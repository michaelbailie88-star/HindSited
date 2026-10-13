// Google PageSpeed Insights (Lighthouse) - real speed, mobile-friendliness
// and SEO basics, trimmed to what the report uses.
const KEEP = ["largest-contentful-paint", "cumulative-layout-shift", "total-blocking-time", "first-contentful-paint", "speed-index",
  "uses-responsive-images", "modern-image-formats", "uses-optimized-images", "offscreen-images", "render-blocking-resources",
  "unused-javascript", "total-byte-weight", "server-response-time", "font-size", "tap-targets", "viewport", "is-crawlable",
  "color-contrast", "link-text", "document-title", "meta-description", "http-status-code", "is-on-https", "redirects", "uses-text-compression"];

export async function pageSpeed(url, strategy, key) {
  const qs = new URLSearchParams({ url, strategy });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) qs.append("category", c);
  if (key) qs.set("key", key);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 100000);
  let res;
  try { res = await fetch("https://www.googleapis.com/pagespeedonline/v5/runPagespeed?" + qs, { signal: ctrl.signal }); }
  catch { return { error: "timeout" }; }
  finally { clearTimeout(t); }
  if (res.status === 429) return { error: "quota" };
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.lighthouseResult) return { error: data?.error?.message ? "lighthouse" : "failed", detail: String(data?.error?.message || res.status).slice(0, 200) };
  const lr = data.lighthouseResult;
  const cats = {};
  for (const [k, v] of Object.entries(lr.categories || {})) cats[k] = v.score == null ? null : Math.round(v.score * 100);
  const audits = {};
  for (const id of KEEP) {
    const a = lr.audits?.[id];
    if (!a) continue;
    audits[id] = {
      score: a.score, value: a.numericValue ?? null, display: a.displayValue || "",
      savingsMs: a.metricSavings?.LCP ?? a.details?.overallSavingsMs ?? null,
      savingsBytes: a.details?.overallSavingsBytes ?? null,
      items: (a.details?.items || []).slice(0, 4).map((it) => ({ url: it.url || it.node?.snippet || it.source?.url || "", bytes: it.wastedBytes ?? it.totalBytes ?? null, label: it.node?.nodeLabel || "" }))
    };
  }
  const field = data.loadingExperience?.overall_category || null;
  return { strategy, scores: cats, audits, field, fetched: lr.fetchTime, finalUrl: lr.finalDisplayedUrl || lr.finalUrl };
}
