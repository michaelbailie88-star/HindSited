// Owner-only: new-website builds, their payment links and live status.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { OWNER_EMAILS } from "../lib/store.mjs";
import { stripe } from "../lib/stripe.mjs";
import { sendMail } from "../lib/mail.mjs";
import { clean, EMAIL_RE } from "../lib/password.mjs";
import { builds, refresh, stage, payLink, customerEmail, depositOf, balanceOf, money } from "../lib/builds.mjs";
import crypto from "node:crypto";

async function view(origin, b) {
  return { ...b, stage: stage(b), deposit$: money(depositOf(b)), balance$: money(balanceOf(b)), launch$: money(balanceOf(b)), price$: money(b.price),
    links: { deposit: await payLink(origin, b, "deposit"), launch: await payLink(origin, b, "launch") } };
}

export default async (req) => {
  const me = await sessionEmail(req);
  if (!me || !OWNER_EMAILS.includes(me)) return json({ error: "Owner only." }, 403);
  const origin = new URL(req.url).origin;
  const store = builds();

  if (req.method === "GET") {
    const keys = (await store.list()).blobs.map((x) => x.key);
    const all = [];
    for (const k of keys) {
      const b = await store.get(k, { type: "json" });
      if (!b) continue;
      const before = JSON.stringify(b);
      await refresh(b);
      if (JSON.stringify(b) !== before) await store.setJSON(b.id, b);
      all.push(await view(origin, b));
    }
    all.sort((a, z) => (z.createdAt || "").localeCompare(a.createdAt || ""));
    return json({ builds: all });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action === "create") {
    const email = clean(body.email, 254).toLowerCase();
    const price = Math.round(Number(body.price) * 100);
    if (!EMAIL_RE.test(email)) return json({ error: "Enter the customer's email.", field: "email" }, 400);
    if (!clean(body.name, 80)) return json({ error: "Enter the customer's name.", field: "name" }, 400);
    if (!Number.isFinite(price) || price < 10000 || price > 10000000) return json({ error: "Enter the full build price in CAD (at least $100).", field: "price" }, 400);
    const b = { id: crypto.randomUUID(), email, name: clean(body.name, 80), business: clean(body.business, 120), site: clean(body.site, 200), preview: "", notes: clean(body.notes, 1000), price, createdAt: new Date().toISOString(),
      deposit: { sessions: [], paid: false }, launch: { sessions: [], paid: false }, sent: {} };
    try { const c = await stripe("POST", "/customers", { email, name: b.name, description: b.business || undefined, "metadata[app]": "tlcc-build", "metadata[build]": b.id }); b.customer = c.id; }
    catch (e) { return json({ error: "Stripe didn't respond. Try again in a minute." }, 502); }
    await store.setJSON(b.id, b);
    return json({ build: await view(origin, b) });
  }

  const b = body.id && (await store.get(String(body.id).replace(/[^a-f0-9-]/gi, ""), { type: "json" }));
  if (!b) return json({ error: "That build wasn't found." }, 404);

  if (body.action === "update") {
    if (typeof body.preview === "string") { const pv = clean(body.preview, 300); if (pv && !/^https:\/\//.test(pv)) return json({ error: "The preview link must start with https://", field: "preview" }, 400); b.preview = pv; }
    if (typeof body.notes === "string") b.notes = clean(body.notes, 1000);
  } else if (body.action === "send") {
    if (!["deposit", "launch"].includes(body.kind)) return json({ error: "Unknown email." }, 400);
    if (body.kind === "launch" && !b.deposit.paid) return json({ error: "The deposit isn't paid yet." }, 400);
    const m = await customerEmail(origin, b, body.kind);
    try { await sendMail({ to: b.email, replyTo: "thelazycreatorco@gmail.com", subject: m.subject, html: m.html, text: m.text }); }
    catch { return json({ error: "The email didn't send. Copy the link instead." }, 502); }
    b.sent[body.kind] = new Date().toISOString();
  } else if (body.action === "delete") {
    if (b.deposit.paid && !body.confirm) return json({ error: "This build has payments. Tick confirm to delete the record (Stripe keeps the payments)." }, 400);
    await store.delete(b.id);
    return json({ ok: true, deleted: true });
  } else return json({ error: "Unknown action." }, 400);
  await store.setJSON(b.id, b);
  return json({ build: await view(origin, b) });
};

export const config = { path: "/api/builds", method: ["GET", "POST"] };
