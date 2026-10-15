// New-website builds: owner-only screen, never-expiring payment links, 50%
// deposit, launch (50% + $25 CAD/month hosting, card only), paid emails,
// late / 14-day pause flags, update-card link, 30-day hosting end, Help page.
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
ok(/Deposit \$250\.00 CAD · Launch \$275\.00 CAD/.test(await o.$eval("#split", (e) => e.textContent)), "price splits live: $250 deposit, $275 launch");
await o.click('#newB button[type=submit]'); await o.waitForSelector(".bd-card");
let t = await text(o);
ok(/Waiting for deposit/.test(t) && /Deposit \$250 CAD/.test(t) && /Launch \$275 CAD/.test(t), "build saved: waiting for deposit, $250 / $275 CAD");
ok(await o.$eval('[data-send="launch"]', (e) => e.disabled), "launch link is locked until the deposit is paid");
const id = await o.$eval(".bd-card", (e) => e.id.slice(2));
await o.click('[data-send="deposit"]'); await o.waitForFunction(() => /Email sent/.test(document.body.innerText));
const dep = mailTo("pat@pats-plumbing.ca", /50% deposit/);
ok(!!dep && /\$250 CAD/.test(dep.subject) && /\$25 CAD a month/.test(dep.text) && /1 to 2 weeks/.test(dep.text) && !!linkIn(dep, "deposit"), "deposit email: amount in CAD, hosting disclosed, timing, a pay link");
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
ok(!!lau && /\$275 CAD/.test(lau.subject) && lau.text.includes("https://pats-plumbing.netlify.app") && /14 days/.test(lau.text) && /30 days' notice/.test(lau.text) && /\$150 CAD/.test(lau.text), "launch email: preview, $275 CAD today, $25/month, 14-day pause, 30-day notice, new pages");
await c.goto(linkIn(lau, "launch")); await c.waitForFunction(() => /You're all set/.test(document.body.innerText));
const ls = Object.values(state.sessions).find((s) => s.metadata.kind === "launch");
ok(ls.mode === "subscription" && ls.body["payment_method_types[0]"] === "card" && ls.body["line_items[0][price]"] === "price_hosting_m" && ls.body["line_items[1][price_data][unit_amount]"] === "25000", "launch checkout: $25/month hosting + $250 balance, card only (saved for monthly)");
ok(!!mailTo("thelazycreatorco@gmail.com", /Launch paid, hosting started/), "you're told when the launch is paid");

// owner: live, then late, then pause
await o.reload(); await o.waitForSelector(".bd-card");
ok(/Live: hosting paid/.test(await text(o)) && !!(await o.$('[data-send="card"]')), "owner sees it live, with an update-card link");
const sub = state.subs["sub_" + ls.id];
sub.status = "past_due"; sub.latest_invoice = { status: "open", created: Math.floor(Date.now() / 1000) - 3 * 86400, amount_remaining: 2500 };
await o.reload(); await o.waitForSelector(".bd-card");
ok(/Payment failed 3 days ago/.test(await text(o)), "a failed payment shows how many days late");
sub.latest_invoice.created = Math.floor(Date.now() / 1000) - 15 * 86400;
await o.reload(); await o.waitForSelector(".bd-alert");
ok(/15 days unpaid: pause the site/.test(await text(o)) && /Pause the site now/.test(await text(o)), "at 14+ days it says to pause the site");
await o.screenshot({ path: out("builds-2-pause.png"), fullPage: true });
await o.click('[data-send="card"]'); await o.waitForFunction(() => /Email sent/.test(document.body.innerText));
const card = mailTo("pat@pats-plumbing.ca", /Update the card/);
ok(!!card && /didn't go through/.test(card.text), "update-card email mentions the missed payment");
await c.goto(linkIn(card, "card")); await c.waitForFunction(() => /Mock billing portal/.test(document.body.innerText));
ok(true, "update-card link opens the Stripe card page");

// end hosting in 30 days, then keep
sub.status = "active"; sub.latest_invoice = { status: "paid", created: Math.floor(Date.now() / 1000), amount_remaining: 0 };
await o.reload(); await o.waitForSelector("[data-cancel]");
await o.click("[data-cancel]"); await o.waitForSelector("[data-keep]");
const days = Math.round((sub.cancel_at - Date.now() / 1000) / 86400);
ok(days === 30 && !!mailTo("pat@pats-plumbing.ca", /hosting is ending/), "end hosting: Stripe stops it in 30 days and the customer is emailed the date");
await o.click("[data-keep]"); await o.waitForSelector("[data-cancel]");
ok(sub.cancel_at === null, "keep hosting clears the end date");

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
ok(/75\.2\.60\.5/.test(t) && /Don't touch your email settings/.test(t), "help deep link opens the two settings, with exact values and the email warning");
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
