// Funnel counts: one tiny blob per event, keyed "YYYY-MM-DD/event/source/random",
// so counting is just listing keys (no read-modify-write races). Nothing
// personal is stored: no email, no IP, no report id. Only the event name, the
// day, and (for home visits) the referring website's domain.
import crypto from "node:crypto";
import { events, OWNER_EMAILS } from "./store.mjs";

// in funnel order. Two paths split after "Opened a report": a plan, or a new website.
export const FUNNEL = [
  ["home_view", "Visited the home page"],
  ["scan_start", "Started a scan"],
  ["scan_done", "Scan finished"],
  ["report_view", "Opened a report"],
  ["plans_view", "Saw the plans"],
  ["checkout_start", "Started checkout"],
  ["paid", "Paid for a plan"],
  ["build_click", "Clicked “Start my new website”", "report_view"],
  ["lead_sent", "Sent a website request"]
];
export const OTHER = [["scan_error", "Scan failed"], ["unlock_click", "Clicked “Unlock full report”"], ["share_click", "Shared a score"]];
export const EVENTS = new Set([...FUNNEL, ...OTHER].map((x) => x[0]));
// the only events a browser may send (the rest are recorded by the server itself)
export const CLIENT_EVENTS = new Set(["home_view", "report_view", "plans_view", "unlock_click", "build_click", "share_click"]);

export const BOT_RE = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|pagespeed|HindSited\//i;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

export function cleanSource(ref, selfHost) {
  try {
    const h = new URL(String(ref)).hostname.toLowerCase().replace(/^www\./, "");
    if (!h || (selfHost && h === selfHost.replace(/^www\./, ""))) return "direct";
    return h.replace(/[^a-z0-9.-]/g, "").slice(0, 60) || "direct";
  } catch { return "direct"; }
}

// never throws: tracking must not break the thing being tracked
export async function track(event, { source = "-", tag = "" } = {}) {
  if (!EVENTS.has(event)) return;
  try {
    const t = String(tag).replace(/[^a-z0-9_-]/gi, "").slice(0, 20);
    await events().set(`${today()}/${event}/${source}${t ? "~" + t : ""}/${crypto.randomBytes(6).toString("hex")}`, "1");
  } catch {}
}

// owners' own clicks don't count
export const isOwner = (email) => !!email && OWNER_EMAILS.includes(email);

export async function summary(days = 7) {
  const store = events();
  const n = Math.min(90, Math.max(1, Math.round(days) || 7));
  const byDay = [], total = {}, sources = {}, tags = {};
  for (let i = n - 1; i >= 0; i--) {
    const day = today(new Date(Date.now() - i * 864e5));
    const counts = {};
    const { blobs } = await store.list({ prefix: day + "/" });
    for (const { key } of blobs) {
      const [, ev, src = "-"] = key.split("/");
      if (!EVENTS.has(ev)) continue;
      counts[ev] = (counts[ev] || 0) + 1;
      total[ev] = (total[ev] || 0) + 1;
      const [from, tag] = src.split("~");
      if (ev === "home_view") sources[from] = (sources[from] || 0) + 1;
      if (tag) { tags[ev] = tags[ev] || {}; tags[ev][tag] = (tags[ev][tag] || 0) + 1; }
    }
    byDay.push({ day, counts });
  }
  return { days: n, byDay, total, tags, sources: Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 15), funnel: FUNNEL, other: OTHER };
}
