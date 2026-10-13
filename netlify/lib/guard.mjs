// URL validation and safe fetching. Blocks private / internal addresses so the
// scanner can't be pointed at anything but public websites.
import dns from "node:dns/promises";
import net from "node:net";

const allowLocal = () => process.env.HS_ALLOW_LOCAL === "1";

export function normalizeUrl(input) {
  let s = String(input || "").trim();
  if (!s) throw new Error("Enter a website address.");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { throw new Error("That doesn't look like a website address."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http and https addresses can be checked.");
  if (u.username || u.password) throw new Error("Addresses with a username or password can't be checked.");
  if (u.port && !["80", "443"].includes(u.port) && !allowLocal()) throw new Error("Only standard web ports can be checked.");
  if (!allowLocal() && !/\.[a-z]{2,}$/i.test(u.hostname)) throw new Error("Enter a public website address, like example.com.");
  u.hash = "";
  return u;
}

function privateV4(ip) {
  const p = ip.split(".").map(Number);
  return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224 || (p[0] === 192 && p[1] === 0 && p[2] === 0) || (p[0] === 198 && (p[1] === 18 || p[1] === 19));
}
function privateV6(ip) {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("::ffff:")) return privateV4(s.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
}
export function isPrivateIp(ip) { return net.isIPv4(ip) ? privateV4(ip) : net.isIPv6(ip) ? privateV6(ip) : true; }

const dnsCache = new Map();
export async function assertPublicHost(hostname) {
  if (allowLocal()) return;
  const h = hostname.replace(/^\[|\]$/g, "");
  if (/^localhost$|\.local$|\.internal$|\.localhost$/i.test(h)) throw new Error("blocked-host");
  if (net.isIP(h)) { if (isPrivateIp(h)) throw new Error("blocked-host"); return; }
  if (dnsCache.has(h)) { if (!dnsCache.get(h)) throw new Error("blocked-host"); return; }
  const addrs = await dns.lookup(h, { all: true });
  const ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  dnsCache.set(h, ok);
  if (!ok) throw new Error("blocked-host");
}

export const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36 HindSited/1.0 (+https://hindsited.com)";
export const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 HindSited/1.0 (+https://hindsited.com)";

// fetch with manual redirects (each hop re-checked), timeout and size cap.
export async function safeFetch(url, { method = "GET", timeout = 8000, maxBytes = 1_500_000, headers = {}, maxRedirects = 5 } = {}) {
  let current = new URL(url);
  const chain = [];
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicHost(current.hostname);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(current, { method, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA_DESKTOP, accept: "text/html,application/xhtml+xml,*/*;q=0.8", ...headers } });
    } finally { clearTimeout(t); }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      chain.push({ url: current.href, status: res.status });
      try { await res.body?.cancel(); } catch {}
      current = new URL(res.headers.get("location"), current);
      if (!/^https?:$/.test(current.protocol)) throw new Error("bad-redirect");
      continue;
    }
    let body = "";
    if (method !== "HEAD" && res.body) {
      const reader = res.body.getReader();
      const chunks = []; let size = 0;
      const ctrl2 = setTimeout(() => reader.cancel().catch(() => {}), timeout);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length; chunks.push(value);
          if (size > maxBytes) { await reader.cancel().catch(() => {}); break; }
        }
      } catch {} finally { clearTimeout(ctrl2); }
      body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
    }
    return { status: res.status, url: current.href, headers: res.headers, body, chain };
  }
  throw new Error("too-many-redirects");
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

// "shop.example.com" and "www.example.com" are the same site; hosting
// platforms' subdomains (you.netlify.app) are separate sites.
const PLATFORM_SUFFIX = /(?:^|\.)(?:netlify\.app|vercel\.app|github\.io|pages\.dev|web\.app|firebaseapp\.com|herokuapp\.com|onrender\.com|wixsite\.com|squarespace\.com|myshopify\.com|wordpress\.com|blogspot\.com|weebly\.com|webflow\.io|godaddysites\.com|square\.site|carrd\.co|framer\.website|framer\.app|glitch\.me|replit\.app|bubbleapps\.io|ueniweb\.com|business\.site)$/i;
export function siteKey(hostname) {
  const h = String(hostname).toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  const parts = h.split(".");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h;
  if (PLATFORM_SUFFIX.test(h)) return parts.slice(-3).join(".");
  if (parts.length >= 3 && /^(?:co|com|org|net|gov|ac|edu|ltd|plc|nom|gen|qc|on|bc|ab)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}
