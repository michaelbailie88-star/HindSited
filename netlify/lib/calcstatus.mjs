// Is a calculator taking quotes? Free ones run 14 days or 10 leads, whichever
// comes first; then they pause until the owner upgrades.
import { getUser, leads } from "./store.mjs";
import { effectivePlan } from "./entitle.mjs";

export const FREE_DAYS = 14, FREE_LEADS = 10;
export async function calcStatus(c) {
  const owner = await getUser(c.owner);
  const ent = effectivePlan(owner, c.owner);
  const paid = ent.plan !== "free";
  const { blobs } = await leads().list({ prefix: c.slug + "/" });
  const leadCount = blobs.length;
  const freeEnds = new Date(Date.parse(c.createdAt) + FREE_DAYS * 86400000).toISOString();
  let pausedReason = null;
  if (!paid && Date.now() > Date.parse(freeEnds)) pausedReason = "time";
  else if (!paid && leadCount >= FREE_LEADS) pausedReason = "leads";
  return { active: !pausedReason, pausedReason, paid, badge: !paid, leadCount, freeEnds: paid ? null : freeEnds };
}
