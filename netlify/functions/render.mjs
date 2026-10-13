import { launchBrowser } from "../lib/browser.mjs";
import { renderAudit } from "../lib/render.mjs";
import { normalizeUrl, assertPublicHost, json } from "../lib/guard.mjs";

export default async (req) => {
  if (req.method !== "POST" && req.method !== "GET") return json({ error: "Use POST." }, 405);
  const isGet = req.method === "GET";
  let url;
  try {
    const body = isGet ? { url: new URL(req.url).searchParams.get("url") } : await req.json();
    url = normalizeUrl(body.url);
    await assertPublicHost(url.hostname);
  } catch (e) {
    const msg = e.message === "blocked-host" ? "That address isn't a public website." : /ENOTFOUND|EAI_AGAIN/.test(e.code || e.message) ? "We couldn't find that website. Check the spelling." : e.message;
    return json({ error: msg }, 400);
  }
  let browser;
  try {
    browser = await launchBrowser();
    const out = await renderAudit(browser, url.href, { budgetMs: 52000 });
    if (!out.ok) return json({ error: out.status ? `The site answered with error ${out.status}, so there was nothing to check.` : "The site didn't load.", status: out.status }, 422);
    if (isGet) {
      // compact summary (no screenshots) for quick checks and monitoring
      const a = out.audit;
      return json({ finalUrl: out.finalUrl, status: out.status, ms: out.ms, title: a.title, desc: a.desc, h1: a.h1, platform: a.signals.platform,
        findings: a.findings.map((f) => ({ rule: f.rule, evidence: f.evidence })), deadButtons: out.deadLinks.map((d) => d.text),
        robotsMetas: a.robotsMetas, signals: a.signals, mobileFoldCtas: out.mobileFold.count, desktopFoldCtas: out.desktopFold ? out.desktopFold.count : null,
        net404: out.net404, links: a.links.length, notes: out.notes });
    }
    return json(out);
  } catch (e) {
    const m = String(e && e.message || e);
    const friendly = /ERR_NAME_NOT_RESOLVED/.test(m) ? "We couldn't find that website. Check the spelling."
      : /ERR_CONNECTION|ERR_TIMED_OUT|ERR_SSL|ERR_CERT/.test(m) ? "The website wouldn't connect. It may be down or have a security certificate problem."
      : "Something went wrong loading the site. Try again in a minute.";
    return json({ error: friendly, detail: m.slice(0, 200) }, 502);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

export const config = {
  path: "/api/render",
  method: ["POST", "GET"],
  rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
