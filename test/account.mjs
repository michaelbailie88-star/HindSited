// Accounts: always-visible sign in, sign up, sign in/out, lockout, forgot +
// reset password, sessions, older accounts, dashboard, reviews, delete.
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { signUp, signIn, signOut, PW } from "./helpers.mjs";
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
const ctx = await b.createBrowserContext();
const p = await ctx.newPage(); await p.setViewport({ width: 375, height: 800 });
p.on("pageerror", (e) => errors.push(e.message));
const text = (pg = p) => pg.evaluate(() => document.body.innerText);
const linkIn = (to, re) => { const m = outbox.filter((x) => x.to === to && re.test(x.subject)).pop(); return m && m.text.match(/https?:\/\/\S+/)[0]; };
const visible = (sel, pg = p) => pg.$eval(sel, (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && r.top >= 0 && r.top < 70; }).catch(() => false);
const post = (pth, body, cookie) => fetch(BASE + pth, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

// ---- signed out: Sign in is always in the header bar, on every page and size
for (const pg of ["/", "/reviews", "/quotes", "/privacy", "/terms", "/cancel"]) {
  await p.goto(BASE + pg); await p.waitForSelector("#acct .acct-signin", { timeout: 8000 }).catch(() => {});
  ok(await visible("#acct .acct-signin"), `phone: Sign in visible in the header on ${pg}`);
}
await p.setViewport({ width: 1280, height: 800 }); await p.goto(BASE + "/"); await p.waitForSelector("#acct .acct-signin");
ok((await visible("#acct .acct-signin")) && (await visible("#acct .acct-create")), "desktop: Sign in and Create account both in the header");
await p.setViewport({ width: 375, height: 800 });

// ---- sign-up checks
await p.goto(BASE + "/account?mode=signup"); await p.waitForSelector('.auth-form input[name="business"]');
const tryUp = async (fields) => { for (const [k, v] of Object.entries(fields)) { await p.$eval(`.auth-form input[name="${k}"]`, (e) => (e.value = "")); await p.type(`.auth-form input[name="${k}"]`, v); } await p.click(".auth-go"); await p.waitForFunction(() => !document.querySelector(".auth .form-err").hidden); return p.$eval(".auth .form-err", (e) => e.textContent); };
ok(/business name/i.test(await tryUp({ name: "Dana", email: "dana@lakeside-co.com", password: PW })), "sign-up requires a business name");
ok(/8 characters/.test(await tryUp({ business: "Lakeside Co", password: "short" })), "sign-up refuses short passwords");
ok(/real email/i.test(await tryUp({ email: "dana@mailinator.com", password: PW })), "sign-up refuses throwaway emails");

// ---- sign up for real
await signUp(p, BASE, { email: "dana@lakeside-co.com", name: "Dana Fisher", business: "Lakeside Co", website: "lakeside-co.com" });
await p.waitForSelector(".dash");
let t = await text();
ok(new URL(p.url()).pathname === "/account" && /Hi, Dana/.test(t) && /Lakeside Co/.test(t) && /lakeside-co\.com/.test(t), "new account lands on the dashboard with name, business and website");
ok(await visible("#acctBtn"), "signed in: the account button is in the header bar on a phone");
ok(/confirm your email/i.test(t) && !!linkIn("dana@lakeside-co.com", /Confirm/), "a confirmation email is sent and the dashboard asks to confirm");
await p.screenshot({ path: out("acct-dash-phone.png"), fullPage: true });
await p.goto(linkIn("dana@lakeside-co.com", /Confirm/)); await p.waitForSelector(".dash");
ok(/email is confirmed/i.test(await text()) && !(await p.$(".dash-verify")), "confirm link verifies the email");
await p.click("#acctBtn"); await p.waitForSelector("#acctPop:not([hidden])");
const pop = await p.$eval("#acctPop", (e) => e.innerText);
ok(/Dana Fisher/.test(pop) && /Lakeside Co/.test(pop) && /Free plan/.test(pop) && /Sign out/.test(pop), "account menu shows name, business, plan and Sign out");
await p.screenshot({ path: out("acct-menu-phone.png") });
await p.keyboard.press("Escape");

// ---- sign out, and it stays signed out
await signOut(p);
ok(new URL(p.url()).pathname === "/" && (await visible("#acct .acct-signin")), "Sign out returns home with Sign in still in the header");
await p.reload(); await p.waitForSelector("#acct .acct-signin");
ok(true, "still signed out after reload");

// ---- wrong passwords and lockout
const login = (password) => post("/api/auth/login", { email: "dana@lakeside-co.com", password });
let r = await login("wrong-one-1"); let d = await r.json();
ok(r.status === 401 && /don't match/.test(d.error), "wrong password is refused with a neutral message");
for (let i = 0; i < 4; i++) await login("wrong-one-1");
r = await login(PW); d = await r.json();
ok(r.status === 429 && /Try again in 15 minutes/.test(d.error), "5 wrong passwords lock the account for 15 minutes, even for the right password");
const nobody = await (await post("/api/auth/login", { email: "nobody@lakeside-co.com", password: PW })).json();
ok(/don't match/.test(nobody.error), "unknown emails get the same message (no account fishing)");

// ---- forgot password unlocks and resets
await p.goto(BASE + "/account"); await p.waitForSelector(".auth-forgot"); await p.click(".auth-forgot");
await p.waitForSelector('.auth-form input[name="email"]'); await p.type('.auth-form input[name="email"]', "dana@lakeside-co.com");
await p.click(".auth-go"); await p.waitForFunction(() => /check your inbox/i.test(document.body.innerText));
const ghost = await (await post("/api/auth/forgot", { email: "ghost@lakeside-co.com" })).json();
ok(ghost.sent === true && !outbox.some((m) => m.to === "ghost@lakeside-co.com"), "forgot password answers the same for unknown emails and sends nothing");
const resetLink = linkIn("dana@lakeside-co.com", /Reset/);
// a second device signed in before the reset (clear the lockout first)
{ const u = await store.getUser("dana@lakeside-co.com"); u.lockUntil = null; u.fails = 0; await store.saveUser(u); }
const sess2 = await post("/api/auth/login", { email: "dana@lakeside-co.com", password: PW });
const cookie2 = (sess2.headers.get("set-cookie") || "").split(";")[0];
ok(sess2.status === 200 && (await (await fetch(BASE + "/api/me", { headers: { cookie: cookie2 } })).json()).signedIn, "second device is signed in");
await p.goto(resetLink); await p.waitForSelector('.auth-form input[name="password"]');
await p.type('.auth-form input[name="password"]', "New-Password-77");
await Promise.all([p.waitForNavigation(), p.click(".auth-go")]); await p.waitForSelector(".dash");
ok(/new password is saved/i.test(await text()), "reset link sets a new password and signs in");
const other = await (await fetch(BASE + "/api/me", { headers: { cookie: cookie2 } })).json();
ok(other.signedIn === false, "resetting the password signs out other devices");
const again = await (await post("/api/auth/reset", { t: new URL(resetLink).searchParams.get("t"), password: "Another-Pass-88" })).json();
ok(again.expired === true, "a reset link works only once");
ok((await login(PW)).status === 401 && (await login("New-Password-77")).status === 200, "old password no longer works, new one does");

// ---- next= returns you where you were; //other-site is ignored
await signOut(p);
await p.goto(BASE + "/reviews"); await p.waitForSelector("#acct .acct-signin"); await p.click("#acct .acct-signin");
await p.waitForSelector('.auth-form input[name="email"]');
await p.type('.auth-form input[name="email"]', "dana@lakeside-co.com"); await p.type('.auth-form input[name="password"]', "New-Password-77");
await Promise.all([p.waitForNavigation(), p.click(".auth-go")]);
await p.waitForSelector("#acctBtn");
ok(new URL(p.url()).pathname === "/reviews", "signing in from Review Booster returns to Review Booster");
const evil = await (await post("/api/auth/login", { email: "dana@lakeside-co.com", password: "New-Password-77", next: "//evil.com" })).json();
ok(evil.next === "/account", "a //other-site return address is ignored");

// ---- older account with no password
const legacy = store.newUser("old.timer@lakeside-co.com"); await store.saveUser(legacy);
const lg = await (await post("/api/auth/login", { email: "old.timer@lakeside-co.com", password: "anything-123" })).json();
ok(lg.needsPassword && !!linkIn("old.timer@lakeside-co.com", /Set your/), "an older account with no password gets a set-password email");
const steal = await post("/api/auth/signup", { name: "Thief", business: "X", email: "old.timer@lakeside-co.com", password: PW });
ok(steal.status === 409 && !(await store.getUser("old.timer@lakeside-co.com")).pw, "nobody can claim an older account by signing up with its email");
ok((await post("/api/auth/signup", { name: "Dup", business: "X", email: "dana@lakeside-co.com", password: PW })).status === 409, "signing up with an existing email is refused");

// ---- dashboard: edit details, change password
await p.goto(BASE + "/account"); await p.waitForSelector("#profForm");
await p.click("#settings details.set summary");
await p.$eval('#profForm input[name="business"]', (e) => (e.value = "")); await p.type('#profForm input[name="business"]', "Lakeside Cleaning Co");
await p.click("#profForm button[type=submit]"); await p.waitForFunction(() => /details are saved/.test(document.body.innerText));
ok(/Lakeside Cleaning Co/.test(await text()), "profile edits save and show on the dashboard");

// ---- review of HindSited: needs approval before it's public
await p.click('.star-pick label:nth-of-type(5)');
await p.type('#revForm textarea[name="text"]', "Found three broken links I never knew about. Fixed in a day.");
await p.click('#revForm input[name="showBusiness"]');
await p.click("#revForm button[type=submit]"); await p.waitForFunction(() => /will appear once/.test(document.body.innerText));
let pubR = await (await fetch(BASE + "/api/reviews")).json();
ok(pubR.reviews.length === 0 && outbox.some((m) => m.to === "thelazycreatorco@gmail.com" && /waiting for approval/.test(m.subject)), "a new review isn't public until approved, and the studio is told");
const o = await (await b.createBrowserContext()).newPage(); await o.setViewport({ width: 1200, height: 900 });
o.on("pageerror", (e) => errors.push(e.message));
await signUp(o, BASE, { email: "michaelbailie88@icloud.com", name: "Michael Bailie", business: "The Lazy Creator Company" });
await o.waitForSelector("#moderate [data-act=approve]");
await o.click("#moderate [data-act=approve]"); await o.waitForFunction(() => /approved/i.test(document.querySelector("#moderate").innerText));
pubR = await (await fetch(BASE + "/api/reviews")).json();
ok(pubR.reviews.length === 1 && pubR.reviews[0].name === "Dana F." && pubR.reviews[0].business === "Lakeside Cleaning Co" && !JSON.stringify(pubR).includes("@"), "approved review is public with a short name and no email");
await o.goto(BASE + "/"); await o.waitForSelector("#sayso:not([hidden])", { timeout: 8000 }).catch(() => {});
ok(/Found three broken links/.test(await text(o)), "approved reviews show on the landing page");
ok((await post("/api/reviews", { action: "approve", id: pubR.reviews[0].id }, cookie2)).status !== 200, "only the owner can approve reviews");

// ---- delete account
await p.goto(BASE + "/account"); await p.waitForSelector("#delForm");
await p.click("details.danger summary");
await p.type('#delForm input[name="password"]', "wrong-password"); await p.type('#delForm input[name="confirm"]', "DELETE");
await p.click("#delForm button[type=submit]"); await p.waitForFunction(() => !document.querySelector("#delForm .form-err").hidden);
ok(!!(await store.getUser("dana@lakeside-co.com")), "delete needs the right password");
await p.$eval('#delForm input[name="password"]', (e) => (e.value = "")); await p.type('#delForm input[name="password"]', "New-Password-77");
await Promise.all([p.waitForNavigation(), p.click("#delForm button[type=submit]")]);
ok(!(await store.getUser("dana@lakeside-co.com")) && /has been deleted/.test(await text()) && (await visible("#acct .acct-signin")), "account is deleted and signed out");
pubR = await (await fetch(BASE + "/api/reviews")).json();
ok(pubR.reviews.length === 0, "their review is removed with the account");

ok(errors.length === 0, "no page errors" + (errors.length ? ": " + errors.join(" | ") : ""));
await b.close(); dev.close?.();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);
