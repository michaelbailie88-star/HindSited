// "Start your new website" guide: who can open it, no platform logins asked,
// answers kept in the browser, domain paths, I'm stuck, and the request email.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { signUp, freshIp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
const store = await import("../netlify/lib/store.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const fx = [await serve(path.join(here, "fixtures", "bad"), 8101), await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2"), await serve(path.join(here, "fixtures", "bad2"), 8103, "127.0.0.3"), await serve(path.join(here, "fixtures", "bad"), 8104, "127.0.0.4")];
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
const text = (pg) => pg.evaluate(() => document.body.innerText);
async function page(w = 1200) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 }); await freshIp(p); p.on("pageerror", (e) => errors.push(e.message)); return p; }
async function scan(p, site) { await p.goto(BASE + "/"); await p.waitForSelector("#url"); await p.type("#url", site); await p.click("#go"); await p.waitForSelector(".rep-head", { timeout: 120000 }); return new URL(p.url()).pathname.split("/").pop(); }
const studio = (re) => outbox.filter((m) => m.to === "thelazycreatorco@gmail.com" && re.test(m.subject)).pop();

// owner account (paid) runs three checks
const o = await page();
await signUp(o, BASE, { email: "michaelbailie88@icloud.com", name: "Pat Owner", business: "Owner Biz" });
const id1 = await scan(o, "127.0.0.1:8101"), id2 = await scan(o, "127.0.0.2:8102"), id3 = await scan(o, "127.0.0.3:8103");
// pretend the scan found a Wix site with a GoDaddy domain
const r1 = await store.reports().get(id1, { type: "json" });
r1.scan.render.audit.signals.platform = "Wix";
r1.scan.domain = { name: "patsbiz.com", registrar: "GoDaddy.com, LLC", created: "2016-01-01T00:00:00.000Z", expires: "2027-05-01T00:00:00.000Z" };
await store.reports().setJSON(id1, r1);

// who can open it
const anon = await page();
await anon.goto(BASE + "/fix/" + id1); await anon.waitForFunction(() => /Sign in to continue/.test(document.body.innerText));
ok(!!(await anon.$('a[href^="/account?mode=signup&next=%2Ffix%2F"]')), "signed out: asked to sign in or create a free account, and returned here after");
const st = await fetch(BASE + "/api/fix?report=" + id1);
ok(st.status === 401, "API refuses signed-out callers");
const free = await page();
await signUp(free, BASE, { email: "free.person@other-biz.com", name: "Fran Free", business: "Free Biz" });
const fid = await scan(free, "127.0.0.4:8104").catch(() => null);
if (fid) { await free.goto(BASE + "/fix/" + fid); await free.waitForSelector(".fx-card"); ok(/Start your new website/.test(await text(free)), "a free account can start a new website from its own report (no plan needed)");
  const bad = await free.evaluate(async (rid) => (await fetch("/api/fix", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: rid, action: "send", about: {} }) })).status, fid);
  ok(bad === 400, "API refuses a request with the web address question unanswered"); }
else ok(false, "free account scan");

// report button -> guide
await o.goto(BASE + "/r/" + id1); await o.waitForSelector("#offers");
await Promise.all([o.waitForNavigation(), o.click('#offers a[href^="/fix/"]')]);
await o.waitForSelector("#aboutForm");
let t = await text(o);
ok(/Start your new website/.test(t) && !/password to|log in to Wix|Invite/i.test(t), "guide opens from the report and never asks for a platform login");
ok((await o.$eval('#aboutForm input[name=name]', (e) => e.value)) === "Pat Owner" && (await o.$eval('#aboutForm input[name=business]', (e) => e.value)) === "Owner Biz", "name and business are filled in from the account");
await o.$eval('#aboutForm input[name=business]', (e) => (e.value = "")); await o.click('#aboutForm button[type=submit]');
await o.waitForSelector("#aboutForm .form-err:not([hidden])");
ok(/business name/.test(await o.$eval("#aboutForm .form-err", (e) => e.textContent)), "name and business are required");
await o.type('#aboutForm input[name=business]', "Pat's Plumbing"); await o.type('#aboutForm input[name=phone]', "519-555-0100");
await o.click('#aboutForm input[value="Online booking"]'); await o.click('#aboutForm input[value="Show my Google reviews"]');
await o.type('#aboutForm textarea[name=note]', "Keep the blue colour.");
await o.screenshot({ path: out("fix-1-about.png"), fullPage: true });
await o.click('#aboutForm button[type=submit]'); await o.waitForSelector("[data-d]");
t = await text(o);
ok(/patsbiz\.com/.test(t) && /GoDaddy\.com, LLC/.test(t) && /never share a password/.test(t), "step 2 shows the web address, who holds it, and that no password is shared");
await o.screenshot({ path: out("fix-2-domain.png"), fullPage: true });
// progress + answers survive a reload
await o.reload(); await o.waitForSelector("[data-d]");
ok(true, "progress is saved: reload returns to the web address step");
await o.click('[data-d="locked"]'); await o.waitForSelector("#gotIn");
t = await text(o);
ok(/Forgot password/.test(t) && /michaelbailie88@icloud\.com/.test(t) && /GoDaddy ↗/.test(t), "locked out: Forgot password help with the emails to try and the registrar's help link");
await o.screenshot({ path: out("fix-3-recover.png"), fullPage: true });
// I'm stuck (hidden until clicked)
ok(await o.$eval(".fx-stuck-form", (f) => getComputedStyle(f).display === "none"), "the I'm stuck form stays closed until asked for");
await o.click("[data-stuck]"); await o.type(".fx-stuck-form textarea", "Our old designer registered it");
await o.click(".fx-stuck-form button"); await o.waitForFunction(() => /knows exactly where you're stuck/.test(document.body.innerText));
const stuck = studio(/Stuck starting a new website/);
ok(!!stuck && /recover step/.test(stuck.subject) && stuck.text.includes("old designer") && stuck.text.includes("/r/" + id1) && stuck.replyTo === "michaelbailie88@icloud.com", "I'm stuck emails the studio with the step, their note, the report and reply-to");
await o.click("#skip"); await o.waitForSelector("#send");
t = await text(o);
ok(/Pat's Plumbing/.test(t) && /Online booking, Show my Google reviews/.test(t) && /Keep the blue colour/.test(t) && /still getting into your domain/.test(t), "summary shows every answer before sending (kept in the browser across the reload)");
await o.screenshot({ path: out("fix-4-send.png"), fullPage: true });
await o.click("#send"); await o.waitForSelector(".fx-final");
const done = studio(/New website request: 127\.0\.0\.1/);
ok(!!done && done.text.includes("Pat's Plumbing") && done.text.includes("519-555-0100") && done.text.includes("Online booking, Show my Google reviews") && done.text.includes("Locked out of their domain account") && done.text.includes("patsbiz.com at GoDaddy.com, LLC") && done.text.includes("Keep the blue colour") && done.replyTo === "michaelbailie88@icloud.com", "Send emails the studio everything: business, phone, needs, domain status, report, notes");
ok(/nothing is charged until you agree/.test(await text(o)), "final screen: quote first, no charge until they agree");
ok(await o.evaluate((k) => localStorage.getItem(k) === null, "hs-new-site-" + id1), "answers are cleared from the browser once sent");
await o.screenshot({ path: out("fix-5-done.png"), fullPage: true });
await o.reload(); await o.waitForSelector(".fx-final");
ok(true, "a sent request stays on the done screen");

// "yes I can log in" path and "no web address" path
await o.goto(BASE + "/fix/" + id2); await o.waitForSelector("#aboutForm"); await o.click('#aboutForm button[type=submit]');
await o.waitForSelector("[data-d]"); await o.click('[data-d="yes"]'); await o.waitForSelector("#send");
ok(/You can log in to your domain account/.test(await text(o)), "can log in: goes straight to send");
await o.click("#send"); await o.waitForSelector(".fx-final");
ok(/Can log in to their domain account/.test(studio(/New website request: 127\.0\.0\.2/).text), "domain status reaches the studio");
await o.goto(BASE + "/fix/" + id3); await o.waitForSelector("#aboutForm"); await o.click('#aboutForm button[type=submit]');
await o.waitForSelector("[data-d]"); await o.click('[data-d="none"]'); await o.waitForSelector("#send");
await o.click("#send"); await o.waitForSelector(".fx-final");
ok(/no web address of their own/.test(studio(/New website request: 127\.0\.0\.3/).text), "no web address: the studio is told they need one");

// someone else's report
const other = await page();
await signUp(other, BASE, { email: "boss@agency-co.com" });
await other.goto(BASE + "/fix/" + id1); await other.waitForFunction(() => /belongs to another account/.test(document.body.innerText));
ok(true, "another account can't open someone else's guide");

// phone fit
await o.setViewport({ width: 320, height: 800 }); await o.goto(BASE + "/fix/" + id1); await o.waitForSelector(".fx-card");
ok(await o.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "guide fits a 320px phone");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); fx.forEach((x) => x.close()); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
