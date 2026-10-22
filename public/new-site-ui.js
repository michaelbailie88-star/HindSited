// "Get a new website" without a scan: one form, emailed to the studio.
import { WANTS } from "./fix-guide.js";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f = $("#ns");
$("#wants").insertAdjacentHTML("beforeend", WANTS.map((w) => `<label class="check"><input type="checkbox" name="wants" value="${esc(w)}"> ${esc(w)}</label>`).join(""));
// prefill from the signed-in account, if any
fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).then((m) => {
  if (!m || !m.signedIn) return;
  if (!f.name.value && m.name) f.name.value = m.name;
  if (!f.email.value && m.email) f.email.value = m.email;
  if (!f.business.value && m.business) f.business.value = m.business;
  if (!f.website.value && m.website) f.website.value = m.website;
}).catch(() => {});
f.onsubmit = async (e) => {
  e.preventDefault();
  const er = f.querySelector(".form-err"); er.hidden = true;
  const d = Object.fromEntries(new FormData(f));
  d.wants = [...f.querySelectorAll('input[name="wants"]:checked')].map((x) => x.value);
  const miss = !d.name.trim() ? "Add your name." : !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.email.trim()) ? "Add an email so Michael can reply." : !d.business.trim() ? "Add your business name." : !d.domain ? "Choose an answer about your web address." : "";
  if (miss) { er.textContent = miss; er.hidden = false; return; }
  const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
  let data = {};
  try { const r = await fetch("/api/request", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...d, kind: "newsite" }) }); data = await r.json(); } catch {}
  btn.disabled = false;
  if (!data.sent) { er.textContent = data.error || "That didn't send. Email thelazycreatorco@gmail.com instead."; er.hidden = false; return; }
  f.closest(".fx-card").outerHTML = `<section class="fx-card fx-final"><p class="fx-k">Sent</p><h2>Your request is in</h2>
    <p>Thanks, ${esc(d.name.trim().split(" ")[0])}. Michael will reply by email. Here's what happens next:</p>
    <ol class="fx-steps"><li><b>Your quote by email</b>: what's included, the price and the timing. Nothing happens until you say yes.</li><li><b>Pay the 50% deposit</b> by the secure link in your email. Building starts.</li><li><b>Your new site is built</b> in about 1 to 2 weeks, and you get a preview link.</li><li><b>Pay the final 50%.</b> No monthly charges.</li><li><b>Get your files</b> and put them on any host you choose (<a href="/help#domain-settings" target="_blank">pointing your web address</a>).</li></ol>
    <p class="muted small">Every step in detail: <a href="/help#new-site">Help: your new website</a></p></section>`;
  window.scrollTo({ top: 0 });
};
