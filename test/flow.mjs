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
// ---- what is this costing you? (owner's own numbers)
ok(/Fill in all three/.test(await p.$eval("#loss", (e) => e.innerText)), "loss calculator waits for the owner's own numbers");
await p.type('#loss input[name=enquiries]', "20"); await p.type('#loss input[name=perTen]', "3"); await p.type('#loss input[name=value]', "400");
await p.waitForSelector(".loss-big");
{
  const { estimate } = await import("../public/loss.js");
  const apiR = await (await fetch(BASE + "/api/report?id=" + id)).json();
  const want = estimate({ findings: apiR.report.findings, hidden: apiR.hidden, enquiries: 20, perTen: 3, value: 400 });
  const shown = await p.$eval(".loss-big b", (e) => e.textContent);
  ok(shown === "$" + Math.round(want.lostMonth).toLocaleString("en-CA") && want.lostMonth > 0, `loss estimate matches the formula (${shown}/month)`);
  const sumParts = want.items.reduce((x, i) => x + i.month, 0);
  ok(Math.abs(sumParts - want.lostMonth) < 0.01, "each issue's share adds up exactly to the total");
  ok(want.could <= 20 * 4 + 1e-9, "never claims more than 4x the enquiries they get now");
}
ok(!!(await p.$(".loss-stage.is-hidden .unlock-btn")) && /hidden issues? account for about/.test(await p.$eval("#loss", (e) => e.innerText)), "free report: hidden issues show their cost with an unlock button");
ok(/How we estimate this/.test(await p.$eval("#loss", (e) => e.innerText)), "the estimate shows how it's worked out");
await p.$eval('#loss input[name=perTen]', (e) => { e.value = "12"; e.dispatchEvent(new Event("input", { bubbles: true })); });
ok(/between 0 and 10/.test(await p.$eval(".loss-out", (e) => e.innerText)), "bad numbers get a plain message");
await p.$eval('#loss input[name=perTen]', (e) => { e.value = "3"; e.dispatchEvent(new Event("input", { bubbles: true })); });
// ---- before & after
ok(!!(await p.$("[data-ba] .ba-frame img")) && (await p.$eval(".ba-frame > img", (e) => e.src.startsWith("data:image"))), "before/after uses the customer's real screenshot");
await p.$eval(".ba-range", (e) => { e.value = "20"; e.dispatchEvent(new Event("input", { bubbles: true })); });
ok((await p.$eval(".ba-frame", (e) => e.style.getPropertyValue("--p"))) === "20%", "slider moves the divide");
await p.click('.ba-tab[data-b="1"]');
ok((await p.$eval(".ba-after img", (e) => e.getAttribute("src"))) === "/img/builds/creative-acoustics.jpg" && /Creative Acoustics/.test(await p.$eval(".ba-cap", (e) => e.innerText)), "tabs switch to another real build, with its name and link");
ok(await p.evaluate(async () => (await fetch("/img/builds/staged-right-carpentry.jpg")).ok), "build screenshots are served");
await p.reload(); await p.waitForSelector(".loss-big");
ok((await p.$eval('#loss input[name=value]', (e) => e.value)) === "400", "the owner's numbers are remembered on this device");
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
const q = await newPage(400); const qIp = "10.9.9.9"; await q.setExtraHTTPHeaders({ "x-test-ip": qIp });
await scan(q, "127.0.0.1:8101");
ok(/already had its free check/i.test(await text(q)), "a website gets only one free scan, whoever runs it");
// ---- share link: still locked for others
await q.goto(BASE + "/r/" + id); await q.waitForSelector(".rep-head", { timeout: 20000 });
ok(/Free report: showing/.test(await text(q)), "share link of a free report stays locked for other viewers");
ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "free report fits a phone");
await q.screenshot({ path: out("p2-free-report-phone.png"), fullPage: true });

// ---- one free scan per person: device and connection
await scan(q, "127.0.0.2:8102");
ok(!!(await q.$(".rep-head")), "a person who hasn't used their free scan can scan a different site");
await scan(q, "127.0.0.3:8103");
ok(/already used your free check/i.test(await text(q)) && !!(await q.$('a[href^="/r/"]')), "the same device can't run a second free scan on another site (and gets a link back to its report)");
const sameIp = await (await b.createBrowserContext()).newPage(); await sameIp.setViewport({ width: 1200, height: 900 });
await sameIp.setExtraHTTPHeaders({ "x-test-ip": qIp });
await scan(sameIp, "127.0.0.3:8103");
ok(/already used your free check/i.test(await text(sameIp)), "a new browser on the same internet connection can't either (30 days)");

// ---- redesign request is emailed to the studio
const r = await newPage();
await r.goto(BASE + "/r/" + id); await r.waitForSelector("#offers");
await r.click('[data-req="redesign"]'); await r.waitForSelector('.req-form input[name="name"]');
await r.type('.req-form input[name="name"]', "Pat Owner"); await r.type('.req-form input[name="email"]', "pat@owner-biz.com");
await r.type('.req-form textarea[name="note"]', "Need a new site before spring.");
await r.click(".req-form button[type=submit]"); await r.waitForFunction(() => /Your request is in/.test(document.body.innerText));
const req = outbox.filter((m) => /Redesign request/.test(m.subject)).pop();
ok(!!req && req.to === "thelazycreatorco@gmail.com" && req.replyTo === "pat@owner-biz.com" && req.text.includes("/r/" + id), "redesign request reaches the studio with the report link and reply-to");

// ---- request a new website with no scan and no account
const ns = await newPage(390);
await ns.goto(BASE + "/"); await ns.waitForSelector('.hero-alt a[href="/new-website"]');
await Promise.all([ns.waitForNavigation(), ns.click('.hero-alt a[href="/new-website"]')]);
await ns.waitForSelector("#ns");
await ns.click('#ns button[type=submit]'); await ns.waitForSelector("#ns .form-err:not([hidden])");
ok(/name/.test(await ns.$eval("#ns .form-err", (e) => e.textContent)), "new-website form checks the details before sending");
ok(/\$25 CAD a month/.test(await text(ns)) && /50% to start/.test(await text(ns)), "new-website form shows the costs before sending");
await ns.type('#ns input[name=name]', "Robin Baker"); await ns.type('#ns input[name=email]', "robin@robins-bakery.ca"); await ns.type('#ns input[name=business]', "Robin's Bakery");
await ns.click('#ns input[name=domain][value=none]'); await ns.click('#ns input[value="Online booking"]');
await ns.type('#ns textarea[name=note]', "Need it before Christmas.");
await ns.click('#ns button[type=submit]'); await ns.waitForSelector(".fx-final");
const nm = outbox.filter((m) => /New website request: Robin's Bakery/.test(m.subject)).pop();
ok(!!nm && nm.replyTo === "robin@robins-bakery.ca" && nm.text.includes("No web address yet") && nm.text.includes("Online booking") && nm.text.includes("Need it before Christmas."), "the request reaches you with business, web address status, needs and notes, and reply-to");
ok(await ns.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "new-website page fits a phone");

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
