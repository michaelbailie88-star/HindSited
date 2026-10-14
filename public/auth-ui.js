// Sign in / create account / forgot password / set new password forms.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
async function post(path, body) {
  try {
    const r = await fetch("/api/auth/" + path, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let d = {}; try { d = await r.json(); } catch {}
    if (r.status === 429 && !d.error) d.error = "Too many tries. Wait a minute and try again.";
    return { status: r.status, data: d };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited. Check your connection." } }; }
}
const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/account");

// mode: "signin" | "signup"; next: where to go after; title/lead: optional copy above the form
export function renderAuth(el, { mode = "signin", next = "/account", title, lead } = {}) {
  next = safeNext(next);
  const draw = (m, email = "") => {
    const signup = m === "signup";
    el.innerHTML = `<div class="auth">
      ${title ? `<h2 class="panel-h">${title}</h2>` : ""}${lead ? `<p class="auth-lead">${lead}</p>` : ""}
      <div class="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="${!signup}" data-m="signin">Sign in</button>
        <button type="button" role="tab" aria-selected="${signup}" data-m="signup">Create account</button>
      </div>
      <form class="auth-form" novalidate>
        ${signup ? `<label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>
        <label>Business name<input name="business" autocomplete="organization" maxlength="100" required></label>
        <label><span>Business website <span class="opt">(optional)</span></span><input name="website" inputmode="url" autocomplete="url" autocapitalize="off" spellcheck="false" maxlength="200" placeholder="yourbusiness.com"></label>` : ""}
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}"></label>
        <label><span>Password${signup ? ` <span class="opt">(8+ characters)</span>` : ""}</span>
          <span class="pw"><input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" maxlength="200" required><button type="button" class="pw-show" aria-label="Show password">Show</button></span></label>
        <p class="form-err" role="alert" hidden></p>
        <button class="btn auth-go" type="submit">${signup ? "Create my account" : "Sign in"}</button>
        ${signup ? `<p class="auth-fine">By creating an account you agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/privacy" target="_blank">Privacy Policy</a>. We never sell or share your information.</p>`
          : `<button type="button" class="linkish auth-forgot">Forgot password?</button>`}
      </form>
    </div>`;
    el.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => draw(b.dataset.m, el.querySelector('input[name="email"]').value)));
    const f = el.querySelector("form"), err = el.querySelector(".form-err"), go = el.querySelector(".auth-go");
    const pw = el.querySelector('input[name="password"]');
    el.querySelector(".pw-show").onclick = (e) => { const show = pw.type === "password"; pw.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show"; e.target.setAttribute("aria-label", show ? "Hide password" : "Show password"); };
    const fg = el.querySelector(".auth-forgot");
    if (fg) fg.onclick = () => renderForgot(el, { email: el.querySelector('input[name="email"]').value, back: () => draw("signin") });
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      const body = Object.fromEntries(new FormData(f));
      go.disabled = true;
      const { data } = await post(signup ? "signup" : "login", { ...body, next });
      go.disabled = false;
      if (data.ok) { location.href = data.next || next; return; }
      err.textContent = data.error || "Something went wrong. Try again.";
      err.hidden = false;
      if (data.field) { const inp = f.querySelector(`[name="${data.field}"]`); if (inp) inp.focus(); }
    };
    const first = el.querySelector(signup ? 'input[name="name"]' : email ? 'input[name="password"]' : 'input[name="email"]');
    if (first && !matchMedia("(pointer: coarse)").matches) first.focus({ preventScroll: true });
  };
  draw(mode === "signup" ? "signup" : "signin");
}

export function renderForgot(el, { email = "", back } = {}) {
  el.innerHTML = `<div class="auth">
    <h2 class="panel-h">Reset your password</h2>
    <p class="auth-lead">Enter your account email and we'll send you a link to choose a new password.</p>
    <form class="auth-form" novalidate>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}"></label>
      <p class="form-err" role="alert" hidden></p>
      <button class="btn auth-go" type="submit">Email me a reset link</button>
      ${back ? `<button type="button" class="linkish auth-back">← Back to sign in</button>` : ""}
    </form></div>`;
  if (back) el.querySelector(".auth-back").onclick = back;
  const f = el.querySelector("form"), err = el.querySelector(".form-err");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const em = f.email.value.trim();
    const { data } = await post("forgot", { email: em });
    if (!data.sent) { err.textContent = data.error || "Something went wrong."; err.hidden = false; return; }
    el.innerHTML = `<div class="auth"><h2 class="panel-h">Check your inbox</h2>
      <p class="auth-lead">If there's a HindSited account for <b class="one-line">${esc(em)}</b>, a reset link is on its way. It works once and expires in 30 minutes. Check your spam or promotions folder too.</p>
      ${back ? `<button type="button" class="linkish auth-back">← Back to sign in</button>` : ""}</div>`;
    if (back) el.querySelector(".auth-back").onclick = back;
  };
}

export function renderReset(el, token) {
  el.innerHTML = `<div class="auth">
    <h2 class="panel-h">Choose a new password</h2>
    <form class="auth-form" novalidate>
      <label><span>New password <span class="opt">(8+ characters)</span></span><span class="pw"><input name="password" type="password" autocomplete="new-password" minlength="8" maxlength="200" required><button type="button" class="pw-show" aria-label="Show password">Show</button></span></label>
      <p class="form-err" role="alert" hidden></p>
      <button class="btn auth-go" type="submit">Save password and sign in</button>
    </form></div>`;
  const f = el.querySelector("form"), err = el.querySelector(".form-err"), pw = f.password;
  el.querySelector(".pw-show").onclick = (e) => { const show = pw.type === "password"; pw.type = show ? "text" : "password"; e.target.textContent = show ? "Hide" : "Show"; };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const { data } = await post("reset", { t: token, password: pw.value });
    if (data.ok) { location.href = "/account?reset=1"; return; }
    err.innerHTML = esc(data.error || "Something went wrong.") + (data.expired ? ` <a href="/account?mode=forgot">Get a new link</a>` : "");
    err.hidden = false;
  };
}
