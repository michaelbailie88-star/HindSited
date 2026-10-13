// Header sign-in / sign-out on every page, and /account when signed out.
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
const ctx = await b.createBrowserContext();
const p = await ctx.newPage(); await p.setViewport({ width: 1280, height: 900 });
p.on("pageerror", (e) => errors.push(e.message));
const linkFor = (email) => outbox.filter((m) => m.to === email).pop().text.match(/https?:\/\/\S+/)[0];
const headerText = () => p.$eval("#account", (e) => e.innerText.trim());

// 1. signed-out header on all three pages
for (const pg of ["/", "/reviews", "/quotes"]) {
  await p.goto(BASE + pg); await p.waitForSelector("#account .acct-signin", { timeout: 8000 }).catch(() => {});
  ok((await headerText()) === "Sign in", `signed-out header shows "Sign in" on ${pg}`);
}
await p.goto(BASE + "/"); await p.waitForSelector("#account .acct-signin");
await p.screenshot({ path: out("acct-home-signedout.png") });

// 2. header Sign in -> plain sign-in panel -> email -> lands on account page
await p.click("#signInLink");
await p.waitForSelector("#acSignin");
ok(new URL(p.url()).pathname === "/account", "header Sign in opens /account sign-in form");
await p.screenshot({ path: out("acct-signin-panel.png") });
await p.type("#acEmail", "header@acme-co.com"); await p.click("#acSignin button");
await p.waitForFunction(() => /check your inbox/i.test(document.body.innerText));
await p.goto(linkFor("header@acme-co.com"));
await p.waitForFunction(() => /your account/i.test(document.body.innerText), { timeout: 10000 });
ok(new URL(p.url()).pathname === "/account", "sign-in link lands on My account");
ok(/header@acme-co\.com/.test(await headerText()) && /Sign out/.test(await headerText()), "header shows email + My account + Sign out");

// 3. sign out from home page -> Sign in reappears
await p.click("#signOut");
await p.waitForSelector("#account .acct-signin");
ok((await headerText()) === "Sign in" && new URL(p.url()).pathname === "/", "after sign-out, home shows Sign in");
await p.reload(); await p.waitForSelector("#account .acct-signin");
ok((await headerText()) === "Sign in", "still signed out after reload (cookie cleared)");

// 4. /account opened directly while signed out -> sign-in form, not a blank bounce
await p.goto(BASE + "/account"); await p.waitForSelector("#acSignin", { timeout: 8000 }).catch(() => {});
ok(!!(await p.$("#acSignin")), "/account while signed out shows the sign-in form");

// 5. header Sign in from Review Booster returns you to Review Booster
await p.goto(BASE + "/reviews"); await p.waitForSelector("#account .acct-signin");
await p.click("#account .acct-signin"); await p.waitForSelector("#acSignin");
ok(new URL(p.url()).searchParams.get("next") === "/reviews", "tool-page Sign in carries the return page");
await p.type("#acEmail", "tool@acme-co.com"); await p.click("#acSignin button");
await p.waitForFunction(() => /check your inbox/i.test(document.body.innerText));
await p.goto(linkFor("tool@acme-co.com"));
await p.waitForFunction(() => location.pathname === "/reviews" && /Sign out/.test(document.querySelector("#account").innerText), { timeout: 10000 });
ok(true, "sign-in from Review Booster returns to Review Booster, signed in");

// 6. sign out on the tool page -> Sign in shows there too
await p.click("#signOut");
await p.waitForSelector("#account .acct-signin", { timeout: 8000 }).catch(() => {});
ok((await headerText()) === "Sign in", "sign-out on Review Booster shows Sign in");

// 7. bad next is ignored
await p.goto(BASE + "/account?next=//evil.com"); await p.waitForSelector("#acSignin");
await p.type("#acEmail", "evil@acme-co.com"); await p.click("#acSignin button");
await p.waitForFunction(() => /check your inbox/i.test(document.body.innerText));
await p.goto(linkFor("evil@acme-co.com"));
await p.waitForFunction(() => /your account/i.test(document.body.innerText), { timeout: 10000 });
ok(new URL(p.url()).host === "127.0.0.1:8100", "a //other-site return address is ignored");

// 8. phone width: header fits
await p.setViewport({ width: 375, height: 800 }); await p.goto(BASE + "/"); await p.waitForSelector("#account");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), "header fits on a phone (no sideways scroll)");
await p.screenshot({ path: out("acct-phone-signedin.png") });
await p.click("#signOut"); await p.waitForSelector("#account .acct-signin");
ok(await p.evaluate(() => document.documentElement.scrollWidth <= 375), "signed-out header fits on a phone");
await p.screenshot({ path: out("acct-phone-signedout.png") });

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); await dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
