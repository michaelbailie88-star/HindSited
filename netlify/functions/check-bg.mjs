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
    const stages = [];
    const started = Date.now();
    const log = (st) => { stages.push(st + "@" + Math.round((Date.now() - started) / 1000) + "s"); save({ state: "running", url: u.href, stages }).catch(() => {}); };
    if (q.get("only") === "client") {
      // replay exactly what the browser client does, against the live endpoints
      const base = new URL(req.url).origin;
      const call = async (path, body) => {
        const t = Date.now();
        try {
          const r = await fetch(base + "/api/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(75000) });
          const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
          return { path, status: r.status, ms: Date.now() - t, error: j && j.error, detail: j && j.detail, size: txt.length, json: j };
        } catch (e) { return { path, status: 0, ms: Date.now() - t, error: String(e.message) }; }
      };
      const [m, d, s1, s2] = await Promise.all([call("render", { url: u.href }), call("render", { url: u.href, mode: "desktop" }), call("speed", { url: u.href, strategy: "mobile" }), call("speed", { url: u.href, strategy: "desktop" })]);
      const strip = (x) => ({ path: x.path, status: x.status, ms: x.ms, error: x.error, detail: x.detail, size: x.size });
      const summary = { mobile: strip(m), desktop: strip(d), speedMobile: { ...strip(s1), scores: s1.json && s1.json.scores }, speedDesktop: { ...strip(s2), scores: s2.json && s2.json.scores } };
      if (m.json && m.json.audit) {
        summary.mobile.notes = m.json.notes; summary.mobile.findings = m.json.audit.findings.map((f) => f.rule + ": " + f.evidence); summary.mobile.hasShot = !!(m.json.shots && m.json.shots.mobile);
        const pageUrls = m.json.audit.links.filter((l) => l.internal).map((l) => l.url).slice(0, 8);
        summary.crawl = strip(await call("crawl", { urls: pageUrls, origin: u.origin }));
        summary.links = strip(await call("links", { items: m.json.audit.links.slice(0, 40).map((l) => ({ url: l.url, internal: l.internal })) }));
      }
      if (d.json) summary.desktop.hasShot = !!d.json.shot;
      return await save({ state: "done", url: u.href, client: summary });
    }
    browser = await launchBrowser();
    log("browser");
    if (q.get("only") === "render") {
      const { renderAudit } = await import("../lib/render.mjs");
      const r = await renderAudit(browser, u.href, { budgetMs: 55000, onStage: log, mode: q.get("mode") || "mobile" });
      return await save({ state: "done", url: u.href, stages, ok: r.ok, status: r.status, ms: r.ms, notes: r.notes, findings: r.audit ? r.audit.findings.map((f) => f.rule + ": " + f.evidence) : null, hash: r.audit ? r.audit.hashCandidates.length : null });
    }
    const out = await fullScan(browser, u.href, { psiKey: Netlify.env.get("PSI_KEY"), log });
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
