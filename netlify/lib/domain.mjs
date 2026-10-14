// Who a website's domain is registered with, and when it renews, from the
// public RDAP registry service (the modern replacement for WHOIS).
import net from "node:net";

const BASE = () => process.env.HS_RDAP_BASE || "https://rdap.org";

function vcardName(entity) {
  const v = entity && entity.vcardArray && entity.vcardArray[1];
  const fn = Array.isArray(v) && v.find((x) => x[0] === "fn");
  return fn ? String(fn[3] || "").trim() : "";
}
function vcardUrl(entity) {
  const v = entity && entity.vcardArray && entity.vcardArray[1];
  const u = Array.isArray(v) && v.find((x) => x[0] === "url");
  return u ? String(u[3] || "") : "";
}

export async function domainInfo(domain, { timeout = 6000 } = {}) {
  domain = String(domain || "").toLowerCase().replace(/^www\./, "");
  if (!domain || net.isIP(domain) || !/\.[a-z]{2,}$/.test(domain)) return null;
  try {
    const r = await fetch(`${BASE()}/domain/${encodeURIComponent(domain)}`, { headers: { accept: "application/rdap+json, application/json" }, redirect: "follow", signal: AbortSignal.timeout(timeout) });
    if (!r.ok) return null;
    const d = await r.json();
    const ents = Array.isArray(d.entities) ? d.entities : [];
    const reg = ents.find((e) => Array.isArray(e.roles) && e.roles.includes("registrar"));
    const ev = (a) => { const e = (d.events || []).find((x) => x.eventAction === a); return e && e.eventDate ? new Date(e.eventDate).toISOString() : null; };
    const registrar = vcardName(reg) || "";
    if (!registrar && !ev("expiration")) return null;
    return { name: domain, registrar, registrarUrl: vcardUrl(reg), created: ev("registration"), expires: ev("expiration") };
  } catch { return null; }
}
