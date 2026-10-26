// The share card: a 1200x630 PNG of a report's score (the size social sites
// use for link previews). Drawn by the scanner's own browser and kept in Blobs.
import { cards } from "./store.mjs";
import { buildReport } from "../../public/rules.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// only a plain HindSited report gets a card (not competitor checks or agency-branded reports)
export const cardable = (r) => !!r && r.state === "done" && !!r.scan && !r.kind && !r.brand;

export function cardInfo(r) {
  const rep = buildReport(r.scan);
  const n = (s) => rep.findings.filter((f) => f.severity === s).length;
  const host = (() => { try { return new URL(r.scan.render.finalUrl || r.url).hostname.replace(/^www\./, ""); } catch { return r.site; } })();
  return { host, score: rep.score, grade: rep.grade.label, now: n("Fix now"), soon: n("Fix soon"), passed: rep.passed.length };
}

export function cardHtml(i) {
  const color = i.score >= 90 ? "#1d7347" : i.score >= 75 ? "#b86b00" : "#e5461d";
  const C = 2 * Math.PI * 120;
  const hostSize = i.host.length > 30 ? 40 : i.host.length > 22 ? 50 : 62;
  const chip = (n, label, cls) => `<span class="chip ${cls}">${n} ${label}</span>`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,700..900&family=Public+Sans:wght@500;700&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#f4f1ea;color:#14161b;font-family:"Public Sans",Arial,sans-serif}
.c{display:flex;height:630px}
.l{width:470px;background:#14161b;display:flex;align-items:center;justify-content:center;position:relative}
.dial{position:relative;width:300px;height:300px}
.dial svg{transform:rotate(-90deg)}
.num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}
.num b{font:900 118px/1 "Archivo",Arial,sans-serif;font-stretch:110%;letter-spacing:-.02em}
.num small{font-size:22px;color:#b9b6ae;margin-top:6px}
.r{flex:1;padding:58px 64px 50px;display:flex;flex-direction:column}
.k{font:700 20px/1 "Public Sans",Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#e5461d}
.host{font:850 ${hostSize}px/1.05 "Archivo",Arial,sans-serif;font-stretch:106%;letter-spacing:-.015em;margin-top:26px;word-break:break-all}
.grade{font:700 30px/1.2 "Public Sans",Arial,sans-serif;color:#3a3e47;margin-top:16px}
.chips{display:flex;flex-wrap:wrap;gap:12px;margin-top:30px}
.chip{font:700 22px/1 "Public Sans",Arial,sans-serif;padding:13px 18px;border-radius:99px;background:#e6e8ec;color:#4a5363}
.chip.now{background:#fbe3da;color:#a32a0c}.chip.soon{background:#f8ead2;color:#7a4700}.chip.ok{background:#dcefe3;color:#1d7347}
.foot{margin-top:auto;display:flex;align-items:center;gap:16px;font:600 22px/1.3 "Public Sans",Arial,sans-serif;color:#3a3e47}
.mark{width:34px;height:34px;border-radius:50%;border:5px solid #14161b;position:relative;flex:none}
.mark:after{content:"";position:absolute;inset:6px;border-radius:50%;background:#e5461d}
.foot b{color:#14161b}
</style></head><body><div class="c">
<div class="l"><div class="dial"><svg width="300" height="300" viewBox="0 0 300 300"><circle cx="150" cy="150" r="120" fill="none" stroke="#3a3e47" stroke-width="22"/><circle cx="150" cy="150" r="120" fill="none" stroke="${color}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - i.score / 100)}"/></svg>
<div class="num"><b>${i.score}</b><small>out of 100</small></div></div></div>
<div class="r"><p class="k">Website check</p><p class="host">${esc(i.host)}</p><p class="grade">${esc(i.grade)}</p>
<div class="chips">${i.now ? chip(i.now, "fix now", "now") : ""}${i.soon ? chip(i.soon, "fix soon", "soon") : ""}${chip(i.passed, "checks passed", "ok")}</div>
<p class="foot"><span class="mark"></span><span><b>HindSited</b> · Check your own website free at hindsited.com</span></p></div>
</div></body></html>`;
}

// draws and saves the card; never throws
export async function makeCard(browser, id, r) {
  if (!cardable(r)) return false;
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    await page.setContent(cardHtml(cardInfo(r)), { waitUntil: "networkidle0", timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
    await cards().set(id, Buffer.from(png));
    return true;
  } catch (e) { console.error("card failed", String(e && e.message).slice(0, 200)); return false; }
  finally { if (page) await page.close().catch(() => {}); }
}
