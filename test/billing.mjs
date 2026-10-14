// Payments: unlock a free report by subscribing (returns to the now-full
// report), plan limits, cancellation, Agency lifetime + branding + extra
// business, billing portal, forged links, and deleting an account cancels billing.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { startStripeMock, state } from "./stripe-mock.mjs";
import { signUp, freshIp } from "./helpers.mjs";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.HS_STRIPE_BASE = "http://127.0.0.1:8199/v1";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev } = await import("./dev.mjs");
const store = await import("../netlify/lib/store.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const fxA = await serve(path.join(here, "fixtures", "bad"), 8101);
const fxB = await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2");
const fxC = await serve(path.join(here, "fixtures", "bad2"), 8103, "127.0.0.3");
const mock = await startStripeMock(8199);
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
const text = (p) => p.evaluate(() => document.body.innerText);
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1200, height: 900 }); await freshIp(p);
p.on("pageerror", (e) => errors.push(e.message + " @ " + (e.stack || "").split("\n").slice(0, 3).join(" | ")));
async function check(site) {
  await p.goto(BASE + "/"); await p.waitForSelector("#url");
  await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", site); await p.click("#go");
  await p.waitForSelector(".rep-head, .plans, .err-box", { timeout: 120000 });
}
const dash = async () => { await p.goto(BASE + "/account"); await p.waitForSelector(".dash"); return text(p); };

// free scan with no account, then unlock -> sign up -> pay -> back on the full report
await check("127.0.0.1:8101");
const rid = new URL(p.url()).pathname.split("/").pop();
ok(!!(await p.$(".lock-bar")), "free scan is locked");
await p.click(".lock-bar .unlock-btn"); await p.waitForSelector(".plans");
await p.click('[data-plan="solo"][data-int="month"]');
await p.waitForSelector('.auth-form input[name="business"]');
await p.type('.auth-form input[name="name"]', "Sam Buyer"); await p.type('.auth-form input[name="business"]', "Solo Biz");
await p.type('.auth-form input[name="email"]', "buyer@solo-biz.com"); await p.type('.auth-form input[name="password"]', "Correct-horse-9");
await Promise.all([p.waitForNavigation(), p.click(".auth-go")]);
await p.waitForSelector(".plans", { timeout: 60000 });
ok(new URL(p.url()).pathname === "/r/" + rid && /Unlock your full report/.test(await text(p)), "after creating an account they land back on the report's plans");
await Promise.all([p.waitForNavigation(), p.click('[data-plan="solo"][data-int="month"]')]);
await p.waitForSelector(".rep-head", { timeout: 60000 });
ok(new URL(p.url()).pathname === "/r/" + rid && !(await p.$(".lock-bar")) && /Your top 5 fixes/.test(await text(p)), "after paying they return to the same report, now fully unlocked");
ok(/Start my new website/.test(await text(p)) && !/Fix It/.test(await text(p)), "paid report offers the new website, with no Fix It promise");
ok(state.sessions["cs_test_0x"].price === "price_solo_m" && /back=%2Fr%2F/.test(state.sessions["cs_test_0x"].success_url), "checkout used the Solo monthly price and returns to the report");
let t = await dash();
ok(!/fix your report/i.test(await (async () => { await p.goto(BASE + "/pricing"); await p.waitForSelector(".plans"); return text(p); })()), "pricing no longer promises to fix reports");
t = await dash();
ok(/Solo/.test(t) && /Renews/.test(t) && /30 left|29 left/.test(t), "dashboard shows Solo, its renewal date and checks left");
ok(/Solo Biz/.test(t) && /Sam/.test(t), "dashboard shows the account holder and business");
await p.screenshot({ path: path.join(here, "out", "p3-dash-solo.png"), fullPage: true });

// plan limits
await check("127.0.0.1:8101");
ok(!!(await p.$(".rep-head")) && !(await p.$(".lock-bar")), "Solo user can re-check their business, full report");
await check("127.0.0.2:8102");
ok(/covers 1 business/i.test(await text(p)), "Solo user can't add a second business");

// cancelled in Stripe -> back to free after the re-check window
const user = await store.getUser("buyer@solo-biz.com");
state.subs[user.subs[0].id].status = "canceled";
user.subs[0].checkedAt = new Date(Date.now() - 7 * 3600e3).toISOString(); await store.saveUser(user);
t = await dash();
ok(/Free/.test(await p.$eval(".stat", (e) => e.innerText)), "cancelled subscription returns the account to Free");

// agency lifetime + branding + extra business
await p.click("#upgrade"); await p.waitForSelector(".plans");
await Promise.all([p.waitForNavigation(), p.click('[data-plan="agency"][data-int="once"]')]);
await p.waitForSelector(".dash");
t = await text(p);
ok(/Agency/.test(t) && /Lifetime access/.test(t) && /Payment received/.test(t), "Agency lifetime purchase unlocks Agency");
ok(!!(await p.$("#brandForm")), "Agency sees the branding form");
await p.type("#bName", "Northwind Web Studio"); await p.type("#bSite", "https://northwind.example");
await p.click("#brandForm button[type=submit]");
await p.waitForFunction(() => /Saved/.test(document.querySelector("#bNote").textContent));
await check("127.0.0.2:8102");
t = await text(p);
ok(/Website report by Northwind Web Studio/i.test(t) && !(await p.$("#offers")), "Agency report carries their branding, not TLCC's offers");
await p.screenshot({ path: path.join(here, "out", "p3-branded-report.png") });
await dash();
await Promise.all([p.waitForNavigation(), p.click("#addBiz")]);
await p.waitForSelector(".dash");
ok(/of 11/.test(await text(p)), "extra business purchase raises the limit to 11");
await p.click("#billing"); await p.waitForFunction(() => /Mock billing portal/.test(document.body.innerText), { timeout: 10000 });
ok(true, "Manage billing opens the customer portal");

// forged success link does nothing
const forged = await fetch(BASE + "/api/checkout/done?sid=cs_fake", { redirect: "manual" });
ok(/checkout=error/.test(forged.headers.get("location") || ""), "a made-up payment link unlocks nothing");

// deleting the account cancels the monthly extra-business subscription
const before = await store.getUser("buyer@solo-biz.com");
const live = before.subs.filter((s) => !s.ended).map((s) => s.id);
await dash();
await p.click("details.danger summary");
await p.type('#delForm input[name="password"]', "Correct-horse-9"); await p.type('#delForm input[name="confirm"]', "DELETE");
await Promise.all([p.waitForNavigation(), p.click("#delForm button[type=submit]")]);
ok(live.length > 0 && live.every((id) => state.subs[id].status === "canceled"), "deleting the account cancels its subscriptions in Stripe");
ok(!(await store.getUser("buyer@solo-biz.com")) && !(await store.reports().get(rid)), "account and its reports are deleted");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); [fxA, fxB, fxC, mock, dev].forEach((x) => x.close());
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
