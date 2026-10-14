// Minimal Stripe REST client (no SDK). Payments are confirmed by reading the
// Checkout Session and Subscription straight from Stripe, so no webhook secret
// is needed and nothing can be faked from the browser.
export const PRICE_KEYS = {
  "solo:month": "hindsited_solo_month",
  "solo:once": "hindsited_solo_once",
  "agency:month": "hindsited_agency_month",
  "agency:once": "hindsited_agency_once",
  "extra:month": "hindsited_extra_business_month"
};
export const PORTAL_CONFIG = "bpc_1UQCDmQ0BdZodLRjFQ2NIGEP";

function form(obj, prefix = "", out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") form(v, key, out);
    else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v)));
  }
  return out.join("&");
}
export async function stripe(method, path, params) {
  const key = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("stripe-not-configured");
  let url = (process.env.HS_STRIPE_BASE || "https://api.stripe.com/v1") + path;
  const init = { method, headers: { authorization: "Bearer " + key }, signal: AbortSignal.timeout(15000) };
  if (params && method === "GET") url += "?" + form(params);
  else if (params) { init.body = form(params); init.headers["content-type"] = "application/x-www-form-urlencoded"; }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error("stripe " + res.status + ": " + (data.error && data.error.message));
  return data;
}

const priceCache = new Map();
export async function priceId(plan, interval) {
  const lk = PRICE_KEYS[plan + ":" + interval];
  if (!lk) throw new Error("unknown-price");
  if (priceCache.has(lk)) return priceCache.get(lk);
  const list = await stripe("GET", "/prices", { "lookup_keys[0]": lk, active: "true" });
  if (!list.data.length) throw new Error("price-missing " + lk);
  priceCache.set(lk, list.data[0].id);
  return list.data[0].id;
}

// Re-check a monthly subscription at most every 6 hours; lifetime never lapses.
const ACTIVE = new Set(["active", "trialing", "past_due"]);
export async function refreshSubscriptions(user) {
  let changed = false;
  for (const s of user.subs || []) {
    if (s.ended) continue;
    if (s.checkedAt && s.periodEnd !== undefined && Date.now() - Date.parse(s.checkedAt) < 6 * 3600 * 1000) continue;
    try {
      const sub = await stripe("GET", "/subscriptions/" + s.id);
      s.status = sub.status; s.checkedAt = new Date().toISOString();
      const end = sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end);
      s.periodEnd = end ? new Date(end * 1000).toISOString() : s.periodEnd || null;
      s.cancelling = !!(sub.cancel_at_period_end || sub.cancel_at);
      if (!ACTIVE.has(sub.status)) s.ended = true;
      changed = true;
    } catch { /* keep last known state if Stripe can't be reached */ }
  }
  return changed;
}
