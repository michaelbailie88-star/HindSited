// Sends a one-time sign-in link by email.
import { json } from "../lib/guard.mjs";
import { sign } from "../lib/session.mjs";
import { sendMail } from "../lib/mail.mjs";
import { isDisposable } from "../lib/disposable.mjs";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!EMAIL.test(email)) return json({ error: "Enter a valid email address." }, 400);
  if (isDisposable(email)) return json({ error: "Please use your real email address. Temporary inboxes can't be used." }, 400);
  const next = typeof body.next === "string" && body.next.startsWith("/") && !body.next.startsWith("//") ? body.next.slice(0, 500) : "/";
  const token = await sign({ t: "link", email, next, exp: Date.now() + 20 * 60 * 1000 });
  const origin = new URL(req.url).origin;
  const link = `${origin}/api/auth/verify?t=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: email,
      subject: "Your HindSited sign-in link",
      text: `Tap this link to sign in to HindSited and see your website report:\n\n${link}\n\nThe link works once and expires in 20 minutes. If you didn't ask for this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#14161b">
        <p style="font-size:20px;font-weight:800;margin:0 0 16px">Hind<span style="color:#e5461d">Sited</span></p>
        <p style="font-size:16px;line-height:1.5">Tap the button to sign in and see your website report.</p>
        <p style="margin:24px 0"><a href="${esc(link)}" style="background:#e5461d;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;display:inline-block">Sign in to HindSited</a></p>
        <p style="font-size:13px;color:#676b74;line-height:1.5">The link expires in 20 minutes. If you didn't ask for this, you can ignore this email.</p>
      </div>`
    });
  } catch (e) {
    return json({ error: /not-configured/.test(e.message) ? "Sign-in email isn't set up yet." : "We couldn't send the email. Check the address and try again." }, 502);
  }
  return json({ sent: true });
};

export const config = { path: "/api/auth/start", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 5, windowSize: 60, aggregateBy: ["ip", "domain"] } };
