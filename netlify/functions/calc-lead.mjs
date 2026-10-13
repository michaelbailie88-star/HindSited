// A visitor asks for their exact quote. The price is recomputed here from the
// owner's saved calculator, so nothing the browser sends can change it.
import crypto from "node:crypto";
import { json } from "../lib/guard.mjs";
import { calcs, leads } from "../lib/store.mjs";
import { calcStatus } from "../lib/calcstatus.mjs";
import { sendMail } from "../lib/mail.mjs";
import { price, priceText } from "../../public/calc-core.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (b.website) return json({ sent: true });
  const slug = String(b.slug || "").replace(/[^\w-]/g, "").slice(0, 60);
  const c = slug && (await calcs().get(slug, { type: "json" }));
  if (!c) return json({ error: "This quote calculator doesn't exist." }, 404);
  const st = await calcStatus(c);
  if (!st.active) return json({ error: "Online quotes are paused right now. Please contact the business directly.", paused: true }, 409);
  const name = String(b.name || "").trim().slice(0, 80);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 120);
  const phone = String(b.phone || "").trim().slice(0, 40);
  const note = String(b.note || "").trim().slice(0, 1000);
  if (!name) return json({ error: "Please enter your name." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && phone.replace(/\D/g, "").length < 7) return json({ error: "Please enter an email or phone number so they can reach you." }, 400);
  const answers = b.answers && typeof b.answers === "object" ? b.answers : {};
  const r = price(c.config, answers);
  const quote = priceText(r, c.config);
  const id = new Date().toISOString().replace(/[:.]/g, "-") + "-" + crypto.randomBytes(3).toString("hex");
  const lead = { id, at: new Date().toISOString(), name, email, phone, note, quote, low: r.low, high: r.high, lines: r.lines, page: String(b.page || "").slice(0, 300) };
  await leads().setJSON(slug + "/" + id, lead);
  const rows = r.lines.map((l) => `<tr><td style="padding:4px 10px 4px 0;color:#676b74">${esc(l.q)}</td><td style="padding:4px 0">${esc(l.a)}</td></tr>`).join("");
  try {
    await sendMail({
      to: c.notify,
      subject: `New quote request: ${name} (${quote})`,
      text: `New quote request from your HindSited calculator.\n\nName: ${name}\nEmail: ${email || "-"}\nPhone: ${phone || "-"}\nQuote shown: ${quote}\n\n${r.lines.map((l) => `${l.q}: ${l.a}`).join("\n")}${note ? "\n\nNote: " + note : ""}\n\nReply quickly: people who hear back within the hour are far more likely to book.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800;margin:0 0 6px">New quote request</p><p style="margin:0 0 14px;color:#676b74">From your ${esc(c.business)} quote calculator</p>
        <p style="font-size:16px"><b>${esc(name)}</b><br>${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a><br>` : ""}${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : ""}</p>
        <p style="font-size:22px;font-weight:800;margin:14px 0">${esc(quote)}</p><table style="font-size:14px">${rows}</table>${note ? `<p style="background:#f4f1ea;padding:12px;border-radius:8px">${esc(note)}</p>` : ""}</div>`
    });
  } catch { /* the lead is saved either way; it shows in the dashboard */ }
  if (st.paid && c.followUp !== false && email) {
    try {
      await sendMail({ to: email, subject: `Your quote from ${c.business}`,
        text: `Hi ${name},\n\nThanks for your interest in ${c.business}. Based on your answers, your estimate is ${quote}.\n\n${r.lines.map((l) => `${l.q}: ${l.a}`).join("\n")}\n\nWe'll be in touch shortly to confirm the details and an exact price.${c.phone ? `\n\nWant to talk sooner? Call ${c.phone}.` : ""}\n\n${c.business}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p>Hi ${esc(name)},</p><p>Thanks for your interest in ${esc(c.business)}. Based on your answers, your estimate is:</p><p style="font-size:24px;font-weight:800">${esc(quote)}</p><table style="font-size:14px">${rows}</table><p>We'll be in touch shortly to confirm the details and an exact price.${c.phone ? ` Want to talk sooner? Call <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>.` : ""}</p><p>${esc(c.business)}</p></div>` });
    } catch {}
  }
  return json({ sent: true, quote });
};

export const config = { path: "/api/calc-lead", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 6, windowSize: 60, aggregateBy: ["ip", "domain"] } };
