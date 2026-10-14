// "Request a redesign" / "Fix this report" forms. The request is emailed to
// The Lazy Creator Company and not stored anywhere.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports, getUser } from "../lib/store.mjs";
import { sendMail } from "../lib/mail.mjs";
import { EMAIL_RE, clean } from "../lib/password.mjs";
import { esc } from "../lib/emails.mjs";

const STUDIO = "thelazycreatorco@gmail.com";
const KINDS = { redesign: "New website (redesign)", fix: "Fix the issues in my report" };

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  if (b.hp) return json({ sent: true }); // honeypot: bots fill it, people never see it
  const kind = KINDS[b.kind] ? b.kind : null;
  if (!kind) return json({ error: "Unknown request." }, 400);
  const name = clean(b.name, 80), email = clean(b.email, 254).toLowerCase(), phone = clean(b.phone, 40), note = clean(b.note, 2000);
  if (!name) return json({ error: "Enter your name.", field: "name" }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email so we can reply.", field: "email" }, 400);
  let rep = null;
  const id = String(b.report || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (id) { const r = await reports().get(id, { type: "json" }); if (r) rep = { id, site: r.site, url: r.url, score: r.score, grade: r.grade }; }
  const me = await sessionEmail(req);
  const u = me ? await getUser(me) : null;
  const origin = new URL(req.url).origin;
  const rows = [["Request", KINDS[kind]], ["Name", name], ["Email", email], ["Phone", phone || "(not given)"],
    ["Website", rep ? rep.url : clean(b.website, 200) || "(not given)"],
    ...(rep ? [["Report", `${origin}/r/${rep.id}`], ["Score", rep.score != null ? rep.score + "/100 (" + (rep.grade || "") + ")" : "(still running)"]] : []),
    ...(u ? [["Account", `${u.email}${u.business ? " · " + u.business : ""}`]] : [["Account", "Not signed in"]])];
  try {
    await sendMail({
      to: STUDIO, replyTo: email,
      subject: `${kind === "redesign" ? "Redesign request" : "Fix request"}: ${rep ? rep.site : name}`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nMessage:\n${note || "(none)"}\n\nReply to this email to answer ${name} directly.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800;margin:0 0 12px">${esc(KINDS[kind])}</p><table style="border-collapse:collapse;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#676b74;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${/^https?:/.test(v) ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`).join("")}</table><p style="white-space:pre-wrap;background:#f4f1ea;padding:14px;border-radius:10px;margin-top:14px">${esc(note || "(no message)")}</p><p style="font-size:13px;color:#676b74">Reply to this email to answer ${esc(name)} directly.</p></div>`
    });
  } catch { return json({ error: "Your request couldn't be sent right now. Email thelazycreatorco@gmail.com instead." }, 502); }
  return json({ sent: true });
};

export const config = { path: "/api/request", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 4, windowSize: 60, aggregateBy: ["ip", "domain"] } };
