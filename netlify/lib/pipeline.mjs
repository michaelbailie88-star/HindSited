// The whole scan, server-side: phone render, desktop view, extra pages,
// links and Google speed. Mirrors what the browser client does.
import { renderAudit } from "./render.mjs";
import { checkPage, checkSite } from "./crawl.mjs";
import { checkLinks } from "./links.mjs";
import { pageSpeed } from "./speed.mjs";

const SKIP_PATH = /\/(cart|checkout|account|login|log-in|signin|sign-in|register|wp-admin|wp-login|search|cdn-cgi|feed|tag|tags|author|wp-json|xmlrpc|cgi-bin)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|mov)$/i;

export async function fullScan(browser, url, { psiKey, log = () => {} } = {}) {
  log("start");
  const t = {}; const t0 = Date.now();
  const speedP = Promise.all([pageSpeed(url, "mobile", psiKey), pageSpeed(url, "desktop", psiKey)]);
  // one page at a time keeps memory low on small servers
  const render = await renderAudit(browser, url, { budgetMs: 55000, onStage: (st) => log("render:" + st) });
  const desk = render.ok ? await renderAudit(browser, url, { budgetMs: 40000, mode: "desktop" }).catch((e) => ({ ok: false, error: String(e.message) })) : null;
  t.render = Date.now() - t0; log("rendered");
  if (!render.ok) return { error: "render", render };
  if (desk && desk.ok) { render.desktopFold = desk.desktopFold; render.shots.desktop = desk.shot; }
  const home = new URL(render.finalUrl);
  const homeKey = home.origin + home.pathname.replace(/\/$/, "");
  const same = (u) => u.hostname.replace(/^www\./, "") === home.hostname.replace(/^www\./, "");
  const seen = new Set([homeKey]); const cand = []; let products = 0;
  for (const l of [...render.audit.links.filter((l) => l.internal && l.nav), ...render.audit.links.filter((l) => l.internal && !l.nav)]) {
    let u; try { u = new URL(l.url); } catch { continue; }
    if (!same(u) || SKIP_PATH.test(u.pathname) || u.search.length > 60) continue;
    const k = u.origin + u.pathname.replace(/\/$/, "");
    if (seen.has(k)) continue;
    if (/\/products?\//.test(u.pathname)) { if (products >= 4) continue; products++; }
    seen.add(k); cand.push(u.href); if (cand.length >= 24) break;
  }
  const pages = [];
  for (let i = 0; i < cand.length; i += 8) pages.push(...(await Promise.all(cand.slice(i, i + 8).map((u) => checkPage(u)))));
  const site = await checkSite(home.origin);
  t.pages = Date.now() - t0; log("pages");
  const map = new Map();
  const add = (u, meta) => { const k = u.replace(/#.*$/, ""); if (!map.has(k) && !seen.has(k.replace(/\/$/, "")) && k.replace(/\/$/, "") !== homeKey) map.set(k, { url: k, ...meta }); };
  for (const l of render.audit.links) add(l.url, { internal: l.internal, text: l.text, from: render.finalUrl, kind: "page" });
  for (const p of pages) for (const l of p.links || []) add(l.url, { internal: l.internal, text: l.text, from: p.finalUrl || p.url, kind: "page" });
  let imgs = 0;
  for (const p of pages) for (const im of p.images || []) if (!map.has(im) && imgs < 40) { imgs++; map.set(im, { url: im, internal: same(new URL(im)), from: p.finalUrl || p.url, kind: "image" }); }
  const all = [...map.values()];
  const queue = [...all.filter((x) => x.kind === "page" && x.internal), ...all.filter((x) => x.kind === "page" && !x.internal), ...all.filter((x) => x.kind === "image")].slice(0, 160);
  const res = await checkLinks(queue, 12);
  const links = queue.map((x, i) => ({ ...x, ...res[i] }));
  for (const p of pages) if (p.status === 404 || p.status === 410 || p.status >= 500) links.push({ url: p.url, broken: true, reason: String(p.status), kind: "page", internal: true, from: render.finalUrl });
  t.links = Date.now() - t0; log("links");
  const [mobile, desktop] = await Promise.race([speedP, new Promise((r) => setTimeout(() => r([{ error: "timeout" }, { error: "timeout" }]), 70000))]);
  t.speed = Date.now() - t0;
  return { scan: { render, pages, site, links, linksChecked: true, speed: { mobile, desktop } }, timings: t };
}
