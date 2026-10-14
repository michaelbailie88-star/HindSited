// "Start your new website": a short guide the owner finishes alone, so Michael
// gets everything he needs in one email. No platform logins are asked for.
// Answers stay in this browser until Send; only the step is saved to the account.
import { registrarHelp, WANTS } from "./fix-guide.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#fix");
const id = (location.pathname.match(/^\/fix\/([a-f0-9-]{20,40})\/?$/i) || [])[1];
const KEY = "hs-new-site-" + id;
async function api(method, body) {
  try {
    const r = await fetch("/api/fix" + (method === "GET" ? "?report=" + encodeURIComponent(id) : ""), { method, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let d = {}; try { d = await r.json(); } catch {}
    return { status: r.status, data: d };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited. Check your connection." } }; }
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(about)); } catch {} };
const forget = () => { try { localStorage.removeItem(KEY); } catch {} };

let D, step, about, domain;
const ORDER = [["about", "Your business"], ["domain", "Web address"], ["send", "Send"]];

(async () => {
  if (!id) { root.innerHTML = `<p>This link isn't complete. Open it from your report.</p>`; return; }
  const { status, data } = await api("GET");
  if (status === 401) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Sign in to continue</h1><p>Your new-website request is linked to your account, so Michael knows who to reply to.</p><div class="fx-act"><a class="btn" href="/account?next=${encodeURIComponent(location.pathname)}">Sign in</a><a class="btn ghost" href="/account?mode=signup&next=${encodeURIComponent(location.pathname)}">Create a free account</a></div></div>`; return; }
  if (!data.report) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">We couldn't open this</h1><p>${esc(data.error || "Try again from your report.")}</p></div>`; return; }
  D = data;
  about = { name: D.name, business: D.business, phone: "", wants: [], note: "", ...load() };
  domain = D.progress.domain || "";
  step = D.progress.status === "sent" ? "done" : D.progress.step || "about";
  draw();
})();

function go(next) { step = next; api("POST", { report: id, action: "step", step: next, domain }); draw(); window.scrollTo({ top: root.offsetTop - 20, behavior: "smooth" }); }

function progressBar() {
  const at = step === "recover" ? 1 : step === "done" ? 3 : ORDER.findIndex(([k]) => k === step);
  return `<ol class="fx-prog" aria-label="Progress">${ORDER.map(([k, label], i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"${i === at ? ' aria-current="step"' : ""}><span>${i + 1}</span>${label}</li>`).join("")}</ol>`;
}
const stuckBox = (s) => `<div class="fx-stuck"><button class="linkish" type="button" data-stuck>I'm stuck on this step</button>
  <form class="fx-stuck-form" hidden novalidate><label>What happened? <span class="opt">(optional, but it helps)</span><textarea name="note" rows="3" maxlength="1500" placeholder="e.g. I don't know who registered our web address"></textarea></label>
  <button class="btn small-btn" type="submit">Tell Michael where I'm stuck</button><p class="form-err" role="alert" hidden></p></form></div>`;
const dateLong = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

function draw() {
  const R = D.report, dm = R.domain;
  let body = "";
  if (step === "about") {
    body = `<section class="fx-card"><p class="fx-k">Step 1</p><h2>About your business</h2>
      <form id="aboutForm" class="fx-form" novalidate>
        <label>Your name<input name="name" autocomplete="name" maxlength="80" required value="${esc(about.name)}"></label>
        <label>Business name<input name="business" autocomplete="organization" maxlength="120" required value="${esc(about.business)}"></label>
        <label><span>Phone <span class="opt">(optional)</span></span><input name="phone" type="tel" autocomplete="tel" maxlength="40" value="${esc(about.phone)}"></label>
        <fieldset class="fx-wants"><legend>What should your new site help you do? <span class="opt">(tick any)</span></legend>
          ${WANTS.map((w) => `<label class="check"><input type="checkbox" name="wants" value="${esc(w)}"${about.wants.includes(w) ? " checked" : ""}> ${esc(w)}</label>`).join("")}</fieldset>
        <label><span>Anything else? <span class="opt">(optional)</span></span><textarea name="note" rows="3" maxlength="2000" placeholder="Pages you want, things you like or dislike about your current site, a site you love">${esc(about.note)}</textarea></label>
        <p class="muted small">Your words, photos and logo can come from your current site, so there's nothing to gather now.</p>
        <p class="form-err" role="alert" hidden></p>
        <div class="fx-act"><button class="btn" type="submit">Next: your web address</button></div>
      </form></section>`;
  } else if (step === "domain") {
    body = `<section class="fx-card"><p class="fx-k">Step 2</p><h2>Your web address</h2>
      ${dm && dm.registrar ? `<p class="fx-big">Your web address <b class="one-line">${esc(dm.name)}</b> is registered with <b>${esc(dm.registrar)}</b>.</p>${dm.expires ? `<p class="muted">It renews on ${esc(dateLong(dm.expires))}.</p>` : ""}`
        : `<p class="fx-big">Your web address is registered with a domain company.</p><p class="muted">It's often GoDaddy, Namecheap, Squarespace or Wix. Search your email for "domain renewal" to find yours.</p>`}
      <p>Your new site keeps this address. When it's ready, you log in to that account and change two settings. Michael sends you the exact steps, and you never share a password with anyone.</p>
      <h3>Can you log in to your ${dm && dm.registrar ? esc(dm.registrar) : "domain"} account?</h3>
      <div class="fx-choices" role="radiogroup" aria-label="Domain account">
        <button type="button" class="fx-choice" data-d="yes" role="radio" aria-checked="false">Yes, I can log in</button>
        <button type="button" class="fx-choice" data-d="locked" role="radio" aria-checked="false">No, or I'm not sure</button>
        <button type="button" class="fx-choice" data-d="none" role="radio" aria-checked="false">I don't have my own web address</button></div>
      <div class="fx-act"><button class="linkish" type="button" id="back">← Back</button></div>${stuckBox("domain")}</section>`;
  } else if (step === "recover") {
    const rh = dm && registrarHelp(dm.registrar), emails = D.emails || [];
    body = `<section class="fx-card"><p class="fx-k">Step 2, continued</p><h2>Getting into your domain account</h2>
      <p>You don't need this sorted before you send your request, but it's the one thing only you can do, so it helps to start now.</p>
      <h3>Try Forgot password</h3>
      <p>${rh ? `On <a href="${esc(rh.url)}" target="_blank" rel="noopener">${esc(rh.name)} ↗</a>, use` : "On your domain company's log-in page, use"} <b>Forgot password</b> with each of these emails:</p>
      <ul class="fx-emails">${emails.map((e) => `<li><span class="one-line">${esc(e)}</span></li>`).join("")}<li class="muted">…and any other email your business has used, including old ones.</li></ul>
      <p class="fx-tip"><b>Tip:</b> whoever's card pays the yearly domain renewal is almost always the account owner. Look for a charge from ${dm && dm.registrar ? esc(dm.registrar) : "a domain company"} on your bank or card statement.</p>
      <h3>If someone else set it up</h3>
      <p>If a past web designer registered it under their own account, ask them to transfer the domain into an account in your name. If you can't reach them, domain companies can verify you as the owner. Have ready your business registration, an invoice or receipt, and photo ID.</p>
      <div class="fx-act"><button class="btn" type="button" id="gotIn">I got in</button><button class="btn ghost" type="button" id="skip">Send my request anyway</button><button class="linkish" type="button" id="back">← Back</button></div>
      ${stuckBox("recover")}</section>`;
  } else if (step === "send") {
    const dl = { yes: "You can log in to your domain account.", locked: "You're still getting into your domain account. Michael can help.", none: "You need a web address. Michael can help you choose one." }[domain] || "";
    body = `<section class="fx-card"><p class="fx-k">Step 3</p><h2>Send it to Michael</h2>
      <dl class="fx-sum"><dt>Business</dt><dd>${esc(about.business)}${about.name ? " · " + esc(about.name) : ""}</dd>
        <dt>Current site</dt><dd><span class="one-line">${esc(R.site)}</span> · score ${R.score}/100 · ${R.issues} issues</dd>
        <dt>Web address</dt><dd>${esc(dl)}</dd>
        <dt>Needs to</dt><dd>${about.wants.length ? esc(about.wants.join(", ")) : "Nothing ticked"}</dd>
        ${about.note ? `<dt>Notes</dt><dd class="fx-note">${esc(about.note)}</dd>` : ""}</dl>
      <p class="muted small">Michael gets your report and these answers by email, and replies to <span class="one-line">${esc(D.email)}</span>.</p>
      <p class="form-err" role="alert" hidden></p>
      <div class="fx-act"><button class="btn" type="button" id="send">Send my request</button><button class="linkish" type="button" id="back">← Back</button></div></section>`;
  } else {
    body = `<section class="fx-card fx-final"><p class="fx-k">All done</p><h2>Your request is in</h2>
      <p>Here's what happens next:</p>
      <ol class="fx-steps"><li>Michael emails you a quote with exactly what's included and the timing. No work starts and nothing is charged until you agree.</li><li>He builds your new site. Your current site stays up the whole time.</li><li>When it's ready, you change two settings in your domain account (he sends the steps) and your web address points to the new site.</li><li>Run a new scan and watch your score go up.</li></ol>
      <a class="btn" href="/r/${esc(id)}">Back to your report</a></section>`;
  }
  root.innerHTML = `<p class="eyebrow">New website</p><h1 class="fx-h">Start your new website</h1>
    <p class="fx-site"><span class="one-line">${esc(D.report.site)}</span> · score ${D.report.score}/100 · ${D.report.issues} issues · <a href="/r/${esc(id)}">view report</a></p>
    <p class="muted fx-lead">About 5 minutes. No cost to ask, and nothing is charged until you agree to a quote.</p>
    ${progressBar()}${body}`;
  wire();
}

function wire() {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  const af = $("#aboutForm");
  if (af) {
    const read = () => { about = { name: af.name.value.trim(), business: af.business.value.trim(), phone: af.phone.value.trim(), wants: [...af.querySelectorAll('input[name="wants"]:checked')].map((x) => x.value), note: af.note.value }; keep(); };
    af.oninput = read;
    af.onsubmit = (e) => {
      e.preventDefault(); read();
      const er = af.querySelector(".form-err");
      if (!about.name || !about.business) { er.textContent = "Add your name and business name."; er.hidden = false; return; }
      go("domain");
    };
  }
  root.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { domain = b.dataset.d; go(domain === "locked" ? "recover" : "send"); }));
  on("#gotIn", () => { domain = "yes"; go("send"); });
  on("#skip", () => { domain = "locked"; go("send"); });
  on("#back", () => go(step === "domain" ? "about" : step === "recover" ? "domain" : domain === "locked" ? "recover" : "domain"));
  on("#send", async (e) => {
    const er = root.querySelector(".form-err"); er.hidden = true;
    e.target.disabled = true;
    const { data } = await api("POST", { report: id, action: "send", domain, about });
    e.target.disabled = false;
    if (data.ok) { D.progress = data.progress; forget(); step = "done"; draw(); window.scrollTo({ top: 0 }); }
    else { er.textContent = data.error || "That didn't send. Try again."; er.hidden = false; }
  });
  root.querySelectorAll("[data-stuck]").forEach((b) => (b.onclick = () => { const f = b.nextElementSibling; f.hidden = !f.hidden; if (!f.hidden) f.querySelector("textarea").focus(); }));
  root.querySelectorAll(".fx-stuck-form").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); btn.disabled = true;
    const { data } = await api("POST", { report: id, action: "stuck", step, note: f.note.value, about });
    btn.disabled = false;
    if (data.ok) f.parentElement.innerHTML = `<p class="flash ok">Sent. Michael knows exactly where you're stuck and will email you.</p>`;
    else { const er = f.querySelector(".form-err"); er.textContent = data.error || "That didn't send."; er.hidden = false; }
  }));
}
