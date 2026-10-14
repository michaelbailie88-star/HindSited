// Domain lookup (RDAP) against a stand-in registry, including the redirect
// rdap.org does to the real registry, timeouts and bad answers.
import http from "node:http";
let fail = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };
const sample = { objectClassName: "domain", ldhName: "EXAMPLE-BIZ.COM",
  events: [{ eventAction: "registration", eventDate: "2015-03-02T18:21:44Z" }, { eventAction: "expiration", eventDate: "2027-03-02T18:21:44Z" }, { eventAction: "last update of RDAP database", eventDate: "2026-10-14T00:00:00Z" }],
  entities: [{ objectClassName: "entity", roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "GoDaddy.com, LLC"], ["url", {}, "uri", "https://www.godaddy.com"]]] }] };
const srv = http.createServer((req, res) => {
  if (req.url === "/domain/example-biz.com") { res.writeHead(302, { location: "/registry/domain/example-biz.com" }); return res.end(); }
  if (req.url === "/registry/domain/example-biz.com") { res.writeHead(200, { "content-type": "application/rdap+json" }); return res.end(JSON.stringify(sample)); }
  if (req.url === "/domain/slow.com") return; // never answers
  if (req.url === "/domain/garbage.com") { res.writeHead(200); return res.end("not json"); }
  res.writeHead(404); res.end("{}");
}).listen(8177, "127.0.0.1");
process.env.HS_RDAP_BASE = "http://127.0.0.1:8177";
const { domainInfo } = await import("../netlify/lib/domain.mjs");
const d = await domainInfo("www.example-biz.com");
ok(d && d.name === "example-biz.com" && d.registrar === "GoDaddy.com, LLC" && d.registrarUrl === "https://www.godaddy.com", "finds the registrar after the registry redirect");
ok(d && d.expires === "2027-03-02T18:21:44.000Z" && d.created === "2015-03-02T18:21:44.000Z", "reads registration and renewal dates");
ok((await domainInfo("unknown.com")) === null, "unknown domain gives nothing, no error");
const t0 = Date.now(); const s = await domainInfo("slow.com", { timeout: 800 });
ok(s === null && Date.now() - t0 < 2000, "a registry that never answers is given up on quickly");
ok((await domainInfo("garbage.com")) === null, "a broken answer gives nothing, no error");
ok((await domainInfo("127.0.0.1")) === null && (await domainInfo("")) === null, "IP addresses and blanks are skipped");
srv.close();
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED"); process.exit(fail ? 1 : 0);
