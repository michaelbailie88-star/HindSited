// Share your score: a 1200x630 card drawn when the scan finishes, a share
// link with link-preview tags that sends people to the report, cards for older
// reports drawn on demand, and nothing for competitor checks.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { freshIp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev } = await import("./dev.mjs");
const store = await import("../netlify/lib/store.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const fxA = await serve(path.join(here, "fixtures", "bad"), 8101);
const fxB = await serve(path.join(here, "fixtures", "clean"), 8102, "127.0.0.2");
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
async function page(w = 1200) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: 900 }); await freshIp(p); p.on("pageerror", (e) => errors.push(e.message)); return p; }
const pngSize = (buf) => ({ sig: buf.slice(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const waitFor = async (fn, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 500)); } return false; };

const p = await page();
await p.goto(BASE + "/"); await p.waitForSelector("#url");
await p.type("#url", "127.0.0.1:8101"); await p.click("#go");
await p.waitForSelector(".rep-head", { timeout: 120000 });
const rid = new URL(p.url()).pathname.split("/").pop();
const score = Number(await p.$eval(".dial b", (e) => e.textContent));
ok(await waitFor(async () => !!(await store.cards().get(rid))), "the score card is drawn when the scan finishes");
let r = await fetch(BASE + "/api/card?id=" + rid);
const png = Buffer.from(await r.arrayBuffer());
fs.writeFileSync(out("share-card.png"), png);
const sz = pngSize(png);
ok(r.status === 200 && r.headers.get("content-type") === "image/png" && sz.sig === "PNG" && sz.w === 1200 && sz.h === 630, "card is a 1200x630 PNG");

// the share panel
await p.click("#shareCard"); await p.waitForSelector("#shareBox .share-img");
ok(await p.$eval("#shareBox .share-img", (i) => new Promise((res) => (i.complete ? res(i.naturalWidth) : (i.onload = () => res(i.naturalWidth))))) === 1200, "share panel shows the card");
ok((await p.$eval("#shareUrl", (i) => i.value)) === BASE + "/s/" + rid, "share link is the /s/ link");
const hrefs = await p.$$eval("#shareBox .share-to a", (a) => a.map((x) => x.href));
ok(hrefs.some((h) => h.startsWith("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(BASE + "/s/" + rid))) && hrefs.some((h) => h.includes("linkedin.com/sharing")) && hrefs.some((h) => h.includes("twitter.com/intent/tweet") && h.includes(encodeURIComponent(score + "/100"))), "Facebook, LinkedIn and X buttons carry the link and score");
await p.screenshot({ path: out("share-panel.png") });

// the share page: preview tags for social sites, people go on to the report
r = await fetch(BASE + "/s/" + rid);
const html = await r.text();
ok(r.status === 200 && html.includes(`<meta property="og:image" content="${BASE}/api/card?id=${rid}">`) && html.includes('content="summary_large_image"') && new RegExp(`og:title" content="127\\.0\\.0\\.1 scored ${score}/100 on HindSited"`).test(html), "share page has the preview image, title and large-card tags");
const v = await page(390);
await v.goto(BASE + "/s/" + rid); await v.waitForSelector(".rep-head", { timeout: 30000 });
ok(new URL(v.url()).pathname === "/r/" + rid, "opening the share link lands on the report");
ok((await fetch(BASE + "/s/not-a-report", { redirect: "manual" })).status === 302, "a bad share link goes to the home page");

// an older report with no card: drawn on demand
await store.cards().delete(rid);
const q = await page();
await q.goto(BASE + "/r/" + rid); await q.waitForSelector("#shareCard");
await q.click("#shareCard"); await q.waitForSelector("#shareBox .share-img, #shareBox .share-row", { timeout: 90000 });
ok(!!(await q.$("#shareBox .share-img")) && !!(await store.cards().get(rid)), "an older report's card is drawn when someone taps Share");

// competitor checks get no card or share page
const cmp = await fetch(BASE + "/api/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: rid, url: "127.0.0.2:8102" }) }).then((x) => x.json());
await waitFor(async () => (await store.reports().get(cmp.id, { type: "json" }))?.state === "done", 150000);
ok((await fetch(BASE + "/api/card?id=" + cmp.id + "&make=1")).status === 404 && !(await store.cards().get(cmp.id)), "no card for a competitor check");
ok((await fetch(BASE + "/s/" + cmp.id, { redirect: "manual" })).status === 302, "no share page for a competitor check");

// phone
const m = await page(360);
await m.goto(BASE + "/r/" + rid); await m.waitForSelector("#shareCard"); await m.click("#shareCard"); await m.waitForSelector("#shareBox .share-img");
ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "share panel fits a 360px phone");
await m.evaluate(() => document.querySelector("#shareBox").scrollIntoView()); await m.screenshot({ path: out("share-phone.png") });

const ev = await (await import("../netlify/lib/events.mjs")).summary(1);
console.log("   events:", JSON.stringify(ev.total));
ok(!errors.length, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close(); fxA.close(); fxB.close();
console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
