// Background full scan: stores a compact report in Blobs for /api/check.
import { getStore } from "@netlify/blobs";
import { launchBrowser } from "../lib/browser.mjs";
import { fullScan } from "../lib/pipeline.mjs";
import { normalizeUrl, assertPublicHost } from "../lib/guard.mjs";
import { buildReport } from "../../public/rules.js";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  const id = (q.get("id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  if (!id) return;
  const store = getStore("checks");
  const save = (data) => store.setJSON(id, { ...data, at: new Date().toISOString() });
  let browser;
  try {
    const u = normalizeUrl(q.get("url"));
    await assertPublicHost(u.hostname);
    await save({ state: "running", url: u.href });
    browser = await launchBrowser();
    const out = await fullScan(browser, u.href, { psiKey: Netlify.env.get("PSI_KEY") });
    if (out.error) return await save({ state: "error", url: u.href, error: out.render });
    const r = buildReport(out.scan);
    const sp = out.scan.speed;
    await save({
      state: "done", url: u.href, finalUrl: out.scan.render.finalUrl, timings: out.timings, score: r.score, grade: r.grade.label,
      pagesChecked: r.pagesChecked, linksChecked: r.linksChecked, platform: r.platform,
      findings: r.findings.map((f) => ({ rule: f.rule, severity: f.severity, title: f.title, items: f.items.slice(0, 6).map((i) => (i.evidence || "") + (i.page ? "  @ " + i.page : "")) })),
      passed: r.passed.map((p) => p.rule),
      speed: { mobile: sp.mobile && (sp.mobile.error ? { error: sp.mobile.error, detail: sp.mobile.detail } : sp.mobile.scores), desktop: sp.desktop && (sp.desktop.error ? { error: sp.desktop.error, detail: sp.desktop.detail } : sp.desktop.scores) },
      renderNotes: out.scan.render.notes, renderMs: out.scan.render.ms, deadButtonsTested: out.scan.render.audit.hashCandidates.length
    });
  } catch (e) {
    await save({ state: "error", error: String(e && e.stack || e).slice(0, 600) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

export const config = { path: "/api/check-bg", background: true, rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] } };
