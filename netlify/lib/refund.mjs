import { getUser, saveUser, claims } from "./store.mjs";

// Give a free scan back when the check couldn't run at all.
export async function refund(email, id, site, wasFree) {
  const u = await getUser(email);
  if (!u) return;
  if (wasFree) {
    const c = await claims().get(site, { type: "json" });
    if (c && c.reportId === id) await claims().delete(site);
    if (u.freeUsed && u.freeUsed.reportId === id) u.freeUsed = null;
  }
  if (u.usage && u.usage.scans > 0) u.usage.scans--;
  u.reports = (u.reports || []).filter((r) => r.id !== id);
  await saveUser(u);
}

