// /s/<id>: the link people share. Social sites read the preview (score card
// image, title) from here; people are sent straight on to the report.
import { reports } from "../lib/store.mjs";
import { cardable, cardInfo } from "../lib/card.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async (req) => {
  const u = new URL(req.url);
  const id = ((u.pathname.match(/^\/s\/([a-f0-9-]{20,40})\/?$/i) || [])[1] || "").toLowerCase();
  const r = id ? await reports().get(id, { type: "json" }) : null;
  if (!cardable(r)) return Response.redirect(u.origin + "/", 302);
  const i = cardInfo(r);
  const title = `${i.host} scored ${i.score}/100 on HindSited`;
  const desc = `${i.grade}. HindSited checks a website the way customers see it on a phone and shows what's costing them customers. Check yours free.`;
  const page = `${u.origin}/s/${id}`, report = `/r/${id}`, img = `${u.origin}/api/card?id=${id}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="HindSited"><meta property="og:url" content="${esc(page)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="${esc(u.origin + report)}"><meta http-equiv="refresh" content="0; url=${esc(report)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"></head>
<body style="font-family:system-ui,sans-serif;padding:24px"><p><a href="${esc(report)}">See the report for ${esc(i.host)}</a></p><script>location.replace(${JSON.stringify(report)})</script></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300", "x-frame-options": "DENY" } });
};

export const config = { path: "/s/*", method: "GET" };
