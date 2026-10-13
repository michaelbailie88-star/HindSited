// Opens Stripe's customer portal to update cards, see invoices or cancel.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser } from "../lib/store.mjs";
import { stripe, PORTAL_CONFIG } from "../lib/stripe.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ error: "Please sign in first." }, 401);
  const user = await getUser(email);
  if (!user || !user.customer) return json({ error: "There's no billing on this account yet." }, 400);
  try {
    const p = await stripe("POST", "/billing_portal/sessions", { customer: user.customer, configuration: PORTAL_CONFIG, return_url: new URL(req.url).origin + "/account" });
    return json({ url: p.url });
  } catch { return json({ error: "Billing couldn't open. Try again in a minute." }, 502); }
};

export const config = { path: "/api/billing", method: "POST" };
