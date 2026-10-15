// Never-expiring payment links for new-website builds. Each visit creates a
// fresh Stripe Checkout (or card-update page) and sends the customer there.
//   /pay/:id/deposit  50% deposit
//   /pay/:id/launch   final 50% + first month of hosting; card saved for $25 CAD/month
//   /pay/:id/card     update the hosting card / see invoices
import { stripe } from "../lib/stripe.mjs";
import { builds, token, refresh, depositOf, balanceOf, hostingPriceId, HOSTING_PORTAL } from "../lib/builds.mjs";

const go = (url) => new Response(null, { status: 303, headers: { location: url, "cache-control": "no-store" } });

export default async (req) => {
  const u = new URL(req.url);
  const m = u.pathname.match(/^\/pay\/([a-f0-9-]{20,40})\/(deposit|launch|card)\/?$/i);
  const done = (q) => go(u.origin + "/paid?" + q);
  if (!m) return done("k=bad");
  const [, id, kind] = m;
  if (u.searchParams.get("t") !== (await token(id, kind))) return done("k=bad");
  const store = builds();
  const b = await store.get(id, { type: "json" });
  if (!b) return done("k=bad");
  try { await refresh(b); } catch {}
  const name = b.business || b.name || "your business";
  try {
    if (kind === "card") {
      if (!b.launch.paid || !b.customer) return done("k=nohosting");
      const p = await stripe("POST", "/billing_portal/sessions", { customer: b.customer, configuration: HOSTING_PORTAL, return_url: u.origin + "/paid?k=card" });
      return go(p.url);
    }
    if (b[kind].paid) return done("k=" + kind + "&already=1");
    if (kind === "launch" && !b.deposit.paid) return done("k=needdeposit");
    const common = { customer: b.customer, success_url: `${u.origin}/api/pay/done?sid={CHECKOUT_SESSION_ID}`, cancel_url: `${u.origin}/paid?k=cancelled`, "metadata[app]": "tlcc-build", "metadata[build]": b.id, "metadata[kind]": kind };
    const s = kind === "deposit"
      ? await stripe("POST", "/checkout/sessions", { ...common, mode: "payment",
          "line_items[0][price_data][currency]": "cad", "line_items[0][price_data][unit_amount]": depositOf(b), "line_items[0][price_data][product_data][name]": `New website: 50% deposit (${name})`, "line_items[0][quantity]": 1,
          "payment_intent_data[metadata][app]": "tlcc-build", "payment_intent_data[metadata][build]": b.id, "payment_intent_data[description]": `New website deposit: ${name}` })
      : await stripe("POST", "/checkout/sessions", { ...common, mode: "subscription", "payment_method_types[0]": "card",
          "line_items[0][price]": await hostingPriceId(), "line_items[0][quantity]": 1,
          "line_items[1][price_data][currency]": "cad", "line_items[1][price_data][unit_amount]": balanceOf(b), "line_items[1][price_data][product_data][name]": `New website: final 50% (${name})`, "line_items[1][quantity]": 1,
          "subscription_data[metadata][app]": "tlcc-hosting", "subscription_data[metadata][build]": b.id, "subscription_data[description]": `Website hosting and updates: ${b.site || name}` });
    b[kind].sessions = [...b[kind].sessions, s.id].slice(-10);
    await store.setJSON(b.id, b);
    return go(s.url);
  } catch (e) {
    console.error("pay-failed", kind, String(e && e.message).slice(0, 300));
    return done("k=error");
  }
};

export const config = { path: "/pay/*", method: "GET" };
