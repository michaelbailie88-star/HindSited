// Review Booster kits. GET ?slug= is public (the customer-facing review page).
// GET ?mine=1 lists the owner's kits. POST creates or updates (signed in).
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser, claims, fingerprint } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { PLANS } from "../lib/plans.mjs";
import { kits, parseGoogleReviewLink, slugify, cleanUrl } from "../lib/kits.mjs";

const TYPES = ["general", "trades", "restaurant", "salon", "health", "retail", "fitness", "professional", "auto"];
const pub = (k) => ({ slug: k.slug, name: k.name, color: k.color, logo: k.logo, google: k.google, facebook: k.facebook || "", yelp: k.yelp || "", type: k.type, messages: !!k.notify });

export default async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const slug = (u.searchParams.get("slug") || "").replace(/[^\w-]/g, "").slice(0, 60);
    if (slug) { const k = await kits().get(slug, { type: "json" }); return k ? json(pub(k)) : json({ error: "This review page doesn't exist." }, 404); }
    const email = await sessionEmail(req);
    if (!email) return json({ signedIn: false }, 401);
    const user = await getUser(email);
    const list = [];
    for (const s of (user && user.kits) || []) { const k = await kits().get(s, { type: "json" }); if (k) list.push({ ...pub(k), notify: k.notify || "" }); }
    const ent = effectivePlan(user, email);
    const plan = PLANS[ent.plan];
    return json({ kits: list, plan: ent.plan, paid: ent.plan !== "free", allowed: Number.isFinite(plan.businesses) ? plan.businesses + ent.extra : null });
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ needSignIn: true, error: "Please sign in first." }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const name = String(b.name || "").replace(/[<>]/g, "").trim().slice(0, 60);
  if (!name) return json({ error: "Enter your business name." }, 400);
  const g = parseGoogleReviewLink(b.google);
  if (!g) return json({ error: "That doesn't look like a Google review link. Copy the “Ask for reviews” link from your Google Business Profile (it starts with https://g.page/r/)." }, 400);
  const color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#e5461d";
  const type = TYPES.includes(b.type) ? b.type : "general";
  let logo = null;
  if (typeof b.logo === "string" && b.logo) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.logo) || b.logo.length > 280000) return json({ error: "Logo must be a PNG, JPG or WebP under 200 KB." }, 400);
    logo = b.logo;
  }
  const notify = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(b.notify || "") ? String(b.notify).toLowerCase() : email;

  const user = (await getUser(email)) || newUser(email);
  const ent = effectivePlan(user, email);
  const paid = ent.plan !== "free";
  const plan = PLANS[ent.plan];
  user.kits = user.kits || [];
  let kit = null;
  if (b.slug && user.kits.includes(b.slug)) kit = await kits().get(b.slug, { type: "json" });
  if (!kit) {
    const allowed = paid ? plan.businesses + ent.extra : 1;
    if (user.kits.length >= allowed) return json({ paywall: true, reason: paid ? "kit-limit" : "kit-free-used", allowed }, 402);
    if (!paid) {
      const who = await fingerprint(email);
      const c = await claims().setJSON("review:" + g.key, { who, at: new Date().toISOString() }, { onlyIfNew: true });
      if (!c.modified) {
        const ex = await claims().get("review:" + g.key, { type: "json" });
        if (!ex || (ex.who !== who && ex.email !== email)) return json({ paywall: true, reason: "kit-listing-used" }, 402);
      }
    }
    kit = { slug: slugify(name), owner: email, createdAt: new Date().toISOString() };
    user.kits.push(kit.slug);
  }
  Object.assign(kit, { name, google: g.url, googleKey: g.key, color, type, notify, updatedAt: new Date().toISOString() });
  if (logo !== null || b.logo === null) kit.logo = logo;
  // Facebook and Yelp buttons are part of paid plans
  kit.facebook = paid ? cleanUrl(b.facebook, /(^|\.)facebook\.com$/i) : "";
  kit.yelp = paid ? cleanUrl(b.yelp, /(^|\.)yelp\.[a-z.]+$/i) : "";
  await kits().setJSON(kit.slug, kit);
  await saveUser(user);
  return json({ kit: { ...pub(kit), notify: kit.notify } });
};

export const config = { path: "/api/kit", method: ["GET", "POST"], rateLimit: { action: "rate_limit", windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] } };
