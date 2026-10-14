// Local dev server: serves public/ and routes /api/* to the real Netlify
// functions, with in-memory Blobs and a captured outbox instead of email.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.HS_LOCAL_BLOBS = "1";
process.env.HS_LOCAL_MAIL = "1";
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const load = async (f) => (await import("../netlify/functions/" + f + ".mjs"));
const mods = {};
for (const f of ["auth", "account", "request", "reviews", "me", "scan", "report", "check-bg", "checkout", "checkout-done", "billing", "brand", "kit", "kit-message", "calc", "calc-lead", "calc-leads"]) mods[f] = await load(f);
const routes = {};
for (const m of Object.values(mods)) { const p = m.config.path; (Array.isArray(p) ? p : [p]).forEach((x) => (routes[x] = m)); }
export const { outbox } = await import("../netlify/lib/mail.mjs");
const pub = path.join(here, "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".png": "image/png" };
export function startDev(port = 8100) {
  return new Promise((res) => {
    const s = http.createServer(async (req, rsp) => {
      const p = req.url.split("?")[0];
      const mod = routes[p];
      if (mod) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const headers = { ...req.headers };
        const request = new Request("http://127.0.0.1:" + port + req.url, { method: req.method, headers, body: ["POST", "PUT"].includes(req.method) ? Buffer.concat(chunks) : undefined, redirect: "manual" });
        if (mod.config.background) { rsp.writeHead(202); rsp.end(); mod.default(request, {}).catch((e) => console.error("bg", e)); return; }
        const r = await mod.default(request, { ip: req.headers["x-test-ip"] || req.socket.remoteAddress });
        const h = {}; r.headers.forEach((v, k) => (h[k] = v));
        rsp.writeHead(r.status, h); rsp.end(Buffer.from(await r.arrayBuffer())); return;
      }
      let f = path.join(pub, p === "/" ? "index.html" : p);
      if (/^\/(r\/|account|reset)/.test(p)) f = path.join(pub, "index.html");
      if (["/privacy", "/terms", "/cancel"].includes(p)) f = path.join(pub, p.slice(1) + ".html");
      if (p === "/reviews") f = path.join(pub, "booster.html");
      if (p.startsWith("/review/")) f = path.join(pub, "review.html");
      if (p === "/quotes") f = path.join(pub, "quotes.html");
      if (p.startsWith("/q/")) f = path.join(pub, "quote.html");
      if (!f.startsWith(pub) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end("nf"); }
      rsp.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(rsp);
    }).listen(port, "127.0.0.1", () => res(s));
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await startDev(); console.log("dev on http://127.0.0.1:8100"); }
