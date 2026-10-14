// Phase 5 end-to-end: build a calculator from a template, live preview,
// public page, embed, server-side pricing, lead email, CSV, free limits.
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
const store = await import("../netlify/lib/store.mjs");
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

async function joinHere(pg, email, name, business) {
  await pg.waitForSelector('.auth-form input[name="business"]');
  await pg.type('.auth-form input[name="name"]', name); await pg.type('.auth-form input[name="business"]', business);
  await pg.type('.auth-form input[name="email"]', email); await pg.type('.auth-form input[name="password"]', "Correct-horse-9");
  await Promise.all([pg.waitForNavigation(), pg.click(".auth-go")]);
}
await p.goto(BASE + "/quotes"); await joinHere(p, "jo@bright-spark.com", "Jo Bright", "Bright Spark Cleaning");
await p.waitForSelector("#svcList .row-ed", { timeout: 15000 });
ok(new URL(p.url()).pathname === "/quotes", "creating an account on Quote Calculator returns to Quote Calculator");
const svc0 = await p.$eval('#svcList .row-ed input[data-f="label"]', (e) => e.value);
ok(svc0 === "Standard clean" && (await p.$eval("#bType", (e) => e.value)) === "Cleaning" && (await p.$eval("#bBiz", (e) => e.value)) === "Bright Spark Cleaning", "a cleaning business starts with cleaning examples, filled from the account");
await p.waitForSelector("#prev .calc-amount");
const first = await p.$eval("#prev .calc-amount", (e) => e.textContent);
ok(/^\$\d/.test(first), "live preview shows a price: " + first);
// change the first service price -> preview updates
await p.$eval('#svcList .row-ed input[data-f="price"]', (e) => { e.value = "150"; e.dispatchEvent(new Event("input", { bubbles: true })); });
const after = await p.$eval("#prev .calc-amount", (e) => e.textContent);
ok(after !== first, "editing a price updates the preview (" + first + " -> " + after + ")");
// after editing, typing a different business type offers examples instead of overwriting
await p.$eval("#bType", (e) => (e.value = "")); await p.type("#bType", "dog grooming"); await p.$eval("#bType", (e) => e.dispatchEvent(new Event("change")));
ok(/Use examples/.test(await p.$eval("#typeHint", (e) => e.innerText)) && (await p.$eval('#svcList .row-ed input[data-f="label"]', (e) => e.value)) === "Standard clean", "after edits, a new business type offers examples without overwriting");
await p.$eval("#bType", (e) => (e.value = "Cleaning"));
// no-price mode: a request form, no price anywhere
await p.click('input[name="bMode"][value="none"]');
ok(!(await p.$("#prev .calc-amount")) && /Send my request/.test(await p.$eval("#prev", (e) => e.innerText)) && !(await p.$("#svcList .price-in:not([hidden])")), "'No price' turns it into a request form and hides prices");
await p.click('input[name="bMode"][value="range"]');
ok(!!(await p.$("#prev .calc-amount")), "switching back to a range shows the price again");
// add and remove an add-on
const nAdd = (await p.$$("#addList .row-ed")).length;
await p.click("#addAdd"); await p.click("#addList .row-ed:last-child [data-del]");
ok((await p.$$("#addList .row-ed")).length === nAdd, "add-ons can be added and removed");
await p.screenshot({ path: out("p5-builder.png"), fullPage: true });
await p.click("#bSave");
await p.waitForSelector("#emb", { timeout: 15000 });
const t = await text(p);
const slug = (t.match(/\/q\/(bright-spark-cleaning-[0-9a-f]{6})/) || [])[1];
ok(!!slug, "calculator saved with a public link");
ok(/Free trial: 10 requests or 14 days left/i.test(t), "free trial status shown");
await p.screenshot({ path: out("p5-dashboard.png"), fullPage: true });

// public page: pick answers, request quote
const c2 = await b.createBrowserContext(); const q = await c2.newPage(); await q.setViewport({ width: 400, height: 860 });
q.on("pageerror", (e) => errors.push(e.message));
await q.goto(BASE + "/q/" + slug); await q.waitForSelector(".calc-amount");
await q.click('[data-step="1"]');                          // 3 bedrooms
await q.click('input[data-k="service"][value="1"]');       // deep clean
await q.click('input[data-k="addons"][value="0"]');        // oven
const shown = await q.$eval(".calc-amount", (e) => e.textContent);
await q.type('input[name="name"]', "Avery Lee"); await q.type('input[name="email"]', "avery@example-home.com");
await q.click(".calc-btn"); await q.waitForSelector(".calc-done", { timeout: 10000 });
const mail = outbox.filter((m) => m.to === "jo@bright-spark.com" && /New quote request/.test(m.subject)).pop();
ok(!!mail && mail.subject.includes(shown) && mail.text.includes("Deep clean"), "owner gets the lead by email with the same price the visitor saw (" + shown + ")");
ok(!outbox.some((m) => m.to === "avery@example-home.com"), "free plan doesn't send the visitor follow-up");
await q.screenshot({ path: out("p5-public.png"), fullPage: true });
const sw = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
ok(sw[0] <= sw[1], "public calculator fits a phone");

// a tampered request can't change the price
const r = await fetch(BASE + "/api/calc-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, name: "Hacker", email: "h@example-x.com", answers: { service: 1, qty: 3, addons: [0] }, quote: "$1", low: 1 }) });
const rj = await r.json();
ok(rj.quote === shown, "server recomputes the price (" + rj.quote + ")");

// leads dashboard + CSV
await p.reload(); await p.waitForSelector(".lead-table");
ok((await p.$$(".lead-table tbody tr")).length === 2, "leads appear in the dashboard");
const csv = await p.evaluate(async (s) => (await fetch("/api/calc-leads?slug=" + s + "&format=csv")).text(), slug);
ok(csv.includes("Avery Lee") && csv.split("\n")[0].includes("How many bedrooms?"), "CSV download has leads and answers");

// embed on another site
const host = http.createServer((req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(`<!doctype html><h1>Client site</h1><script src="${BASE}/embed.js" data-calc="${slug}" async></script>`); }).listen(8150, "127.0.0.1");
const e = await c2.newPage(); await e.setViewport({ width: 1000, height: 900 });
await e.goto("http://127.0.0.1:8150/"); await e.waitForSelector("iframe");
await new Promise((s) => setTimeout(s, 2500));
const fr = e.frames().find((f) => f.url().includes("/q/" + slug));
ok(!!fr && !!(await fr.$(".calc-amount")), "embed code shows the calculator on another website");
const h = await e.$eval("iframe", (f) => parseInt(f.style.height));
ok(h > 400 && h < 2600, "embedded calculator sizes itself (" + h + "px)");
await e.screenshot({ path: out("p5-embed.png"), fullPage: true });

// free limit: 10 leads then paused
for (let i = 0; i < 8; i++) await fetch(BASE + "/api/calc-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, name: "L" + i, phone: "5195550" + (100 + i), answers: {} }) });
const r11 = await fetch(BASE + "/api/calc-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, name: "Late", phone: "5195550199", answers: {} }) });
ok(r11.status === 409, "11th request on the free plan is refused (calculator paused)");
await q.reload(); await q.waitForSelector(".calc-paused");
ok(true, "public page shows the paused message");
// second calculator on free -> paywall
await p.reload(); await p.waitForSelector("#cNew"); await p.click("#cNew");
ok(/one quote calculator/i.test(await text(p)), "a second calculator needs a paid plan");

// paid owner: auto follow-up to visitor and no badge
const u = await store.getUser("jo@bright-spark.com"); u.lifetime = [{ plan: "solo", at: new Date().toISOString() }]; await store.saveUser(u);
const rp = await fetch(BASE + "/api/calc-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, name: "Paid Visitor", email: "pv@example-home.com", answers: {} }) });
ok(rp.status === 200 && outbox.some((m) => m.to === "pv@example-home.com" && /Your quote from Bright Spark Cleaning/.test(m.subject)), "after upgrading, the calculator works again and visitors get their estimate by email");
await q.reload(); await q.waitForSelector(".calc-amount");
ok(!(await q.$(".calc-badge")), "paid calculators have no HindSited badge");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close(); host.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
