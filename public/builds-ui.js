// Owner-only: new-website builds. Make the payment links, email them, and see
// who has paid, who is behind, and when a site has to be paused.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#builds");
const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" }) : "");
async function api(method, body) {
  try {
    const r = await fetch("/api/builds", { method, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let d = {}; try { d = await r.json(); } catch {}
    return { status: r.status, data: d };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited." } }; }
}
let list = [];

(async () => {
  const { status, data } = await api("GET");
  if (status === 403) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Owner only</h1><p>Sign in with the studio account to see builds.</p><a class="btn" href="/account?next=/builds">Sign in</a></div>`; return; }
  list = data.builds || [];
  draw();
})();

function draw() {
  root.innerHTML = `<p class="eyebrow">Owner</p><h1 class="fx-h">New-website builds</h1>
    <details class="bd-how"><summary>How a build gets paid (tap to read)</summary>
      <ol class="fx-steps"><li><b>Add the build</b> below with the customer's email and the full price in CAD.</li>
      <li><b>Email the deposit link.</b> They pay 50%. You get an email the moment it's paid. Start building (1 to 2 weeks).</li>
      <li><b>Add the preview link</b> when the site's ready, then <b>email the launch link</b>. It charges the other 50% plus the first $25 CAD month and saves their card. You get an email when it's paid.</li>
      <li><b>Put the site live</b> and send them the two domain settings (see <a href="/help#domain-settings" target="_blank">Help: the two settings</a>).</li>
      <li>Every month Stripe charges $25 CAD. If it fails, Stripe retries and emails them. This page shows how many days it's been unpaid. At 14 days it says <b>Pause the site</b>.</li>
      <li>If they want to leave: <b>End hosting in 30 days</b>, then send them a zip of the site.</li></ol>
      <p class="muted small">Links never expire. Each click opens a fresh Stripe checkout, and a paid link can't be paid twice.</p></details>
    <section class="fx-card bd-new"><h2>Add a build</h2>
      <form id="newB" class="fx-form bd-form" novalidate>
        <label>Customer name<input name="name" maxlength="80" required autocomplete="off"></label>
        <label>Customer email<input name="email" type="email" maxlength="254" required autocomplete="off"></label>
        <label><span>Business <span class="opt">(optional)</span></span><input name="business" maxlength="120" autocomplete="off"></label>
        <label><span>Current website <span class="opt">(optional)</span></span><input name="site" maxlength="200" autocomplete="off"></label>
        <label>Full build price (CAD)<input name="price" inputmode="decimal" required placeholder="500"></label>
        <p class="bd-split muted small" id="split">Enter a price to see the 50/50 split.</p>
        <label class="bd-wide"><span>Notes <span class="opt">(only you see these)</span></span><textarea name="notes" rows="2" maxlength="1000"></textarea></label>
        <p class="form-err" role="alert" hidden></p>
        <div class="fx-act bd-wide"><button class="btn" type="submit">Add build</button></div>
      </form></section>
    <h2 class="bd-h">Builds (${list.length})</h2>
    ${list.length ? list.map(card).join("") : `<p class="muted">No builds yet. Add one above when a customer says yes to a quote.</p>`}`;
  wire();
}

function linkRow(b, kind, label, enabled, note) {
  const sent = b.sent && b.sent[kind];
  return `<div class="bd-link${enabled ? "" : " off"}"><div><b>${label}</b>${note ? `<span class="muted small"> ${note}</span>` : ""}${sent ? `<span class="muted small"> · emailed ${esc(day(sent))}</span>` : ""}</div>
    <div class="bd-btns"><button class="btn small-btn" type="button" data-send="${kind}" data-id="${b.id}"${enabled ? "" : " disabled"}>Email it to ${esc(b.name.split(" ")[0] || "them")}</button>
    <button class="tool" type="button" data-copy="${esc(b.links[kind])}"${enabled ? "" : " disabled"}>Copy link</button></div></div>`;
}

function card(b) {
  const st = b.stage, H = b.hosting || {};
  return `<article class="bd-card st-${st.key}" id="b-${b.id}">
    <div class="bd-top"><div><h3>${esc(b.business || b.name)}</h3><p class="muted small"><span class="one-line">${esc(b.name)} · ${esc(b.email)}</span>${b.site ? `<br><span class="one-line">${esc(b.site)}</span>` : ""}</p></div>
      <span class="bd-stage">${esc(st.label)}</span></div>
    <ol class="bd-steps">
      <li class="${b.deposit.paid ? "ok" : ""}">Deposit ${esc(b.deposit$)}${b.deposit.paid ? ` · paid ${esc(day(b.deposit.paidAt))}` : ""}</li>
      <li class="${b.launch.paid ? "ok" : ""}">Launch ${esc(b.launch$)} <span class="muted small">(${esc(b.balance$)} + $25 first month)</span>${b.launch.paid ? ` · paid ${esc(day(b.launch.paidAt))}` : ""}</li>
      <li class="${b.launch.paid && !H.daysLate ? "ok" : ""}">Hosting $25 CAD/month${b.launch.paid ? ` · ${esc(({ active: "active", past_due: "payment overdue", unpaid: "unpaid", canceled: "ended", incomplete: "waiting for payment" })[H.status] || H.status || "active")}` : ""}</li></ol>
    ${st.key === "pause" ? `<div class="bd-alert"><b>Pause the site now.</b> It's ${H.daysLate} days unpaid (${esc(((H.owing || 0) / 100).toFixed(2))} CAD owing). In Netlify, open the site's settings and stop it (or swap in a "temporarily offline" page). Email them the update-card link. When they pay, switch it back on.</div>`
      : st.key === "late" ? `<div class="bd-warn">Monthly payment failed ${H.daysLate} day${H.daysLate === 1 ? "" : "s"} ago. Stripe is retrying. Email them the update-card link. At 14 days, pause the site.</div>` : ""}
    ${b.deposit.paid ? "" : linkRow(b, "deposit", "Deposit link", true, `50%: ${b.deposit$}`)}
    ${b.launch.paid ? "" : `<form class="bd-prev" data-id="${b.id}"><label>Preview link for the launch email<input name="preview" type="url" placeholder="https://their-new-site.netlify.app" value="${esc(b.preview || "")}"></label><button class="tool" type="submit">Save</button></form>`}
    ${b.launch.paid ? "" : linkRow(b, "launch", "Launch link", b.deposit.paid, b.deposit.paid ? `final 50% + first month: ${b.launch$}` : "(after the deposit is paid)")}
    ${b.launch.paid ? linkRow(b, "card", "Update-card link", true, "for a failed payment or a new card") : ""}
    ${b.launch.paid ? `<div class="bd-end">${H.cancelAt ? `<p>Hosting ends <b>${esc(day(H.cancelAt))}</b>. Send them a zip of the site before then. <button class="linkish" type="button" data-keep="${b.id}">Keep hosting instead</button></p>` : `<button class="linkish" type="button" data-cancel="${b.id}">End hosting in 30 days (they asked to leave)</button>`}</div>` : ""}
    ${b.notes ? `<p class="muted small bd-notes">${esc(b.notes)}</p>` : ""}
    <p class="bd-foot"><button class="linkish small" type="button" data-del="${b.id}" data-paid="${b.deposit.paid ? 1 : 0}">Delete record</button><span class="bd-msg muted small" role="status"></span></p>
  </article>`;
}

function replace(b) { list = list.map((x) => (x.id === b.id ? b : x)); const el = $("#b-" + b.id); if (el) { el.outerHTML = card(b); wire(); } }
function msg(id, t) { const el = $("#b-" + id + " .bd-msg"); if (el) el.textContent = t; }

function wire() {
  const f = $("#newB");
  if (f && !f.wired) {
    f.wired = true;
    const split = () => { const v = Number(f.price.value); $("#split").textContent = v >= 100 ? `Deposit $${(Math.round(v * 50) / 100).toFixed(2)} CAD · Launch $${(v - Math.round(v * 50) / 100 + 25).toFixed(2)} CAD (other 50% + $25 first month) · then $25 CAD/month` : "Enter a price to see the 50/50 split."; };
    f.price.oninput = split;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const er = f.querySelector(".form-err"); er.hidden = true;
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      const { data } = await api("POST", { action: "create", ...Object.fromEntries(new FormData(f)) });
      btn.disabled = false;
      if (data.build) { list.unshift(data.build); draw(); $("#b-" + data.build.id).scrollIntoView({ behavior: "smooth" }); return; }
      er.textContent = data.error || "That didn't save."; er.hidden = false;
    };
  }
  root.querySelectorAll("[data-send]").forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    const { data } = await api("POST", { action: "send", id: b.dataset.id, kind: b.dataset.send });
    b.disabled = false;
    if (data.build) { replace(data.build); msg(data.build.id, "Email sent."); } else msg(b.dataset.id, data.error || "Didn't send.");
  }));
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; } catch { prompt("Copy this link:", b.dataset.copy); } }));
  root.querySelectorAll(".bd-prev").forEach((pf) => (pf.onsubmit = async (e) => {
    e.preventDefault();
    const { data } = await api("POST", { action: "update", id: pf.dataset.id, preview: pf.preview.value.trim() });
    if (data.build) { replace(data.build); msg(data.build.id, "Preview link saved."); } else msg(pf.dataset.id, data.error || "Didn't save.");
  }));
  root.querySelectorAll("[data-cancel],[data-keep]").forEach((b) => (b.onclick = async () => {
    const id = b.dataset.cancel || b.dataset.keep, cancel = !!b.dataset.cancel;
    if (cancel && !confirm("End this customer's hosting 30 days from today? They'll get an email with the end date.")) return;
    const { data } = await api("POST", { action: cancel ? "cancel" : "keep", id });
    if (data.build) replace(data.build); else msg(id, data.error || "Didn't change.");
  }));
  root.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    const paid = b.dataset.paid === "1";
    if (!confirm(paid ? "This build has payments. Delete the record anyway? Stripe keeps the payments and any hosting keeps charging." : "Delete this build record?")) return;
    const { data } = await api("POST", { action: "delete", id: b.dataset.del, confirm: paid });
    if (data.deleted) { list = list.filter((x) => x.id !== b.dataset.del); draw(); } else msg(b.dataset.del, data.error || "Didn't delete.");
  }));
}
