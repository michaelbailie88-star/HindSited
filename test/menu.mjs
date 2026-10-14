// Header: phone menu (hamburger) + always-visible account control and its dropdown.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { signUp } from "./helpers.mjs";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const out = (n) => path.join(here, "out", n);
const dev = await startDev(8100);
const BASE = "http://127.0.0.1:8100";
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox"] });
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const errors = [];
const p = await (await b.createBrowserContext()).newPage();
p.on("pageerror", (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const isOpen = () => p.$eval("#siteMenu", (m) => m.classList.contains("open") && getComputedStyle(m).display !== "none");
const popOpen = () => p.$eval("#acctPop", (e) => !e.hidden).catch(() => false);
const expanded = () => p.$eval(".menu-btn", (e) => e.getAttribute("aria-expanded"));

for (const pg of ["/", "/reviews", "/quotes", "/privacy"]) {
  await p.setViewport({ width: 375, height: 800 }); await p.goto(BASE + pg); await p.waitForSelector("#acct .acct-signin");
  ok(await p.$eval(".menu-btn", (e) => getComputedStyle(e).display !== "none") && !(await isOpen()), `${pg}: phone shows the menu button, menu closed`);
  ok(await p.$eval(".tools-nav", (e) => e.getBoundingClientRect().height === 0), `${pg}: tool links hidden until the menu opens`);
  await p.click(".menu-btn"); await wait(150);
  ok(await isOpen() && (await expanded()) === "true", `${pg}: tapping the button opens the menu`);
  const links = await p.$$eval("#siteMenu .tools-nav a", (as) => as.map((a) => Math.round(a.getBoundingClientRect().height)));
  ok(links.length === 3 && links.every((h) => h >= 44), `${pg}: 3 tool links, each easy to tap (${links.join("/")}px)`);
  await p.click(".menu-btn"); await wait(150);
  ok(!(await isOpen()) && (await expanded()) === "false", `${pg}: tapping again closes it`);
}
await p.goto(BASE + "/"); await p.waitForSelector("#acct .acct-signin");
await p.click(".menu-btn"); await wait(100); await p.keyboard.press("Escape"); await wait(100);
ok(!(await isOpen()), "Escape closes the menu");
await p.click(".menu-btn"); await wait(100); await p.mouse.click(180, 700); await wait(100);
ok(!(await isOpen()), "tapping the page outside the menu closes it");
await p.click(".menu-btn"); await wait(100);
await Promise.all([p.waitForNavigation(), p.click('#siteMenu a[href="/reviews"]')]);
ok(new URL(p.url()).pathname === "/reviews", "Review Booster link in the menu works");

// signed in: account dropdown
await signUp(p, BASE, { email: "menu@acme-co.com", name: "Mona Lisa", business: "Acme Co" });
await p.goto(BASE + "/"); await p.waitForSelector("#acctBtn");
const sz = await p.$eval("#acctBtn", (e) => { const r = e.getBoundingClientRect(); return [r.width, r.height, r.top]; });
ok(sz[1] >= 38 && sz[2] < 62, `account button sits in the header bar and is easy to tap (${Math.round(sz[0])}x${Math.round(sz[1])})`);
await p.click("#acctBtn"); await wait(100);
ok(await popOpen(), "tapping the account button opens the account menu");
ok(await p.$eval("#acctPop", (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), "account menu fits on the phone screen");
await p.screenshot({ path: out("menu-acct-phone.png") });
await p.click(".menu-btn"); await wait(100);
ok(!(await popOpen()) && (await isOpen()), "opening the tools menu closes the account menu");
await p.click("#acctBtn"); await wait(100);
ok((await popOpen()) && !(await isOpen()), "opening the account menu closes the tools menu");
await p.keyboard.press("Escape"); await wait(100);
ok(!(await popOpen()), "Escape closes the account menu");
await p.click("#acctBtn"); await wait(100);
await Promise.all([p.waitForNavigation(), p.click('#acctPop a[href="/account"]')]);
await p.waitForSelector(".dash");
ok(true, "My dashboard link opens the dashboard");

// desktop
for (const w of [1280, 1024, 900]) {
  await p.setViewport({ width: w, height: 800 }); await p.goto(BASE + "/"); await p.waitForSelector("#acctBtn"); await wait(150);
  ok(await p.$eval(".menu-btn", (e) => getComputedStyle(e).display === "none"), `${w}px: no menu button`);
  ok(await p.$eval(".tools-nav", (e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top < 62), `${w}px: tool links sit in the header bar`);
  ok(await p.$eval(".top", (e) => Math.round(e.getBoundingClientRect().height)) <= 64, `${w}px: header is one row`);
  await p.screenshot({ path: out(`menu-desktop-${w}.png`), clip: { x: 0, y: 0, width: w, height: 70 } });
}
await p.click("#acctBtn"); await wait(100);
ok(await popOpen() && /Sign out/.test(await p.$eval("#acctPop", (e) => e.innerText)), "desktop: account menu with Sign out");
ok((await p.$eval(".menu-btn", (e) => e.getAttribute("aria-controls"))) === "siteMenu" && (await p.$eval("#acctBtn", (e) => e.getAttribute("aria-haspopup"))) === "true", "menu and account buttons are labelled for screen readers");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
