// Stripe sends the buyer here after paying. The session is read back from
// Stripe and only a completed, paid session unlocks anything (once).
import { getUser, saveUser, newUser } from "../lib/store.mjs";
import { stripe } from "../lib/stripe.mjs";
import { track, isOwner } from "../lib/events.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const sid = (u.searchParams.get("sid") || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 200);
  const ret = (u.searchParams.get("back") || "").match(/^\/r\/[a-f0-9-]{20,40}$/i);
  const back = (q) => Response.redirect(u.origin + (ret && /success/.test(q) ? ret[0] : "/account") + q, 302);
  if (!sid) return back("?checkout=error");
  let s;
  try { s = await stripe("GET", "/checkout/sessions/" + sid); } catch { return back("?checkout=error"); }
  const md = s.metadata || {};
  if (md.app !== "hindsited" || s.status !== "complete" || !["paid", "no_payment_required"].includes(s.payment_status)) return back("?checkout=pending");
  const email = (md.email || s.client_reference_id || "").toLowerCase();
  if (!email) return back("?checkout=error");
  const user = (await getUser(email)) || newUser(email);
  user.payments = user.payments || [];
  if (!user.payments.includes(sid)) {
    user.payments.push(sid);
    if (s.mode === "subscription" && s.subscription) {
      user.subs = (user.subs || []).filter((x) => x.id !== s.subscription);
      user.subs.push({ id: s.subscription, plan: md.plan, qty: 1, status: "active", checkedAt: new Date().toISOString(), since: new Date().toISOString() });
    } else {
      user.lifetime = user.lifetime || [];
      user.lifetime.push({ plan: md.plan, session: sid, at: new Date().toISOString() });
    }
    if (s.customer && !user.customer) user.customer = s.customer;
    await saveUser(user);
    if (!isOwner(email)) await track("paid", { tag: (md.plan || "plan") + "-" + (s.mode === "subscription" ? "month" : "once") });
  }
  return back("?checkout=success&plan=" + encodeURIComponent(md.plan || ""));
};

export const config = { path: "/api/checkout/done", method: "GET" };
