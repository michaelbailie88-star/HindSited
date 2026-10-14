// "Start your new website": the guide's data, saved step, and the emails to
// The Lazy Creator Company. No platform logins are ever asked for. The owner's
// answers stay in their browser and are only emailed when they press Send.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports, getUser, saveUser } from "../lib/store.mjs";
import { sendMail } from "../lib/mail.mjs";
import { clean } from "../lib/password.mjs";
import { esc } from "../lib/emails.mjs";
import { buildReport } from "../../public/rules.js";
import { WANTS } from "../../public/fix-guide.js";

const STUDIO = "thelazycreatorco@gmail.com";
const STEPS = ["about", "domain", "recover", "send", "done"];
const DOMAIN = { yes: "Can log in to their domain account", locked: "Locked out of their domain account (needs help recovering it)", none: "Has no web address of their own (needs one)", unsure: "Not sure where their web address is registered" };

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
  if (!u) return json({ error: "Please sign in first.", needSignIn: true }, 401);
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const id = String((req.method === "POST" ? body.report : url.searchParams.get("report")) || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  const r = id && (await reports().get(id, { type: "json" }));
  if (!r || r.state !== "done" || !r.scan) return json({ error: "We couldn't find that report." }, 404);
  if (r.owner && r.owner !== me) return json({ error: "That report belongs to another account." }, 403);
  u.fixes = u.fixes || {};
  const prog = u.fixes[id] || { step: "about", status: "started", at: new Date().toISOString() };
  const rep = buildReport(r.scan);
  const info = { site: r.site, url: r.url, score: rep.score, grade: rep.grade.label, issues: rep.findings.length, platform: rep.platform || "", domain: r.scan.domain || null };

  if (req.method === "GET") {
    return json({ report: { id, ...info }, emails: [...new Set([me, ...siteEmails(r.scan)])], progress: prog, email: me, name: u.name || "", business: u.business || "" });
  }

  const origin = url.origin;
  const a = body.about && typeof body.about === "object" ? body.about : {};
  const name = clean(a.name, 80) || u.name || "", business = clean(a.business, 120) || u.business || "";
  const who = `${name || me}${business ? " · " + business : ""}`;
  const head = [["Business", who], ["Account email", me], ...(clean(a.phone, 40) ? [["Phone", clean(a.phone, 40)]] : []), ["Current website", info.url], ["Report", `${origin}/r/${id}`], ["Score", `${info.score}/100 (${info.grade}), ${info.issues} issues`], ["Built on", info.platform || "unknown"],
    ["Web address", info.domain ? `${info.domain.name} at ${info.domain.registrar || "unknown registrar"}${info.domain.expires ? ", renews " + info.domain.expires.slice(0, 10) : ""}` : "not found"]];
  const mail = async (subject, rows, note) => sendMail({
    to: STUDIO, replyTo: me, subject,
    text: rows.map(([k, v]) => `${k}: ${v}`).join("\n") + (note ? `\n\n${note}` : "") + `\n\nReply to this email to answer ${name || me} directly.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800;margin:0 0 12px">${esc(subject)}</p><table style="border-collapse:collapse;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#676b74;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${/^https?:/.test(v) ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</td></tr>`).join("")}</table>${note ? `<p style="white-space:pre-wrap;background:#f4f1ea;padding:14px;border-radius:10px;margin-top:14px">${esc(note)}</p>` : ""}<p style="font-size:13px;color:#676b74">Reply to this email to answer ${esc(name || me)} directly.</p></div>`
  });

  if (body.action === "step") {
    if (!STEPS.includes(body.step) || body.step === "done") return json({ error: "Unknown step." }, 400);
    prog.step = body.step;
    if (DOMAIN[body.domain]) prog.domain = body.domain;
  } else if (body.action === "stuck") {
    const step = STEPS.includes(body.step) ? body.step : prog.step;
    try { await mail(`Stuck starting a new website: ${info.site} (${step} step)`, [...head, ["Stuck at", step]], clean(body.note, 1500) || "(no details given)"); }
    catch { return json({ error: "That didn't send. Email thelazycreatorco@gmail.com instead." }, 502); }
    prog.stuck = { step, at: new Date().toISOString() };
  } else if (body.action === "send") {
    const domain = DOMAIN[body.domain] ? body.domain : prog.domain;
    if (!domain) return json({ error: "Answer the web address question first." }, 400);
    const wants = (Array.isArray(a.wants) ? a.wants : []).filter((w) => WANTS.includes(w));
    try { await mail(`New website request: ${info.site}`, [...head, ["Domain access", DOMAIN[domain]], ["Needs the site to", wants.length ? wants.join(", ") : "(nothing ticked)"]], clean(a.note, 2000) || ""); }
    catch { return json({ error: "That didn't send. Email thelazycreatorco@gmail.com instead." }, 502); }
    Object.assign(prog, { step: "done", status: "sent", domain, sentAt: new Date().toISOString() });
  } else return json({ error: "Unknown action." }, 400);
  u.fixes[id] = prog;
  await saveUser(u);
  return json({ ok: true, progress: prog });
};

export const config = { path: "/api/fix", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };
