import { launchBrowser } from "../lib/browser.mjs";
import { renderAudit } from "../lib/render.mjs";
import { normalizeUrl, assertPublicHost, json } from "../lib/guard.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let url;
  try {
    const body = await req.json();
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
  method: "POST",
  rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
