// Reviews of HindSited itself. Only signed-in account holders can write one,
// and nothing is published until The Lazy Creator Company approves it.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, reviewsStore, fingerprint, OWNER_EMAILS } from "../lib/store.mjs";
import { sendMail } from "../lib/mail.mjs";
import { clean } from "../lib/password.mjs";
import { esc } from "../lib/emails.mjs";

const STUDIO = "thelazycreatorco@gmail.com";
const shortName = (n) => { const p = String(n || "").trim().split(/\s+/); return p.length > 1 ? p[0] + " " + p[p.length - 1][0] + "." : p[0] || "A HindSited customer"; };
const pub = (r) => ({ id: r.id, rating: r.rating, text: r.text, name: r.name, business: r.showBusiness ? r.business : "", at: r.at });

async function all() {
  const st = reviewsStore();
  const { blobs } = await st.list({ prefix: "r/" });
  return (await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })))).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export default async (req) => {
  const me = await sessionEmail(req);
  const owner = !!me && OWNER_EMAILS.includes(me);
  const st = reviewsStore();
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    const list = await all();
    const out = { google: Netlify.env.get("HS_GOOGLE_REVIEW_URL") || "", reviews: list.filter((r) => r.status === "approved").slice(0, 12).map(pub), signedIn: !!me };
    if (me) { const id = await fingerprint("review:" + me); const mine = list.find((r) => r.id === id); out.mine = mine ? { ...pub(mine), status: mine.status, showBusiness: !!mine.showBusiness } : null; }
    if (owner && q.get("all")) out.all = list.map((r) => ({ ...pub(r), email: r.email, business: r.business, status: r.status }));
    return json(out);
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!me) return json({ error: "Sign in to leave a review.", needSignIn: true }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  if (b.action) {
    if (!owner) return json({ error: "Not allowed." }, 403);
    const id = String(b.id || "").replace(/[^a-f0-9]/g, "").slice(0, 40);
    const r = id && (await st.get("r/" + id, { type: "json" }));
    if (!r) return json({ error: "Review not found." }, 404);
    if (b.action === "delete") { await st.delete("r/" + id); return json({ ok: true }); }
    if (!["approve", "reject"].includes(b.action)) return json({ error: "Unknown action." }, 400);
    r.status = b.action === "approve" ? "approved" : "rejected";
    await st.setJSON("r/" + id, r);
    return json({ ok: true, status: r.status });
  }

  const rating = Math.round(Number(b.rating));
  const text = clean(b.text, 1000);
  if (!(rating >= 1 && rating <= 5)) return json({ error: "Pick a star rating.", field: "rating" }, 400);
  if (text.length < 10) return json({ error: "Write a little more (at least 10 characters).", field: "text" }, 400);
  const u = await getUser(me);
  const id = await fingerprint("review:" + me);
  const r = { id, email: me, name: shortName(u && u.name), business: (u && u.business) || "", showBusiness: !!b.showBusiness, rating, text, status: "pending", at: new Date().toISOString() };
  await st.setJSON("r/" + id, r);
  await sendMail({
    to: STUDIO, subject: `New HindSited review (${rating}★) waiting for approval`,
    text: `${r.name}${r.business ? " · " + r.business : ""} (${me}) left a ${rating}-star review:\n\n${text}\n\nApprove or reject it from your HindSited dashboard: ${new URL(req.url).origin}/account`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#14161b"><p style="font-size:18px;font-weight:800">New review waiting for approval</p><p>${"★".repeat(rating)}${"☆".repeat(5 - rating)} from <b>${esc(r.name)}</b>${r.business ? " · " + esc(r.business) : ""} (${esc(me)})</p><p style="white-space:pre-wrap;background:#f4f1ea;padding:14px;border-radius:10px">${esc(text)}</p><p><a href="${new URL(req.url).origin}/account">Approve or reject it in your dashboard</a></p></div>`
  }).catch(() => {});
  return json({ ok: true, status: "pending" });
};

export const config = { path: "/api/reviews", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 30, windowSize: 60, aggregateBy: ["ip", "domain"] } };
