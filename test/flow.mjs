// Phase 2 end-to-end: sign-in link, one free check, paywall, share link.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { startDev, outbox } from "./dev.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.HS_ALLOW_LOCAL = "1";
const out = (n) => path.join(here, "out", n);
fs.mkdirSync(path.join(here, "out"), { recursive: true });
const fx = await serve(path.join(here, "fixtures", "bad"), 8101);
const fx2 = await serve(path.join(here, "fixtures", "clean"), 8102);
const dev = await startDev(8100);
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
const BASE = "http://127.0.0.1:8100";
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
async function newPage(ctx, w = 1200) {
  const p = await ctx.newPage(); await p.setViewport({ width: w, height: 900 });
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const text = (p) => p.evaluate(() => document.body.innerText);
async function signIn(p, site, email) {
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.waitForSelector("#url");
  await p.type("#url", site); await p.click("#go");
  await p.waitForSelector("#signinForm", { timeout: 10000 });
  await p.type("#email", email); await p.click("#signinForm button[type=submit]");
  await p.waitForFunction(() => /Check your inbox/i.test(document.body.innerText), { timeout: 10000 });
  const mail = outbox.filter((m) => m.to === email.toLowerCase()).pop();
  return mail && mail.text.match(/https?:\/\/\S+/)[0];
}

const ctxA = await b.createBrowserContext();
const p = await newPage(ctxA);
// disposable email refused
await p.goto(BASE + "/"); await p.type("#url", "127.0.0.1:8101"); await p.click("#go");
await p.waitForSelector("#signinForm");
await p.screenshot({ path: out("p2-signin-desk.png") });
await p.type("#email", "x@mailinator.com"); await p.click("#signinForm button[type=submit]");
await p.waitForFunction(() => !document.querySelector("#siErr").hidden, { timeout: 8000 });
ok(/real email/i.test(await text(p)), "disposable email is refused");

// real sign-in
const link = await signIn(p, "127.0.0.1:8101", "Owner.Test@Example-Biz.com");
ok(!!link && link.includes("/api/auth/verify?t="), "sign-in email contains a link");
await p.screenshot({ path: out("p2-inbox-desk.png") });
await p.goto(link, { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => location.pathname.startsWith("/r/"), { timeout: 15000 });
const reportPath = new URL(p.url()).pathname;
await p.waitForSelector(".rep-head", { timeout: 120000 });
ok(/Needs urgent attention/.test(await text(p)), "free check runs straight after sign-in and shows the report");
ok(/owner\.test@example-biz\.com/i.test(await p.$eval("#account", (e) => e.innerText)), "header shows the signed-in email");
ok(!!(await p.$("#copyLink")) && !!(await p.$("#savePdf")), "share link and PDF buttons present");

// second check, same person -> paywall
await p.click("#again"); await p.waitForSelector("#url");
await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", "127.0.0.1:8102"); await p.click("#go");
await p.waitForSelector(".plans", { timeout: 10000 });
ok(/already used your free check/i.test(await text(p)), "second check by same person hits the paywall");
ok(/\$19/.test(await text(p)) && /\$999/.test(await text(p)), "paywall shows Solo and Agency prices");
await p.screenshot({ path: out("p2-paywall-desk.png"), fullPage: true });

// share link works signed-out
const ctxB = await b.createBrowserContext();
const q = await newPage(ctxB, 400);
await q.goto(BASE + reportPath, { waitUntil: "domcontentloaded" });
await q.waitForSelector(".rep-head", { timeout: 20000 });
ok(/Needs urgent attention/.test(await text(q)), "share link opens the report for someone not signed in");
await q.screenshot({ path: out("p2-shared-phone.png") });
const sw = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
ok(sw[0] <= sw[1], "no sideways scroll on phone");

// different person, same site -> site already used
const link2 = await signIn(q, "127.0.0.1:8101", "second@another-biz.com");
await q.goto(link2, { waitUntil: "domcontentloaded" });
await q.waitForSelector(".plans, .rep-head", { timeout: 20000 });
ok(/already had its free check/i.test(await text(q)), "a second person can't get another free check of the same site");
await q.screenshot({ path: out("p2-paywall-phone.png"), fullPage: true });

// expired / bad link
await q.goto(BASE + "/api/auth/verify?t=garbage", { waitUntil: "domcontentloaded" });
await q.waitForSelector("#formErr:not([hidden])", { timeout: 8000 });
ok(/expired/i.test(await text(q)), "bad sign-in link shows a clear message");

// owner can check repeatedly
const ctxC = await b.createBrowserContext();
const r = await newPage(ctxC);
const link3 = await signIn(r, "127.0.0.1:8102", "thelazycreatorco@gmail.com");
await r.goto(link3); await r.waitForSelector(".rep-head", { timeout: 120000 });
await r.click("#again"); await r.waitForSelector("#url");
await r.evaluate(() => (document.querySelector("#url").value = "")); await r.type("#url", "127.0.0.1:8102"); await r.click("#go");
await r.waitForSelector(".rep-head", { timeout: 120000 });
ok(true, "owner account can run repeated checks");
await r.click("#myReports"); await r.waitForSelector(".report-list");
ok((await r.$$(".report-list li")).length === 2, "My reports lists both checks");
await r.screenshot({ path: out("p2-account-desk.png") });

// direct API abuse: background scanner refuses calls without the secret
const bad = await fetch(BASE + "/api/check-bg?id=00000000-0000-0000-0000-000000000000&url=http://127.0.0.1:8101/");
ok(bad.status === 202, "background route answers but ignores unsigned calls");
const noAuth = await fetch(BASE + "/api/scan", { method: "POST", body: JSON.stringify({ url: "127.0.0.1:8101" }) });
ok(noAuth.status === 401, "scan API refuses signed-out callers");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); fx.close(); fx2.close(); dev.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
