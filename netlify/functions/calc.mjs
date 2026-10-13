// Quote calculators. GET ?slug= is public (no owner details). GET ?mine=1
// lists the owner's calculators. POST creates or updates (signed in).
import crypto from "node:crypto";
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser, calcs, leads } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { PLANS } from "../lib/plans.mjs";
import { sanitize } from "../../public/calc-core.js";
import { calcStatus } from "../lib/calcstatus.mjs";

const pub = (c, st) => ({ slug: c.slug, business: c.business, ...c.config, color: c.color, logo: c.logo, badge: st.badge, active: st.active, phone: c.phone || "" });

export default async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const slug = (u.searchParams.get("slug") || "").replace(/[^\w-]/g, "").slice(0, 60);
    if (slug) {
      const c = await calcs().get(slug, { type: "json" });
      if (!c) return json({ error: "This quote calculator doesn't exist." }, 404);
      return json(pub(c, await calcStatus(c)));
    }
    const email = await sessionEmail(req);
    if (!email) return json({ signedIn: false }, 401);
    const user = await getUser(email);
    const ent = effectivePlan(user, email);
    const list = [];
    for (const s of (user && user.calcs) || []) {
      const c = await calcs().get(s, { type: "json" });
      if (c) { const st = await calcStatus(c); list.push({ ...pub(c, st), notify: c.notify, leadCount: st.leadCount, freeEnds: st.freeEnds, pausedReason: st.pausedReason }); }
    }
    const plan = PLANS[ent.plan];
    return json({ calcs: list, paid: ent.plan !== "free", allowed: ent.plan === "free" ? 1 : Number.isFinite(plan.businesses) ? plan.businesses + ent.extra : null });
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ needSignIn: true, error: "Please sign in first." }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const business = String(b.business || "").replace(/[<>]/g, "").trim().slice(0, 60);
  if (!business) return json({ error: "Enter your business name." }, 400);
  const config = sanitize(b.config || {});
  if (!config.questions.length) return json({ error: "Add at least one question." }, 400);
  const user = (await getUser(email)) || newUser(email);
  const ent = effectivePlan(user, email);
  const paid = ent.plan !== "free";
  user.calcs = user.calcs || [];
  let c = null;
  if (b.slug && user.calcs.includes(b.slug)) c = await calcs().get(b.slug, { type: "json" });
  if (!c) {
    const allowed = paid ? PLANS[ent.plan].businesses + ent.extra : 1;
    if (user.calcs.length >= allowed) return json({ paywall: true, reason: paid ? "calc-limit" : "calc-free-used" }, 402);
    if (!paid && user.freeCalcUsed) return json({ paywall: true, reason: "calc-free-used" }, 402);
    const slug = business.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").slice(0, 32) + "-" + crypto.randomBytes(3).toString("hex");
    c = { slug, owner: email, createdAt: new Date().toISOString() };
    user.calcs.push(slug);
    if (!paid) user.freeCalcUsed = { slug, at: c.createdAt };
  }
  c.business = business;
  c.config = config;
  c.notify = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.notify || "") ? String(b.notify).toLowerCase() : email;
  c.phone = String(b.phone || "").replace(/[^\d+()\-\s.]/g, "").slice(0, 30);
  // own colours, logo and follow-up email are paid features
  c.color = paid && /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#e5461d";
  if (paid && typeof b.logo === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) && b.logo.length < 280000) c.logo = b.logo;
  else if (!paid || b.logo === null || b.logo === "") c.logo = null;
  c.followUp = b.followUp !== false; // only used while the owner is on a paid plan
  c.updatedAt = new Date().toISOString();
  await calcs().setJSON(c.slug, c);
  await saveUser(user);
  return json({ calc: { slug: c.slug } });
};

export const config = { path: "/api/calc", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
