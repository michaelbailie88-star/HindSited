// POST /api/compare {report, url}: check a competitor's site next to a finished
// report. One comparison per report (a failed one can be retried). It doesn't
// use up the competitor's own free scan, and /api/report only ever returns a
// summary of it (never the full findings), so it can't stand in for a report.
import crypto from "node:crypto";
import { json, normalizeUrl, assertPublicHost, siteKey } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports, appSecret } from "../lib/store.mjs";
import { track, isOwner } from "../lib/events.mjs";

const MAX_AGE_DAYS = 60;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const pid = String(body.report || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  const parent = pid ? await reports().get(pid, { type: "json" }) : null;
  if (!parent || parent.kind === "compare") return json({ error: "We couldn't find that report." }, 404);
  if (parent.state !== "done") return json({ error: "Wait for your report to finish first." }, 409);
  if (Date.now() - Date.parse(parent.createdAt || 0) > MAX_AGE_DAYS * 864e5) return json({ error: "This report is too old to compare. Run a new check first." }, 410);
  if (parent.compare) {
    const prev = await reports().get(parent.compare.id, { type: "json" });
    if (prev && prev.state !== "error") return json({ error: "This report already has a comparison.", id: parent.compare.id }, 409);
  }
  let url;
  try { url = normalizeUrl(body.url); await assertPublicHost(url.hostname); }
  catch (e) {
    const m = String((e && e.code) || "") + " " + String((e && e.message) || "");
    return json({ error: /blocked-host/.test(m) ? "That address isn't a public website." : /ENOTFOUND|EAI_AGAIN|EBUSY|getaddrinfo/.test(m) ? "We couldn't find that website. Check the spelling." : e.message || "Bad request." }, 400);
  }
  const site = siteKey(url.hostname);
  if (site === parent.site) return json({ error: "That's the same website. Enter a competitor's address." }, 400);

  const id = crypto.randomUUID();
  const at = new Date().toISOString();
  const rec = { kind: "compare", parent: pid, state: "queued", url: url.href, site, owner: null, free: false, tier: "compare", day: null, brand: null, createdAt: at };
  await reports().setJSON(id, rec);
  // re-read the parent so nothing written since is lost
  const fresh = (await reports().get(pid, { type: "json" })) || parent;
  fresh.compare = { id, site, at };
  await reports().setJSON(pid, fresh);

  const origin = new URL(req.url).origin;
  try {
    const r = await fetch(`${origin}/api/check-bg?id=${id}&url=${encodeURIComponent(url.href)}`, { headers: { "x-hs-key": await appSecret() }, signal: AbortSignal.timeout(10000) });
    if (r.status !== 202 && !r.ok) throw new Error("bg " + r.status);
  } catch {
    await reports().setJSON(id, { ...rec, state: "error", error: "Couldn't start the check. Try again in a minute." });
    return json({ error: "Couldn't start the check. Try again in a minute." }, 502);
  }
  if (!isOwner(await sessionEmail(req))) await track("compare_start");
  return json({ id, site });
};

export const config = { path: "/api/compare", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 4, windowSize: 60, aggregateBy: ["ip", "domain"] } };
