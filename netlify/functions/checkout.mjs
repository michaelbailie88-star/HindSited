// Starts Stripe Checkout for a plan. Must be signed in, so the purchase is
// tied to the account that will use it.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser } from "../lib/store.mjs";
import { stripe, priceId } from "../lib/stripe.mjs";
import { effectivePlan } from "../lib/entitle.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ error: "Please sign in first.", needSignIn: true }, 401);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const plan = ["solo", "agency", "extra"].includes(body.plan) ? body.plan : null;
  const interval = body.interval === "once" ? "once" : "month";
  if (!plan || (plan === "extra" && interval !== "month")) return json({ error: "Unknown plan." }, 400);
  const user = (await getUser(email)) || newUser(email);
  const cur = effectivePlan(user, email).plan;
  if (plan === "extra" && cur !== "agency") return json({ error: "Extra businesses are for Agency plans." }, 400);
  const origin = new URL(req.url).origin;
  // where to return after paying (e.g. the report they're unlocking)
  const back = typeof body.back === "string" && /^\/r\/[a-f0-9-]{20,40}$/i.test(body.back) ? body.back : "";
  try {
    if (!user.customer) {
      const c = await stripe("POST", "/customers", { email, metadata: { app: "hindsited" } });
      user.customer = c.id;
      await saveUser(user);
    }
    const session = await stripe("POST", "/checkout/sessions", {
      mode: interval === "once" ? "payment" : "subscription",
      customer: user.customer,
      client_reference_id: email,
      "line_items[0][price]": await priceId(plan, interval),
      "line_items[0][quantity]": 1,
      allow_promotion_codes: "true",
      success_url: `${origin}/api/checkout/done?sid={CHECKOUT_SESSION_ID}${back ? "&back=" + encodeURIComponent(back) : ""}`,
      cancel_url: back ? `${origin}${back}?checkout=cancelled` : `${origin}/account?checkout=cancelled`,
      metadata: { app: "hindsited", email, plan, interval },
      ...(interval === "month" ? { "subscription_data[metadata][app]": "hindsited", "subscription_data[metadata][plan]": plan, "subscription_data[metadata][email]": email } : { "payment_intent_data[metadata][app]": "hindsited", "payment_intent_data[metadata][plan]": plan })
    });
    return json({ url: session.url });
  } catch (e) {
    return json({ error: /not-configured/.test(e.message) ? "Payments aren't switched on yet." : "Checkout couldn't start. Try again in a minute." }, 502);
  }
};

export const config = { path: "/api/checkout", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] } };
