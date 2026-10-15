import { getUser, saveUser, claims, counters } from "./store.mjs";

// Give a free scan back when the check couldn't run at all.
export async function refund(email, id, site, wasFree, dayKey) {
  if (wasFree) {
    const c = await claims().get(site, { type: "json" });
    if (c && c.reportId === id) await claims().delete(site);
    if (dayKey && typeof dayKey === "object") {
      // give back the device and connection marks if they belong to this scan
      for (const k of [dayKey.dev, dayKey.ip]) { if (!k) continue; const m = await counters().get(k, { type: "json" }); if (m && m.reportId === id) await counters().delete(k); }
    } else if (dayKey) { const n = Number(await counters().get(dayKey)) || 0; if (n > 0) await counters().set(dayKey, String(n - 1)); }
  }
  if (!email) return;
  const u = await getUser(email);
  if (!u) return;
  if (wasFree && u.freeUsed && u.freeUsed.reportId === id) u.freeUsed = null;
  if (u.usage && u.usage.scans > 0) u.usage.scans--;
  u.reports = (u.reports || []).filter((r) => r.id !== id);
  await saveUser(u);
}
