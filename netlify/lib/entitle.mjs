// Works out what a user is entitled to from what they've bought.
import { OWNER_EMAILS } from "./store.mjs";

const RANK = { free: 0, solo: 1, agency: 2, owner: 3 };
export function effectivePlan(user, email) {
  if (OWNER_EMAILS.includes(email)) return { plan: "owner", extra: 0 };
  let plan = "free", extra = 0;
  for (const l of (user && user.lifetime) || []) if (RANK[l.plan] > RANK[plan]) plan = l.plan;
  for (const s of (user && user.subs) || []) {
    if (s.ended) continue;
    if (s.plan === "extra") extra += s.qty || 1;
    else if (RANK[s.plan] > RANK[plan]) plan = s.plan;
  }
  return { plan, extra: plan === "agency" ? extra : 0 };
}
