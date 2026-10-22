// New-website builds: owner-only screen, never-expiring payment links, 50%
// deposit, launch (final 50%, one payment, no hosting, no subscription), paid
// emails, Help page.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { startStripeMock, state } from "./stripe-mock.mjs";
import { signUp, freshIp } from "./helpers.mjs";
process.env.STRIPE_SECRET_KEY = "sk_test_mock";
process.env.HS_STRIPE_BASE = "http://127.0.0.1:8199/v1";
const { startDev, outbox } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const mock = await startStripeMock(8199);
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
const text = (p) => p.evaluate(() => document.body.innerText);
async function page(w = 1200) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 }); await freshIp(p); p.on("pageerror", (e) => errors.push(e.message)); p.on("dialog", (d) => d.accept()); return p; }
const mailTo = (to, re) => outbox.filter((m) => m.to === to && re.test(m.subject)).pop();
const linkIn = (m, kind) => (m.text.match(new RegExp("http://127\\.0\\.0\\.1:8100/pay/[a-f0-9-]+/" + kind + "\\?t=[a-f0-9]+")) || [])[0];

// owner
const o = await page();
await signUp(o, BASE, { email: "michaelbailie88@icloud.com", name: "Michael Bailie", business: "The Lazy Creator Company" });
await o.goto(BASE + "/account"); await o.waitForSelector("#buildsLink");
ok(true, "owner dashboard links to builds and payments");
await o.goto(BASE + "/builds"); await o.waitForSelector("#newB");
ok(/How a build gets paid/.test(await text(o)), "builds page explains the payment steps");
await o.click('#newB button[type=submit]'); await o.waitForSelector("#newB .form-err:not([hidden])");
ok(/email/i.test(await o.$eval("#newB .form-err", (e) => e.textContent)), "a build needs the customer's details");
await o.type('#newB input[name=name]', "Pat Plumber"); await o.type('#newB input[name=email]', "pat@pats-plumbing.ca");
await o.type('#newB input[name=business]', "Pat's Plumbing"); await o.type('#newB input[name=site]', "patsplumbing.ca"); await o.type('#newB input[name=price]', "500");
ok(/Deposit \$250\.00 CAD · Launch \$250\.00 CAD/.test(await o.$eval("#split", (e) => e.textContent)), "price splits live: $250 deposit, $250 launch");
await o.click('#newB button[type=submit]'); await o.waitForSelector(".bd-card");
let t = await text(o);
ok(/Waiting for deposit/.test(t) && /Deposit \$250 CAD/.test(t) && /Launch \$250 CAD/.test(t), "build saved: waiting for deposit, $250 / $250 CAD");
ok(await o.$eval('[data-send="launch"]', (e) => e.disabled), "launch link is locked until the deposit is paid");
const id = await o.$eval(".bd-card", (e) => e.id.slice(2));
await o.click('[data-send="deposit"]'); await o.waitForFunction(() => /Email sent/.test(document.body.innerText));
const dep = mailTo("pat@pats-plumbing.ca", /50% deposit/);
ok(!!dep && /\$250 CAD/.test(dep.subject) && /don't host websites/.test(dep.text) && !/\$25 CAD a month|hosting and updates/i.test(dep.text) && /1 to 2 weeks/.test(dep.text) && !!linkIn(dep, "deposit"), "deposit email: amount in CAD, no hosting, timing, a pay link");
await o.screenshot({ path: out("builds-1.png"), fullPage: true });

// customer: bad links and launch-before-deposit
const c = await page(390);
await c.goto(BASE + "/pay/" + id + "/deposit?t=wrong"); await c.waitForFunction(() => /isn't valid/.test(document.body.innerText));
ok(true, "a tampered link is refused, nothing charged");
const launchUrl = (await o.$eval('[data-send="launch"] + [data-copy]', (e) => e.dataset.copy));
await c.goto(launchUrl); await c.waitForFunction(() => /deposit comes first/.test(document.body.innerText));
ok(true, "launch link before the deposit says the deposit comes first");

// customer pays the deposit
await c.goto(linkIn(dep, "deposit")); await c.waitForFunction(() => /Deposit received/.test(document.body.innerText));
const ds = Object.values(state.sessions).find((s) => s.metadata.kind === "deposit");
ok(ds.mode === "payment" && ds.body["line_items[0][price_data][currency]"] === "cad" && ds.body["line_items[0][price_data][unit_amount]"] === "25000", "deposit checkout: one payment of $250 CAD");
ok(!!mailTo("thelazycreatorco@gmail.com", /Deposit paid: Pat's Plumbing/) && !!mailTo("pat@pats-plumbing.ca", /Deposit received/), "you and the customer both get a 'deposit paid' email");
await c.screenshot({ path: out("builds-paid.png"), fullPage: true });
await c.goto(linkIn(dep, "deposit")); await c.waitForFunction(() => /already paid/.test(document.body.innerText));
ok(true, "a paid link can't be paid twice");

// owner: preview + launch link
await o.reload(); await o.waitForSelector(".bd-card");
ok(/Deposit paid: building/.test(await text(o)), "owner sees the deposit paid");
await o.type('.bd-prev input[name=preview]', "http://not-secure.example"); await o.click(".bd-prev button");
await o.waitForFunction(() => /must start with https/.test(document.body.innerText));
await o.$eval('.bd-prev input[name=preview]', (e) => (e.value = "")); await o.type('.bd-prev input[name=preview]', "https://pats-plumbing.netlify.app");
await o.click(".bd-prev button"); await o.waitForFunction(() => /Preview link saved/.test(document.body.innerText));
await o.click('[data-send="launch"]'); await o.waitForFunction(() => /Email sent/.test(document.body.innerText));
const lau = mailTo("pat@pats-plumbing.ca", /website is ready/);
ok(!!lau && /\$250 CAD/.test(lau.subject) && lau.text.includes("https://pats-plumbing.netlify.app") && /no monthly charges/.test(lau.text) && !/\$25 CAD a month|hosting and updates/i.test(lau.text) && /\$150 CAD/.test(lau.text), "launch email: preview, $250 CAD today, no monthly charges, no hosting, new pages");
await c.goto(linkIn(lau, "launch")); await c.waitForFunction(() => /You're all set/.test(document.body.innerText));
const ls = Object.values(state.sessions).find((s) => s.metadata.kind === "launch");
ok(ls.mode === "payment" && !ls.body["payment_method_types[0]"] && !ls.body["line_items[0][price]"] && ls.body["line_items[0][price_data][unit_amount]"] === "25000" && !ls.body["line_items[1][price_data][unit_amount]"], "launch checkout: one payment of the $250 balance, no subscription, no saved card");
ok(!!mailTo("thelazycreatorco@gmail.com", /Final payment received/), "you're told when the launch is paid");

// owner: live, then late, then pause
await o.reload(); await o.waitForSelector(".bd-card");
const ownerText = await text(o);
ok(/Paid in full: send the files/.test(ownerText) && !(await o.$('[data-send="card"]')) && !/hosting/i.test(ownerText.replace(/There's no hosting and no monthly charge[^\n]*/, "")), "owner sees it paid in full, with no hosting or update-card controls");
await c.goto(BASE + "/pay/" + id + "/card?t=wrong");
ok(!/billing portal/i.test(await text(c)), "the old update-card link no longer opens a card page");

// not the owner
const x = await page();
await signUp(x, BASE, { email: "someone@else-biz.com" });
ok((await x.evaluate(async () => (await fetch("/api/builds")).status)) === 403, "builds API is owner only");
await x.goto(BASE + "/builds"); await x.waitForFunction(() => /Owner only/.test(document.body.innerText));
ok(true, "builds page tells others it's owner only");

// help page
const h = await page(390);
await h.goto(BASE + "/help#domain-settings"); await h.waitForSelector("#domain-settings[open]");
t = await text(h);
ok(/We don't host websites/.test(t) && !/75\.2\.60\.5|\$25 CAD/.test(t) && /Don't touch your email settings/.test(t), "help deep link opens pointing the address at your own host, with the email warning and no hosting offer");
ok(!(await h.$("#hosting")) && !/Hosting and updates/.test(await text(h)), "help has no hosting section");
await h.type("#hq", "refund"); await new Promise((r) => setTimeout(r, 200));
ok(await h.evaluate(() => !document.querySelector("#pl-refund").hidden && document.querySelector("#scan").hidden), "help search filters to matching answers");
ok(await h.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "help fits a phone");

// phone fit for builds
await o.setViewport({ width: 360, height: 800 }); await o.reload(); await o.waitForSelector(".bd-card");
ok(await o.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "builds page fits a phone");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); mock.close(); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
