import { checkPage, checkSite } from "../lib/crawl.mjs";
import { normalizeUrl, json } from "../lib/guard.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, 8) : [];
  let site = null;
  try {
    const clean = urls.map((u) => normalizeUrl(u).href);
    const tasks = clean.map((u) => checkPage(u));
    if (body.origin) tasks.push(checkSite(normalizeUrl(body.origin).origin).then((s) => { site = s; return null; }));
    const pages = (await Promise.all(tasks)).filter(Boolean);
    return json({ pages, site });
  } catch (e) {
    return json({ error: e.message }, 400);
  }
};

export const config = { path: "/api/crawl", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };
