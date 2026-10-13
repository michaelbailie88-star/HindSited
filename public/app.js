import { buildReport, CATEGORIES } from "./rules.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const API = window.HS_API || "/api";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const form = $("#scanForm"), input = $("#url"), go = $("#go"), errEl = $("#formErr");
let me = { signedIn: false };

function cleanInput(v) {
  v = v.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { const u = new URL(v); if (!/\./.test(u.hostname)) return null; return u.href; } catch { return null; }
}
async function api(path, opts = {}) {
  try {
    const r = await fetch(API + path, { cache: "no-store", credentials: "same-origin", ...opts, headers: { "content-type": "application/json", ...(opts.headers || {}) } });
    let data = {}; try { data = await r.json(); } catch {}
    if (r.status === 429) data.error = data.error || "You're going a little fast. Wait a minute and try again.";
    return { status: r.status, data };
  } catch { return { status: 0, data: { error: "Couldn't reach HindSited. Check your connection." } }; }
}

function step(name, state, note) {
  const li = document.querySelector(`[data-step="${name}"]`);
  if (!li) return;
  li.classList.remove("active", "done", "skipped");
  if (state) li.classList.add(state);
  if (note) { const s = li.querySelector("small"); if (s) s.textContent = note; }
}

// ---------------------------------------------------------------- views
function view(name) {
  for (const id of ["hero", "checks", "progress", "report", "panel"]) { const el = $("#" + id); if (el) el.hidden = true; }
  if (name === "home") { $("#hero").hidden = false; $("#checks").hidden = false; }
  else $("#" + name).hidden = false;
  window.scrollTo({ top: 0 });
}
function panel(html) { const p = $("#panel"); p.innerHTML = `<div class="wrap narrow">${html}</div>`; view("panel"); return p; }

function renderAccount() {
  const a = $("#account");
  if (!a) return;
  if (!me.signedIn) { a.innerHTML = ""; return; }
  a.innerHTML = `<span class="acct-email">${esc(me.email)}</span><button type="button" class="linkish" id="myReports">My account</button><button type="button" class="linkish" id="signOut">Sign out</button>`;
  $("#signOut").onclick = async () => { await api("/me", { method: "POST" }); me = { signedIn: false }; renderAccount(); goHome(); };
  $("#myReports").onclick = showMyReports;
}

function goHome() { history.pushState({}, "", "/"); view("home"); go.disabled = false; input.focus(); }

// ---------------------------------------------------------------- start
form.addEventListener("submit", (e) => {
  e.preventDefault();
  errEl.hidden = true;
  const url = cleanInput(input.value);
  if (!url) { errEl.textContent = "Enter your website address, like yourbusiness.com."; errEl.hidden = false; input.focus(); return; }
  startScan(url);
});

async function startScan(url) {
  go.disabled = true;
  if (!me.signedIn) { showSignIn(url); go.disabled = false; return; }
  const { status, data } = await api("/scan", { method: "POST", body: JSON.stringify({ url }) });
  go.disabled = false;
  if (status === 401) { me = { signedIn: false }; renderAccount(); showSignIn(url); return; }
  if (status === 402 && data.paywall) { showPaywall(data, url); return; }
  if (!data.id) { showError(data.error || "Couldn't start the check. Try again in a minute."); return; }
  history.pushState({}, "", "/r/" + data.id);
  followReport(data.id, url);
}

function showSignIn(url, note) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const p = panel(`<div class="card-panel">
    <p class="eyebrow">One quick step</p>
    <h2 class="panel-h">Where should we send your report?</h2>
    <p>We'll email you a link to sign in. It also means your free check of <b>${esc(host)}</b> is saved to you, so you can come back to it any time.</p>
    ${note ? `<p class="form-err">${esc(note)}</p>` : ""}
    <form id="signinForm" class="stack" novalidate>
      <label class="sr" for="email">Email address</label>
      <div class="field"><input id="email" type="email" autocomplete="email" placeholder="you@yourbusiness.com" required><button type="submit">Send my link</button></div>
      <p class="form-err" id="siErr" role="alert" hidden></p>
    </form>
    <p class="muted small">No password. No spam. Just the link.</p>
    <button type="button" class="linkish" id="siBack">\u2190 Check a different site</button>
  </div>`);
  $("#siBack").onclick = goHome;
  $("#email").focus();
  $("#signinForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim();
    const btn = p.querySelector("button[type=submit]");
    btn.disabled = true;
    const { status, data } = await api("/auth/start", { method: "POST", body: JSON.stringify({ email, next: "/?scan=" + encodeURIComponent(url) }) });
    btn.disabled = false;
    if (status !== 200 || !data.sent) { const er = $("#siErr"); er.textContent = data.error || "Something went wrong. Try again."; er.hidden = false; return; }
    panel(`<div class="card-panel"><p class="eyebrow">Check your inbox</p><h2 class="panel-h">We sent a link to ${esc(email)}</h2>
      <p>Tap it to sign in. Your check of <b>${esc(host)}</b> starts as soon as you do.</p>
      <p class="muted small">It can take a minute to arrive. Check your spam or promotions folder too. The link works once and expires in 20 minutes.</p>
      <button type="button" class="linkish" id="siBack2">\u2190 Use a different email</button></div>`);
    $("#siBack2").onclick = () => showSignIn(url);
  };
}

const PRICES = {
  solo: { name: "Solo", for: "One business", month: 19, once: 299, perks: ["All three tools", "30 website checks a month", "Review Booster kit and Quote Calculator"] },
  agency: { name: "Agency", for: "Up to 10 businesses", month: 79, once: 999, perks: ["Everything in Solo, for 10 businesses", "300 website checks a month", "Reports and PDFs with your own logo", "Add more businesses for $6/month each"] }
};
function showPaywall(d, url) {
  const host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  const why = {
    "free-used": `You've already used your free check${d.site ? " (on <b>" + esc(d.site) + "</b>)" : ""}.`,
    "site-used": `<b>${esc(d.site || host)}</b> has already had its free check.`,
    "business-limit": `Your plan covers ${d.allowed} business${d.allowed === 1 ? "" : "es"} and they're all in use.`,
    "scan-limit": `You've used all ${d.allowed} checks included this month.`,
    "upgrade": "Pick the plan that fits."
  }[d.reason] || "You've reached the limit of your free check.";
  const card = (k) => { const p = PRICES[k]; return `<div class="plan${k === "solo" ? " plan-main" : ""}"><h3>${p.name}</h3><p class="muted">${p.for}</p>
    <p class="price"><b>$${p.month}</b>/month</p><p class="muted small">or $${p.once} once for lifetime access</p>
    <ul>${p.perks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <button class="btn" data-plan="${k}" data-int="month">Start ${p.name} monthly</button>
    <button class="btn ghost" data-plan="${k}" data-int="once">Pay once, $${p.once}</button></div>`; };
  const p = panel(`<div class="card-panel wide">
    <p class="eyebrow">Keep going</p><h2 class="panel-h">${why}</h2>
    <p>Check your site every time you change it, and get the Review Booster and Quote Calculator too.</p>
    ${d.report ? `<p><a href="/r/${esc(d.report)}" class="linkish">See your free report again \u2192</a></p>` : ""}
    <div class="plans">${card("solo")}${card("agency")}</div>
    <p class="muted small">Prices in USD. Cancel monthly plans any time.</p>
    <p class="form-err" id="payErr" role="alert" hidden></p>
    <button type="button" class="linkish" id="pwBack">\u2190 Back</button></div>`);
  $("#pwBack").onclick = goHome;
  p.querySelectorAll("[data-plan]").forEach((b) => (b.onclick = () => checkout(b.dataset.plan, b.dataset.int)));
}
async function checkout(plan, interval) {
  const { status, data } = await api("/checkout", { method: "POST", body: JSON.stringify({ plan, interval }) });
  if (status === 401) { me = { signedIn: false }; renderAccount(); const er = $("#payErr"); if (er) { er.textContent = "Your sign-in expired. Check a site again to get a new sign-in link."; er.hidden = false; } return; }
  if (data.url) { location.href = data.url; return; }
  const er = $("#payErr"); if (er) { er.textContent = data.error || "Checkout isn't available yet."; er.hidden = false; }
}

async function showMyReports(flash) {
  const { data } = await api("/me");
  if (!data.signedIn) { me = { signedIn: false }; renderAccount(); goHome(); return; }
  me = data; renderAccount();
  const rows = (data.reports || []).map((r) => `<li><a href="/r/${esc(r.id)}">${esc(r.site || r.url)}</a><span class="muted small">${esc(new Date(r.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }))}</span></li>`).join("");
  if (location.pathname !== "/account") history.pushState({}, "", "/account");
  const paid = data.plan !== "free";
  const planLine = `Plan: <b>${esc(data.planLabel || "Free")}</b>${data.lifetime ? " (lifetime)" : data.monthly && data.monthly.length ? " (monthly)" : ""}` +
    (data.scansAllowed ? ` \u00b7 ${data.scansUsed} of ${data.scansAllowed} checks used this month` : "") +
    (paid && data.businessesAllowed ? ` \u00b7 ${data.businesses.length} of ${data.businessesAllowed} business${data.businessesAllowed === 1 ? "" : "es"}` : "");
  const brand = data.brand || {};
  const p = panel(`<div class="card-panel wide">
    ${flash ? `<p class="flash ${flash.ok ? "ok" : ""}">${esc(flash.text)}</p>` : ""}
    <p class="eyebrow">Your account</p><h2 class="panel-h">${esc(data.email || "")}</h2>
    <p>${planLine}</p>
    <div class="acct-actions">
      ${!paid ? `<button class="btn" id="upgrade">See plans</button>` : ""}
      ${data.plan === "agency" ? `<button class="btn ghost" id="addBiz">Add a business ($6/month)</button>` : ""}
      ${data.hasBilling ? `<button class="btn ghost" id="billing">Billing, invoices and cancelling</button>` : ""}
    </div>
    ${paid && data.businesses.length ? `<p class="muted small">Businesses on your plan: ${data.businesses.map(esc).join(", ")}</p>` : ""}
    ${data.whiteLabel ? `<h3 class="sub-h">Your branding on reports</h3>
      <p class="muted small">Your name and logo replace HindSited on reports and PDFs you share with clients.</p>
      <form id="brandForm" class="brand-form">
        <label>Business name<input id="bName" maxlength="60" value="${esc(brand.name || "")}" placeholder="Your agency name"></label>
        <label>Website (optional)<input id="bSite" maxlength="120" value="${esc(brand.site || "")}" placeholder="https://youragency.com"></label>
        <label>Logo (PNG, JPG or WebP, under 200 KB)<input id="bLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>
        ${brand.logo ? `<div class="brand-prev"><img src="${esc(brand.logo)}" alt="Your logo"><button type="button" class="linkish" id="bRemove">Remove logo</button></div>` : ""}
        <button class="btn" type="submit">Save branding</button><span class="tool-note" id="bNote" role="status"></span>
      </form>` : ""}
    <h3 class="sub-h">Your reports</h3>${rows ? `<ul class="report-list">${rows}</ul>` : `<p class="muted">No reports yet.</p>`}
    <p class="form-err" id="acErr" role="alert" hidden></p>
    <button type="button" class="linkish" id="acBack">\u2190 Check a site</button></div>`);
  $("#acBack").onclick = goHome;
  const showErr = (m) => { const e = $("#acErr"); e.textContent = m; e.hidden = false; };
  if ($("#upgrade")) $("#upgrade").onclick = () => showPaywall({ reason: "upgrade" });
  if ($("#addBiz")) $("#addBiz").onclick = async () => { const r = await api("/checkout", { method: "POST", body: JSON.stringify({ plan: "extra", interval: "month" }) }); if (r.data.url) location.href = r.data.url; else showErr(r.data.error || "Couldn't start checkout."); };
  if ($("#billing")) $("#billing").onclick = async () => { const r = await api("/billing", { method: "POST" }); if (r.data.url) location.href = r.data.url; else showErr(r.data.error || "Billing couldn't open."); };
  const bf = $("#brandForm");
  if (bf) {
    let logo;
    if ($("#bRemove")) $("#bRemove").onclick = () => { logo = null; $(".brand-prev").remove(); };
    bf.onsubmit = async (e) => {
      e.preventDefault();
      const f = $("#bLogo").files[0];
      if (f) {
        if (f.size > 200 * 1024) { $("#bNote").textContent = "That logo is over 200 KB."; return; }
        logo = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      }
      const r = await api("/brand", { method: "POST", body: JSON.stringify({ name: $("#bName").value, site: $("#bSite").value, ...(logo !== undefined ? { logo } : {}) }) });
      $("#bNote").textContent = r.data.brand ? "Saved. New reports will use your branding." : r.data.error || "Couldn't save.";
    };
  }
}

// ---------------------------------------------------------------- progress
async function followReport(id, url) {
  view("progress");
  $("#progHost").textContent = url ? new URL(url).hostname.replace(/^www\./, "") : "your site";
  ["render", "click", "pages", "links", "speed"].forEach((s) => step(s, null));
  step("render", "active");
  const deadline = Date.now() + 6 * 60 * 1000;
  let data = null, misses = 0, lastCount = -1, lastChange = Date.now(), first = true;
  while (Date.now() < deadline) {
    if (!first) await sleep(2500);
    first = false;
    const r = await api("/report?id=" + encodeURIComponent(id));
    if (r.status === 404) { showError("We couldn't find that report. It may have been mistyped."); return; }
    if (r.status !== 200) { if (++misses > 8) { showError("Lost touch with HindSited. Check your connection and try again."); return; } continue; }
    data = r.data;
    if (!url && data.url) $("#progHost").textContent = new URL(data.url).hostname.replace(/^www\./, "");
    if (data.state === "error") { showError(data.error || "Something went wrong checking the site."); return; }
    if (data.state === "done" && data.scan) break;
    const n = (data.stages || []).length;
    if (n !== lastCount) { lastCount = n; lastChange = Date.now(); }
    // no progress for 3 minutes means the check died on the server
    else if (Date.now() - lastChange > 180000) { showError("The check stopped before it finished. Please try again. If it keeps happening, the site may be blocking automated visitors."); return; }
    showStages(data.stages || []);
  }
  if (!data || data.state !== "done" || !data.scan) { showError("The check took too long. The site may be very slow. Try again in a few minutes."); return; }
  const scan = data.scan;
  const report = buildReport(scan);
  await showReport(report, scan, { id, mine: data.mine, createdAt: data.createdAt || data.at, brand: data.brand || null });
}

function showStages(stages) {
  const has = (p) => stages.some((s) => s.startsWith(p));
  if (has("render:clicked") || has("rendered")) { step("render", "done"); step("click", "done"); }
  else if (has("render:audited")) { step("render", "done"); step("click", "active"); }
  if (has("rendered")) step("pages", "active");
  if (has("pages")) { step("pages", "done"); step("links", "active"); }
  if (has("links")) { step("links", "done"); step("speed", "active"); }
}

function showError(msg) {
  panel(`<div class="err-box"><h3>We couldn't check that site</h3><p>${esc(msg)}</p><button class="btn" id="tryAgain">Try another address</button></div>`);
  $("#tryAgain").onclick = goHome;
  go.disabled = false;
}

// ---------------------------------------------------------------- routing
async function route() {
  const path = location.pathname;
  const m = path.match(/^\/r\/([a-f0-9-]{20,40})\/?$/i);
  if (m) { followReport(m[1]); return; }
  if (path === "/account") {
    const q0 = new URLSearchParams(location.search);
    const c = q0.get("checkout");
    const flash = c === "success" ? { ok: true, text: "Payment received. Your plan is active. Thank you!" } : c === "cancelled" ? { text: "Checkout was cancelled. You haven't been charged." } : c === "pending" ? { text: "Your payment is still processing. Refresh this page in a minute." } : c === "error" ? { text: "We couldn't confirm that payment. If you were charged, email thelazycreatorco@gmail.com and we'll sort it out." } : null;
    if (c) history.replaceState({}, "", "/account");
    if (me.signedIn) { showMyReports(flash); return; }
  }
  const q = new URLSearchParams(location.search);
  if (q.get("signin") === "expired") { history.replaceState({}, "", "/"); view("home"); errEl.textContent = "That sign-in link has expired or was already used. Enter your site again to get a new one."; errEl.hidden = false; return; }
  const pending = q.get("scan");
  if (pending && cleanInput(pending)) { history.replaceState({}, "", "/"); input.value = pending.replace(/^https?:\/\//, ""); startScan(cleanInput(pending)); return; }
  view("home");
}
window.addEventListener("popstate", route);
(async () => {
  const r = await api("/me");
  me = r.data && r.data.signedIn ? r.data : { signedIn: false };
  renderAccount();
  route();
})();

// ---------------------------------------------------------------- report
let shotImg = null;
function loadImg(src) { return new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

// The phone screenshot arrives as screen-sized pieces; join them into one tall image.
async function phoneImage(shot) {
  if (!shot) return null;
  const tiles = shot.tiles && shot.tiles.length ? shot.tiles : [{ y: 0, h: shot.h, data: shot.data }];
  const imgs = await Promise.all(tiles.map((t) => loadImg(t.data)));
  if (imgs.some((i) => !i)) return null;
  const c = document.createElement("canvas");
  c.width = shot.w || imgs[0].naturalWidth;
  c.height = shot.h;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  tiles.forEach((t, i) => g.drawImage(imgs[i], 0, t.y, c.width, t.h));
  return c;
}

function cropCanvas(rect, frame) {
  if (!shotImg || !rect) return null;
  const W = shotImg.width, H = shotImg.height;
  if (rect.y > H - 4 || rect.x > W) return null;
  const winH = Math.min(H, Math.max(300, Math.min(520, rect.h + 220)));
  let top = Math.round(rect.y + rect.h / 2 - winH / 2);
  top = Math.max(0, Math.min(H - winH, top));
  const c = document.createElement("canvas");
  const scale = 2;
  c.width = W * scale; c.height = winH * scale;
  const g = c.getContext("2d");
  g.scale(scale, scale);
  g.drawImage(shotImg, 0, top, W, winH, 0, 0, W, winH);
  const pad = 6;
  const x = Math.max(2, rect.x - pad), y = Math.max(2, rect.y - top - pad);
  const w = Math.min(W - x - 2, rect.w + pad * 2), h = Math.min(winH - y - 2, rect.h + pad * 2);
  if (!frame) {
    g.fillStyle = "rgba(20,22,27,0.42)";
    g.beginPath(); g.rect(0, 0, W, winH); roundRect(g, x, y, w, h, 8); g.fill("evenodd");
  }
  g.strokeStyle = "#e5461d"; g.lineWidth = 3;
  g.beginPath(); roundRect(g, x, y, w, h, 8); g.stroke();
  c.setAttribute("role", "img");
  return c;
}
function roundRect(g, x, y, w, h, r) { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

const sevClass = (s) => (s === "Fix now" ? "now" : s === "Fix soon" ? "soon" : "worth");
const pagePath = (u) => { try { const x = new URL(u); return x.pathname === "/" ? "Homepage" : decodeURIComponent(x.pathname); } catch { return ""; } };

function evidenceList(f, max = 4) {
  const items = f.items.slice(0, max);
  if (!items.length) return "";
  const li = items.map((i) => `<li>${esc(i.evidence)}${i.page ? `<span class="pg">on <a href="${esc(i.page)}" target="_blank" rel="noopener nofollow">${esc(pagePath(i.page))}</a></span>` : ""}</li>`).join("");
  const more = f.items.length > max ? `<p class="more-ev">+ ${f.items.length - max} more</p>` : "";
  return `<ul class="evidence">${li}</ul>${more}`;
}

function serpBlock(report, scan) {
  const a = scan.render.audit;
  const host = new URL(scan.render.finalUrl).hostname.replace(/^www\./, "");
  return `<p class="serp-cap">Roughly how Google shows you now</p><div class="serp"><div class="s-url">${esc(host)}</div><div class="s-title">${esc(a.title || host)}</div><div class="s-desc ${a.desc ? "" : "missing"}">${esc(a.desc || "No description: Google picks some text from your page instead.")}</div></div>`;
}

async function showReport(report, scan, meta = {}) {
  shotImg = await phoneImage(scan.render.shots && scan.render.shots.mobile);
  const host = new URL(scan.render.finalUrl).hostname.replace(/^www\./, "");
  const nowN = report.findings.filter((f) => f.severity === "Fix now").length;
  const soonN = report.findings.filter((f) => f.severity === "Fix soon").length;
  const worthN = report.findings.length - nowN - soonN;
  const dialColor = report.score >= 90 ? "#1d7347" : report.score >= 75 ? "#b86b00" : "#e5461d";
  const C = 2 * Math.PI * 70;
  const ms = scan.render.shots && scan.render.shots.mobile, ds = scan.render.shots && scan.render.shots.desktop;

  let html = `<div class="wrap">
  <div class="rep-tools no-print"><button type="button" class="tool" id="copyLink">Copy share link</button><button type="button" class="tool" id="savePdf">Download PDF</button><span class="tool-note" id="toolNote" role="status"></span></div>
  <div class="rep-head">
    <div class="dial" role="img" aria-label="Score ${report.score} out of 100">
      <svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" fill="none" stroke="#e1dccf" stroke-width="12"/><circle cx="80" cy="80" r="70" fill="none" stroke="${dialColor}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - report.score / 100)}"/></svg>
      <div class="num"><div><b>${report.score}</b><small>out of 100</small></div></div>
    </div>
    <div class="rep-title">
      ${meta.brand ? `<div class="brand-mark-rep">${meta.brand.logo ? `<img src="${esc(meta.brand.logo)}" alt="${esc(meta.brand.name)}">` : ""}<span>Website report by ${esc(meta.brand.name)}</span></div>` : `<p class="eyebrow">Your HindSited report</p>`}
      <h2>${esc(host)}: ${esc(report.grade.label)}</h2>
      <p>${esc(report.grade.note)}</p>
      <div class="tally">${nowN ? `<span class="chip now">${nowN} fix now</span>` : ""}${soonN ? `<span class="chip soon">${soonN} fix soon</span>` : ""}${worthN ? `<span class="chip">${worthN} worth fixing</span>` : ""}<span class="chip ok">${report.passed.length} checks passed</span></div>
      <p class="rep-meta">${report.pagesChecked} page${report.pagesChecked === 1 ? "" : "s"} read · ${report.linksChecked} links and images followed${report.platform ? " · built with " + esc(report.platform) : ""} · ${new Date(meta.createdAt || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
    </div>
    <div class="devices" aria-hidden="true">${ms ? `<div class="dev-phone"><img src="${ms.data}" alt=""></div>` : ""}${ds ? `<div class="dev-desk"><img src="${ds.data}" alt=""></div>` : ""}</div>
  </div>`;

  if (report.top.length) {
    html += `<div class="rep-sec"><h3>Your top ${report.top.length === 1 ? "fix" : report.top.length + " fixes"}</h3><p class="sub">Ranked by how much each one is likely costing you. Highlights show exactly where it is on your page, as a phone sees it.</p><div id="topFixes"></div></div>`;
  } else {
    html += `<div class="rep-sec"><h3>Nothing serious found</h3><p class="sub">Your site passed every check we ran. That's rare. Nice work.</p></div>`;
  }

  // all findings by category
  const byCat = {};
  for (const f of report.findings) (byCat[f.cat] = byCat[f.cat] || []).push(f);
  if (report.findings.length > report.top.length) {
    html += `<div class="rep-sec"><h3>Everything we found</h3><p class="sub">${report.findings.length} issues in total, grouped by what they affect.</p>`;
    for (const [k, label] of Object.entries(CATEGORIES)) {
      const list = byCat[k];
      if (!list) continue;
      html += `<details class="cat"${k === report.findings[0]?.cat ? " open" : ""}><summary>${esc(label)}<span class="cat-count">${list.length} issue${list.length === 1 ? "" : "s"}</span></summary><div class="cat-body">` +
        list.map((f) => `<div class="mini"><h5><span class="sev ${sevClass(f.severity)}">${f.severity}</span>${esc(f.title)}</h5><p>${esc(f.why)}</p><p><b>Fix:</b> ${esc(f.fix)}</p>${evidenceList(f, 3)}</div>`).join("") + `</div></details>`;
    }
    html += `</div>`;
  }

  // speed
  const sp = scan.speed;
  html += `<div class="rep-sec"><h3>Google speed test</h3><p class="sub">Scores straight from Google PageSpeed Insights, which runs the same test Google uses.</p><div class="speed-grid">${gauge("On a phone", sp.mobile)}${gauge("On a computer", sp.desktop)}</div></div>`;

  // passed
  if (report.passed.length) {
    html += `<div class="rep-sec"><h3>What's working</h3><p class="sub">${report.passed.length} checks your site passed.</p><div class="pass-grid">${report.passed.map((p) => `<div class="pass">${esc(p.text)}</div>`).join("")}</div></div>`;
  }

  // pages
  const okPages = scan.pages.filter((p) => p.status >= 200 && p.status < 300);
  html += `<div class="rep-sec"><h3>Pages we read</h3><ol class="pages-list"><li>${esc(pagePath(scan.render.finalUrl))}</li>${okPages.map((p) => `<li>${esc(pagePath(p.finalUrl || p.url))}</li>`).join("")}</ol></div>`;

  html += meta.brand ? `<div class="cta"><div><h3>Want these fixed?</h3><p>${esc(meta.brand.name)} can take care of every issue in this report.${meta.brand.site ? ` <span class="print-only">${esc(meta.brand.site.replace(/^https?:\/\//, ""))}</span>` : ""}</p></div>${meta.brand.site ? `<a class="btn" href="${esc(meta.brand.site)}" target="_blank" rel="noopener">Get in touch</a>` : ""}</div>` : `<div class="cta"><div><h3>Want these fixed?</h3><p>The Lazy Creator Company builds fast, hand-coded websites from $500, with every issue in this report handled. <span class="print-only">thelazycreatorcompany.com</span></p></div><a class="btn" href="https://thelazycreatorcompany.com" target="_blank" rel="noopener">See my work</a></div>`;
  html += `<div class="again no-print"><button id="again">Check another site</button></div></div>`;

  const rep = $("#report");
  rep.innerHTML = html;

  const tf = $("#topFixes");
  if (tf) report.top.forEach((f, i) => tf.appendChild(fixCard(f, i + 1, report, scan)));
  $("#again").onclick = goHome;
  const link = meta.id ? location.origin + "/r/" + meta.id : location.href;
  $("#copyLink").onclick = async () => {
    try { await navigator.clipboard.writeText(link); $("#toolNote").textContent = "Link copied. Anyone with it can view this report."; }
    catch { $("#toolNote").textContent = link; }
  };
  $("#savePdf").onclick = () => { document.title = "HindSited report - " + host; window.print(); };
  window.onbeforeprint = () => document.querySelectorAll("details.cat").forEach((d) => d.setAttribute("open", ""));
  view("report");
}

function fixCard(f, n, report, scan) {
  const el = document.createElement("article");
  const withRect = f.items.find((i) => i.rect && (!i.page || samePage(i.page, scan.render.finalUrl)));
  const canvas = withRect ? cropCanvas(withRect.rect, withRect.frame) : null;
  el.className = "fix" + (canvas ? " has-shot" : "");
  el.innerHTML = `${canvas ? `<div class="fix-shot"></div>` : ""}<div class="fix-body">
    <div class="fix-top"><span class="rank">${n}</span><span class="sev ${sevClass(f.severity)}">${f.severity}</span><span class="catname">${esc(CATEGORIES[f.cat])}</span></div>
    <h4>${esc(f.title)}</h4>
    <p>${esc(f.why)}</p>
    <div class="two"><div><span class="label">What it's costing you</span>${esc(f.cost)}</div><div><span class="label">How to fix it</span>${esc(f.fix)}</div></div>
    ${f.extra && f.extra.serp ? serpBlock(report, scan) : ""}
    ${evidenceList(f)}
  </div>`;
  if (canvas) { canvas.setAttribute("aria-label", "Screenshot of your page on a phone, with the problem highlighted"); el.querySelector(".fix-shot").appendChild(canvas); }
  return el;
}
function samePage(a, b) { try { const x = new URL(a), y = new URL(b); return x.origin + x.pathname.replace(/\/$/, "") === y.origin + y.pathname.replace(/\/$/, ""); } catch { return false; } }

function gauge(label, r) {
  if (!r || r.error) return `<div class="gauge"><h4>${label}</h4><p class="na">${r && r.error === "quota" ? "Google's speed test is busy right now. Try again in a few minutes." : "Google's speed test couldn't finish for this page."}</p></div>`;
  const row = (name, v) => { if (v == null) return ""; const col = v >= 90 ? "#1d7347" : v >= 50 ? "#b86b00" : "#e5461d"; return `<div class="g-row"><span>${name}</span><b>${v}/100</b></div><div class="bar"><i style="width:${v}%;background:${col}"></i></div>`; };
  const lcp = r.audits["largest-contentful-paint"];
  return `<div class="gauge"><h4>${label}</h4>${row("Speed", r.scores.performance)}${row("Google basics (SEO)", r.scores.seo)}${row("Easy for everyone to use", r.scores.accessibility)}${row("Best practices", r.scores["best-practices"])}${lcp ? `<p class="na" style="margin:12px 0 0">Main content appears after <b>${esc(lcp.display)}</b>.</p>` : ""}</div>`;
}
