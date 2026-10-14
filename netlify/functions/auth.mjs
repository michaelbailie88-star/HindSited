// Accounts: create, sign in, forgot password, set a new password, confirm email.
// Passwords are stored only as salted scrypt hashes.
import { json } from "../lib/guard.mjs";
import { sign, verify, sessionFor, sessionEmail } from "../lib/session.mjs";
import { getUser, saveUser, newUser } from "../lib/store.mjs";
import { sendMail } from "../lib/mail.mjs";
import { isDisposable } from "../lib/disposable.mjs";
import { hashPassword, checkPassword, passwordProblem, EMAIL_RE, clean, cleanSite } from "../lib/password.mjs";
import { layout, esc } from "../lib/emails.mjs";

const LOCK_AFTER = 5, LOCK_MIN = 15;
const withCookie = (data, cookie, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "set-cookie": cookie } });
const nextPath = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n.slice(0, 500) : "/account");

async function mailConfirm(origin, user) {
  const t = await sign({ t: "confirm", email: user.email, exp: Date.now() + 7 * 86400000 });
  const m = layout({
    heading: `Welcome to HindSited${user.name ? ", " + esc(user.name.split(" ")[0]) : ""}`,
    paras: ["Your account is ready. Please confirm this is your email address so we can reach you about your account and billing."],
    button: { label: "Confirm my email", href: `${origin}/api/auth/confirm?t=${encodeURIComponent(t)}` },
    after: ["The link works for 7 days. If you didn't create a HindSited account, you can ignore this email."]
  });
  await sendMail({ to: user.email, subject: "Confirm your HindSited account", ...m });
}
async function mailReset(origin, user, setFirst) {
  const t = await sign({ t: "reset", email: user.email, pv: user.pwv || 0, exp: Date.now() + 30 * 60000 });
  const m = layout({
    heading: setFirst ? "Set your HindSited password" : "Reset your HindSited password",
    paras: [setFirst ? "HindSited now uses a password to sign in. Tap the button to choose yours. Your reports and tools are all still here." : "Someone (hopefully you) asked to reset the password on your HindSited account. Tap the button to choose a new one."],
    button: { label: setFirst ? "Set my password" : "Choose a new password", href: `${origin}/reset?t=${encodeURIComponent(t)}` },
    after: ["The link works once and expires in 30 minutes. If you didn't ask for this, you can ignore this email and your password won't change."]
  });
  await sendMail({ to: user.email, subject: setFirst ? "Set your HindSited password" : "Reset your HindSited password", ...m });
}

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  const origin = url.origin;

  if (action === "confirm") {
    const p = await verify(url.searchParams.get("t"));
    if (!p || p.t !== "confirm") return Response.redirect(origin + "/account?confirmed=expired", 302);
    const u = await getUser(p.email);
    if (u && !u.verified) { u.verified = true; await saveUser(u); }
    return Response.redirect(origin + "/account?confirmed=1", 302);
  }
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "Bad request." }, 400); }

  if (action === "resend") {
    const me = await sessionEmail(req);
    const u = me && (await getUser(me));
    if (!u) return json({ error: "Please sign in first." }, 401);
    if (u.verified) return json({ sent: true, already: true });
    try { await mailConfirm(origin, u); } catch { return json({ error: "We couldn't send the email right now. Try again in a minute." }, 502); }
    return json({ sent: true });
  }

  if (action === "signup") {
    const email = clean(b.email, 254).toLowerCase();
    const name = clean(b.name, 80), business = clean(b.business, 100), website = cleanSite(b.website);
    if (!name) return json({ error: "Enter your name.", field: "name" }, 400);
    if (!business) return json({ error: "Enter your business name.", field: "business" }, 400);
    if (website === null) return json({ error: "That website address doesn't look right.", field: "website" }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address.", field: "email" }, 400);
    if (isDisposable(email)) return json({ error: "Please use your real email address. Temporary inboxes can't be used.", field: "email" }, 400);
    const prob = passwordProblem(b.password);
    if (prob) return json({ error: prob, field: "password" }, 400);
    let u = await getUser(email);
    if (u && u.pw) return json({ error: "There's already an account with that email. Sign in instead, or use Forgot password.", field: "email", exists: true }, 409);
    if (u && !u.pw) {
      // account from before passwords: never let a stranger claim it by signing up
      await mailReset(origin, u, true).catch(() => {});
      return json({ error: "That email already has a HindSited account. We've emailed you a link to set its password.", field: "email", exists: true }, 409);
    }
    u = newUser(email);
    Object.assign(u, { name, business, website: website || "", pw: await hashPassword(b.password), pwv: 1, verified: false });
    await saveUser(u);
    await mailConfirm(origin, u).catch(() => {});
    return withCookie({ ok: true, next: nextPath(b.next) }, await sessionFor(u));
  }

  if (action === "login") {
    const email = clean(b.email, 254).toLowerCase();
    const bad = () => json({ error: "That email and password don't match." }, 401);
    if (!EMAIL_RE.test(email) || !b.password) return bad();
    const u = await getUser(email);
    if (!u) { await hashPassword("timing-pad"); return bad(); }
    if (!u.pw) {
      await mailReset(origin, u, true).catch(() => {});
      return json({ error: "This account doesn't have a password yet. We've emailed you a link to set one.", needsPassword: true }, 401);
    }
    if (u.lockUntil && Date.now() < Date.parse(u.lockUntil)) {
      const mins = Math.ceil((Date.parse(u.lockUntil) - Date.now()) / 60000);
      return json({ error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or use Forgot password.`, locked: true }, 429);
    }
    if (!(await checkPassword(b.password, u.pw))) {
      u.fails = (u.fails || 0) + 1;
      if (u.fails >= LOCK_AFTER) { u.lockUntil = new Date(Date.now() + LOCK_MIN * 60000).toISOString(); u.fails = 0; }
      await saveUser(u);
      return bad();
    }
    if (u.fails || u.lockUntil) { u.fails = 0; u.lockUntil = null; await saveUser(u); }
    return withCookie({ ok: true, next: nextPath(b.next) }, await sessionFor(u));
  }

  if (action === "forgot") {
    const email = clean(b.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Enter a valid email address." }, 400);
    const u = await getUser(email);
    if (u) { try { await mailReset(origin, u, !u.pw); } catch { return json({ error: "We couldn't send the email right now. Try again in a minute." }, 502); } }
    return json({ sent: true }); // same answer either way, so nobody can test which emails have accounts
  }

  if (action === "reset") {
    const p = await verify(b.t);
    if (!p || p.t !== "reset") return json({ error: "That link has expired. Ask for a new one.", expired: true }, 400);
    const u = await getUser(p.email);
    if (!u || (u.pwv || 0) !== (p.pv || 0)) return json({ error: "That link was already used. Ask for a new one.", expired: true }, 400);
    const prob = passwordProblem(b.password);
    if (prob) return json({ error: prob }, 400);
    u.pw = await hashPassword(b.password);
    u.pwv = (u.pwv || 0) + 1; // signs out every other device and kills this link
    u.verified = true; u.fails = 0; u.lockUntil = null;
    await saveUser(u);
    return withCookie({ ok: true }, await sessionFor(u));
  }

  return json({ error: "Unknown action." }, 404);
};

export const config = {
  path: ["/api/auth/signup", "/api/auth/login", "/api/auth/forgot", "/api/auth/reset", "/api/auth/confirm", "/api/auth/resend"],
  rateLimit: { action: "rate_limit", windowLimit: 12, windowSize: 60, aggregateBy: ["ip", "domain"] }
};
