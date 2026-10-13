// Who is signed in, their plan and their reports. POST signs out.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, OWNER_EMAILS } from "../lib/store.mjs";
import { PLANS, monthKey } from "../lib/plans.mjs";

export default async (req) => {
  if (req.method === "POST") {
    return new Response(JSON.stringify({ signedIn: false }), { headers: { "content-type": "application/json", "set-cookie": "hs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", "cache-control": "no-store" } });
  }
  const email = await sessionEmail(req);
  if (!email) return json({ signedIn: false });
  const u = await getUser(email);
  const planId = OWNER_EMAILS.includes(email) ? "owner" : (u && u.plan) || "free";
  const plan = PLANS[planId];
  const used = u && u.usage && u.usage.month === monthKey() ? u.usage.scans : 0;
  return json({
    signedIn: true, email, plan: planId, planLabel: plan.label,
    freeUsed: u ? u.freeUsed : null,
    scansUsed: used, scansAllowed: Number.isFinite(plan.scansPerMonth) ? plan.scansPerMonth : null,
    businesses: u ? u.businesses : [], businessesAllowed: Number.isFinite(plan.businesses) ? plan.businesses + ((u && u.extraBusinesses) || 0) : null,
    reports: u ? (u.reports || []).slice(0, 30) : []
  });
};

export const config = { path: "/api/me", method: ["GET", "POST"] };
