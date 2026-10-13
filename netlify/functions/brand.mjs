// Agency white-label: business name and logo shown on their reports and PDFs.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser } from "../lib/store.mjs";
import { effectivePlan } from "../lib/entitle.mjs";
import { PLANS } from "../lib/plans.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ error: "Please sign in first." }, 401);
  const user = await getUser(email);
  if (!user || !PLANS[effectivePlan(user, email).plan].whiteLabel) return json({ error: "Your own branding is part of the Agency plan." }, 402);
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const name = String(body.name || "").replace(/[<>]/g, "").trim().slice(0, 60);
  const site = String(body.site || "").trim().slice(0, 120);
  let logo = body.logo === null ? null : (user.brand && user.brand.logo) || null;
  if (typeof body.logo === "string") {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.logo)) return json({ error: "Logo must be a PNG, JPG or WebP image." }, 400);
    if (body.logo.length > 280000) return json({ error: "Logo is too big. Use one under 200 KB." }, 400);
    logo = body.logo;
  }
  if (!name) return json({ error: "Enter your business name." }, 400);
  user.brand = { name, site: /^https?:\/\/[^\s"'<>]+$/i.test(site) ? site : "", logo };
  await saveUser(user);
  return json({ brand: user.brand });
};

export const config = { path: "/api/brand", method: "POST" };
