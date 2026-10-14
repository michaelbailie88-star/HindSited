// A report by its private id: progress while running, results when done.
// Anyone with the link can view it (share links), never who ran it.
// Free reports show the less serious 60% of findings; the most serious 40%
// are withheld here on the server (not just blurred) until the viewer has a
// paid plan. Paid reports are always shown in full.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports, getUser, saveUser } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { buildReport } from "../../public/rules.js";
import { lockCount } from "../lib/lock.mjs";

const SPEED_RULES = new Set(["slow_mobile", "slow_desktop", "layout_shift", "heavy_images", "small_text"]);

export default async (req) => {
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing report id." }, 400);
  const r = await reports().get(id, { type: "json" });
  if (!r) return json({ state: "missing" }, 404);
  const me = await sessionEmail(req);
  const { owner, day, scan, ...pub } = r;
  const mine = !!me && me === owner;
  const free = r.tier ? r.tier === "free" : !!r.free;
  if (r.state !== "done" || !scan) return json({ ...pub, mine, free });

  let full = !free, viewerPaid = false;
  if (me) {
    const u = await getUser(me);
    viewerPaid = effectivePlan(u, me).plan !== "free";
    if (free && viewerPaid) {
      full = true;
      // a paying viewer opening an unowned free report (their own free scan from
      // before they signed up) gets it added to their account
      if (!owner && u) {
        const rep = buildReport(scan);
        r.owner = me;
        await reports().setJSON(id, r);
        u.reports = [{ id, url: r.url, site: r.site, at: r.createdAt, score: rep.score, grade: rep.grade.label, issues: rep.findings.length }, ...(u.reports || []).filter((x) => x.id !== id)].slice(0, 100);
        await saveUser(u);
      }
    }
  }
  if (full) return json({ ...pub, scan, mine: mine || (!owner && viewerPaid), free, locked: false });

  // ---- locked view: build the report here and send only the safe part
  const rep = buildReport(scan);
  const n = lockCount(rep.findings.length, rep.findings[0]);
  const hidden = rep.findings.slice(0, n), shown = rep.findings.slice(n);
  const bySeverity = {}, byCat = {};
  for (const f of hidden) { bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1; byCat[f.cat] = (byCat[f.cat] || 0) + 1; }
  const speedHidden = hidden.some((f) => SPEED_RULES.has(f.rule));
  const strip = (f) => ({ rule: f.rule, cat: f.cat, title: f.title, why: f.why, cost: f.cost, fix: f.fix, severity: f.severity, w: f.w, extra: f.extra, items: f.items });
  const R = scan.render || {};
  const lite = {
    render: { finalUrl: R.finalUrl, https: R.https, shots: R.shots, audit: { title: R.audit && R.audit.title, desc: R.audit && R.audit.desc } },
    pages: (scan.pages || []).map((p) => ({ url: p.url, finalUrl: p.finalUrl, status: p.status })),
    speed: speedHidden ? { locked: true } : scan.speed || {}
  };
  return json({
    ...pub, mine, free, locked: true, scan: lite,
    report: { score: rep.score, grade: rep.grade, findings: shown.map(strip), passed: rep.passed, pagesChecked: rep.pagesChecked, linksChecked: rep.linksChecked, platform: rep.platform },
    hidden: { count: n, total: rep.findings.length, bySeverity, byCat }
  });
};

export const config = { path: "/api/report", method: "GET" };
