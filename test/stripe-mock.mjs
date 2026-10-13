// A tiny stand-in for the parts of the Stripe API HindSited uses.
import http from "node:http";
export const state = { sessions: {}, subs: {}, customers: 0 };
const PRICES = { hindsited_solo_month: "price_solo_m", hindsited_solo_once: "price_solo_o", hindsited_agency_month: "price_ag_m", hindsited_agency_once: "price_ag_o", hindsited_extra_business_month: "price_extra_m" };
function parse(body) { const o = {}; for (const [k, v] of new URLSearchParams(body)) o[k] = v; return o; }
export function startStripeMock(port = 8199) {
  return new Promise((res) => {
    const s = http.createServer(async (req, rsp) => {
      const chunks = []; for await (const c of req) chunks.push(c);
      const u = new URL(req.url, "http://x"); const p = u.pathname; const b = parse(Buffer.concat(chunks).toString());
      const send = (o, st = 200) => { rsp.writeHead(st, { "content-type": "application/json" }); rsp.end(JSON.stringify(o)); };
      if (req.headers.authorization !== "Bearer sk_test_mock") return send({ error: { message: "bad key" } }, 401);
      if (p === "/v1/customers" && req.method === "POST") return send({ id: "cus_" + ++state.customers });
      if (p === "/v1/prices") { const lk = u.searchParams.get("lookup_keys[0]"); return send({ data: PRICES[lk] ? [{ id: PRICES[lk] }] : [] }); }
      if (p === "/v1/checkout/sessions" && req.method === "POST") {
        const id = "cs_test_" + Object.keys(state.sessions).length + "x";
        const md = {}; for (const k in b) { const m = k.match(/^metadata\[(\w+)\]$/); if (m) md[m[1]] = b[k]; }
        state.sessions[id] = { id, mode: b.mode, customer: b.customer, client_reference_id: b.client_reference_id, metadata: md, status: "open", payment_status: "unpaid", success_url: b.success_url.replace("{CHECKOUT_SESSION_ID}", id), cancel_url: b.cancel_url, price: b["line_items[0][price]"] };
        return send({ id, url: `http://127.0.0.1:${port}/pay/${id}` });
      }
      let m;
      if ((m = p.match(/^\/v1\/checkout\/sessions\/(\w+)$/))) { const x = state.sessions[m[1]]; return x ? send(x) : send({ error: { message: "no such session" } }, 404); }
      if ((m = p.match(/^\/v1\/subscriptions\/(\w+)$/))) { const x = state.subs[m[1]]; return x ? send(x) : send({ error: { message: "no such sub" } }, 404); }
      if (p === "/v1/billing_portal/sessions") return send({ url: `http://127.0.0.1:${port}/portal/${b.customer}` });
      return send({ error: { message: "unhandled " + p } }, 404);
    });
    // fake hosted pages (no auth): paying completes the session
    const outer = http.createServer((req, rsp) => {
      let m;
      if ((m = req.url.match(/^\/pay\/(\w+)/))) {
        const x = state.sessions[m[1]];
        x.status = "complete"; x.payment_status = "paid";
        if (x.mode === "subscription") { const sid = "sub_" + m[1]; x.subscription = sid; state.subs[sid] = { id: sid, status: "active" }; }
        rsp.writeHead(302, { location: x.success_url }); return rsp.end();
      }
      if (req.url.startsWith("/portal/")) { rsp.writeHead(200, { "content-type": "text/html" }); return rsp.end("<h1>Mock billing portal</h1>"); }
      s.emit("request", req, rsp);
    });
    outer.listen(port, "127.0.0.1", () => res(outer));
  });
}
