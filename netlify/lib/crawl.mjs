// Server-side check of extra pages (no browser): fetches HTML and runs the
// text rules on what a visitor would actually see.
import { parse } from "node-html-parser";
import { makeTextRules } from "./textrules.mjs";
import { safeFetch } from "./guard.mjs";

const TR = makeTextRules();
const HIDDEN_CLASS = /(?:^|\s)(?:visually-hidden|sr-only|screen-reader-text|screen-reader-only|hidden|d-none|hide|is-hidden|u-hidden|visuallyhidden|offscreen)(?:\s|$)/i;
const clip = (s, n = 140) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export async function checkPage(url, now = Date.now()) {
  const out = { url, status: 0, findings: [], links: [], images: [], title: "", desc: "", noindex: false };
  let res;
  try { res = await safeFetch(url, { timeout: 9000 }); }
  catch (e) { out.status = 0; out.error = /blocked/.test(e.message) ? "blocked" : "unreachable"; return out; }
  out.status = res.status;
  out.finalUrl = res.url;
  const ct = res.headers.get("content-type") || "";
  if (res.status >= 400 || !/html/i.test(ct)) return out;
  const root = parse(res.body, { comment: false, blockTextElements: { script: false, style: false, noscript: false, pre: false } });
  out.title = clip(root.querySelector("title")?.text || "", 120);
  out.desc = clip(root.querySelector('meta[name="description"]')?.getAttribute("content") || "", 200);
  const robots = root.querySelectorAll("meta").filter((m) => /robots|bot/i.test(m.getAttribute("name") || "") && /noindex/i.test(m.getAttribute("content") || ""));
  out.noindex = robots.length > 0 || /noindex/i.test(res.headers.get("x-robots-tag") || "");

  // remove things visitors never see
  root.querySelectorAll("template,svg,iframe,select,textarea,code").forEach((n) => n.remove());
  root.querySelectorAll("*").forEach((el) => {
    const st = (el.getAttribute("style") || "").replace(/\s/g, "").toLowerCase();
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true" || HIDDEN_CLASS.test(el.getAttribute("class") || "") || st.includes("display:none") || st.includes("visibility:hidden")) el.remove();
  });

  const base = new URL(res.url);
  const host = base.hostname.replace(/^www\./, "");
  const counts = {};
  const add = (rule, evidence, extra) => { counts[rule] = (counts[rule] || 0) + 1; if (counts[rule] <= 3) out.findings.push({ rule, evidence: clip(evidence), extra: extra || null }); };

  // text runs: each element's direct text
  const body = root.querySelector("body") || root;
  const runs = [];
  (function walk(node, depth) {
    if (depth > 60) return;
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { const t = c.rawText ? decode(c.rawText) : c.text; if (t && t.trim()) runs.push({ text: t, el: node }); }
      else if (c.nodeType === 1) walk(c, depth + 1);
    }
  })(body, 0);
  for (const r of runs) {
    for (const h of TR.scanText(r.text, now)) add(h.rule, r.text.substr(Math.max(0, h.index - 40), h.length + 80), h.extra);
    let ctx = false, p = r.el, d = 0;
    while (p && d < 4) { if (/price|money|amount|cost|total/i.test((p.getAttribute?.("class") || "") + " " + (p.getAttribute?.("id") || ""))) { ctx = true; break; } p = p.parentNode; d++; }
    const zp = TR.zeroPrice(r.text, ctx);
    if (zp) add("zero_price", r.text);
  }

  for (const a of root.querySelectorAll("a[href]")) {
    const raw = (a.getAttribute("href") || "").trim();
    if (/^(mailto:|tel:|sms:|javascript:|#|data:)/i.test(raw) || !raw) continue;
    let u; try { u = new URL(raw, base); } catch { continue; }
    if (!/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    const internal = u.hostname.replace(/^www\./, "") === host;
    if (internal && /(?:^|\/)[\w-]*-copy(?:-\d+)?\/?$|\/copy-of-/i.test(u.pathname)) add("copy_slug", "“" + clip(a.text, 50) + "” links to " + u.pathname, { href: u.href });
    out.links.push({ url: u.href, text: clip(a.text, 60), internal });
  }
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
    if (!src || /^data:/.test(src) || /\{|%7B/.test(src)) continue;
    try {
      const u = new URL(src, base);
      if (/^https?:$/.test(u.protocol)) out.images.push(u.href);
      const name = decodeURIComponent(u.pathname.split("/").pop() || "");
      if (/screen[\s_-]?shot|screenshot/i.test(name)) add("screenshot_images", "Image file named “" + name + "”");
    } catch {}
  }
  const allText = runs.map((r) => r.text).join("\n");
  out.signals = { hours: TR.R.hours.test(allText), address: TR.R.address.test(allText), privacy: out.links.some((l) => /privacy/i.test(l.url + " " + l.text)) };
  out.links = dedupe(out.links, (l) => l.url).slice(0, 300);
  out.images = [...new Set(out.images)].slice(0, 80);
  return out;
}

export async function checkSite(origin) {
  const out = { robotsBlocksAll: false, robotsStatus: 0, sitemap: false };
  try {
    const r = await safeFetch(new URL("/robots.txt", origin).href, { timeout: 6000, maxBytes: 200000 });
    out.robotsStatus = r.status;
    if (r.status === 200) {
      let agentAll = false, blocks = false;
      for (const line of r.body.split(/\r?\n/)) {
        const l = line.replace(/#.*/, "").trim();
        const m = /^(user-agent|disallow|allow|sitemap)\s*:\s*(.*)$/i.exec(l);
        if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2].trim();
        if (k === "sitemap") out.sitemap = true;
        if (k === "user-agent") agentAll = v === "*" || /googlebot/i.test(v);
        else if (k === "disallow" && agentAll && v === "/") blocks = true;
      }
      out.robotsBlocksAll = blocks;
    }
  } catch {}
  if (!out.sitemap) {
    try { const s = await safeFetch(new URL("/sitemap.xml", origin).href, { timeout: 6000, maxBytes: 50000 }); out.sitemap = s.status === 200 && /<(urlset|sitemapindex)/i.test(s.body); } catch {}
  }
  return out;
}

function dedupe(arr, key) { const s = new Set(); return arr.filter((x) => { const k = key(x); if (s.has(k)) return false; s.add(k); return true; }); }
function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
