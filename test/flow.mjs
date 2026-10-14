// Free scan with no account, the 60/40 lock (enforced on the server),
// limits, share links, offers, and paid/owner accounts seeing everything.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { signUp, freshIp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
const store = await import("../netlify/lib/store.mjs");
const { buildReport } = await import("../public/rules.js");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
fs.mkdirSync(path.join(here, "out"), { recursive: true });
const fxA = await serve(path.join(here, "fixtures", "bad"), 8101);
const fxB = await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2");
const fxC = await serve(path.join(here, "fixtures", "bad2"), 8103, "127.0.0.3");
const fxD = await serve(path.join(here, "fixtures", "bad"), 8104, "127.0.0.4");
const fxE = await serve(path.join(here, "fixtures", "bad2"), 8105, "127.0.0.5");
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
async function newPage(w = 1200) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 });
  p.on("pageerror", (e) => errors.push(e.message)); await freshIp(p); return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
async function scan(p, site) {
  await p.goto(BASE + "/"); await p.waitForSelector("#url");
  await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", site); await p.click("#go");
  await p.waitForSelector(".rep-head, .plans, .err-box", { timeout: 120000 });
}

// ---- anonymous free scan
const p = await newPage();
await scan(p, "127.0.0.1:8101");
const id = new URL(p.url()).pathname.split("/").pop();
let t = await text(p);
ok(!!(await p.$(".rep-head")) && /Free report: showing \d+ of \d+ issues/.test(t), "free scan runs with no account and shows the free report");
ok((await p.$$(".locked-card")).length > 0 && !(await p.$("#savePdf")), "most serious issues are shown as locked cards; no PDF on free reports");
ok(!!(await p.$("#offers")) && /Start my new website/.test(t) && /From \$500/.test(t) && !/Fix It|I'll fix/.test(t), "report offers one thing: a new website (no 'I'll fix it' promise)");
await p.screenshot({ path: out("p2-free-report.png"), fullPage: true });

// ---- the lock is enforced on the server
const api = await (await fetch(BASE + "/api/report?id=" + id)).json();
const rec = await store.reports().get(id, { type: "json" });
const full = buildReport(rec.scan);
const hiddenTitles = full.findings.slice(0, api.hidden.count).map((f) => f.title);
const raw = JSON.stringify(api);
ok(api.locked === true && api.hidden.count === Math.ceil(full.findings.length * 0.4), `server hides 40% (${api.hidden.count} of ${full.findings.length})`);
ok(api.report.findings.length === full.findings.length - api.hidden.count, "server sends only the other 60%");
ok(hiddenTitles.every((x) => !raw.includes(x)), "none of the hidden issues appear anywhere in the response");
ok(Object.keys(api.scan.render.audit).every((k) => ["title", "desc"].includes(k)) && !api.scan.links && !api.scan.render.deadLinks && api.scan.pages.every((pg) => !pg.findings), "raw scan data is not sent with a locked report");
const minHidden = Math.min(...full.findings.slice(0, api.hidden.count).map((f) => f.w)), maxShown = Math.max(...api.report.findings.map((f) => f.w));
ok(minHidden >= maxShown, "the hidden issues are the most serious ones");

// ---- unlock leads to plans
await p.click(".lock-bar .unlock-btn"); await p.waitForSelector(".plans");
ok(/Unlock your full report/.test(await text(p)) && /create your account/.test(await text(p)), "Unlock shows the plans and explains an account is needed");
await p.click('[data-plan="solo"][data-int="month"]'); await p.waitForSelector('.auth-form input[name="business"]');
ok(true, "choosing a plan while signed out asks to create an account");

// ---- same site again from another connection: already used
const q = await newPage(400);
await scan(q, "127.0.0.1:8101");
ok(/already had its free check/i.test(await text(q)), "a website gets only one free scan, whoever runs it");
// ---- share link: still locked for others
await q.goto(BASE + "/r/" + id); await q.waitForSelector(".rep-head", { timeout: 20000 });
ok(/Free report: showing/.test(await text(q)), "share link of a free report stays locked for other viewers");
ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "free report fits a phone");
await q.screenshot({ path: out("p2-free-report-phone.png"), fullPage: true });

// ---- daily limit per connection (2 free scans a day)
await scan(q, "127.0.0.2:8102");
ok(!!(await q.$(".rep-head")), "a second free scan of a different site works");
await scan(q, "127.0.0.3:8103");
ok(!!(await q.$(".rep-head")), "two free scans a day from one connection");
await scan(q, "127.0.0.4:8104");
ok(/today's free checks/i.test(await text(q)), "a third free scan on the same day is refused");

// ---- redesign request is emailed to the studio
const r = await newPage();
await r.goto(BASE + "/r/" + id); await r.waitForSelector("#offers");
await r.click('[data-req="redesign"]'); await r.waitForSelector('.req-form input[name="name"]');
await r.type('.req-form input[name="name"]', "Pat Owner"); await r.type('.req-form input[name="email"]', "pat@owner-biz.com");
await r.type('.req-form textarea[name="note"]', "Need a new site before spring.");
await r.click(".req-form button[type=submit]"); await r.waitForFunction(() => /Your request is in/.test(document.body.innerText));
const req = outbox.filter((m) => /Redesign request/.test(m.subject)).pop();
ok(!!req && req.to === "thelazycreatorco@gmail.com" && req.replyTo === "pat@owner-biz.com" && req.text.includes("/r/" + id), "redesign request reaches the studio with the report link and reply-to");

// ---- free account: one free scan per account
const f = await newPage();
await signUp(f, BASE, { email: "free.one@cedar-co.com" });
await scan(f, "127.0.0.4:8104");
ok(!!(await f.$(".lock-bar")), "a free account's scan is locked too");
await scan(f, "127.0.0.5:8105");
ok(/already used your free check/i.test(await text(f)), "a free account gets one free scan");

// ---- owner sees everything, and claims the anonymous report when opening it
const o = await newPage();
await signUp(o, BASE, { email: "thelazycreatorco@gmail.com", name: "Michael Bailie", business: "The Lazy Creator Company" });
await o.goto(BASE + "/r/" + id); await o.waitForSelector(".rep-head", { timeout: 20000 });
t = await text(o);
ok(!(await o.$(".lock-bar")) && /Your top 5 fixes/.test(t) && !!(await o.$("#savePdf")), "a paid/owner viewer sees the full report");
ok(!!(await o.$('#offers a[href="/fix/' + id + '"]')), "the offer links to the new-website guide for this report");
await scan(o, "127.0.0.2:8102"); await scan(o, "127.0.0.2:8102");
ok(!!(await o.$(".rep-head")) && !(await o.$(".lock-bar")), "owner can run repeated checks, always full");
await o.goto(BASE + "/account"); await o.waitForSelector(".dash-list.reports");
ok((await o.$$(".dash-list.reports li")).length === 3, "dashboard lists the owner's 2 checks plus the claimed free report");

// ---- API abuse
const bad = await fetch(BASE + "/api/check-bg?id=00000000-0000-0000-0000-000000000000&url=http://127.0.0.1:8101/");
ok(bad.status === 202, "background route answers but ignores unsigned calls");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); [fxA, fxB, fxC, fxD, fxE, dev].forEach((x) => x.close());
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
