// End-to-end engine test against local fixture sites with planted problems.
// Usage: HS_ALLOW_LOCAL=1 HS_LOCAL_CHROME=/path/to/chrome node test/run.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "../netlify/lib/browser.mjs";
import { renderAudit } from "../netlify/lib/render.mjs";
import { checkPage, checkSite } from "../netlify/lib/crawl.mjs";
import { checkLinks } from "../netlify/lib/links.mjs";
import { buildReport } from "../public/rules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml" };

export function serve(dir, port) {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404, { "content-type": "text/html" }); return rsp.end("<h1>Not found</h1>"); }
      rsp.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
      if (req.method === "HEAD") return rsp.end();
      fs.createReadStream(f).pipe(rsp);
    }).listen(port, "127.0.0.1", () => res(s));
  });
}

export async function scanLocal(browser, url) {
  const [render, desk] = await Promise.all([renderAudit(browser, url, { budgetMs: 60000 }), renderAudit(browser, url, { budgetMs: 60000, mode: "desktop" })]);
  if (!render.ok) throw new Error("render failed " + render.status);
  render.desktopFold = desk.desktopFold; render.shots.desktop = desk.shot;
  const home = new URL(render.finalUrl);
  const cand = render.audit.links.filter((l) => l.internal && l.url.replace(/\/$/, "") !== home.href.replace(/\/$/, "")).map((l) => l.url).slice(0, 24);
  const pages = await Promise.all(cand.map((u) => checkPage(u)));
  const site = await checkSite(home.origin);
  const items = new Map();
  for (const l of render.audit.links) if (!cand.includes(l.url) && l.url.replace(/\/$/, "") !== home.href.replace(/\/$/, "")) items.set(l.url, { url: l.url, internal: l.internal, text: l.text, from: render.finalUrl, kind: "page" });
  for (const p of pages) { for (const l of p.links) if (!items.has(l.url) && !cand.includes(l.url) && l.url.replace(/\/$/, "") !== home.href.replace(/\/$/, "")) items.set(l.url, { url: l.url, internal: l.internal, text: l.text, from: p.url, kind: "page" }); for (const im of p.images) if (!items.has(im)) items.set(im, { url: im, internal: true, from: p.url, kind: "image" }); }
  const list = [...items.values()].filter((x) => x.internal); // sandbox has no outside internet
  const res = await checkLinks(list);
  const links = list.map((x, i) => ({ ...x, ...res[i] }));
  for (const p of pages) if (p.status === 404 || p.status >= 500) links.push({ url: p.url, broken: true, reason: String(p.status), kind: "page", internal: true, from: render.finalUrl });
  const scan = { render, pages, site, links, linksChecked: true, speed: {} };
  return { scan, report: buildReport(scan) };
}

const EXPECT = {
  bad: {
    must: ["no_cta_fold", "no_tap_to_call", "lorem", "template_text", "placeholder_contact", "code_error", "zero_price", "old_copyright", "stale_promo", "markup_leftover", "gibberish", "empty_section", "screenshot_images", "free_email", "copy_slug", "dead_links", "broken_images", "dead_buttons", "mislabeled_link", "social_placeholder", "no_privacy", "noindex_broken", "robots_block", "weak_title", "no_meta_desc", "no_h1", "missing_alt", "mobile_overflow"],
    mustNot: ["noindex", "no_viewport", "no_contact_path"]
  },
  clean: { must: [], mustNot: "*", allow: ["no_https"] },
  bad2: { must: ["bad_tel_link", "bad_mailto", "noindex", "dead_links"], mustNot: ["no_tap_to_call", "no_cta_fold", "no_reviews_home", "weak_title"] }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.env.HS_ALLOW_LOCAL = "1";
  const ports = { bad: 8101, clean: 8102, bad2: 8103 };
  const servers = await Promise.all(Object.entries(ports).map(([d, p]) => serve(path.join(here, "fixtures", d), p)));
  const browser = await launchBrowser();
  let fail = 0;
  fs.mkdirSync(path.join(here, "out"), { recursive: true });
  for (const [name, port] of Object.entries(ports)) {
    const t = Date.now();
    const { scan, report } = await scanLocal(browser, `http://127.0.0.1:${port}/`);
    fs.writeFileSync(path.join(here, "out", name + ".json"), JSON.stringify({ scan, report }, null, 1));
    const got = new Set(report.findings.map((f) => f.rule));
    const e = EXPECT[name];
    const missing = e.must.filter((r) => !got.has(r));
    const unexpected = e.mustNot === "*" ? [...got].filter((r) => !(e.allow || []).includes(r)) : e.mustNot.filter((r) => got.has(r));
    const extra = e.mustNot === "*" ? [] : [...got].filter((r) => !e.must.includes(r));
    console.log(`\n== ${name} (${Date.now() - t}ms) score ${report.score} :: ${[...got].join(", ")}`);
    if (missing.length) { fail++; console.log("  MISSING:", missing.join(", ")); }
    if (unexpected.length) { fail++; console.log("  UNEXPECTED:", unexpected.join(", ")); }
    if (extra.length) console.log("  (also found, not in expect list):", extra.join(", "));
    for (const f of report.findings) console.log(`  - [${f.rule}] ${f.items.slice(0, 2).map((i) => i.evidence).join(" | ")}`);
  }
  await browser.close();
  servers.forEach((s) => s.close());
  console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
}
