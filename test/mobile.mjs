// Mobile layout audit: every screen of all three tools, at phone and tablet
// widths. Flags sideways scroll, anything running off the screen, and
// elements that overlap each other. Saves a screenshot of each screen.
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", "mobile"); fs.mkdirSync(OUT, { recursive: true });
await serve(path.join(here, "fixtures", "bad"), 8101);
await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2");
await serve(path.join(here, "fixtures", "bad2"), 8103, "127.0.0.3");
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const WIDTHS = (process.env.WIDTHS || "320,360,375,390,414,768,900,1024").split(",").map(Number);
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
const errors = [];
let problems = 0, screens = 0;

async function page(ctx) { const p = await ctx.newPage(); await p.setViewport({ width: 375, height: 800 }); p.on("pageerror", (e) => errors.push(p.url() + " " + e.message)); await freshIp(p); return p; }
import { signUp, freshIp } from "./helpers.mjs";
// In-page checks. Returns a list of human-readable problems.
const AUDIT = () => {
  const vw = document.documentElement.clientWidth, out = [];
  const name = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += "#" + el.id; else if (el.className && typeof el.className === "string") s += "." + el.className.trim().split(/\s+/).slice(0, 2).join("."); const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30); return t ? `${s} "${t}"` : s; };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const inScroller = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const ox = getComputedStyle(a).overflowX; if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return a; } return null; };
  // hidden if any closed <details> above it doesn't own it through its own summary
  const inClosed = (el) => { for (let d = el.closest("details:not([open])"); d; d = d.parentElement && d.parentElement.closest("details:not([open])")) { const sum = d.querySelector(":scope > summary"); if (!(sum && sum.contains(el))) return true; } return false; };
  const decor = (el) => !!el.closest(".dial, .chart-card, .pw-show, .lc-blur, .lock-ic");
  const srOnly = (el) => { for (let a = el; a; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.clip && cs.clip !== "auto" || cs.clipPath && cs.clipPath !== "none" || a.classList?.contains("sr") || a.classList?.contains("skip") || a.classList?.contains("hp")) return true; } return false; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px wide on a ${vw}px screen)`);
  const all = [...document.body.querySelectorAll("*")].filter((el) => !["SCRIPT", "STYLE", "BR", "OPTION"].includes(el.tagName) && visible(el) && !srOnly(el) && !inClosed(el));
  // off the edge
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) { const anyChildOff = [...el.children].some((c) => { const cr = c.getBoundingClientRect(); return cr.right > vw + 1 || cr.left < -1; }); if (!anyChildOff) out.push(`runs off screen: ${name(el)} (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`); }
  }
  // clipped inside a scroller that isn't meant to scroll (overflow hidden cutting content)
  for (const el of all) {
    const cs = getComputedStyle(el);
    if ((cs.overflowX === "hidden" || cs.overflowX === "clip") && el.scrollWidth > el.clientWidth + 2 && !(["INPUT","TEXTAREA","SELECT"].includes(el.tagName) && el.clientWidth >= 100) && cs.textOverflow !== "ellipsis" && el.tagName !== "BODY" && el.tagName !== "HTML" && !el.matches(".devices, .dev-phone, .dev-desk, .fix-shot, .wrap-x")) out.push(`content cut off inside ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
  }
  // text spilling out of its own box (long words, emails, links)
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.overflowX !== "visible" || decor(el) || ["INPUT", "TEXTAREA", "SELECT", "BODY", "HTML", "svg"].includes(el.tagName) || el.closest("svg")) continue;
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && ![...el.children].some((c) => c.scrollWidth > c.clientWidth + 1 || c.getBoundingClientRect().right > el.getBoundingClientRect().right + 1)) out.push(`text spills past its box: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
  }
  // overlaps between "leaf" things people see: text-bearing elements, controls, images
  const leaf = all.filter((el) => {
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "IMG", "CANVAS", "IFRAME"].includes(el.tagName)) return true;
    if (el.closest("svg") && el.tagName !== "svg") return false;
    if (el.tagName === "svg") return true;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  }).filter((el) => !el.closest("button, select, label.opt") || ["BUTTON", "SELECT"].includes(el.tagName) || el.matches("label.opt"));
  const rects = leaf.map((el) => {
    // for text, use the text's own box, not the block's full width
    let r = el.getBoundingClientRect();
    if (!["INPUT", "SELECT", "TEXTAREA", "BUTTON", "IMG", "CANVAS", "IFRAME", "svg"].includes(el.tagName) && getComputedStyle(el).display === "block") {
      const range = document.createRange(); range.selectNodeContents(el); const rr = range.getBoundingClientRect(); const own = el.getBoundingClientRect();
      if (rr.width > 0) { const L = Math.max(rr.left, own.left), R = Math.min(rr.right, own.right), T = Math.max(rr.top, own.top), B = Math.min(rr.bottom, own.bottom); r = { left: L, right: R, top: T, bottom: B, width: R - L, height: B - T }; }
    }
    const rs = getComputedStyle(el).display === "inline" ? [...el.getClientRects()].filter((x) => x.width > 1) : [r];
    return { el, r, rs };
  }).filter((x) => !decor(x.el));
  const seen = new Set();
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j];
    if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const ma = !!A.el.closest(".menu.open, .acct-pop"), mb = !!B.el.closest(".menu.open, .acct-pop"); if (ma !== mb) continue;
    const clipA = getComputedStyle(A.el).overflow !== "visible", clipB = getComputedStyle(B.el).overflow !== "visible";
    if (clipA) A.rs = [A.el.getBoundingClientRect()]; if (clipB) B.rs = [B.el.getBoundingClientRect()];
    const pa = getComputedStyle(A.el).position, pb = getComputedStyle(B.el).position;
    if (pa === "fixed" || pb === "fixed") continue;
    let w = 0, h = 0;
    for (const ra of A.rs) for (const rb of B.rs) { const ww = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), hh = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top); if (ww > 3 && hh > 3) { w = ww; h = hh; } }
    if (w > 3 && h > 3) { const k = name(A.el) + " / " + name(B.el); if (!seen.has(k)) { seen.add(k); out.push(`overlap: ${k} (${Math.round(w)}x${Math.round(h)})`); } }
  }
  // tap targets: tiny buttons/links that are standalone controls
  if (vw < 900) for (const el of all.filter((e) => e.matches("button, a.btn, .linkish, nav a, .acct-signin, .menu-btn, input[type=checkbox], input[type=radio]"))) {
    const r = el.getBoundingClientRect();
    if (el.matches("input[type=checkbox], input[type=radio]")) continue;
    if (r.height < 24 && !el.closest("p, li")) out.push(`small tap target: ${name(el)} (${Math.round(r.width)}x${Math.round(r.height)})`);
  }
  // text too small to read on a phone
  for (const el of leaf) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 11 && !el.closest("svg") && el.tagName !== "svg") out.push(`tiny text (${fs}px): ${name(el)}`); }
  // an email address or web address broken across two lines
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[a-z0-9-]+\.)+(?:com|ca|org|net|app|dev|io|co)\b(?:\/[\w\/-]*)?/gi;
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement;
    if (!el || !visible(el) || srOnly(el) || inClosed(el) || el.closest("input, textarea, code, .embed-code, script, style")) continue;
    let m; RE.lastIndex = 0;
    while ((m = RE.exec(n.textContent))) {
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push(`address split over two lines: "${m[0]}" in ${name(el)}`);
    }
  }
  // headings too big for a phone
  if (vw <= 480) for (const el of leaf) { if (decor(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs > 42) out.push(`text too big for a phone (${fs}px): ${name(el)}`); }
  return [...new Set(out)];
};

async function check(p, label, opts = {}) {
  if (ONLY && !ONLY.test(label)) return;
  screens++;
  for (const w of WIDTHS) {
    await p.setViewport({ width: w, height: 800 });
    await new Promise((r) => setTimeout(r, 150));
    if (opts.before) await opts.before(p);
    const issues = await p.evaluate(AUDIT);
    const ignore = opts.ignore || [];
    const real = issues.filter((m) => !ignore.some((re) => re.test(m)));
    if (real.length) { problems += real.length; console.log(`\n✗ ${label} @${w}px`); for (const m of real.slice(0, 25)) console.log("   - " + m); if (real.length > 25) console.log(`   … ${real.length - 25} more`); }
    if (w === 375 || w === 320 || w === 768) await p.screenshot({ path: path.join(OUT, `${label}-${w}.png`), fullPage: true });
  }
  await p.setViewport({ width: 375, height: 800 });
}
const menuOpen = async (p) => { const m = await p.$(".menu-btn"); if (m && await m.evaluate((e) => getComputedStyle(e).display !== "none")) { await m.click(); await new Promise((r) => setTimeout(r, 300)); } };
const menuClose = async (p) => { const m = await p.$(".menu-btn[aria-expanded=true]"); if (m) { await m.click(); await new Promise((r) => setTimeout(r, 300)); } };

const scanTo = async (p, site) => { await p.goto(BASE + "/"); await p.waitForSelector("#url"); await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", site); await p.click("#go"); };
const openMenuEach = { before: async (p) => { const vis = await p.$eval(".menu-btn", (e) => getComputedStyle(e).display !== "none"); if (vis && !(await p.$(".menu-btn[aria-expanded=true]"))) await menuOpen(p); } };
const openPopEach = { before: async (p) => { if (await p.$eval("#acctPop", (e) => e.hidden)) { await p.click("#acctBtn"); await new Promise((r) => setTimeout(r, 150)); } } };

// ---------------------------------------------------------------- signed out
const cA = await b.createBrowserContext(); const a = await page(cA);
await a.goto(BASE + "/"); await a.waitForSelector("#acct .acct-signin");
await check(a, "home");
await menuOpen(a); await check(a, "home-menu-open", openMenuEach); await menuClose(a);
await a.goto(BASE + "/account"); await a.waitForSelector(".auth-form"); await check(a, "signin");
await a.goto(BASE + "/account?mode=signup"); await a.waitForSelector('.auth-form input[name="business"]'); await check(a, "signup");
await a.click(".auth-go"); await a.waitForSelector(".auth .form-err:not([hidden])"); await check(a, "signup-error");
await a.goto(BASE + "/account?mode=forgot"); await a.waitForSelector(".auth-form"); await check(a, "forgot");
await a.goto(BASE + "/reset?t=bad"); await a.waitForSelector(".auth-form"); await check(a, "reset");
await a.goto(BASE + "/reviews"); await a.waitForSelector("#signin .auth-form"); await check(a, "booster-intro");
await a.goto(BASE + "/quotes"); await a.waitForSelector("#signin .auth-form"); await check(a, "quotes-intro");
for (const pg of ["privacy", "terms", "cancel"]) { await a.goto(BASE + "/" + pg); await a.waitForSelector("#siteFoot .foot-grid"); await check(a, pg); }
await a.goto(BASE + "/"); await a.waitForSelector("#url"); await a.click("#go"); await a.waitForSelector("#formErr:not([hidden])"); await check(a, "home-form-error");

// ---------------------------------------------------------------- free scan with no account
await scanTo(a, "127.0.0.1:8101");
await a.waitForSelector("#progress:not([hidden])", { timeout: 15000 }); await check(a, "progress");
await a.waitForSelector(".rep-head", { timeout: 120000 });
await a.evaluate(() => document.querySelectorAll("details.cat").forEach((d) => (d.open = true)));
await check(a, "report-free");
const freeId = new URL(a.url()).pathname.split("/").pop();
await a.click('[data-req="redesign"]'); await a.waitForSelector(".req-form"); await check(a, "offer-form");
await a.type('.req-form input[name="name"]', "Avery Long-Name"); await a.type('.req-form input[name="email"]', "avery.with.a.long.address@example-home-services.com");
await a.click(".req-form button[type=submit]"); await a.waitForFunction(() => /Your request is in/.test(document.body.innerText)); await check(a, "offer-sent");
await a.click(".lock-bar .unlock-btn"); await a.waitForSelector(".plans"); await check(a, "paywall-unlock");

// ---------------------------------------------------------------- free account (long email on purpose)
const LONG = "free.user.with.a.long.name@cedar-bakery-and-cafe.com";
const cC = await b.createBrowserContext(); const c = await page(cC);
await signUp(c, BASE, { email: LONG, name: "Alexandra Montgomery-Fitzgerald", business: "Cedar Bakery and Café on Main Street", website: "cedar-bakery-and-cafe.com" });
await c.waitForSelector(".dash"); await check(c, "dashboard-free");
await check(c, "account-menu", openPopEach); await c.keyboard.press("Escape");
await c.goto(BASE + "/reviews"); await c.waitForSelector("#kitForm"); await check(c, "booster-setup");
await c.type("#kName", "Cedar Bakery and Café on Main Street"); await c.type("#kGoogle", "https://g.page/r/CCedarBakery1/review");
await c.click("#kitForm button[type=submit]"); await c.waitForSelector("#mats .mat", { timeout: 15000 });
await c.type("#aFirst", "Dana"); await check(c, "booster-dashboard-free");
await c.click("#addKit"); await c.waitForSelector(".plans, #pwBack"); await check(c, "booster-paywall");
await c.goto(BASE + "/quotes"); await c.waitForSelector("#svcList .row-ed"); await check(c, "quotes-builder");
await c.click('input[name="bMode"][value="none"]'); await check(c, "quotes-builder-noprice"); await c.click('input[name="bMode"][value="range"]');
await c.$eval("#bBiz", (e) => (e.value = "")); await c.type("#bBiz", "Cedar Cleaning Co."); await c.click("#bSave"); await c.waitForSelector("#emb", { timeout: 15000 });
await check(c, "quotes-dashboard-free");
const qslug = (await c.evaluate(() => document.body.innerText)).match(/\/q\/([a-z0-9-]+)/)[1];
if (await c.$("#cNew")) { await c.click("#cNew"); await c.waitForSelector(".plans, #pwBack", { timeout: 8000 }).catch(() => {}); await check(c, "quotes-paywall"); }
await c.goto(BASE + "/account"); await c.waitForSelector(".dash");
await c.evaluate(() => document.querySelectorAll("details.set").forEach((d) => (d.open = true)));
await check(c, "dashboard-settings-open");

// ---------------------------------------------------------------- owner: full report, branding, moderation, error
const cB = await b.createBrowserContext(); const o = await page(cB);
await signUp(o, BASE, { email: "michaelbailie88@icloud.com", name: "Michael Bailie", business: "The Lazy Creator Company", website: "thelazycreatorcompany.com" });
await o.waitForSelector(".dash");
await o.goto(BASE + "/r/" + freeId); await o.waitForSelector(".rep-head", { timeout: 20000 });
// give the report a long domain + registrar so "About your website" is tested at its widest
{ const store = await import("../netlify/lib/store.mjs"); const r = await store.reports().get(freeId, { type: "json" });
  r.scan.render.audit.signals.platform = "Squarespace";
  r.scan.domain = { name: "cedar-bakery-and-cafe-on-main-street.com", registrar: "Network Solutions, LLC", created: "2014-03-01T00:00:00.000Z", expires: new Date(Date.now() + 30 * 864e5).toISOString() };
  await store.reports().setJSON(freeId, r); }
await o.reload(); await o.waitForSelector(".rep-head", { timeout: 20000 });
await o.evaluate(() => document.querySelectorAll("details.cat").forEach((d) => (d.open = true)));
await check(o, "report-full");
// new-website guide: every step
await o.goto(BASE + "/fix/" + freeId); await o.waitForSelector("#aboutForm"); await check(o, "fix-about");
await o.$eval('#aboutForm input[name=business]', (e) => (e.value = "")); await o.click('#aboutForm button[type=submit]'); await o.waitForSelector("#aboutForm .form-err:not([hidden])"); await check(o, "fix-about-error");
await o.type('#aboutForm input[name=business]', "Cedar Bakery and Café on Main Street"); await o.click('#aboutForm input[value="Online booking"]'); await o.click('#aboutForm input[value="Photo gallery or portfolio"]');
await o.type('#aboutForm textarea[name=note]', "We'd love a warmer look, bigger photos of the bread, and a simple way to order cakes for pick-up.");
await o.click('#aboutForm button[type=submit]'); await o.waitForSelector("[data-d]"); await check(o, "fix-domain");
await o.evaluate(() => document.querySelectorAll(".fx-more").forEach((d) => (d.open = true))); await check(o, "fix-domain-open");
await o.click("[data-stuck]"); await check(o, "fix-stuck"); await o.click("[data-stuck]");
await o.click('[data-d="locked"]'); await o.waitForSelector("#gotIn"); await check(o, "fix-recover");
await o.click("#skip"); await o.waitForSelector("#send"); await check(o, "fix-send");
await o.click("#send"); await o.waitForSelector(".fx-final"); await check(o, "fix-done");
const cE = await b.createBrowserContext(); const anon2 = await page(cE); await anon2.goto(BASE + "/fix/" + freeId); await anon2.waitForFunction(() => /Sign in to continue/.test(document.body.innerText)); await check(anon2, "fix-signed-out");
await scanTo(o, "127.0.0.1:9"); await o.waitForSelector(".err-box", { timeout: 120000 }); await check(o, "scan-error");
await c.goto(BASE + "/account#review"); await c.waitForSelector("#revForm");
await c.click(".star-pick label:nth-of-type(4)"); await c.type('#revForm textarea[name="text"]', "Really useful. Found things on our site we never would have spotted ourselves.");
await c.click("#revForm button[type=submit]"); await c.waitForFunction(() => /will appear once/.test(document.body.innerText));
await o.goto(BASE + "/account"); await o.waitForSelector("#moderate"); await check(o, "dashboard-owner");
await o.click("#moderate [data-act=approve]"); await o.waitForFunction(() => /approved/i.test(document.querySelector("#moderate").innerText));
await o.goto(BASE + "/"); await o.waitForSelector("#sayso:not([hidden])"); await check(o, "home-with-reviews");
await o.goto(BASE + "/reviews"); await o.waitForSelector("#kitForm");
await o.type("#kName", "Smith Plumbing"); await o.type("#kGoogle", "https://g.page/r/CSmithOwner1/review");
await o.click("#kitForm button[type=submit]"); await o.waitForSelector("#mats .mat", { timeout: 15000 });
await check(o, "booster-dashboard-paid");
const rslug = (await o.evaluate(() => document.body.innerText)).match(/\/review\/([a-z0-9-]+)/)[1];

// help, builds, payment pages
await o.goto(BASE + "/builds"); await o.waitForSelector("#newB"); await check(o, "builds-empty");
await o.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await check(o, "builds-how-open");
// ---------------------------------------------------------------- public pages
const cD = await b.createBrowserContext(); const v = await page(cD);
await v.goto(BASE + "/review/" + rslug); await v.waitForSelector(".rp-btn"); await check(v, "review-public");
await v.click(".rp-private summary"); await check(v, "review-public-note");
await v.goto(BASE + "/q/" + qslug); await v.waitForSelector(".calc-amount"); await check(v, "quote-public");
await v.type('input[name="name"]', "Avery"); await v.type('input[name="email"]', "avery@example-home.com"); await v.click(".calc-btn"); await v.waitForSelector(".calc-done"); await check(v, "quote-public-sent");
const host = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;padding:16px;font-family:sans-serif"><h1>Client site</h1><script src="${BASE}/embed.js" data-calc="${qslug}" async></script>`); }); await new Promise((r) => host.listen(8150, "127.0.0.1", r));
await v.goto("http://127.0.0.1:8150/"); await v.waitForSelector("iframe"); await new Promise((r) => setTimeout(r, 2000)); await check(v, "quote-embed");
await v.goto(BASE + "/help"); await v.waitForSelector(".hq"); await check(v, "help");
await v.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true))); await check(v, "help-all-open");
await v.goto(BASE + "/help"); await v.waitForSelector("#hq"); await v.type("#hq", "domain"); await check(v, "help-search");
for (const k of ["deposit", "launch", "card", "cancelled", "bad"]) { await v.goto(BASE + "/paid?k=" + k); await v.waitForSelector("#paid h1"); await check(v, "paid-" + k); }
await v.goto(BASE + "/r/does-not-exist-000000000000000000"); await new Promise((r) => setTimeout(r, 2500)); await check(v, "report-missing");

console.log(`\n${screens} screens x ${WIDTHS.length} widths checked. ${problems} problems.` + (errors.length ? `\nPAGE ERRORS: ${errors.join(" | ")}` : ""));
await b.close(); host.close(); dev.close?.();
process.exit(problems || errors.length ? 1 : 0);
