// Checks whether links and images actually load. Only clear failures count
// as broken: 404/410, a dead domain, or (for the site's own pages) a 5xx.
import { safeFetch } from "./guard.mjs";

const BOT_WALLED = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|yelp|pinterest|threads|amazon|google|youtube|apple|tripadvisor|indeed|glassdoor|houzz|homeadvisor|angi|thumbtack|nextdoor|etsy|bbb)\.[a-z.]+$/i;

export async function checkLink(url, { internal = false } = {}) {
  let u;
  try { u = new URL(url); } catch { return { url, broken: true, reason: "bad-url" }; }
  const walled = BOT_WALLED.test(u.hostname);
  // Cloudflare email protection and similar helper URLs only work in a browser
  if (/^\/cdn-cgi\//.test(u.pathname)) return { url, broken: false, skipped: true };
  // checkouts, logins and sign-ups often refuse robots even when they work for people
  const gated = /\/(checkouts?|cart|login|log-in|signin|sign-in|signup|sign-up|register|account|subscribe|auth|oauth)(\/|$)/i.test(u.pathname);
  try {
    let r = await safeFetch(u.href, { method: "HEAD", timeout: 7000 });
    if ([400, 401, 403, 405, 406, 429, 500, 501, 502, 503].includes(r.status) || r.status === 0) {
      r = await safeFetch(u.href, { method: "GET", timeout: 8000, maxBytes: 20000, headers: { range: "bytes=0-1023" } });
    }
    const s = r.status;
    let broken = false, reason = "";
    if (!walled && !gated && (s === 404 || s === 410)) { broken = true; reason = String(s); }
    else if (!walled && internal && s >= 500) { broken = true; reason = String(s); }
    return { url, status: s, finalUrl: r.url, broken, reason };
  } catch (e) {
    const code = e.cause?.code || e.code || "";
    const m = String(e.message || "");
    if (/blocked/.test(m)) return { url, broken: false, skipped: true };
    if (/ENOTFOUND|EAI_NONAME/.test(code + m)) return { url, broken: true, reason: "dead-domain" };
    if (/ECONNREFUSED/.test(code + m) && !walled) return { url, broken: true, reason: "refused" };
    if (/CERT|SSL|TLS/i.test(code + m) && !walled) return { url, broken: true, reason: "certificate" };
    return { url, broken: false, unknown: true, reason: code || "timeout" };
  }
}

export async function checkLinks(items, concurrency = 10) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const k = i++; out[k] = await checkLink(items[k].url, items[k]); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
