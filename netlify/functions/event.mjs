// POST /api/event {e, ref}: a page view or click from the site, for the funnel.
// GET  /api/event?days=7: owner-only funnel summary.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { track, summary, CLIENT_EVENTS, BOT_RE, cleanSource, isOwner } from "../lib/events.mjs";

export default async (req) => {
  const email = await sessionEmail(req);
  if (req.method === "GET") {
    if (!isOwner(email)) return json({ error: "Owner only." }, 403);
    return json(await summary(Number(new URL(req.url).searchParams.get("days")) || 7));
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = JSON.parse(await req.text()); } catch { return json({ ok: false }, 400); }
  const e = String((b && b.e) || "");
  if (!CLIENT_EVENTS.has(e)) return json({ ok: false }, 400);
  if (isOwner(email) || BOT_RE.test(req.headers.get("user-agent") || "")) return json({ ok: true, skipped: true });
  const source = e === "home_view" ? cleanSource(b.ref, new URL(req.url).hostname) : "-";
  await track(e, { source });
  return json({ ok: true });
};

export const config = { path: "/api/event", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] } };
