// Studio automation: start scans and read full reports without the free-scan
// limits, for the outreach agents. Locked behind HS_ADMIN_KEY (set in the
// Netlify environment); with no key set these routes do not exist.
// POST /api/admin/scan   {urls:[...], full?:true} (max 5)  ->  {scans:[{url,id,reportUrl}|{url,error}]}
// GET  /api/admin/report?id=...                ->  state, score and every finding with evidence
// By default reports made here show visitors the normal free view (most serious
// findings locked); with full:true the shared link shows every finding.
import crypto from "node:crypto";
import { json, normalizeUrl, assertPublicHost, siteKey } from "../lib/guard.mjs";
import { reports, appSecret } from "../lib/store.mjs";
import { buildReport } from "../../public/rules.js";

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();
function allowed(req) {
  const key = Netlify.env.get("HS_ADMIN_KEY");
  if (!key || key.length < 24) return false;
  const got = req.headers.get("x-hs-admin") || "";
  return crypto.timingSafeEqual(digest(got), digest(key));
}

export default async (req) => {
  if (!allowed(req)) return json({ error: "Not found." }, 404);
  const u = new URL(req.url);
  if (u.pathname === "/api/admin/scan" && req.method === "POST") return startScans(req, u.origin);
  if (u.pathname === "/api/admin/report" && req.method === "GET") return readReport(u);
  return json({ error: "Not found." }, 404);
};

async function startScans(req, origin) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "Send JSON like {\"urls\":[\"example.com\"]}." }, 400); }
  const list = Array.isArray(body.urls) ? body.urls.slice(0, 5) : [];
  if (!list.length) return json({ error: "Send up to 5 addresses in urls." }, 400);
  const full = body.full === true;
  const scans = [];
  for (const raw of list) {
    try {
      const url = normalizeUrl(raw);
      await assertPublicHost(url.hostname);
      const id = crypto.randomUUID();
      const rec = { state: "queued", url: url.href, site: siteKey(url.hostname), owner: null, free: !full, tier: full ? "paid" : "free", day: null, brand: null, kind: "outreach", createdAt: new Date().toISOString() };
      await reports().setJSON(id, rec);
      const r = await fetch(`${origin}/api/check-bg?id=${id}&url=${encodeURIComponent(url.href)}`, { headers: { "x-hs-key": await appSecret() }, signal: AbortSignal.timeout(10000) });
      if (r.status !== 202 && !r.ok) { await reports().setJSON(id, { ...rec, state: "error", error: "Couldn't start the check." }); scans.push({ url: url.href, error: "Couldn't start the check." }); continue; }
      scans.push({ url: url.href, id, reportUrl: `${origin}/r/${id}` });
    } catch (e) {
      scans.push({ url: String(raw), error: String((e && e.message) || e).slice(0, 160) });
    }
  }
  return json({ scans });
}

async function readReport(u) {
  const id = (u.searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing id." }, 400);
  const r = await reports().get(id, { type: "json" });
  if (!r) return json({ state: "missing" }, 404);
  const base = { id, state: r.state, url: r.url, site: r.site, reportUrl: `${u.origin}/r/${id}`, error: r.error || null, detail: r.detail || null, stages: r.stages || [] };
  if (r.state !== "done" || !r.scan) return json(base);
  const rep = buildReport(r.scan);
  const R = r.scan.render || {};
  return json({
    ...base, score: rep.score, grade: rep.grade.label, platform: rep.platform, pagesChecked: rep.pagesChecked, linksChecked: rep.linksChecked,
    homepage: { title: (R.audit && R.audit.title) || "", description: (R.audit && R.audit.desc) || "", https: !!R.https },
    passed: rep.passed,
    findings: rep.findings.map((f) => ({ rule: f.rule, category: f.cat, severity: f.severity, weight: f.w, title: f.title, why: f.why, cost: f.cost, fix: f.fix, count: (f.items || []).length, examples: (f.items || []).slice(0, 3).map((i) => ({ evidence: String(i.evidence || "").slice(0, 160), page: i.page || null })) }))
  });
}

export const config = { path: ["/api/admin/scan", "/api/admin/report"] };
