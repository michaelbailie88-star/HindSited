// Password hashing (scrypt, random salt per user) and account helpers.
import crypto from "node:crypto";

const N = 16384, KEYLEN = 64;
const scrypt = (pw, salt) => new Promise((res, rej) => crypto.scrypt(pw, salt, KEYLEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw), salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function checkPassword(pw, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const [, s, k] = stored.split("$");
  const want = Buffer.from(k, "base64");
  const got = await scrypt(String(pw), Buffer.from(s, "base64"));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
export function passwordProblem(pw) {
  pw = String(pw || "");
  if (pw.length < 8) return "Use at least 8 characters for your password.";
  if (pw.length > 200) return "That password is too long.";
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|123456789|qwertyui|11111111)$/i.test(pw)) return "That password is too easy to guess. Try another.";
  return null;
}
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
export const clean = (v, n) => String(v ?? "").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, n);
export function cleanSite(v) {
  v = clean(v, 200);
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { const u = new URL(v); if (!/\./.test(u.hostname)) return null; return u.origin + (u.pathname === "/" ? "" : u.pathname); } catch { return null; }
}
