// "Get your website ready to be fixed": a step-by-step guide the owner can
// finish alone. Progress is saved; "I'm stuck" tells us exactly where.
import { PLATFORMS, PLATFORM_CHOICES, STUDIO_EMAIL, registrarHelp, platformKey } from "./fix-guide.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#fix");
const id = (location.pathname.match(/^\/fix\/([a-f0-9-]{20,40})\/?$/i) || [])[1];
const host = (u) => String(u || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
async function api(method, body) {
  try {
    const r = await fetch("/api/fix" + (method === "GET" ? "?report=" + encodeURIComponent(id) : ""), { method, credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    let d = {}; try { d = await r.json(); } catch {}
    return { status: r.status, data: d };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited. Check your connection." } }; }
}

let D, platform, step;
const ORDER = [["platform", "Where it lives"], ["login", "Log in"], ["invite", "Invite us"], ["done", "Done"]];

(async () => {
  if (!id) { root.innerHTML = `<p>This guide link isn't complete. Open it from your report.</p>`; return; }
  const { status, data } = await api("GET");
  if (status === 401) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Sign in to continue</h1><p>This guide is saved to your account.</p><a class="btn" href="/account?next=${encodeURIComponent(location.pathname)}">Sign in</a></div>`; return; }
  if (status === 402) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Fix It is part of the paid plans</h1><p>Subscribe and I'll fix the issues in your report for you, including setting up your reviews and an instant-quote button.</p><a class="btn" href="/pricing">See pricing</a></div>`; return; }
  if (!data.report) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">We couldn't open this guide</h1><p>${esc(data.error || "Try again from your report.")}</p></div>`; return; }
  D = data;
  platform = platformKey(D.progress.platform) || platformKey(D.report.platform);
  step = D.progress.status === "sent" ? "done" : D.progress.step || "platform";
  draw();
})();

function save(next, extra = {}) { step = next; api("POST", { report: id, action: "step", step: next, platform, ...extra }); draw(); window.scrollTo({ top: root.offsetTop - 20, behavior: "smooth" }); }

function progressBar() {
  const at = step === "recover" ? 1 : ORDER.findIndex(([k]) => k === step);
  return `<ol class="fx-prog" aria-label="Progress">${ORDER.map(([k, label], i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"${i === at ? ' aria-current="step"' : ""}><span>${i + 1}</span>${label}</li>`).join("")}</ol>`;
}
const stuckBox = (s) => `<div class="fx-stuck"><button class="linkish" type="button" data-stuck>I'm stuck on this step</button>
  <form class="fx-stuck-form" hidden novalidate><label>What happened? <span class="opt">(optional, but it helps)</span><textarea name="note" rows="3" maxlength="1500" placeholder="e.g. I don't see Roles & Permissions in my settings"></textarea></label>
  <button class="btn small-btn" type="submit">Tell Michael where I'm stuck</button><p class="form-err" role="alert" hidden></p></form></div>`;

function draw() {
  const R = D.report, P = platform ? PLATFORMS[platform] : null;
  let body = "";
  if (step === "platform") {
    body = `<section class="fx-card"><p class="fx-k">Step 1</p><h2>Where your website lives</h2>
      ${P && platform !== "Other" ? `<p class="fx-big">Your website is built on <b>${esc(platform)}</b>.</p><p class="muted">We worked this out from your scan. Not right? Pick the correct one below.</p>` : `<p>We couldn't tell what your website is built on from the scan. Here's how to find out:</p>
        <ul class="ticks"><li>Search your email for <b>Wix</b>, <b>Squarespace</b>, <b>Shopify</b>, <b>WordPress</b>, <b>GoDaddy</b> or <b>Webflow</b>.</li><li>Check your bank or card statements for a monthly website charge. Whoever charges you is where your site lives.</li><li>Look at the very bottom of your own website for "Powered by…".</li></ul>`}
      <div class="fx-choices" role="radiogroup" aria-label="Your website platform">${PLATFORM_CHOICES.map((p) => `<button type="button" class="fx-choice${p === platform ? " on" : ""}" data-p="${esc(p)}" role="radio" aria-checked="${p === platform}">${p === "Other" ? "Something else / I don't know" : esc(p)}</button>`).join("")}</div>
      <div class="fx-act"><button class="btn" type="button" id="next"${platform ? "" : " disabled"}>Next: log in</button></div>${stuckBox("platform")}</section>`;
  } else if (step === "login") {
    const emails = D.emails || [];
    body = `<section class="fx-card"><p class="fx-k">Step 2</p><h2>Log in to ${esc(platform === "Other" ? "your website" : platform)}</h2>
      ${P.login ? `<p><a class="btn ghost small-btn" href="${esc(P.login)}" target="_blank" rel="noopener">Open ${esc(host(P.login))} ↗</a> and click <b>Log in</b>.</p>` : platform === "WordPress" ? `<p>Open <a href="https://${esc(R.site)}/wp-admin" target="_blank" rel="noopener">${esc(R.site)}/wp-admin ↗</a>.</p>` : ""}
      <p><b>Don't know the password?</b> Use <b>Forgot password</b> with each of these emails:</p>
      <ul class="fx-emails">${emails.map((e) => `<li><span class="one-line">${esc(e)}</span></li>`).join("")}<li class="muted">…and any other email your business has used, including old ones.</li></ul>
      <ol class="fx-steps">${P.forgot.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      <p class="fx-tip"><b>Tip:</b> whoever's card pays the monthly website bill is almost always the account owner. ${esc(P.findIt)}</p>
      <div class="fx-act"><button class="btn" type="button" id="in">I'm logged in</button><button class="btn ghost" type="button" id="cant">I can't get in</button><button class="linkish" type="button" id="back">← Back</button></div>${stuckBox("login")}</section>`;
  } else if (step === "recover") {
    const dm = R.domain, rh = dm && registrarHelp(dm.registrar);
    body = `<section class="fx-card"><p class="fx-k">Step 2, continued</p><h2>Getting back into your website</h2>
      ${P.forgotEmail ? `<h3>Forgot which email you used?</h3><p>${esc(P.forgotEmail)}</p>` : ""}
      <h3>If someone else set it up</h3><p>${esc(P.owner)}</p>
      ${P.ownerHelp || P.recoverHelp ? `<p><a href="${esc(P.ownerHelp || P.recoverHelp)}" target="_blank" rel="noopener">${esc(platform === "Other" ? "Help" : platform + " help")} ↗</a></p>` : ""}
      <h3>Your domain is the key</h3>
      ${dm && dm.registrar ? `<p>Your web address <b class="one-line">${esc(dm.name)}</b> is registered with <b>${esc(dm.registrar)}</b>${dm.expires ? `, and renews on ${esc(new Date(dm.expires).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }))}` : ""}. Whoever controls this account controls where your website points, even if the old site can't be recovered.</p>
        <p>Recover that account with your email or phone ${rh ? `on <a href="${esc(rh.url)}" target="_blank" rel="noopener">${esc(rh.name)}'s help pages ↗</a>` : `through ${esc(dm.registrar)}'s website`}. Registrars can also verify you with ID if you've lost both.</p>`
        : `<p>Your web address is registered with a domain company (often GoDaddy, Namecheap, Squarespace or Wix). Search your email for "domain renewal" to find which one, then use its Forgot password page.</p>`}
      <h3>Ask the platform for help</h3><p>Platforms can sometimes move a site to the real business owner. Have ready: your business registration, an invoice or receipt for the website, and photo ID.</p>
      <div class="fx-act"><button class="btn" type="button" id="in">I got in</button><button class="linkish" type="button" id="back">← Back</button></div>
      ${stuckBox("recover")}
      <div class="fx-dead"><h3>Can't get access at all?</h3><p>Then your website isn't really in your control: if something breaks, nobody can fix it. A brand-new site that <b>you</b> own fixes that for good, and your web address can be moved over to it.</p>
        <button class="btn ghost small-btn" type="button" id="noaccess">I can't get access: tell me about a new site</button></div></section>`;
  } else if (step === "invite") {
    body = `<section class="fx-card"><p class="fx-k">Step 3</p><h2>Invite us to your ${esc(platform === "Other" ? "website" : platform)} site</h2>
      <p>This is the only step that touches your site. You never share your password, and you can remove us any time.</p>
      <ol class="fx-steps">${P.invite.map((x) => `<li>${esc(x).replace(esc(STUDIO_EMAIL), `<b class="fx-mail">${esc(STUDIO_EMAIL)}</b> <button class="linkish fx-copy" type="button" data-copy="${esc(STUDIO_EMAIL)}">Copy</button>`)}</li>`).join("")}</ol>
      ${P.note ? `<p class="fx-tip">${esc(P.note)}</p>` : ""}
      ${P.inviteHelp ? `<p class="muted small">${esc(platform)}'s own instructions: <a href="${esc(P.inviteHelp)}" target="_blank" rel="noopener">help page ↗</a></p>` : ""}
      <form id="doneForm" class="fx-done-form" novalidate>
        ${P.needsCode ? `<label>Your 4-digit collaborator request code<input name="code" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="1234" required></label>` : ""}
        <label>Anything I should know? <span class="opt">(optional)</span><textarea name="note" rows="2" maxlength="1500"></textarea></label>
        <label class="check"><input type="checkbox" name="sent" required> ${P.needsCode ? "I've copied my code above" : `I've sent the invite to ${esc(STUDIO_EMAIL)}`}</label>
        <p class="form-err" role="alert" hidden></p>
        <div class="fx-act"><button class="btn" type="submit">Done: send it to Michael</button><button class="linkish" type="button" id="back">← Back</button></div>
      </form>${stuckBox("invite")}</section>`;
  } else {
    body = D.progress.status === "noaccess" ? `<section class="fx-card fx-final"><h2>Thanks, we've got it</h2><p>Michael will email you about a brand-new website you'll fully own, with your web address moved over. There's no cost to ask.</p><a class="btn ghost" href="/r/${esc(id)}">Back to your report</a></section>`
      : `<section class="fx-card fx-final"><p class="fx-k">All done</p><h2>Your website is ready to be fixed</h2>
      <p>Michael has your report, your platform and your invite${platform === "Shopify" ? " code" : ""}. Here's what happens next:</p>
      <ol class="fx-steps"><li>He'll email you to confirm exactly what's included and the timing. No work starts before you agree.</li><li>He fixes the issues in your report, including your reviews and quote button.</li><li>You re-run your scan and watch your score go up.</li><li>Remove our access any time, from the same place you sent the invite.</li></ol>
      <a class="btn" href="/r/${esc(id)}">Back to your report</a></section>`;
  }
  root.innerHTML = `<p class="eyebrow">Fix It</p><h1 class="fx-h">Get your website ready to be fixed</h1>
    <p class="fx-site"><span class="one-line">${esc(R.site)}</span> · score ${R.score}/100 · ${R.issues} issues · <a href="/r/${esc(id)}">view report</a></p>
    <p class="muted fx-lead">About 10 minutes. Your progress is saved, so you can stop and come back.</p>
    ${progressBar()}${body}`;
  wire();
}

function wire() {
  root.querySelectorAll(".fx-choice").forEach((b) => (b.onclick = () => { platform = b.dataset.p; draw(); }));
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on("#next", () => save("login"));
  on("#in", () => save("invite"));
  on("#cant", () => save("recover"));
  on("#back", () => save(step === "invite" ? "login" : step === "recover" ? "login" : "platform"));
  on("#noaccess", async (e) => {
    e.target.disabled = true;
    const { data } = await api("POST", { report: id, action: "noaccess", platform });
    if (data.ok) { D.progress = data.progress; step = "done"; draw(); } else { e.target.disabled = false; alert(data.error || "That didn't send."); }
  });
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; } catch { b.textContent = "Select and copy"; } }));
  root.querySelectorAll("[data-stuck]").forEach((b) => (b.onclick = () => { const f = b.nextElementSibling; f.hidden = !f.hidden; if (!f.hidden) f.querySelector("textarea").focus(); }));
  root.querySelectorAll(".fx-stuck-form").forEach((f) => (f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); btn.disabled = true;
    const { data } = await api("POST", { report: id, action: "stuck", step, platform, note: f.note.value });
    btn.disabled = false;
    if (data.ok) f.parentElement.innerHTML = `<p class="flash ok">Sent. Michael knows exactly where you're stuck and will email you.</p>`;
    else { const er = f.querySelector(".form-err"); er.textContent = data.error || "That didn't send."; er.hidden = false; }
  }));
  const df = $("#doneForm");
  if (df) df.onsubmit = async (e) => {
    e.preventDefault();
    const er = df.querySelector(".form-err"); er.hidden = true;
    const code = df.code ? df.code.value.trim() : "";
    if (df.code && !/^\d{4}$/.test(code)) { er.textContent = "Enter the 4-digit code from Settings, Users, Security."; er.hidden = false; return; }
    if (!df.sent.checked) { er.textContent = df.code ? "Tick the box once you've copied your code." : "Tick the box once you've sent the invite."; er.hidden = false; return; }
    const btn = df.querySelector("button[type=submit]"); btn.disabled = true;
    const { data } = await api("POST", { report: id, action: "done", platform, code, note: df.note.value });
    btn.disabled = false;
    if (data.ok) { D.progress = data.progress; step = "done"; draw(); window.scrollTo({ top: 0 }); }
    else { er.textContent = data.error || "That didn't send. Try again."; er.hidden = false; }
  };
}
