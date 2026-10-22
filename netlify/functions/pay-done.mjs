// Stripe sends the customer here after paying a build link. The session is
// read back from Stripe; only a completed, paid session counts.
import { stripe } from "../lib/stripe.mjs";
import { sendMail } from "../lib/mail.mjs";
import { builds, markPaid, money, depositOf, balanceOf, STUDIO } from "../lib/builds.mjs";
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
    const amount = md.kind === "deposit" ? money(depositOf(b)) : money(balanceOf(b));
    try { await sendMail({ to: STUDIO, replyTo: b.email, subject: `${md.kind === "deposit" ? "Deposit paid" : "Final payment received"}: ${b.business || b.name} (${amount})`,
      text: `${who}\n${b.email}\n${md.kind === "deposit" ? "Deposit paid. Time to build: 1 to 2 weeks." : "Final 50% paid. Send the customer the site's files (no hosting)."}\n\nBuilds: ${u.origin}/builds` }); } catch {}
    const next = md.kind === "deposit"
      ? layout({ heading: "Deposit received. I'm starting your website.", paras: [`Hi ${esc((b.name || "").split(" ")[0] || "there")}, thanks: your ${amount} deposit is in.`, "Your new site is usually ready in 1 to 2 weeks. I'll email you a preview link and the final payment link when it's ready. Your current site stays up the whole time.", "Nothing else is needed from you right now."], after: ["Questions? Just reply to this email."] })
      : layout({ heading: "You're all set. Your site files are on the way.", paras: [`Hi ${esc((b.name || "").split(" ")[0] || "there")}, thanks: your final payment (${amount}) is in.`, "I'll send you the complete files for your new website within 1 day. They're yours to keep and put on any host you choose. I don't host websites, and your web address stays in your name.", "For a new page ($150 CAD) or a change, just reply to this email."], after: [`How it works: <a href="${u.origin}/help#new-site">${u.origin}/help#new-site</a>`] });
    try { await sendMail({ to: b.email, replyTo: STUDIO, subject: md.kind === "deposit" ? "Deposit received: your new website" : "Payment received: your website files are on the way", html: next.html, text: next.text }); } catch {}
  }
  return back("k=" + md.kind);
};

export const config = { path: "/api/pay/done", method: "GET" };
