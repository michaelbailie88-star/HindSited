// The owner's leads for one calculator, as JSON or a CSV download.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { calcs, leads } from "../lib/store.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const email = await sessionEmail(req);
  if (!email) return json({ error: "Please sign in first." }, 401);
  const slug = (u.searchParams.get("slug") || "").replace(/[^\w-]/g, "").slice(0, 60);
  const c = slug && (await calcs().get(slug, { type: "json" }));
  if (!c || c.owner !== email) return json({ error: "Not found." }, 404);
  const { blobs } = await leads().list({ prefix: slug + "/" });
  const keys = blobs.map((x) => x.key).sort().reverse().slice(0, 1000);
  const list = (await Promise.all(keys.map((k) => leads().get(k, { type: "json" })))).filter(Boolean);
  if (u.searchParams.get("format") === "csv") {
    const cell = (v) => { const s = String(v ?? ""); return /^[=+\-@]/.test(s) ? `"'${s.replace(/"/g, '""')}"` : `"${s.replace(/"/g, '""')}"`; };
    const qs = [...new Set(list.flatMap((l) => (l.lines || []).map((x) => x.q)))];
    const head = ["Date", "Name", "Email", "Phone", "Quote", "Low", "High", "Note", ...qs];
    const rows = list.map((l) => [l.at, l.name, l.email, l.phone, l.quote, l.low, l.high, l.note, ...qs.map((q) => ((l.lines || []).find((x) => x.q === q) || {}).a || "")]);
    const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    return new Response("﻿" + csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug}-leads.csv"`, "cache-control": "no-store" } });
  }
  return json({ leads: list });
};

export const config = { path: "/api/calc-leads", method: "GET" };
