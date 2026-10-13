// Shared bits for the tool pages: API calls, the account bar and sign-in.
export const $ = (s, r = document) => r.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export async function api(path, opts = {}) {
  try {
    const r = await fetch("/api" + path, { cache: "no-store", credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    let data = {}; try { data = await r.json(); } catch {}
    if (r.status === 429) data.error = data.error || "You're going a little fast. Wait a minute and try again.";
    return { status: r.status, data };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited. Check your connection." } }; }
}
export async function loadMe() {
  const r = await api("/me");
  const me = r.data && r.data.signedIn ? r.data : { signedIn: false };
  const a = $("#account");
  if (a) a.innerHTML = me.signedIn ? `<span class="acct-email">${esc(me.email)}</span><a class="linkish" href="/account">My account</a><button type="button" class="linkish" id="signOut">Sign out</button>` : "";
  const so = $("#signOut");
  if (so) so.onclick = async () => { await api("/me", { method: "POST" }); location.href = location.pathname; };
  return me;
}
export function readFileAsDataUrl(f) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }); }
export function signInForm(el, { next, lead }) {
  el.innerHTML = `<form class="stack" id="siForm" novalidate>${lead ? `<p>${lead}</p>` : ""}
    <label class="sr" for="siEmail">Email address</label>
    <div class="field"><input id="siEmail" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required><button type="submit">Send my link</button></div>
    <p class="form-err" id="siErr" role="alert" hidden></p><p class="muted small">No password. We email you a sign-in link.</p></form>`;
  $("#siForm", el).onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#siEmail", el).value.trim();
    const { status, data } = await api("/auth/start", { method: "POST", body: JSON.stringify({ email, next }) });
    if (status !== 200 || !data.sent) { const er = $("#siErr", el); er.textContent = data.error || "Something went wrong."; er.hidden = false; return; }
    el.innerHTML = `<p class="flash ok">Check your inbox: we sent a sign-in link to <b>${esc(email)}</b>. It can take a minute, and may land in spam or promotions.</p>`;
  };
}
