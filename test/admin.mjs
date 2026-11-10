// Admin scan endpoint: locked without the key, scans past the free limit, full report out.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./run.mjs";
process.env.HS_ALLOW_LOCAL = "1";
process.env.HS_ADMIN_KEY = "test-admin-key-0123456789abcdef";
const { startDev } = await import("./dev.mjs");
const here = path.dirname(fileURLToPath(import.meta.url));
const fx = await serve(path.join(here, "fixtures", "bad"), 8111);
const dev = await startDev(8110);
const BASE = "http://127.0.0.1:8110";
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const H = { "content-type": "application/json", "x-hs-admin": process.env.HS_ADMIN_KEY };
let r = await fetch(BASE + "/api/admin/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ urls: ["127.0.0.1:8111"] }) });
ok(r.status === 404, "no key: 404");
r = await fetch(BASE + "/api/admin/scan", { method: "POST", headers: { ...H, "x-hs-admin": "wrong" }, body: "{}" });
ok(r.status === 404, "wrong key: 404");
r = await fetch(BASE + "/api/admin/report?id=abc", { headers: { "x-hs-admin": "wrong" } });
ok(r.status === 404, "wrong key on report: 404");
// two scans of the same site: the free limit must not apply
const ids = [];
for (let i = 0; i < 2; i++) {
  r = await fetch(BASE + "/api/admin/scan", { method: "POST", headers: H, body: JSON.stringify({ urls: ["127.0.0.1:8111", "not a url"] }) });
  const j = await r.json();
  ok(r.status === 200 && j.scans[0].id && j.scans[1].error, "scan " + (i + 1) + " started, bad url reported");
  ids.push(j.scans[0].id);
}
let rep;
for (let t = 0; t < 120; t++) {
  rep = await (await fetch(BASE + "/api/admin/report?id=" + ids[0], { headers: H })).json();
  if (rep.state === "done" || rep.state === "error") break;
  await new Promise((s) => setTimeout(s, 1000));
}
ok(rep.state === "done", "scan finished: " + rep.state + (rep.error ? " " + rep.error : ""));
ok(rep.findings && rep.findings.length > 5 && rep.findings[0].examples, "full findings with evidence: " + (rep.findings || []).length);
ok(typeof rep.score === "number" && rep.homepage, "score and homepage info");
const pub = await (await fetch(BASE + "/api/report?id=" + ids[0])).json();
ok(pub.locked === true, "public link shows the locked free view");
r = await fetch(BASE + "/api/admin/scan", { method: "POST", headers: H, body: JSON.stringify({ urls: ["127.0.0.1:8111"], full: true }) });
const fj = (await r.json()).scans[0];
let fp;
for (let t = 0; t < 120; t++) { fp = await (await fetch(BASE + "/api/report?id=" + fj.id)).json(); if (fp.state === "done" || fp.state === "error") break; await new Promise((s) => setTimeout(s, 1000)); }
ok(fp.state === "done" && fp.locked === false && fp.scan, "full:true link shows every finding to anyone");
dev.close(); fx.close();
console.log(fail ? "FAILED" : "ALL PASSED"); process.exit(fail ? 1 : 0);
