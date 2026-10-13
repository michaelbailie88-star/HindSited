// Phase 3 end-to-end: free user upgrades, plan unlocks, agency branding,
// extra business, cancelled subscription drops back to free.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { startStripeMock, state } from "./stripe-mock.mjs";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.HS_STRIPE_BASE = "http://127.0.0.1:8199/v1";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
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
await p.setViewport({ width: 1200, height: 900 });
p.on("pageerror", (e) => errors.push(e.message + " @ " + (e.stack || "").split("\n").slice(0, 3).join(" | ")));

async function signIn(site, email) {
  await p.goto(BASE + "/"); await p.waitForSelector("#url");
  await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", site); await p.click("#go");
  await p.waitForSelector("#signinForm"); await p.type("#email", email); await p.click("#signinForm button[type=submit]");
  await p.waitForFunction(() => /Check your inbox/i.test(document.body.innerText));
  const link = outbox.filter((m) => m.to === email).pop().text.match(/https?:\/\/\S+/)[0];
  await p.goto(link);
}
async function check(site) {
  await p.goto(BASE + "/"); await p.waitForSelector("#url");
  await p.evaluate(() => (document.querySelector("#url").value = "")); await p.type("#url", site); await p.click("#go");
  try { await p.waitForSelector(".rep-head, .plans, .err-box, #signinForm", { timeout: 120000 }); }
  catch (e) { console.log("STUCK at", p.url(), (await text(p)).slice(0, 300)); throw e; }
}

await signIn("127.0.0.1:8101", "buyer@solo-biz.com");
await p.waitForSelector(".rep-head", { timeout: 120000 });
await check("127.0.0.2:8102");
ok(!!(await p.$(".plans")), "free user hits paywall on a second site");
if (!(await p.$(".plans"))) console.log("SAW:", p.url(), (await text(p)).slice(0, 400));
await Promise.all([p.waitForNavigation(), p.click('[data-plan="solo"][data-int="month"]')]);
await p.waitForSelector(".card-panel", { timeout: 20000 });
ok(/Payment received/i.test(await text(p)) && /Plan: Solo \(monthly\)/.test(await text(p)), "Solo monthly checkout unlocks the plan");
await p.screenshot({ path: path.join(here, "out", "p3-account-solo.png") });
await check("127.0.0.1:8101");
ok(!!(await p.$(".rep-head")), "Solo user can re-check their business");
await check("127.0.0.2:8102");
ok(/covers 1 business/i.test(await text(p)), "Solo user can't add a second business");
ok(state.sessions["cs_test_0x"].price === "price_solo_m", "checkout used the Solo monthly price");

// cancel in Stripe -> drops back to free after the re-check window
const u = (await import("../netlify/lib/store.mjs"));
const user = await u.getUser("buyer@solo-biz.com");
state.subs[user.subs[0].id].status = "canceled";
user.subs[0].checkedAt = new Date(Date.now() - 7 * 3600e3).toISOString(); await u.saveUser(user);
await p.goto(BASE + "/account"); await p.waitForSelector(".card-panel");
ok(/Plan: Free/.test(await text(p)), "cancelled subscription returns the account to Free");

// agency lifetime + branding + extra business
await p.click("#signOut"); await p.waitForSelector("#url");
await signIn("127.0.0.3:8103", "boss@agency-co.com");
await p.waitForSelector(".rep-head", { timeout: 120000 });
await p.goto(BASE + "/account"); await p.waitForSelector("#upgrade"); await p.click("#upgrade");
await p.waitForSelector(".plans");
await Promise.all([p.waitForNavigation(), p.click('[data-plan="agency"][data-int="once"]')]);
await p.waitForSelector(".card-panel");
ok(/Plan: Agency \(lifetime\)/.test(await text(p)), "Agency lifetime purchase unlocks Agency");
ok(!!(await p.$("#brandForm")), "Agency sees the branding form");
await p.type("#bName", "Northwind Web Studio"); await p.type("#bSite", "https://northwind.example");
await p.click("#brandForm button[type=submit]");
await p.waitForFunction(() => /Saved/.test(document.querySelector("#bNote").textContent));
ok(true, "branding saved");
await check("127.0.0.2:8102");
ok(/Website report by Northwind Web Studio/i.test(await text(p)) && !/See my work/.test(await text(p)), "Agency report carries their branding, not TLCC's");
if (!/Website report by/.test(await text(p))) console.log("SAW2:", (await text(p)).slice(0, 500));
await p.screenshot({ path: path.join(here, "out", "p3-branded-report.png") });
await p.goto(BASE + "/account"); await p.waitForSelector("#addBiz");
await Promise.all([p.waitForNavigation(), p.click("#addBiz")]);
await p.waitForSelector(".card-panel");
ok(/of 11 businesses/.test(await text(p)), "extra business purchase raises the limit to 11");
await p.screenshot({ path: path.join(here, "out", "p3-account-agency.png"), fullPage: true });
await p.click("#billing"); await p.waitForFunction(() => /Mock billing portal/.test(document.body.innerText), { timeout: 10000 });
ok(true, "Billing button opens the customer portal");

// forged success link does nothing
const forged = await fetch(BASE + "/api/checkout/done?sid=cs_fake", { redirect: "manual" });
ok(/checkout=error/.test(forged.headers.get("location") || ""), "a made-up payment link unlocks nothing");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); [fxA, fxB, fxC, mock, dev].forEach((x) => x.close());
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
