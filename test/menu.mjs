// Hamburger menu behaviour on phones, and the desktop header staying as it was.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
process.env.HS_ALLOW_LOCAL = "1";
const { startDev, outbox } = await import("./dev.mjs");
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
const expanded = () => p.$eval(".menu-btn", (e) => e.getAttribute("aria-expanded"));

for (const pg of ["/", "/reviews", "/quotes"]) {
  await p.setViewport({ width: 375, height: 800 }); await p.goto(BASE + pg); await p.waitForSelector("#account .acct-signin");
  ok(await p.$eval(".menu-btn", (e) => getComputedStyle(e).display !== "none") && !(await isOpen()), `${pg}: phone shows the menu button, menu closed`);
  ok(await p.$eval(".tools-nav", (e) => e.getBoundingClientRect().height === 0), `${pg}: tool links hidden until the menu opens`);
  await p.click(".menu-btn"); await wait(150);
  ok(await isOpen() && (await expanded()) === "true", `${pg}: tapping the button opens the menu`);
  const links = await p.$$eval("#siteMenu .tools-nav a", (as) => as.map((a) => [a.textContent, Math.round(a.getBoundingClientRect().height)]));
  ok(links.length === 3 && links.every(([, h]) => h >= 44), `${pg}: 3 tool links, each easy to tap (${links.map((l) => l[1]).join("/")}px)`);
  await p.click(".menu-btn"); await wait(150);
  ok(!(await isOpen()) && (await expanded()) === "false", `${pg}: tapping again closes it`);
}
// Escape and tapping outside close it
await p.goto(BASE + "/"); await p.waitForSelector("#account .acct-signin");
await p.click(".menu-btn"); await wait(100); await p.keyboard.press("Escape"); await wait(100);
ok(!(await isOpen()), "Escape closes the menu");
await p.click(".menu-btn"); await wait(100); await p.mouse.click(180, 700); await wait(100);
ok(!(await isOpen()), "tapping the page outside the menu closes it");
// a tool link navigates
await p.click(".menu-btn"); await wait(100);
await Promise.all([p.waitForNavigation(), p.click('#siteMenu a[href="/reviews"]')]);
ok(new URL(p.url()).pathname === "/reviews", "Review Booster link in the menu works");
// Sign in from the menu
await p.click(".menu-btn"); await wait(100);
await Promise.all([p.waitForNavigation(), p.click("#siteMenu .acct-signin")]);
await p.waitForSelector("#acSignin");
ok(true, "Sign in in the menu opens the sign-in form");
await p.type("#acEmail", "menu@acme-co.com"); await p.click("#acSignin button");
await p.waitForFunction(() => /check your inbox/i.test(document.body.innerText));
await p.goto(outbox.filter((m) => m.to === "menu@acme-co.com").pop().text.match(/https?:\/\/\S+/)[0]);
await p.waitForSelector("#signOut", { timeout: 10000 });
// on the main page, My account swaps views without a page load: menu must close
await p.goto(BASE + "/"); await p.waitForSelector("#myReports");
await p.click(".menu-btn"); await wait(100);
ok(/menu@acme-co\.com/.test(await p.$eval("#siteMenu", (e) => e.innerText)), "menu shows the signed-in email");
await p.click("#myReports"); await p.waitForFunction(() => /your account/i.test(document.body.innerText));
ok(!(await isOpen()), "My account from the menu opens the account page and closes the menu");
await p.screenshot({ path: out("menu-account-phone.png") });
await p.click(".menu-btn"); await wait(100); await p.click("#signOut"); await p.waitForSelector("#account .acct-signin");
ok(!(await isOpen()) && /^Sign in$/.test(await p.$eval("#account", (e) => e.innerText.trim())), "Sign out from the menu signs out and closes the menu");
// open menu then rotate/resize to desktop -> menu closes, normal header
await p.click(".menu-btn"); await wait(100);
await p.setViewport({ width: 1280, height: 800 }); await wait(200);
ok(await p.$eval(".menu-btn", (e) => getComputedStyle(e).display === "none"), "desktop: no menu button");
ok(await p.$eval(".tools-nav", (e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top < 62), "desktop: tool links sit in the header bar");
ok(!(await p.$eval("#siteMenu", (m) => m.classList.contains("open"))), "resizing to desktop clears the open menu");
ok(await p.$eval(".top", (e) => Math.round(e.getBoundingClientRect().height)) <= 64, "desktop header is one row");
await p.screenshot({ path: out("menu-desktop-1280.png"), clip: { x: 0, y: 0, width: 1280, height: 70 } });
// keyboard: button reachable and labelled
ok((await p.$eval(".menu-btn", (e) => e.getAttribute("aria-controls"))) === "siteMenu", "menu button is linked to the menu for screen readers");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
