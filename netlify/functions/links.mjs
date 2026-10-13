import { checkLinks } from "../lib/links.mjs";
import { json } from "../lib/guard.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40)
    .filter((x) => x && typeof x.url === "string" && /^https?:\/\//i.test(x.url))
    .map((x) => ({ url: x.url, internal: !!x.internal }));
  const results = await checkLinks(items, 10);
  return json({ results });
};

export const config = { path: "/api/links", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 40, windowSize: 60, aggregateBy: ["ip", "domain"] } };
