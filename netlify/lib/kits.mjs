// Review Booster kits: one per business listing.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

const memK = new Map();
const kitStore = () => (process.env.HS_LOCAL_BLOBS === "1"
  ? { async get(k, o = {}) { return memK.has(k) ? (o.type === "json" ? JSON.parse(memK.get(k)) : memK.get(k)) : null; }, async setJSON(k, v) { memK.set(k, JSON.stringify(v)); return { modified: true }; }, async delete(k) { memK.delete(k); } }
  : getStore({ name: "kits", consistency: "strong" }));
export const kits = kitStore;

// Accept the links Google gives owners for asking for reviews.
export function parseGoogleReviewLink(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "g.page" && /^\/r\/[\w-]+(\/review)?\/?$/i.test(u.pathname)) return { url: u.origin + u.pathname.replace(/\/?$/, "").replace(/(\/review)?$/, "/review"), key: "gpage:" + u.pathname.split("/")[2] };
  if (h === "search.google.com" && u.pathname === "/local/writereview" && u.searchParams.get("placeid")) {
    const pid = u.searchParams.get("placeid").replace(/[^\w-]/g, "");
    return { url: "https://search.google.com/local/writereview?placeid=" + pid, key: "place:" + pid };
  }
  if ((h === "maps.app.goo.gl" || h === "goo.gl") && u.pathname.length > 3) return { url: u.href, key: "short:" + u.pathname.replace(/\W/g, "") };
  return null;
}
export const slugify = (name) => (String(name).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "review") + "-" + crypto.randomBytes(3).toString("hex");
export function cleanUrl(raw, host) {
  try { const u = new URL(String(raw || "").trim()); if (u.protocol === "https:" && host.test(u.hostname)) return u.href; } catch {}
  return "";
}
