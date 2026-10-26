// GET /api/card?id=…: a report's share card (PNG). If an older report has no
// card yet, ?make=1 starts drawing one in the background and answers 202.
import { json } from "../lib/guard.mjs";
import { reports, cards, appSecret } from "../lib/store.mjs";
import { cardable } from "../lib/card.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const id = (u.searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing id." }, 400);
  const png = await cards().get(id, { type: "arrayBuffer" });
  if (png) return new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } });
  const r = await reports().get(id, { type: "json" });
  if (!cardable(r)) return json({ error: "No card for this report." }, 404);
  if (u.searchParams.get("make") !== "1") return json({ pending: false }, 404);
  try { await fetch(`${u.origin}/api/card-bg?id=${id}`, { headers: { "x-hs-key": await appSecret() }, signal: AbortSignal.timeout(8000) }); } catch {}
  return json({ pending: true }, 202);
};

export const config = { path: "/api/card", method: "GET", rateLimit: { action: "rate_limit", windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
