import { getUser, saveUser, claims, counters } from "./store.mjs";

// Give a free scan back when the check couldn't run at all.
export async function refund(email, id, site, wasFree, dayKey) {
  if (wasFree) {
    const c = await claims().get(site, { type: "json" });
    if (c && c.reportId === id) await claims().delete(site);
    if (dayKey) { const n = Number(await counters().get(dayKey)) || 0; if (n > 0) await counters().set(dayKey, String(n - 1)); }
  }
  if (!email) return;
  const u = await getUser(email);
  if (!u) return;
  if (wasFree && u.freeUsed && u.freeUsed.reportId === id) u.freeUsed = null;
  if (u.usage && u.usage.scans > 0) u.usage.scans--;
  u.reports = (u.reports || []).filter((r) => r.id !== id);
  await saveUser(u);
}
