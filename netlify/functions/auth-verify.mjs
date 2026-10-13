// Turns an emailed link into a 30-day session cookie.
import { sign, verify, sessionCookie } from "../lib/session.mjs";
import { getUser, saveUser, newUser } from "../lib/store.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const p = await verify(u.searchParams.get("t"));
  if (!p || p.t !== "link") return Response.redirect(u.origin + "/?signin=expired", 302);
  if (!(await getUser(p.email))) await saveUser(newUser(p.email));
  const days = 30;
  const token = await sign({ t: "session", email: p.email, exp: Date.now() + days * 86400000 });
  const next = typeof p.next === "string" && p.next.startsWith("/") && !p.next.startsWith("//") ? p.next : "/";
  return new Response(null, { status: 302, headers: { location: u.origin + next, "set-cookie": sessionCookie(token, days * 86400), "cache-control": "no-store" } });
};

export const config = { path: "/api/auth/verify", method: "GET", rateLimit: { action: "rate_limit", windowLimit: 20, windowSize: 60, aggregateBy: ["ip", "domain"] } };
