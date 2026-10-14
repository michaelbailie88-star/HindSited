// Signed tokens for email sign-in links and the session cookie (HMAC-SHA256).
import crypto from "node:crypto";
import { appSecret, getUser } from "./store.mjs";

const b64 = (b) => Buffer.from(b).toString("base64url");
export async function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", await appSecret()).update(body).digest("base64url");
  return body + "." + mac;
}
export async function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const good = crypto.createHmac("sha256", await appSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac || ""), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
  if (!p.exp || Date.now() > p.exp) return null;
  return p;
}
export function readCookie(req, name) {
  const m = (req.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
// A session is valid only while the account exists and its password hasn't
// changed since sign-in (a reset signs out every other device).
export async function sessionEmail(req) {
  const p = await verify(readCookie(req, "hs_session"));
  if (!p || p.t !== "session") return null;
  const u = await getUser(p.email);
  if (!u || (u.pwv || 0) !== (p.pv || 0)) return null;
  return p.email;
}
export const SESSION_DAYS = 30;
export async function sessionFor(user) {
  const token = await sign({ t: "session", email: user.email, pv: user.pwv || 0, exp: Date.now() + SESSION_DAYS * 86400000 });
  return sessionCookie(token, SESSION_DAYS * 86400);
}
export const clearSession = "hs_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
export function sessionCookie(token, maxAgeSec) {
  return `hs_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
