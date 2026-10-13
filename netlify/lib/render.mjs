// Renders a page in real Chromium, the way a visitor's phone sees it, and runs
// the in-page audit. Works with any puppeteer Browser instance.
import { pageAudit, foldCta } from "./pageaudit.mjs";
import { makeTextRules } from "./textrules.mjs";
import { assertPublicHost, isPrivateIp, UA, UA_DESKTOP } from "./guard.mjs";
import net from "node:net";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Every step against the page gets a deadline, so a busy or broken page can
// never stall the whole scan.
function T(p, ms, label) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout:" + label)), ms); })]).finally(() => clearTimeout(t));
}

export async function renderAudit(browser, url, { budgetMs = 50000, now = Date.now(), mode = "mobile", onStage = () => {} } = {}) {
  if (mode === "desktop") return desktopPass(browser, url, budgetMs);
  const stage = (s) => { try { onStage(s); } catch {} };
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  const page = await browser.newPage();
  const net404 = [];
  const notes = [];
  try {
    await page.setBypassCSP(true);
    await page.setUserAgent(UA);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      try {
        const u = new URL(req.url());
        if (u.protocol === "data:" || u.protocol === "blob:") return req.continue();
        if (!/^https?:$/.test(u.protocol)) return req.abort();
        const h = u.hostname.replace(/^\[|\]$/g, "");
        if (process.env.HS_ALLOW_LOCAL !== "1") {
          if (/^localhost$/i.test(h) || (net.isIP(h) && isPrivateIp(h))) return req.abort();
          if (req.isNavigationRequest() && req.frame() === page.mainFrame()) await assertPublicHost(h);
        }
        // skip heavy media we never look at
        if (["media", "websocket", "eventsource"].includes(req.resourceType())) return req.abort();
        return req.continue();
      } catch { try { req.abort(); } catch {} }
    });
    page.on("response", (res) => {
      const rt = res.request().resourceType();
      if (rt === "image" && (res.status() === 404 || res.status() === 410)) net404.push(res.url());
    });
    page.on("dialog", (d) => d.dismiss().catch(() => {}));

    let resp;
    try {
      resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(20000, left() - 20000) });
    } catch (e) {
      if (/timeout/i.test(e.message)) { notes.push("slow-load"); resp = null; }
      else throw e;
    }
    // give the page a fair chance to finish, without waiting forever on trackers
    await page.waitForFunction(() => document.readyState === "complete", { timeout: Math.min(8000, Math.max(1000, left() - 25000)) }).catch(() => notes.push("load-incomplete"));
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 2500 }).catch(() => {});
    const mainStatus = resp ? resp.status() : 0;
    const hdrs = resp ? resp.headers() : {};
    if (mainStatus >= 400) {
      return { ok: false, status: mainStatus, finalUrl: page.url(), error: "status" };
    }

    // scroll to trigger lazy content, then back to top
    stage("loaded");
    await T(page.evaluate(async (limitMs) => {
      const s = Date.now();
      let y = 0;
      const max = Math.min(document.documentElement.scrollHeight, 16000);
      while (y < max && Date.now() - s < limitMs) { y += 700; window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, 0);
    }, Math.min(5000, Math.max(1000, left() - 30000))), 9000, "scroll").catch(() => notes.push("scroll-timeout"));
    stage("scrolled");
    await sleep(700);

    await T(page.evaluate(`window.__hsTR = (${makeTextRules.toString()})()`), 8000, "rules");
    const audit = await T(page.evaluate(pageAudit, { now, mobile: true, deviceWidth: 390 }), Math.max(8000, Math.min(20000, left() - 12000)), "audit");
    stage("audited");
    const mobileFold = await T(page.evaluate(foldCta, { w: 390, h: 844 }), 6000, "fold").catch(() => ({ count: -1, first: [] }));

    // full-page mobile screenshot (capped) for pinpointing findings
    const shotH = Math.min(audit.docH, 9000);
    let mobileShot = null;
    try {
      const buf = await T(page.screenshot({ type: "jpeg", quality: 55, clip: { x: 0, y: 0, width: 390, height: shotH }, captureBeyondViewport: true }), Math.max(4000, Math.min(12000, left() - 10000)), "screenshot");
      mobileShot = { data: "data:image/jpeg;base64," + Buffer.from(buf).toString("base64"), w: 390, h: shotH };
    } catch (e) { notes.push("shot-failed"); }

    // try every "#" link: does clicking it actually do anything?
    const deadLinks = [];
    let navigated = false;
    const baseUrl = page.url().replace(/#.*$/, "");
    const onNav = (fr) => { if (fr === page.mainFrame() && fr.url().replace(/#.*$/, "") !== baseUrl) navigated = true; };
    page.on("framenavigated", onNav);
    for (const c of audit.hashCandidates) {
      if (left() < 22000 || navigated) break;
      let r;
      try {
        r = await T(page.evaluate(async (id) => {
          const el = document.querySelector('[data-hs-hash="' + id + '"]');
          if (!el) return { gone: true };
          el.scrollIntoView({ block: "center" });
          await new Promise((s) => setTimeout(s, 200));
          const noisy = new Set();
          let obs = new MutationObserver((ms) => ms.forEach((m) => noisy.add(m.target)));
          obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
          await new Promise((s) => setTimeout(s, 500));
          obs.disconnect();
          const isNoisy = (t) => { for (const x of noisy) if (x === t || (x.contains && x.contains(t))) return true; return false; };
          let effects = 0;
          obs = new MutationObserver((ms) => ms.forEach((m) => { if (m.target !== el && !el.contains(m.target) && !isNoisy(m.target)) effects++; }));
          obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
          let opened = false; const oo = window.open; window.open = function () { opened = true; return null; };
          const before = location.href.replace(/#.*$/, "");
          el.click();
          await new Promise((s) => setTimeout(s, 700));
          obs.disconnect(); window.open = oo;
          return { effects, opened, nav: location.href.replace(/#.*$/, "") !== before };
        }, c.id), 5000, "click");
      } catch (e) { if (/^timeout:/.test(e.message)) { notes.push("click-timeout"); break; } navigated = true; break; }
      if (r && !r.gone && !r.effects && !r.opened && !r.nav && !navigated) deadLinks.push(c);
    }
    page.off("framenavigated", onNav);
    stage("clicked");

    return {
      ok: true, status: mainStatus, finalUrl: audit.url, https: audit.url.startsWith("https:"),
      xRobots: hdrs["x-robots-tag"] || "", audit, mobileFold, desktopFold: null, deadLinks, net404: [...new Set(net404)].slice(0, 20),
      shots: { mobile: mobileShot, desktop: null }, ms: Date.now() - t0, notes
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// Desktop pass: what a computer shows in the first screen.
async function desktopPass(browser, url, budgetMs) {
  const t0 = Date.now();
  const left = () => budgetMs - (Date.now() - t0);
  const page = await browser.newPage();
  try {
    await page.setUserAgent(UA_DESKTOP);
    await page.setViewport({ width: 1366, height: 800, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      try {
        const u = new URL(req.url());
        if (u.protocol === "data:" || u.protocol === "blob:") return req.continue();
        if (!/^https?:$/.test(u.protocol)) return req.abort();
        const h = u.hostname.replace(/^\[|\]$/g, "");
        if (process.env.HS_ALLOW_LOCAL !== "1") {
          if (/^localhost$/i.test(h) || (net.isIP(h) && isPrivateIp(h))) return req.abort();
          if (req.isNavigationRequest() && req.frame() === page.mainFrame()) await assertPublicHost(h);
        }
        if (["media", "websocket", "eventsource"].includes(req.resourceType())) return req.abort();
        return req.continue();
      } catch { try { req.abort(); } catch {} }
    });
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(20000, left() - 15000) }).catch(() => null);
    await page.waitForFunction(() => document.readyState === "complete", { timeout: Math.min(8000, Math.max(1000, left() - 12000)) }).catch(() => {});
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 2000 }).catch(() => {});
    await sleep(500);
    const desktopFold = await T(page.evaluate(foldCta, { w: 1366, h: 800 }), 6000, "fold").catch(() => null);
    const buf = await T(page.screenshot({ type: "jpeg", quality: 60 }), 10000, "screenshot");
    return { ok: true, status: resp ? resp.status() : 0, desktopFold, shot: { data: "data:image/jpeg;base64," + Buffer.from(buf).toString("base64"), w: 1366, h: 800 }, ms: Date.now() - t0 };
  } finally {
    await page.close().catch(() => {});
  }
}
