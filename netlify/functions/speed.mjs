import { pageSpeed } from "../lib/speed.mjs";
import { normalizeUrl, assertPublicHost, json } from "../lib/guard.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json();
    const u = normalizeUrl(body.url);
    await assertPublicHost(u.hostname);
    const strategy = body.strategy === "desktop" ? "desktop" : "mobile";
    const out = await pageSpeed(u.href, strategy, Netlify.env.get("PSI_KEY"));
    return json(out, out.error ? 502 : 200);
  } catch (e) {
    return json({ error: e.message }, 400);
  }
};

export const config = { path: "/api/speed", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] } };
