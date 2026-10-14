// "Get your website ready to be fixed" guide: who can open it, each platform
// path, saved progress, I'm stuck, Shopify code, no-access lead, emails.
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
const fx = [await serve(path.join(here, "fixtures", "bad"), 8101), await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2"), await serve(path.join(here, "fixtures", "bad2"), 8103, "127.0.0.3")];
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
ok(true, "signed out: asked to sign in");
const free = await page();
await signUp(free, BASE, { email: "free.person@other-biz.com" });
await free.goto(BASE + "/fix/" + id1); await free.waitForFunction(() => /part of the paid plans/.test(document.body.innerText));
ok(/See pricing/.test(await text(free)), "free account: told Fix It is a paid feature, with pricing");
const paidOther = await signUp(await page(), BASE, { email: "thelazycreatorco@gmail.com" }).then(() => null);
const st = await fetch(BASE + "/api/fix?report=" + id1, { headers: { cookie: "" } });
ok(st.status === 401, "API refuses signed-out callers");

// report button -> guide
await o.goto(BASE + "/r/" + id1); await o.waitForSelector("#offers");
await Promise.all([o.waitForNavigation(), o.click('#offers a[href^="/fix/"]')]);
await o.waitForSelector(".fx-card");
ok(/Your website is built on Wix/.test(await text(o)), "guide opens from the report and already knows the platform");
await o.screenshot({ path: out("fix-1-platform.png"), fullPage: true });
await o.click("#next"); await o.waitForSelector("#in");
let t = await text(o);
ok(/Log in to Wix/.test(t) && /michaelbailie88@icloud\.com/.test(t) && /Forgot Password\?/.test(t), "step 2: log-in help with the emails to try and Wix's exact steps");
await o.click("#cant"); await o.waitForSelector(".fx-dead");
t = await text(o);
ok(/patsbiz\.com/.test(t) && /GoDaddy\.com, LLC/.test(t) && /GoDaddy's help pages/.test(t), "can't get in: shows who holds the domain and where to recover it");
await o.screenshot({ path: out("fix-2-recover.png"), fullPage: true });
await o.reload(); await o.waitForSelector(".fx-card");
ok(/Getting back into your website/.test(await text(o)), "progress is saved: reload returns to the same step");
await o.click("#in"); await o.waitForSelector("#doneForm");
t = await text(o);
ok(/Roles & Permissions/.test(t) && /Invite Collaborators/.test(t) && /Website Manager/.test(t) && /thelazycreatorco@gmail\.com/.test(t), "step 3: Wix invite steps with the exact email and role");
// I'm stuck
await o.click("[data-stuck]"); await o.type(".fx-stuck-form textarea", "I don't see Roles & Permissions");
await o.click(".fx-stuck-form button"); await o.waitForFunction(() => /knows exactly where you're stuck/.test(document.body.innerText));
const stuck = studio(/Stuck on Fix It/);
ok(!!stuck && /invite step/.test(stuck.subject) && stuck.text.includes("Roles & Permissions") && stuck.text.includes("/r/" + id1) && stuck.replyTo === "michaelbailie88@icloud.com", "I'm stuck emails the studio with the step, their note, the report and reply-to");
// must tick the box
await o.click('#doneForm button[type=submit]'); await o.waitForSelector("#doneForm .form-err:not([hidden])");
ok(/Tick the box/.test(await o.$eval("#doneForm .form-err", (e) => e.textContent)), "can't finish without confirming the invite was sent");
await o.click('#doneForm input[name=sent]');
await o.click('#doneForm button[type=submit]'); await o.waitForSelector(".fx-final");
const done = studio(/Fix It request/);
ok(!!done && /Wix/.test(done.subject) && done.text.includes("patsbiz.com at GoDaddy.com, LLC") && done.text.includes("/r/" + id1) && done.text.includes("Pat Owner"), "Done emails the studio everything: platform, domain, report, who");
ok(/No work starts before you agree/.test(await text(o)), "final screen explains what happens next");
await o.screenshot({ path: out("fix-3-done.png"), fullPage: true });

// Shopify path needs the 4-digit code
await o.goto(BASE + "/fix/" + id2); await o.waitForSelector(".fx-choice");
await o.click('.fx-choice[data-p="Shopify"]'); await o.click("#next"); await o.waitForSelector("#in"); await o.click("#in");
await o.waitForSelector('#doneForm input[name=code]');
ok(/collaborator request code/.test(await text(o)), "Shopify: asks for the 4-digit collaborator code");
await o.type('#doneForm input[name=code]', "12a"); await o.click('#doneForm input[name=sent]'); await o.click('#doneForm button[type=submit]');
await o.waitForSelector("#doneForm .form-err:not([hidden])");
ok(/4-digit code/.test(await o.$eval("#doneForm .form-err", (e) => e.textContent)), "a bad code is refused");
await o.$eval('#doneForm input[name=code]', (e) => (e.value = "")); await o.type('#doneForm input[name=code]', "4821");
await o.click('#doneForm button[type=submit]'); await o.waitForSelector(".fx-final");
const shop = studio(/Fix It request: 127\.0\.0\.2/);
ok(!!shop && shop.text.includes("Shopify collaborator code: 4821"), "the Shopify code reaches the studio");

// no access at all -> redesign lead
await o.goto(BASE + "/fix/" + id3); await o.waitForSelector(".fx-choice");
await o.click('.fx-choice[data-p="Other"]'); await o.click("#next"); await o.waitForSelector("#cant"); await o.click("#cant");
await o.waitForSelector("#noaccess"); await o.click("#noaccess"); await o.waitForSelector(".fx-final");
ok(!!studio(/No access to their website: 127\.0\.0\.3 \(redesign lead\)/) && /brand-new website/.test(await text(o)), "can't get access at all becomes a redesign lead");

// someone else's report
const other = await page();
await signUp(other, BASE, { email: "boss@agency-co.com" });
const u = await store.getUser("boss@agency-co.com"); u.lifetime = [{ plan: "agency", at: new Date().toISOString() }]; await store.saveUser(u);
await other.goto(BASE + "/fix/" + id1); await other.waitForFunction(() => /belongs to another account/.test(document.body.innerText));
ok(true, "another paid account can't open someone else's fix guide");

// phone fit
await o.setViewport({ width: 360, height: 800 }); await o.goto(BASE + "/fix/" + id2); await o.waitForSelector(".fx-card");
ok(await o.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "guide fits a phone");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); fx.forEach((x) => x.close()); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
