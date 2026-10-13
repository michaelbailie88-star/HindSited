// Persistent data in Netlify Blobs (free, no extra service): users, reports,
// one-free-scan claims, and the app's signing secret.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// HS_LOCAL_BLOBS=1 (tests only): an in-memory stand-in with the same calls.
const mem = new Map();
function memStore(name) {
  const m = mem.get(name) || new Map(); mem.set(name, m);
  return {
    async get(k, o = {}) { if (!m.has(k)) return null; const v = m.get(k); return o.type === "json" ? JSON.parse(v) : v; },
    async set(k, v, o = {}) { if (o.onlyIfNew && m.has(k)) return { modified: false }; m.set(k, String(v)); return { modified: true }; },
    async setJSON(k, v, o = {}) { return this.set(k, JSON.stringify(v), o); },
    async delete(k) { m.delete(k); }
  };
}
const S = (name) => (process.env.HS_LOCAL_BLOBS === "1" ? memStore(name) : getStore({ name, consistency: "strong" }));
export const users = () => S("users");
export const reports = () => S("reports");
export const claims = () => S("free-claims");
const config = () => S("config");

let cachedSecret = null;
// One random secret, created on first use and kept forever.
export async function appSecret() {
  if (cachedSecret) return cachedSecret;
  const c = config();
  let s = await c.get("secret");
  if (!s) {
    await c.set("secret", crypto.randomBytes(32).toString("hex"), { onlyIfNew: true });
    s = await c.get("secret");
  }
  cachedSecret = s;
  return s;
}

const userKey = (email) => "u/" + crypto.createHash("sha256").update(email.toLowerCase()).digest("hex");
export async function getUser(email) {
  return (await users().get(userKey(email), { type: "json" })) || null;
}
export async function saveUser(u) {
  u.updatedAt = new Date().toISOString();
  await users().setJSON(userKey(u.email), u);
  return u;
}
export function newUser(email) {
  return { email: email.toLowerCase(), plan: "free", createdAt: new Date().toISOString(), freeUsed: null, businesses: [], usage: { month: "", scans: 0 }, reports: [] };
}
export const OWNER_EMAILS = ["thelazycreatorco@gmail.com", "michaelbailie88@icloud.com"];
