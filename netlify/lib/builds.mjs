// New-website builds sold through HindSited: the record, the never-expiring
// payment links, live status from Stripe, and the customer emails.
// Terms: 50% deposit to start, 50% at launch. No hosting: the customer gets
// the site's files and hosts them themselves.
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

export const STUDIO = "thelazycreatorco@gmail.com";
export const KINDS = ["deposit", "launch"];

export const money = (cents) => "$" + (cents / 100).toLocaleString("en-CA", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " CAD";
export const depositOf = (b) => Math.round(b.price / 2);
export const balanceOf = (b) => b.price - depositOf(b);

export async function token(id, kind) {
  return crypto.createHmac("sha256", await appSecret()).update("build:" + id + ":" + kind).digest("hex").slice(0, 24);
}
export async function payLink(origin, b, kind) { return `${origin}/pay/${b.id}/${kind}?t=${await token(b.id, kind)}`; }

// Read payment status straight from Stripe (no webhooks to fake).
export async function refresh(b) {
  for (const kind of ["deposit", "launch"]) {
    const k = b[kind];
    if (k.paid || !k.sessions.length) continue;
    for (const sid of k.sessions.slice(-5)) {
      let s; try { s = await stripe("GET", "/checkout/sessions/" + sid); } catch { continue; }
      if (s.status === "complete" && ["paid", "no_payment_required"].includes(s.payment_status)) { markPaid(b, kind, s); break; }
    }
  }
  return b;
}
export function markPaid(b, kind, s) {
  b[kind].paid = true;
  b[kind].paidAt = new Date().toISOString();
  b[kind].session = s.id;
}

export function stage(b) {
  if (b.launch.paid) return { key: "live", label: "Paid in full: send the files" };
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
      `When it's ready, you'll get a second link for the other 50% (${money(balanceOf(b))}). Nothing is handed over until both are paid. I don't host websites: you get your site's files to keep and put on any host you choose.`],
    button: { href: await payLink(origin, b, "deposit"), label: `Pay the deposit (${money(depositOf(b))})` },
    after: ["This link doesn't expire. Payments are handled securely by Stripe.", `Everything about how it works, in plain words: <a href="${terms}">${terms}</a>`, "Questions? Just reply to this email."]
  }) };
  if (kind === "launch") return { subject: `Your new website is ready: final payment (${money(balanceOf(b))})`, ...layout({
    heading: "Your new website is ready",
    paras: [`Hi ${esc(first(b))}, your new website is built${b.preview ? `. Take a look: <a href="${esc(b.preview)}">${esc(b.preview)}</a>` : "."}`,
      `To receive your site's files, pay the final 50% (<b>${money(balanceOf(b))}</b>). That's the whole balance: there are no monthly charges.`,
      "Once it's paid I send you the complete files within 1 day. They're yours to keep and put on any host you choose. I don't host websites or manage web addresses, so your web address stays in your name, with you. New pages are $150 CAD each."],
    button: { href: await payLink(origin, b, "launch"), label: `Pay the final 50% (${money(balanceOf(b))})` },
    after: ["This link doesn't expire. Payments are handled securely by Stripe.", `How payments and your files work: <a href="${terms}">${terms}</a>`, "Questions? Just reply to this email."]
  }) };
  throw new Error("unknown kind");
}
