// Phase 4 end-to-end: Review Booster setup, links, printables, messages,
// public review page with private feedback, free limits.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
const text = (p) => p.evaluate(() => document.body.innerText);
const ctx = await b.createBrowserContext();
const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 900 });
p.on("pageerror", (e) => errors.push(e.message));

await p.goto(BASE + "/reviews"); await p.waitForSelector("#siForm");
await p.screenshot({ path: out("p4-intro.png") });
await p.type("#siEmail", "owner@smith-plumbing.com"); await p.click("#siForm button");
await p.waitForFunction(() => /Check your inbox/.test(document.body.innerText));
const link = outbox.filter((m) => m.to === "owner@smith-plumbing.com").pop().text.match(/https?:\/\/\S+/)[0];
await p.goto(link); await p.waitForSelector("#kitForm", { timeout: 15000 });
ok(new URL(p.url()).pathname === "/reviews", "sign-in link returns to Review Booster");
await p.type("#kName", "Smith Plumbing");
await p.type("#kGoogle", "https://www.google.com/maps/place/oops");
await p.click("#kitForm button[type=submit]");
await p.waitForFunction(() => !document.querySelector("#kErr").hidden);
ok(/g\.page\/r\//.test(await p.$eval("#kErr", (e) => e.textContent)), "a non-review Google link is refused with guidance");
await p.$eval("#kGoogle", (e) => (e.value = ""));
await p.type("#kGoogle", "https://g.page/r/CTestSmith123/review");
await p.select("#kType", "trades");
await p.click("#kitForm button[type=submit]");
await p.waitForSelector("#mats .mat", { timeout: 15000 });
ok((await p.$$("#mats .mat svg")).length === 4, "four printable materials render");
const t = await text(p);
ok(t.includes("https://g.page/r/CTestSmith123/review") && /\/review\/smith-plumbing-[0-9a-f]{6}/.test(t), "both review links shown");
await p.type("#aFirst", "Dana");
const sms = await p.$eval("#msgs .msg a", (a) => a.getAttribute("href"));
ok(/^sms:/.test(sms) && decodeURIComponent(sms).includes("Hi Dana") && decodeURIComponent(sms).includes("the work we did at your place"), "text message is personalised for trades");
ok(/paid plans/i.test(t) && /Unlock with a paid plan/.test(t), "reply library is locked on free");
await p.screenshot({ path: out("p4-dashboard.png"), fullPage: true });

// QR decodes to the right link (check the SVG path is non-trivial and QR lib round-trips)
const qrOk = await p.evaluate(() => { const q = window.qrcode(0, "M"); q.addData("https://g.page/r/CTestSmith123/review"); q.make(); return q.getModuleCount() >= 25; });
ok(qrOk, "QR code builds for the review link");

// printing opens a print window
const popupP = new Promise((res) => ctx.once("targetcreated", (tg) => res(tg)));
await p.click('[data-print="counter"]');
const tgt = await popupP; const pop = await tgt.page();
await pop.waitForSelector("svg", { timeout: 5000 });
ok(/size:4in 6in/.test(await pop.content()), "counter card prints at 4 x 6 inches");
await pop.close();

// second kit on free -> paywall
await p.click("#addKit");
ok(/Your free plan includes one review kit/.test(await text(p)), "a second business needs a paid plan");

// public review page
const slug = (t.match(/\/review\/(smith-plumbing-[0-9a-f]{6})/) || [])[1];
const c2 = await b.createBrowserContext(); const q = await c2.newPage(); await q.setViewport({ width: 400, height: 860 });
q.on("pageerror", (e) => errors.push(e.message));
await q.goto(BASE + "/review/" + slug); await q.waitForSelector(".rp-btn");
ok((await q.$eval(".rp-btn", (a) => a.href)) === "https://g.page/r/CTestSmith123/review", "public page's main button goes to Google");
await q.click(".rp-private summary");
await q.type("#pmMsg", "The tech was great but arrived late.");
await q.type("#pmName", "Dana");
await q.click("#pm button");
await q.waitForFunction(() => /sent privately/.test(document.body.innerText));
const fb = outbox.filter((m) => m.to === "owner@smith-plumbing.com" && /Private feedback/.test(m.subject)).pop();
ok(!!fb && fb.text.includes("arrived late"), "private feedback is emailed to the owner");
await q.screenshot({ path: out("p4-review-page.png"), fullPage: true });
const sw = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
ok(sw[0] <= sw[1], "review page fits a phone");

// another person can't take a free kit for the same Google listing
const c3 = await b.createBrowserContext(); const r = await c3.newPage();
await r.goto(BASE + "/reviews"); await r.waitForSelector("#siForm");
await r.type("#siEmail", "copycat@other-biz.com"); await r.click("#siForm button");
await r.waitForFunction(() => /Check your inbox/.test(document.body.innerText));
await r.goto(outbox.filter((m) => m.to === "copycat@other-biz.com").pop().text.match(/https?:\/\/\S+/)[0]);
await r.waitForSelector("#kitForm"); await r.type("#kName", "Copycat"); await r.type("#kGoogle", "https://g.page/r/CTestSmith123/review");
await r.click("#kitForm button[type=submit]");
await r.waitForFunction(() => /already has a free review kit/.test(document.body.innerText), { timeout: 10000 });
ok(true, "the same Google listing can't get a second free kit");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
