// New-website builds sold through HindSited: the record, the never-expiring
// payment links, live status from Stripe, and the customer emails.
// Terms: 50% deposit to start, 50% at launch plus $25 CAD/month hosting
// (card saved), 14 days unpaid = site paused, 30 days' notice to leave.
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import { appSecret } from "./store.mjs";
import { stripe } from "./stripe.mjs";
import { layout, esc } from "./emails.mjs";

const mem = new Map();
export const builds = () => {
  if (process.env.HS_LOCAL_BLOBS !== "1") return getStore({ name: "builds", consistency: "strong" });
  return {
    async get(k, o = {}) { return mem.has(k) ? (o.type === "json" ? JSON.parse(mem.get(k)) : mem.get(k)) : null; },
    async setJSON(k, v) { mem.set(k, JSON.stringify(v)); },
    async delete(k) { mem.delete(k); },
    async list() { return { blobs: [...mem.keys()].map((key) => ({ key })) }; }
  };
};

export const HOSTING_MONTHLY = 2500; // cents CAD
export const HOSTING_LOOKUP = "tlcc_hosting_month";
export const HOSTING_PORTAL = "bpc_1UQpDqQ0BdZodLRjLGhnK43r";
export const GRACE_DAYS = 14;
export const NOTICE_DAYS = 30;
export const STUDIO = "thelazycreatorco@gmail.com";
export const KINDS = ["deposit", "launch", "card"];

export const money = (cents) => "$" + (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " CAD";
export const depositOf = (b) => Math.round(b.price / 2);
export const balanceOf = (b) => b.price - depositOf(b);

export async function token(id, kind) {
  return crypto.createHmac("sha256", await appSecret()).update("build:" + id + ":" + kind).digest("hex").slice(0, 24);
}
export async function payLink(origin, b, kind) { return `${origin}/pay/${b.id}/${kind}?t=${await token(b.id, kind)}`; }

let hostingPrice = null;
export async function hostingPriceId() {
  if (hostingPrice) return hostingPrice;
  const list = await stripe("GET", "/prices", { "lookup_keys[0]": HOSTING_LOOKUP, active: "true" });
  if (!list.data.length) throw new Error("price-missing " + HOSTING_LOOKUP);
  return (hostingPrice = list.data[0].id);
}

// Read payment and hosting status straight from Stripe (no webhooks to fake).
export async function refresh(b) {
  for (const kind of ["deposit", "launch"]) {
    const k = b[kind];
    if (k.paid || !k.sessions.length) continue;
    for (const sid of k.sessions.slice(-5)) {
      let s; try { s = await stripe("GET", "/checkout/sessions/" + sid); } catch { continue; }
      if (s.status === "complete" && ["paid", "no_payment_required"].includes(s.payment_status)) { markPaid(b, kind, s); break; }
    }
  }
  if (b.launch.sub) {
    try {
      const sub = await stripe("GET", "/subscriptions/" + b.launch.sub, { "expand[0]": "latest_invoice" });
      const inv = sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null;
      const owing = ["past_due", "unpaid"].includes(sub.status) && inv && inv.status === "open";
      b.hosting = {
        status: sub.status,
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
        daysLate: owing ? Math.floor((Date.now() / 1000 - inv.created) / 86400) : 0,
        owing: owing ? inv.amount_remaining : 0,
        checkedAt: new Date().toISOString()
      };
    } catch { /* keep the last known status */ }
  }
  return b;
}
export function markPaid(b, kind, s) {
  b[kind].paid = true;
  b[kind].paidAt = new Date().toISOString();
  b[kind].session = s.id;
  if (kind === "launch" && s.subscription) b.launch.sub = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
}

export function stage(b) {
  if (b.hosting && b.hosting.status === "canceled") return { key: "ended", label: "Hosting ended" };
  if (b.hosting && b.hosting.cancelAt) return { key: "leaving", label: "Hosting ends " + b.hosting.cancelAt.slice(0, 10) };
  if (b.hosting && b.hosting.daysLate >= GRACE_DAYS) return { key: "pause", label: `${b.hosting.daysLate} days unpaid: pause the site` };
  if (b.hosting && b.hosting.daysLate > 0) return { key: "late", label: `Payment failed ${b.hosting.daysLate} day${b.hosting.daysLate === 1 ? "" : "s"} ago` };
  if (b.launch.paid) return { key: "live", label: "Live: hosting paid" };
  if (b.deposit.paid) return { key: "building", label: "Deposit paid: building" };
  return { key: "deposit", label: "Waiting for deposit" };
}

// ---------------------------------------------------------------- emails to the customer
const first = (b) => (b.name || "").split(" ")[0] || "there";
export async function customerEmail(origin, b, kind) {
  const terms = `${origin}/help#new-site`;
  if (kind === "deposit") return { subject: `Your new website: 50% deposit (${money(depositOf(b))})`, ...layout({
    heading: "Let's build your new website",
    paras: [`Hi ${esc(first(b))}, here's the link to pay the 50% deposit for your new ${b.business ? esc(b.business) + " " : ""}website: <b>${money(depositOf(b))}</b> of the ${money(b.price)} total.`,
      "Once it's paid, I start building. Your new site is usually ready in 1 to 2 weeks, and your current site stays up the whole time.",
      `When it's ready, you'll get a second link for the other 50% (${money(balanceOf(b))}). That same payment starts your hosting and updates at <b>$25 CAD a month</b>, charged to the same card each month. Nothing goes live until both are paid.`],
    button: { href: await payLink(origin, b, "deposit"), label: `Pay the deposit (${money(depositOf(b))})` },
    after: ["This link doesn't expire. Payments are handled securely by Stripe.", `Everything about how it works, in plain words: <a href="${terms}">${terms}</a>`, "Questions? Just reply to this email."]
  }) };
  if (kind === "launch") return { subject: `Your new website is ready: final payment (${money(balanceOf(b) + HOSTING_MONTHLY)})`, ...layout({
    heading: "Your new website is ready",
    paras: [`Hi ${esc(first(b))}, your new website is built${b.preview ? `. Take a look: <a href="${esc(b.preview)}">${esc(b.preview)}</a>` : "."}`,
      `To put it live, pay the final 50% (<b>${money(balanceOf(b))}</b>) plus your first month of hosting and updates (<b>$25 CAD</b>): <b>${money(balanceOf(b) + HOSTING_MONTHLY)}</b> today.`,
      "After that, $25 CAD is charged to the same card once a month. It covers hosting, the security padlock (SSL), small text and photo changes, and fixes if anything breaks. New pages are $150 CAD each.",
      `If a monthly payment fails, Stripe tries again and emails you. If it's still unpaid after ${GRACE_DAYS} days, the site is paused until it's paid. To stop hosting, give ${NOTICE_DAYS} days' notice by email and you'll get your website's files. Your web address always stays in your name.`],
    button: { href: await payLink(origin, b, "launch"), label: `Pay and go live (${money(balanceOf(b) + HOSTING_MONTHLY)})` },
    after: ["This link doesn't expire. Your card is saved securely by Stripe for the monthly charge.", `How hosting, payments and your web address work: <a href="${terms}">${terms}</a>`, "Questions? Just reply to this email."]
  }) };
  if (kind === "card") return { subject: "Update the card for your website hosting", ...layout({
    heading: "Update your card",
    paras: [`Hi ${esc(first(b))}, use this link to update the card for your website hosting ($25 CAD a month). It opens a secure Stripe page where you can change your card and see your invoices.`,
      b.hosting && b.hosting.daysLate ? `Your last payment didn't go through. Once your card is updated, Stripe charges it automatically. Sites unpaid for ${GRACE_DAYS} days are paused until paid.` : ""].filter(Boolean),
    button: { href: await payLink(origin, b, "card"), label: "Update my card" },
    after: ["This link doesn't expire.", "Questions? Just reply to this email."]
  }) };
  if (kind === "cancel") return { subject: "Your website hosting is ending", ...layout({
    heading: "Your hosting end date is set",
    paras: [`Hi ${esc(first(b))}, as requested, your website hosting ends on <b>${esc(new Date(b.hosting.cancelAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }))}</b> (${NOTICE_DAYS} days' notice). You won't be charged after that.`,
      "Before then, I'll send you a zip file of your website so you can host it anywhere. Your web address is in your name, so you can point it wherever you like."],
    after: ["Changed your mind? Just reply and I'll keep it running."]
  }) };
  throw new Error("unknown kind");
}
