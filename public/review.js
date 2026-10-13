// The customer-facing review page. Google is always the main button; a
// private note to the owner is offered beside it, never instead of it.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#rp");
const slug = (location.pathname.match(/^\/review\/([\w-]{3,60})\/?$/) || [])[1];

(async () => {
  if (!slug) { root.innerHTML = `<div class="wrap narrow"><p>This review page doesn't exist.</p></div>`; return; }
  let k;
  try { const r = await fetch("/api/kit?slug=" + encodeURIComponent(slug)); k = await r.json(); if (!r.ok) throw 0; }
  catch { root.innerHTML = `<div class="wrap narrow"><div class="rp-card"><h1 class="rp-h">This review page isn't available.</h1></div></div>`; return; }
  document.title = `Review ${k.name}`;
  document.documentElement.style.setProperty("--brand", k.color || "#e5461d");
  root.innerHTML = `<div class="wrap narrow"><div class="rp-card">
    <div class="rp-top">${k.logo ? `<img src="${esc(k.logo)}" alt="${esc(k.name)}">` : `<span class="rp-name">${esc(k.name)}</span>`}</div>
    <h1 class="rp-h">How was your experience with ${esc(k.name)}?</h1>
    <p class="rp-sub">Your review helps other people find a business they can trust. It only takes about 30 seconds.</p>
    <a class="rp-btn" href="${esc(k.google)}" rel="noopener">${googleIcon()}Leave a review on Google</a>
    ${k.facebook ? `<a class="rp-btn alt" href="${esc(k.facebook)}" rel="noopener">Review us on Facebook</a>` : ""}
    ${k.yelp ? `<a class="rp-btn alt" href="${esc(k.yelp)}" rel="noopener">Review us on Yelp</a>` : ""}
    ${k.messages ? `<details class="rp-private"><summary>Want to tell ${esc(k.name)} something privately too?</summary>
      <form id="pm" novalidate>
        <label>Your message<textarea id="pmMsg" rows="4" maxlength="2000" required></textarea></label>
        <label>Your name (optional)<input id="pmName" maxlength="80"></label>
        <label>Email or phone, if you'd like a reply (optional)<input id="pmContact" maxlength="120"></label>
        <label class="hp" aria-hidden="true">Website<input id="pmWeb" tabindex="-1" autocomplete="off"></label>
        <button class="rp-btn alt" type="submit">Send privately</button>
        <p class="rp-note" id="pmNote" role="status"></p>
      </form>
      <p class="muted small">This goes only to the owner. You can still leave a public review on Google too.</p></details>` : ""}
  </div></div>`;
  const f = $("#pm");
  if (f) f.onsubmit = async (e) => {
    e.preventDefault();
    const note = $("#pmNote");
    const r = await fetch("/api/kit-message", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug, message: $("#pmMsg").value, name: $("#pmName").value, contact: $("#pmContact").value, website: $("#pmWeb").value }) });
    const d = await r.json().catch(() => ({}));
    if (d.sent) { f.innerHTML = `<p class="rp-note ok">Thank you. Your message was sent privately to ${esc(k.name)}.</p>`; }
    else note.textContent = d.error || "That didn't send. Please try again.";
  };
})();

function googleIcon() {
  return `<svg aria-hidden="true" viewBox="0 0 48 48" width="22" height="22"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;
}
