// You vs a competitor: side-by-side summary on a report, one per report, never
// a full second report, and it doesn't use up the competitor's own free scan.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { freshIp, apiSignUp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const fxA = await serve(path.join(here, "fixtures", "bad"), 8101);
const fxB = await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2");
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
async function page(w = 1200) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 }); await freshIp(p); p.on("pageerror", (e) => errors.push(e.message)); return p; }
const text = (p) => p.evaluate(() => document.body.innerText);
const get = (u, h = {}) => fetch(BASE + u, { headers: h }).then(async (r) => ({ status: r.status, data: await r.json() }));

// free scan of the "bad" site
const p = await page();
await p.goto(BASE + "/"); await p.waitForSelector("#url");
await p.type("#url", "127.0.0.1:8101"); await p.click("#go");
await p.waitForSelector(".rep-head", { timeout: 120000 });
const rid = new URL(p.url()).pathname.split("/").pop();
ok(!!(await p.$("#rival .rival-form")), "report offers a competitor comparison");
await p.click("#rival .rival-form button"); await p.waitForSelector("#rival .form-err:not([hidden])");
ok(/theircompany\.com/.test(await p.$eval("#rival .form-err", (e) => e.textContent)), "empty address is caught");
await p.type("#rivalUrl", "127.0.0.1:8101"); await p.click("#rival .rival-form button");
await p.waitForFunction(() => /same website/.test(document.querySelector("#rival .form-err").textContent));
ok(true, "comparing with your own site is refused");
await p.evaluate(() => (document.querySelector("#rivalUrl").value = "")); await p.type("#rivalUrl", "127.0.0.2:8102"); await p.click("#rival .rival-form button");
await p.waitForSelector("#rival .rival-wait"); ok(/Checking 127\.0\.0\.2/.test(await text(p)), "shows that the competitor is being checked");
await p.waitForSelector("#rival .rival-table", { timeout: 180000 });
let t = await text(p);
const parent = (await get("/api/report?id=" + rid)).data;
const cid = parent.compare && parent.compare.id;
ok(!!cid && parent.compare.site === "127.0.0.2", "the comparison is saved on the report");
ok(/127\.0\.0\.2 is ahead of you by \d+ points/.test(t), "verdict: the clean competitor is ahead");
ok((await p.$$eval(".rival-table td.win", (x) => x.length)) > 0 && /Fix now/.test(t) && /Checks passed/.test(t) && /Broken things/.test(t) && /issues by type/i.test(t), "side-by-side table with the better side highlighted");
ok(!!(await p.$("#rival .unlock-btn")), "free report: the comparison leads to unlocking the full report");
await p.screenshot({ path: out("compare-1.png"), fullPage: false, clip: await p.$eval("#rival", (e) => { const r = e.getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height }; }) });

// what the server gives out about the competitor: a summary only
const c = (await get("/api/report?id=" + cid)).data;
ok(c.kind === "compare" && typeof c.score === "number" && c.counts && !("scan" in c) && !("findings" in c) && !("report" in c) && !("url" in c), "competitor record returns only a summary (no findings, no scan)");
ok((await get("/api/report?id=" + cid)).data.top.length <= 3, "at most their 3 biggest problem titles");
const again = await fetch(BASE + "/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: rid, url: "example.org" }) });
ok(again.status === 409, "one comparison per report");
const fromCmp = await fetch(BASE + "/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: cid, url: "example.org" }) });
ok(fromCmp.status === 404, "a comparison can't be compared again");
const acct = await apiSignUp(BASE, "cmp@example.com");
ok((await get("/api/fix?report=" + cid, { cookie: acct.cookie })).status === 404, "the new-website guide refuses a competitor record");

// opening the report again shows the comparison; a competitor link goes to its report
await p.goto(BASE + "/r/" + rid); await p.waitForSelector("#rival .rival-table", { timeout: 30000 });
ok(true, "reopening the report shows the comparison");
await p.goto(BASE + "/r/" + cid); await p.waitForSelector(".rep-head", { timeout: 30000 });
ok(new URL(p.url()).pathname === "/r/" + rid, "a competitor record link opens the report it belongs to");

// the competitor still has its own free scan
const q = await page();
await q.goto(BASE + "/"); await q.waitForSelector("#url");
await q.type("#url", "127.0.0.2:8102"); await q.click("#go");
await q.waitForSelector(".rep-head, .plans", { timeout: 120000 });
ok(!!(await q.$(".rep-head")), "the competitor's own free scan is still available");

// phone
const m = await page(360);
await m.goto(BASE + "/r/" + rid); await m.waitForSelector("#rival .rival-table", { timeout: 30000 });
ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "comparison fits a 360px phone");
for (const w of [320, 360, 390]) {
  await m.setViewport({ width: w, height: 800 }); await new Promise((r) => setTimeout(r, 150));
  const bad = await m.$$eval(".rival-table th, .rival-table td", (els) => els.filter((e) => {
    if (e.scrollWidth > e.clientWidth + 1) return true;
    // no word split across lines: each word must fit on one line inside its cell
    const r = document.createRange(); const words = [];
    // (website names may wrap: they can be longer than the column)
    const walk = (n) => n.nodeType === 3 ? words.push(n) : n.classList && n.classList.contains("one-line") ? null : n.childNodes.forEach(walk); walk(e);
    return words.some((n) => [...n.textContent.matchAll(/\S+/g)].some((m) => { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); return r.getClientRects().length > 1; }));
  }).map((e) => e.textContent.trim()));
  ok(!bad.length && (await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth)), `comparison table: nothing spills over at ${w}px` + (bad.length ? " (" + bad.join(", ") + ")" : ""));
}
await m.setViewport({ width: 360, height: 800 });
await m.evaluate(() => document.querySelector("#rival").scrollIntoView());
await m.screenshot({ path: out("compare-phone.png") });

const ev = await (await import("../netlify/lib/events.mjs")).summary(1);
ok(ev.total.compare_start === 1 && ev.total.scan_start === 2 && ev.total.scan_done === 2, "funnel: 1 comparison; competitor checks aren't counted as scans");
ok(!errors.length, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close(); fxA.close(); fxB.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
