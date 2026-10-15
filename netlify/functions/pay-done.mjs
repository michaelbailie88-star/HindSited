// Stripe sends the customer here after paying a build link. The session is
// read back from Stripe; only a completed, paid session counts.
import { stripe } from "../lib/stripe.mjs";
import { sendMail } from "../lib/mail.mjs";
import { builds, markPaid, money, depositOf, balanceOf, HOSTING_MONTHLY, STUDIO } from "../lib/builds.mjs";
import { layout, esc } from "../lib/emails.mjs";

export default async (req) => {
  const u = new URL(req.url);
  const back = (q) => Response.redirect(u.origin + "/paid?" + q, 302);
  const sid = (u.searchParams.get("sid") || "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 200);
  if (!sid) return back("k=error");
  let s; try { s = await stripe("GET", "/checkout/sessions/" + sid); } catch { return back("k=error"); }
  const md = s.metadata || {};
  if (md.app !== "tlcc-build" || !["deposit", "launch"].includes(md.kind)) return back("k=error");
  if (s.status !== "complete" || !["paid", "no_payment_required"].includes(s.payment_status)) return back("k=pending");
  const store = builds();
  const b = await store.get(String(md.build), { type: "json" });
  if (!b) return back("k=error");
  if (!b[md.kind].paid) {
    markPaid(b, md.kind, s);
    await store.setJSON(b.id, b);
    const who = `${b.name}${b.business ? " · " + b.business : ""}`;
    const amount = md.kind === "deposit" ? money(depositOf(b)) : money(balanceOf(b) + HOSTING_MONTHLY);
    try { await sendMail({ to: STUDIO, replyTo: b.email, subject: `${md.kind === "deposit" ? "Deposit paid" : "Launch paid, hosting started"}: ${b.business || b.name} (${amount})`,
      text: `${who}\n${b.email}\n${md.kind === "deposit" ? "Deposit paid. Time to build: 1 to 2 weeks." : "Final 50% and first month paid. $25 CAD/month hosting is now active. Put the site live."}\n\nBuilds: ${u.origin}/builds` }); } catch {}
    const next = md.kind === "deposit"
      ? layout({ heading: "Deposit received. I'm starting your website.", paras: [`Hi ${esc((b.name || "").split(" ")[0] || "there")}, thanks: your ${amount} deposit is in.`, "Your new site is usually ready in 1 to 2 weeks. I'll email you a preview link and the final payment link when it's ready. Your current site stays up the whole time.", "Nothing else is needed from you right now."], after: ["Questions? Just reply to this email."] })
      : layout({ heading: "You're all set. Your site is going live.", paras: [`Hi ${esc((b.name || "").split(" ")[0] || "there")}, thanks: your final payment and first month of hosting (${amount}) are in.`, "I'll email you the two settings to change in your domain account so your web address points to the new site. It only takes a few minutes.", "From now on, $25 CAD is charged to the same card each month for hosting and updates. For a small change, just reply to this email."], after: [`How hosting works: <a href="${u.origin}/help#hosting">${u.origin}/help#hosting</a>`] });
    try { await sendMail({ to: b.email, replyTo: STUDIO, subject: md.kind === "deposit" ? "Deposit received: your new website" : "Payment received: your website is going live", html: next.html, text: next.text }); } catch {}
  }
  return back("k=" + md.kind);
};

export const config = { path: "/api/pay/done", method: "GET" };
