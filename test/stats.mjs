// Funnel tracking: page events counted once per visit, server events at scan,
// report, checkout and request, owner and bots not counted, owner-only stats.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { signUp, freshIp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const fx = await serve(path.join(here, "fixtures", "bad"), 8101);
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
async function page(w = 1200) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 }); await p.setUserAgent(UA); await freshIp(p); p.on("pageerror", (e) => errors.push(e.message)); return p; }
const text = (p) => p.evaluate(() => document.body.innerText);
// a real visitor's browser (the test browser calls itself "HeadlessChrome", which is counted as a bot)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const settle = () => new Promise((r) => setTimeout(r, 400));

// a visitor: home (twice: still one visit), scan, report, unlock, plans, back, build click
const v = await page();
await v.goto(BASE + "/"); await v.waitForSelector("#url"); await settle();
await v.goto(BASE + "/"); await v.waitForSelector("#url"); await settle();
await v.type("#url", "127.0.0.1:8101"); await v.click("#go");
await v.waitForSelector(".rep-head", { timeout: 120000 });
const rid = new URL(v.url()).pathname.split("/").pop();
await v.click(".lock-bar .unlock-btn"); await v.waitForSelector(".plans"); await settle();
await v.goto(BASE + "/r/" + rid); await v.waitForSelector(".rep-head"); await settle(); // reopen: still one report view
await v.evaluate(() => { const a = document.querySelector('a[href^="/fix/"]'); a.addEventListener("click", (e) => e.preventDefault()); a.click(); });
await settle();
// website request from the report
await v.click('[data-req="redesign"]'); await v.waitForSelector(".req-form");
await v.type('.req-form input[name="name"]', "Sam Visitor"); await v.type('.req-form input[name="email"]', "sam@example.com");
await v.click('.req-form button[type="submit"]'); await v.waitForSelector(".req .flash.ok");

// rules the endpoint enforces
const post = (body, ua = UA) => fetch(BASE + "/api/event", { method: "POST", headers: { "content-type": "application/json", "user-agent": ua }, body: JSON.stringify(body) });
ok((await post({ e: "scan_start" })).status === 400, "a browser can't fake server-only events (scan started)");
ok((await post({ e: "paid" })).status === 400, "a browser can't fake a payment");
ok((await post({ e: "nonsense" })).status === 400, "unknown events are refused");
ok((await (await post({ e: "home_view", ref: "https://www.google.com/search?q=x" }, "Googlebot/2.1")).json()).skipped, "bots aren't counted");
ok((await (await post({ e: "home_view" }, "Mozilla/5.0 HeadlessChrome/141.0")).json()).skipped, "headless browsers aren't counted");
ok((await post({ e: "home_view", ref: "https://www.google.com/search?q=plumber" })).status === 200, "a visit from Google is counted");
ok((await fetch(BASE + "/api/event")).status === 403, "stats are owner only (signed out)");
const stranger = await page();
await signUp(stranger, BASE, { email: "someone@example.com" });
await stranger.goto(BASE + "/stats"); await stranger.waitForFunction(() => /Owner only/.test(document.body.innerText));
ok(true, "a signed-in customer sees 'Owner only' on /stats");

// the owner: their own visits don't count
const o = await page();
await signUp(o, BASE, { email: "michaelbailie88@icloud.com", name: "Michael Bailie", business: "The Lazy Creator Company" });
await o.goto(BASE + "/"); await o.waitForSelector("#url"); await settle();
await o.goto(BASE + "/account"); await o.waitForSelector("#statsLink");
ok(true, "owner dashboard links to the stats");
await o.goto(BASE + "/stats"); await o.waitForSelector(".st-funnel");
const s = await o.evaluate(() => fetch("/api/event?days=7").then((r) => r.json()));
const t = s.total;
console.log("   totals:", JSON.stringify(t), "sources:", JSON.stringify(s.sources), "tags:", JSON.stringify(s.tags));
ok(t.home_view === 2, "home visits: 2 (the visitor once per visit + one from Google; owner, bots and repeat loads not counted)");
ok(t.scan_start === 1 && s.tags.scan_start.free === 1, "scan started: 1 free scan");
ok(t.scan_done === 1, "scan finished: 1");
ok(t.report_view === 1, "report opened: 1 (reopening the same report doesn't double count)");
ok(t.unlock_click === 1 && t.plans_view === 1, "unlock click and plans view: 1 each");
ok(t.build_click === 1, "“Start my new website” click: 1");
ok(t.lead_sent === 1 && s.tags.lead_sent.redesign === 1, "website request: 1 (redesign)");
ok(!t.paid && !t.checkout_start, "no payments counted that didn't happen");
ok(s.sources.some(([h, n]) => h === "google.com" && n === 1) && s.sources.some(([h]) => h === "direct"), "visit sources: google.com and direct");
const st = await text(o);
ok(/Where people drop off/.test(st) && /Visited the home page/.test(st) && /50% of the step above/.test(st) && /100% of “opened a report”/.test(st), "stats page shows the funnel with step-to-step drop-off");
ok(/Where visitors came from/.test(st) && /google\.com/.test(st) && /Day by day/.test(st), "stats page shows sources and a daily table");
await o.screenshot({ path: out("stats-1.png"), fullPage: true });
await o.click('[data-days="30"]'); await o.waitForFunction(() => document.querySelector('[data-days="30"]').classList.contains("on"));
ok((await o.$$eval(".st-table tbody tr", (r) => r.length)) === 30, "30-day view shows 30 days");

// phone: no sideways scroll
const m = await page(390);
await m.setCookie(...(await o.cookies()));
await m.goto(BASE + "/stats"); await m.waitForSelector(".st-funnel");
ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "stats page fits a phone screen");
await m.screenshot({ path: out("stats-phone.png"), fullPage: true });

ok(!errors.length, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close(); fx.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
