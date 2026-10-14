// Who is signed in, their plan and their reports. POST signs out.
import { json } from "../lib/guard.mjs";
import { sessionEmail, clearSession } from "../lib/session.mjs";
import { getUser, saveUser } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { refreshSubscriptions } from "../lib/stripe.mjs";
import { PLANS, monthKey } from "../lib/plans.mjs";

const nextMonthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString(); };

export default async (req) => {
  if (req.method === "POST") {
    return new Response(JSON.stringify({ signedIn: false }), { headers: { "content-type": "application/json", "set-cookie": clearSession, "cache-control": "no-store" } });
  }
  const email = await sessionEmail(req);
  if (!email) return json({ signedIn: false });
  const u = await getUser(email);
  if (u && (u.subs || []).length && Netlify.env.get("STRIPE_SECRET_KEY") && (await refreshSubscriptions(u))) await saveUser(u);
  const ent = effectivePlan(u, email);
  const planId = ent.plan;
  const plan = PLANS[planId];
  const used = u && u.usage && u.usage.month === monthKey() ? u.usage.scans : 0;
  const subs = u ? (u.subs || []).filter((s) => !s.ended) : [];
  const main = subs.find((s) => s.plan !== "extra");
  const allowed = Number.isFinite(plan.scansPerMonth) ? plan.scansPerMonth : null;
  return json({
    signedIn: true, email, plan: planId, planLabel: plan.label,
    name: (u && u.name) || "", business: (u && u.business) || "", website: (u && u.website) || "",
    verified: !!(u && u.verified), hasPassword: !!(u && u.pw), memberSince: u ? u.createdAt : null,
    scansRemaining: allowed == null ? null : Math.max(0, allowed - used), resetsOn: nextMonthStart(),
    renewal: main ? { periodEnd: main.periodEnd || null, cancelling: !!main.cancelling, status: main.status } : null,
    extraBusinesses: ent.extra,
    freeUsed: u ? u.freeUsed : null,
    scansUsed: used, scansAllowed: Number.isFinite(plan.scansPerMonth) ? plan.scansPerMonth : null,
    businesses: u ? u.businesses : [], businessesAllowed: Number.isFinite(plan.businesses) ? plan.businesses + ent.extra : null,
    lifetime: !!(u && (u.lifetime || []).length), hasBilling: !!(u && u.customer), whiteLabel: !!plan.whiteLabel, brand: (u && u.brand) || null,
    monthly: subs.map((s) => ({ plan: s.plan, status: s.status, periodEnd: s.periodEnd || null, cancelling: !!s.cancelling })),
    reports: u ? (u.reports || []).slice(0, 30) : []
  });
};

export const config = { path: "/api/me", method: ["GET", "POST"] };
