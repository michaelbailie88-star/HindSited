// Local dev server: serves public/ and routes /api/* to the Netlify functions.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const fns = {
  "/api/render": (await import("../netlify/functions/render.mjs")).default,
  "/api/crawl": (await import("../netlify/functions/crawl.mjs")).default,
  "/api/links": (await import("../netlify/functions/links.mjs")).default,
  "/api/speed": (await import("../netlify/functions/speed.mjs")).default
};
const pub = path.join(here, "..", "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain" };
export function startDev(port = 8100) {
  return new Promise((res) => {
    const s = http.createServer(async (req, rsp) => {
      const p = req.url.split("?")[0];
      if (fns[p]) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const r = await fns[p](new Request("http://localhost" + req.url, { method: req.method, headers: req.headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }));
        rsp.writeHead(r.status, Object.fromEntries(r.headers)); rsp.end(Buffer.from(await r.arrayBuffer())); return;
      }
      const f = path.join(pub, p === "/" ? "index.html" : p);
      if (!f.startsWith(pub) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end("nf"); }
      rsp.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(rsp);
    }).listen(port, "127.0.0.1", () => res(s));
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await startDev(); console.log("dev on http://127.0.0.1:8100"); }
