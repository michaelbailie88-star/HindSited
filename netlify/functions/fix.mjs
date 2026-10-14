// "Get your website ready to be fixed": the guide's data, saved progress, and
// the emails to The Lazy Creator Company when the owner is stuck or done.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports, getUser, saveUser } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { sendMail } from "../lib/mail.mjs";
import { clean } from "../lib/password.mjs";
import { esc } from "../lib/emails.mjs";
import { buildReport } from "../../public/rules.js";

const STUDIO = "thelazycreatorco@gmail.com";
const STEPS = ["platform", "login", "recover", "invite", "done"];

// emails shown on the owner's own site (to try at "forgot password")
function siteEmails(scan) {
  const found = new Set();
  const s = JSON.stringify(scan || {}).slice(0, 2_000_000);
  for (const m of s.matchAll(/mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) found.add(m[1].toLowerCase());
  return [...found].filter((e) => !/example\.|sentry|wixpress|godaddy|squarespace|shopify/i.test(e)).slice(0, 6);
}

export default async (req) => {
  const me = await sessionEmail(req);
  if (!me) return json({ error: "Please sign in first.", needSignIn: true }, 401);
  const u = await getUser(me);
  if (effectivePlan(u, me).plan === "free") return json({ error: "Fix It is part of the paid plans.", needPlan: true }, 402);
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const id = String((req.method === "POST" ? body.report : url.searchParams.get("report")) || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  const r = id && (await reports().get(id, { type: "json" }));
  if (!r || r.state !== "done" || !r.scan) return json({ error: "We couldn't find that report." }, 404);
  if (r.owner && r.owner !== me) return json({ error: "That report belongs to another account." }, 403);
  u.fixes = u.fixes || {};
  const prog = u.fixes[id] || { step: "platform", status: "started", at: new Date().toISOString() };
  const rep = buildReport(r.scan);
  const info = { site: r.site, url: r.url, score: rep.score, grade: rep.grade.label, issues: rep.findings.length, platform: rep.platform || "", domain: r.scan.domain || null };

  if (req.method === "GET") {
    return json({ report: { id, ...info }, emails: [...new Set([me, ...siteEmails(r.scan)])], progress: prog, name: u.name || "", business: u.business || "" });
  }

  const origin = url.origin;
  const who = `${u.name || me}${u.business ? " · " + u.business : ""}`;
  const head = [["Business", who], ["Account email", me], ["Website", info.url], ["Report", `${origin}/r/${id}`], ["Score", `${info.score}/100 (${info.grade}), ${info.issues} issues`], ["Platform", body.platform || info.platform || "unknown"],
    ["Domain", info.domain ? `${info.domain.name} at ${info.domain.registrar || "unknown registrar"}${info.domain.expires ? ", renews " + info.domain.expires.slice(0, 10) : ""}` : "not found"]];
  const mail = async (subject, rows, note) => sendMail({
    to: STUDIO, replyTo: me, subject,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") + (note ? `\n\n${note}` : "") + `\n\nReply to this email to answer ${u.name || me} directly.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800;margin:0 0 12px">${esc(subject)}</p><table style="border-collapse:collapse;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#676b74;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${/^https?:/.test(v) ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`).join("")}</table>${note ? `<p style="white-space:pre-wrap;background:#f4f1ea;padding:14px;border-radius:10px;margin-top:14px">${esc(note)}</p>` : ""}<p style="font-size:13px;color:#676b74">Reply to this email to answer ${esc(u.name || me)} directly.</p></div>`
  });

  if (body.action === "step") {
    if (!STEPS.includes(body.step)) return json({ error: "Unknown step." }, 400);
    Object.assign(prog, { step: body.step, platform: clean(body.platform, 30) || prog.platform || "" });
  } else if (body.action === "stuck") {
    const note = clean(body.note, 1500);
    const step = STEPS.includes(body.step) ? body.step : prog.step;
    try { await mail(`Stuck on Fix It: ${info.site} (${step} step)`, [...head, ["Stuck at", step]], note || "(no details given)"); }
    catch { return json({ error: "That didn't send. Email thelazycreatorco@gmail.com instead." }, 502); }
    Object.assign(prog, { stuck: { step, at: new Date().toISOString() } });
  } else if (body.action === "done") {
    const code = clean(body.code, 12);
    try { await mail(`Fix It request: ${info.site} is ready (${body.platform || info.platform || "platform unknown"})`, [...head, ...(code ? [["Shopify collaborator code", code]] : []), ["Invite sent to", STUDIO]], clean(body.note, 1500) || ""); }
    catch { return json({ error: "That didn't send. Email thelazycreatorco@gmail.com instead." }, 502); }
    Object.assign(prog, { step: "done", status: "sent", sentAt: new Date().toISOString(), platform: clean(body.platform, 30) });
  } else if (body.action === "noaccess") {
    try { await mail(`No access to their website: ${info.site} (redesign lead)`, head, clean(body.note, 1500) || "They worked through the guide but can't get access to their website or domain."); }
    catch { return json({ error: "That didn't send. Email thelazycreatorco@gmail.com instead." }, 502); }
    Object.assign(prog, { status: "noaccess", at: new Date().toISOString() });
  } else return json({ error: "Unknown action." }, 400);
  u.fixes[id] = prog;
  await saveUser(u);
  return json({ ok: true, progress: prog });
};

export const config = { path: "/api/fix", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };
