// End-to-end engine test against local fixture sites with planted problems.
// Usage: HS_ALLOW_LOCAL=1 HS_LOCAL_CHROME=/path/to/chrome node test/run.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "../netlify/lib/browser.mjs";
import { fullScan } from "../netlify/lib/pipeline.mjs";
import { buildReport } from "../public/rules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".txt": "text/plain", ".xml": "application/xml", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg", ".webm": "video/webm", ".mp4": "video/mp4" };

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
  const out = await fullScan(browser, url, {});
  if (out.error) throw new Error("render failed");
  // the sandbox has no outside internet: ignore external link results
  out.scan.links = out.scan.links.filter((l) => l.internal);
  return { scan: out.scan, report: buildReport(out.scan) };
}

const EXPECT = {
  bad: {
    must: ["no_cta_fold", "no_tap_to_call", "lorem", "template_text", "placeholder_contact", "code_error", "zero_price", "old_copyright", "stale_promo", "markup_leftover", "gibberish", "empty_section", "screenshot_images", "free_email", "copy_slug", "dead_links", "broken_images", "dead_buttons", "mislabeled_link", "social_placeholder", "no_privacy", "noindex_broken", "robots_block", "weak_title", "no_meta_desc", "no_h1", "missing_alt", "mobile_overflow"],
    mustNot: ["noindex", "no_viewport", "no_contact_path"]
  },
  clean: { must: [], mustNot: "*", allow: ["no_https"] },
  bad2: { must: ["bad_tel_link", "bad_mailto", "noindex", "dead_links", "no_reviews_home", "old_copyright"], mustNot: ["no_tap_to_call", "no_cta_fold", "weak_title"], deadOnly: ["/shop", "/reviews"] }
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
    if (e.deadOnly) {
      const dl = report.findings.find((f) => f.rule === "dead_links");
      const bad = (dl ? dl.items : []).filter((i) => !e.deadOnly.some((p) => i.evidence.includes(p + " ")));
      if (bad.length) { fail++; console.log("  WRONG DEAD LINKS:", bad.map((i) => i.evidence).join(" | ")); }
    }
    for (const f of report.findings) console.log(`  - [${f.rule}] ${f.items.slice(0, 2).map((i) => i.evidence).join(" | ")}`);
  }
  await browser.close();
  servers.forEach((s) => s.close());
  console.log(fail ? `\nFAILED (${fail})` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
}
