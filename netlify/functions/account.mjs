// Account settings for the signed-in user: edit profile, change password,
// and permanently delete the account and everything in it.
import { json } from "../lib/guard.mjs";
import { sessionEmail, sessionFor, clearSession } from "../lib/session.mjs";
import { getUser, saveUser, deleteUser, reports, calcs, leads, reviewsStore, fingerprint, cards } from "../lib/store.mjs";
import { kits } from "../lib/kits.mjs";
import { stripe } from "../lib/stripe.mjs";
import { hashPassword, checkPassword, passwordProblem, clean, cleanSite } from "../lib/password.mjs";

const out = (data, cookie) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json", "cache-control": "no-store", ...(cookie ? { "set-cookie": cookie } : {}) } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const email = await sessionEmail(req);
  if (!email) return json({ error: "Please sign in first.", needSignIn: true }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const u = await getUser(email);
  if (!u) return json({ error: "Please sign in first.", needSignIn: true }, 401);

  if (b.action === "profile") {
    const name = clean(b.name, 80), business = clean(b.business, 100), website = cleanSite(b.website);
    if (!name) return json({ error: "Enter your name.", field: "name" }, 400);
    if (!business) return json({ error: "Enter your business name.", field: "business" }, 400);
    if (website === null) return json({ error: "That website address doesn't look right.", field: "website" }, 400);
    Object.assign(u, { name, business, website: website || "" });
    await saveUser(u);
    return json({ ok: true, name, business, website: u.website });
  }

  if (b.action === "password") {
    if (u.pw && !(await checkPassword(b.current || "", u.pw))) return json({ error: "Your current password isn't right.", field: "current" }, 400);
    const prob = passwordProblem(b.password);
    if (prob) return json({ error: prob, field: "password" }, 400);
    u.pw = await hashPassword(b.password);
    u.pwv = (u.pwv || 0) + 1; // signs out other devices
    await saveUser(u);
    return out({ ok: true }, await sessionFor(u));
  }

  if (b.action === "delete") {
    if (String(b.confirm || "").trim().toUpperCase() !== "DELETE") return json({ error: "Type DELETE to confirm.", field: "confirm" }, 400);
    if (u.pw && !(await checkPassword(b.password || "", u.pw))) return json({ error: "Your password isn't right.", field: "password" }, 400);
    // stop any monthly billing first, so nobody is charged for a deleted account
    for (const s of (u.subs || []).filter((x) => !x.ended)) {
      try { await stripe("DELETE", "/subscriptions/" + s.id); }
      catch (e) { if (!/404|No such subscription/.test(e.message)) return json({ error: "We couldn't cancel your subscription with our payment provider, so nothing was deleted. Try again in a minute, or email thelazycreatorco@gmail.com." }, 502); }
    }
    for (const r of u.reports || []) { await reports().delete(r.id).catch(() => {}); await cards().delete(r.id).catch(() => {}); }
    for (const s of u.kits || []) await kits().delete(s).catch(() => {});
    for (const s of u.calcs || []) {
      await calcs().delete(s).catch(() => {});
      const { blobs } = await leads().list({ prefix: s + "/" }).catch(() => ({ blobs: [] }));
      for (const x of blobs) await leads().delete(x.key).catch(() => {});
    }
    await reviewsStore().delete("r/" + (await fingerprint("review:" + email))).catch(() => {});
    await deleteUser(email);
    return out({ ok: true, deleted: true }, clearSession);
  }

  return json({ error: "Unknown action." }, 400);
};

export const config = { path: "/api/account", method: "POST", rateLimit: { action: "rate_limit", windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] } };
