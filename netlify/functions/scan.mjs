// Starts a scan for the signed-in user after checking their allowance:
// free = one scan per person AND one free scan per website, ever.
import crypto from "node:crypto";
import { json, normalizeUrl, assertPublicHost, siteKey } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser, reports, claims, appSecret, OWNER_EMAILS } from "../lib/store.mjs";
import { PLANS, monthKey } from "../lib/plans.mjs";
import { refund } from "../lib/refund.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ needSignIn: true }, 401);
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
  const user = (await getUser(email)) || newUser(email);
  const planId = OWNER_EMAILS.includes(email) ? "owner" : user.plan || "free";
  const plan = PLANS[planId] || PLANS.free;
  const month = monthKey();
  if (!user.usage || user.usage.month !== month) user.usage = { month, scans: 0 };
  const id = crypto.randomUUID();

  if (planId === "free") {
    if (user.freeUsed) return json({ paywall: true, reason: "free-used", report: user.freeUsed.reportId, site: user.freeUsed.site }, 402);
    const claim = await claims().setJSON(site, { email, reportId: id, at: new Date().toISOString() }, { onlyIfNew: true });
    if (!claim.modified) {
      const existing = await claims().get(site, { type: "json" });
      return json({ paywall: true, reason: existing && existing.email === email ? "free-used" : "site-used", report: existing && existing.email === email ? existing.reportId : null, site }, 402);
    }
    user.freeUsed = { site, reportId: id, at: new Date().toISOString() };
  } else {
    const allowedBiz = plan.businesses + (user.extraBusinesses || 0);
    if (!user.businesses.includes(site)) {
      if (user.businesses.length >= allowedBiz) return json({ paywall: true, reason: "business-limit", businesses: user.businesses, allowed: allowedBiz }, 402);
      user.businesses.push(site);
    }
    if (user.usage.scans >= plan.scansPerMonth) return json({ paywall: true, reason: "scan-limit", allowed: plan.scansPerMonth }, 402);
  }
  user.usage.scans++;
  user.reports = [{ id, url: url.href, site, at: new Date().toISOString() }, ...(user.reports || [])].slice(0, 100);
  await reports().setJSON(id, { state: "queued", url: url.href, site, owner: email, free: planId === "free", createdAt: new Date().toISOString() });
  await saveUser(user);

  // hand off to the background scanner (up to 15 minutes)
  const origin = new URL(req.url).origin;
  try {
    const r = await fetch(`${origin}/api/check-bg?id=${id}&url=${encodeURIComponent(url.href)}`, { headers: { "x-hs-key": await appSecret() }, signal: AbortSignal.timeout(10000) });
    if (r.status !== 202 && !r.ok) throw new Error("bg " + r.status);
  } catch (e) {
    await reports().setJSON(id, { state: "error", url: url.href, site, owner: email, free: planId === "free", error: "Couldn't start the check. Try again in a minute.", createdAt: new Date().toISOString() });
    await refund(email, id, site, planId === "free");
    return json({ error: "Couldn't start the check. Try again in a minute." }, 502);
  }
  return json({ id });
};

export const config = { path: "/api/scan", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] } };
