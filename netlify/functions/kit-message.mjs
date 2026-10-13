// A customer's private note to the owner from the review page. It is offered
// beside the Google button, never instead of it.
import { json } from "../lib/guard.mjs";
import { kits } from "../lib/kits.mjs";
import { sendMail } from "../lib/mail.mjs";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (b.website) return json({ sent: true }); // honeypot field: bots fill it, people never see it
  const slug = String(b.slug || "").replace(/[^\w-]/g, "").slice(0, 60);
  const k = slug && (await kits().get(slug, { type: "json" }));
  if (!k || !k.notify) return json({ error: "This page can't take messages." }, 404);
  const message = String(b.message || "").trim().slice(0, 2000);
  const name = String(b.name || "").trim().slice(0, 80);
  const contact = String(b.contact || "").trim().slice(0, 120);
  if (message.length < 3) return json({ error: "Write a short message first." }, 400);
  try {
    await sendMail({
      to: k.notify,
      subject: `Private feedback for ${k.name}`,
      text: `Someone left you private feedback on your HindSited review page.\n\nFrom: ${name || "(no name)"}\nContact: ${contact || "(none given)"}\n\n${message}\n\nThis was sent privately and was not posted anywhere.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800">Private feedback for ${esc(k.name)}</p><p><b>From:</b> ${esc(name || "(no name)")}<br><b>Contact:</b> ${esc(contact || "(none given)")}</p><p style="white-space:pre-wrap;background:#f4f1ea;padding:14px;border-radius:10px">${esc(message)}</p><p style="font-size:13px;color:#676b74">Sent privately from your HindSited review page. It was not posted anywhere.</p></div>`
    });
  } catch { return json({ error: "Your message couldn't be sent. Please try again later." }, 502); }
  return json({ sent: true });
};

export const config = { path: "/api/kit-message", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 4, windowSize: 60, aggregateBy: ["ip", "domain"] } };
