// Background scan (up to 15 min), started only by /api/scan. Stores
// progress and the finished scan on the report record.
import { launchBrowser } from "../lib/browser.mjs";
import { fullScan } from "../lib/pipeline.mjs";
import { normalizeUrl, assertPublicHost } from "../lib/guard.mjs";
import { reports, appSecret } from "../lib/store.mjs";
import { buildReport } from "../../public/rules.js";
import { refund } from "../lib/refund.mjs";

export default async (req) => {
  if (req.headers.get("x-hs-key") !== (await appSecret())) return;
  const q = new URL(req.url).searchParams;
  const id = (q.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id) return;
  const store = reports();
  const base = await store.get(id, { type: "json" });
  if (!base || base.state !== "queued") return;
  const keep = { url: base.url, site: base.site, owner: base.owner, free: base.free, createdAt: base.createdAt };
  let chain = Promise.resolve();
  // saves run strictly in order so a late progress update never overwrites the result
  const save = (data) => (chain = chain.then(() => store.setJSON(id, { ...keep, ...data, at: new Date().toISOString() })).catch(() => {}));
  let browser;
  try {
    const u = normalizeUrl(base.url);
    await assertPublicHost(u.hostname);
    const stages = [];
    const started = Date.now();
    const log = (st) => { stages.push(st + "@" + Math.round((Date.now() - started) / 1000) + "s"); save({ state: "running", stages }); };
    await save({ state: "running", stages });
    browser = await launchBrowser();
    log("browser");
    const out = await fullScan(browser, u.href, { psiKey: Netlify.env.get("PSI_KEY"), log });
    if (out.error) {
      const st = out.render && out.render.status;
      await save({ state: "error", stages, error: st ? `The site answered with error ${st}, so there was nothing to check.` : "The site didn't load." });
      await refund(keep.owner, id, keep.site, keep.free).catch(() => {});
      return;
    }
    const r = buildReport(out.scan);
    await save({ state: "done", stages, timings: out.timings, score: r.score, grade: r.grade.label, scan: out.scan });
  } catch (e) {
    const m = String((e && e.code) || "") + " " + String((e && e.message) || e);
    const friendly = /blocked-host/.test(m) ? "That address isn't a public website."
      : /ENOTFOUND|EAI_AGAIN|EBUSY|getaddrinfo|ERR_NAME_NOT_RESOLVED/.test(m) ? "We couldn't find that website. Check the spelling."
      : /ERR_CONNECTION|ERR_TIMED_OUT|ERR_SSL|ERR_CERT/.test(m) ? "The website wouldn't connect. It may be down or have a security certificate problem."
      : "Something went wrong checking the site. Try again in a minute.";
    await save({ state: "error", error: friendly, detail: m.slice(0, 400) });
    await refund(keep.owner, id, keep.site, keep.free).catch(() => {});
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

export const config = { path: "/api/check-bg", background: true };
