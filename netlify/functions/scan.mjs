// Starts a scan. Anyone can run the free scan (no account needed), but it's
// ONE free scan per person: per account, per device (a long-lived cookie), per
// internet connection (30 days) and per website (ever). Paid accounts use
// their monthly allowance.
import crypto from "node:crypto";
import { json, normalizeUrl, assertPublicHost, siteKey } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser, reports, claims, counters, appSecret, fingerprint } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { refreshSubscriptions } from "../lib/stripe.mjs";
import { PLANS, monthKey } from "../lib/plans.mjs";
import { refund } from "../lib/refund.mjs";

const IP_DAYS = 30; // one free scan per internet connection per 30 days
const DEV_COOKIE = "hs_dev";
const devCookie = (v) => `${DEV_COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${2 * 365 * 86400}`;
function readDev(req) { const m = (req.headers.get("cookie") || "").match(/(?:^|;\s*)hs_dev=([a-f0-9-]{36})/); return m ? m[1] : null; }

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  // every visitor gets a device id; the response always carries it back
  const devId = readDev(req) || crypto.randomUUID();
  const res = await handle(req, context, devId);
  res.headers.append("set-cookie", devCookie(devId));
  return res;
};

async function handle(req, context, devId) {
  const email = await sessionEmail(req);
  let url;
  try {
    const body = await req.json();
    url = normalizeUrl(body.url);
    await assertPublicHost(url.hostname);
  } catch (e) {
    const m = String((e && e.code) || "") + " " + String((e && e.message) || "");
    return json({ error: /blocked-host/.test(m) ? "That address isn't a public website." : /ENOTFOUND|EAI_AGAIN|EBUSY|getaddrinfo/.test(m) ? "We couldn't find that website. Check the spelling." : e.message || "Bad request." }, 400);
  }
  const site = siteKey(url.hostname);
  const user = email ? (await getUser(email)) || newUser(email) : null;
  if (user && (user.subs || []).length && Netlify.env.get("STRIPE_SECRET_KEY")) await refreshSubscriptions(user);
  const planId = user ? effectivePlan(user, email).plan : "free";
  const ent = user ? effectivePlan(user, email) : { plan: "free", extra: 0 };
  const plan = PLANS[planId] || PLANS.free;
  const month = monthKey();
  if (user && (!user.usage || user.usage.month !== month)) user.usage = { month, scans: 0 };
  const id = crypto.randomUUID();
  let dayKey = null;

  if (planId === "free") {
    if (user && user.freeUsed) return json({ paywall: true, reason: "free-used", report: user.freeUsed.reportId, site: user.freeUsed.site }, 402);
    const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "unknown";
    const devKey = "dev/" + (await fingerprint("dev:" + devId));
    const ipKey = "ipfree/" + (await fingerprint("ip:" + ip));
    const used = await counters().get(devKey, { type: "json" });
    if (used) return json({ paywall: true, reason: "free-used", report: used.reportId, site: used.site }, 402);
    const ipUsed = await counters().get(ipKey, { type: "json" });
    if (ipUsed && Date.now() - Date.parse(ipUsed.at) < IP_DAYS * 864e5) return json({ paywall: true, reason: "free-used", report: ipUsed.reportId, site: ipUsed.site }, 402);
    const who = await fingerprint(email || "ip:" + ip);
    const claim = await claims().setJSON(site, { who, reportId: id, at: new Date().toISOString() }, { onlyIfNew: true });
    if (!claim.modified) {
      const existing = await claims().get(site, { type: "json" });
      const same = existing && (existing.who === who || (email && existing.email === email));
      return json({ paywall: true, reason: same ? "free-used" : "site-used", report: existing ? existing.reportId : null, site }, 402);
    }
    const mark = { reportId: id, site, at: new Date().toISOString() };
    await counters().setJSON(devKey, mark);
    await counters().setJSON(ipKey, mark);
    dayKey = { dev: devKey, ip: ipKey };
    if (user) user.freeUsed = { site, reportId: id, at: mark.at };
  } else {
    const allowedBiz = plan.businesses + ent.extra;
    if (!user.businesses.includes(site)) {
      if (user.businesses.length >= allowedBiz) return json({ paywall: true, reason: "business-limit", businesses: user.businesses, allowed: allowedBiz }, 402);
      user.businesses.push(site);
    }
    if (user.usage.scans >= plan.scansPerMonth) return json({ paywall: true, reason: "scan-limit", allowed: plan.scansPerMonth }, 402);
  }
  const free = planId === "free";
  const brand = user && plan.whiteLabel && user.brand && user.brand.name ? user.brand : null;
  const rec = { state: "queued", url: url.href, site, owner: email || null, free, tier: free ? "free" : "paid", day: dayKey, brand, createdAt: new Date().toISOString() };
  await reports().setJSON(id, rec);
  if (user) {
    user.usage.scans++;
    user.reports = [{ id, url: url.href, site, at: new Date().toISOString() }, ...(user.reports || [])].slice(0, 100);
    await saveUser(user);
  }

  // hand off to the background scanner (up to 15 minutes)
  const origin = new URL(req.url).origin;
  try {
    const r = await fetch(`${origin}/api/check-bg?id=${id}&url=${encodeURIComponent(url.href)}`, { headers: { "x-hs-key": await appSecret() }, signal: AbortSignal.timeout(10000) });
    if (r.status !== 202 && !r.ok) throw new Error("bg " + r.status);
  } catch (e) {
    await reports().setJSON(id, { ...rec, state: "error", error: "Couldn't start the check. Try again in a minute." });
    await refund(email, id, site, free, dayKey);
    return json({ error: "Couldn't start the check. Try again in a minute." }, 502);
  }
  return json({ id });
}

export const config = { path: "/api/scan", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] } };
