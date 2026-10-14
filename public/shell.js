// Shared bits for the tool pages: API calls and sign-in.
import { renderAuth } from "./auth-ui.js";
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
// The header account control is drawn by site.js; tool pages just need to know who's signed in.
export async function loadMe() {
  return window.HS ? await window.HS.me() : (await api("/me")).data;
}
export function readFileAsDataUrl(f) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }); }
export function signInForm(el, { next, lead }) {
  renderAuth(el, { mode: "signup", next, lead });
}
