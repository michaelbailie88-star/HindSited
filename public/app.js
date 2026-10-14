import { buildReport, CATEGORIES } from "./rules.js";
import { renderAuth, renderForgot, renderReset } from "./auth-ui.js";
import { renderDashboard } from "./dashboard.js";

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
  for (const id of ["hero", "checks", "how", "progress", "report", "panel", "sayso"]) { const el = $("#" + id); if (el) el.hidden = true; }
  if (name === "home") { $("#hero").hidden = false; $("#checks").hidden = false; $("#how").hidden = false; const s = $("#sayso"); if (s && s.dataset.has) s.hidden = false; }
  else $("#" + name).hidden = false;
  window.scrollTo({ top: 0 });
}
function panel(html) { const p = $("#panel"); p.innerHTML = `<div class="wrap narrow">${html}</div>`; view("panel"); return p; }
function nav(path) { if (location.pathname + location.search !== path) history.pushState({}, "", path); }
function goHome() { nav("/"); view("home"); go.disabled = false; if (!matchMedia("(pointer: coarse)").matches) input.focus(); }

// ---------------------------------------------------------------- free scan (no account needed)
form.addEventListener("submit", (e) => {
  e.preventDefault();
  errEl.hidden = true;
  const url = cleanInput(input.value);
  if (!url) { errEl.textContent = "Enter your website address, like yourbusiness.com."; errEl.hidden = false; input.focus(); return; }
  startScan(url);
});

async function startScan(url) {
  go.disabled = true;
  const { status, data } = await api("/scan", { method: "POST", body: JSON.stringify({ url }) });
  go.disabled = false;
  if (status === 402 && data.paywall) { showPaywall(data, url); return; }
  if (!data.id) { showError(data.error || "Couldn't start the check. Try again in a minute."); return; }
  nav("/r/" + data.id);
  followReport(data.id, url);
}

// ---------------------------------------------------------------- sign in / account
function showSignIn({ mode = "signin", next = "/account", title, lead } = {}) {
  const p = panel(`<div class="card-panel auth-panel" id="authBox"></div>`);
  renderAuth($("#authBox", p), { mode, next, title, lead });
}

const PRICES = {
  solo: { name: "Solo", for: "One business", month: 19, once: 299, perks: ["Full reports: every issue revealed", "30 website checks a month", "Fix tools: Review Booster and Quote Calculator", "Fix It: I'll fix your report for you"] },
  agency: { name: "Agency", for: "Up to 10 businesses", month: 79, once: 999, perks: ["Everything in Solo, for 10 businesses", "300 website checks a month", "Reports and PDFs with your own logo", "Add more businesses for $6/month each"] }
};
function showPaywall(d, url, back) {
  const host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  const why = {
    "free-used": `You've already used your free check${d.site ? " (on <b>" + esc(d.site) + "</b>)" : ""}.`,
    "site-used": `<b>${esc(d.site || host)}</b> has already had its free check.`,
    "daily-limit": `You've run today's free checks.`,
    "business-limit": `Your plan covers ${d.allowed} business${d.allowed === 1 ? "" : "es"} and they're all in use.`,
    "scan-limit": `You've used all ${d.allowed} checks included this month.`,
    "unlock": `Unlock your full report${d.site ? " for <b>" + esc(d.site) + "</b>" : ""}.`,
    "pricing": "Find the problems, then fix them.",
    "upgrade": "Pick the plan that fits."
  }[d.reason] || "You've reached the limit of your free check.";
  const sub = d.reason === "pricing"
    ? "Every plan gets full reports with every issue revealed, plus the tools that fix the two most common gaps: Review Booster for more Google reviews and Quote Calculator for more enquiries. Send any report with Fix It and I'll fix it for you."
    : d.reason === "unlock"
    ? "Subscribe and every hidden issue is revealed straight away, with exactly where it is and how to fix it. Then hit Fix It and I'll fix them for you."
    : "See every issue in full, check your site whenever you change it, and get the Review Booster and Quote Calculator too.";
  const card = (k) => { const p = PRICES[k]; return `<div class="plan${k === "solo" ? " plan-main" : ""}"><h3>${p.name}</h3><p class="muted">${p.for}</p>
    <p class="price"><b>$${p.month}</b>/month</p><p class="muted small">or $${p.once} once for lifetime access</p>
    <ul>${p.perks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
    <button class="btn" data-plan="${k}" data-int="month">Start ${p.name} monthly</button>
    <button class="btn ghost" data-plan="${k}" data-int="once">Pay once, $${p.once}</button></div>`; };
  const p = panel(`<div class="card-panel wide">
    <p class="eyebrow">${d.reason === "unlock" ? "Full report" : d.reason === "pricing" ? "Pricing" : "Keep going"}</p><h2 class="panel-h">${why}</h2>
    <p>${sub}</p>
    ${d.report && d.reason !== "unlock" ? `<p><a href="/r/${esc(d.report)}" class="linkish">See the free report again →</a></p>` : ""}
    ${!me.signedIn ? `<p class="flash">You'll create your account (or sign in) first, so your plan is saved to you.</p>` : ""}
    <div class="plans">${card("solo")}${card("agency")}</div>
    <p class="muted small">Prices in USD. Monthly plans cancel any time. Lifetime plans can be refunded within 7 days (70% back). <a href="/cancel" target="_blank">Cancellation policy</a></p>
    <p class="form-err" id="payErr" role="alert" hidden></p>
    <button type="button" class="linkish" id="pwBack">← Back</button></div>`);
  $("#pwBack").onclick = () => (back ? (nav(back), followReport(back.split("/").pop())) : goHome());
  p.querySelectorAll("[data-plan]").forEach((b) => (b.onclick = () => checkout(b.dataset.plan, b.dataset.int, back)));
}
async function checkout(plan, interval, back) {
  if (!me.signedIn) {
    const ret = (back || "/account") + (back ? "?plans=1" : "");
    showSignIn({ mode: "signup", next: ret, title: "Create your account", lead: "Your plan and reports are saved to your account. Already have one? Choose Sign in." });
    return;
  }
  const { status, data } = await api("/checkout", { method: "POST", body: JSON.stringify({ plan, interval, back }) });
  if (status === 401) { me = { signedIn: false }; return checkout(plan, interval, back); }
  if (data.url) { location.href = data.url; return; }
  const er = $("#payErr"); if (er) { er.textContent = data.error || "Checkout isn't available yet."; er.hidden = false; }
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
  const report = data.locked ? data.report : buildReport(data.scan);
  await showReport(report, data.scan, { id, mine: data.mine, createdAt: data.createdAt || data.at, brand: data.brand || null, locked: !!data.locked, hidden: data.hidden || null, free: !!data.free, site: data.site });
  const q = new URLSearchParams(location.search);
  if (q.get("plans") && data.locked) { history.replaceState({}, "", "/r/" + id); showPaywall({ reason: "unlock", site: data.site }, null, "/r/" + id); }
  else if (q.get("checkout")) {
    history.replaceState({}, "", "/r/" + id);
    const note = $("#toolNote");
    if (note) note.textContent = q.get("checkout") === "success" ? (data.locked ? "Payment received. Refresh in a moment to see everything." : "Payment received. Your full report is unlocked.") : q.get("checkout") === "cancelled" ? "Checkout was cancelled. You haven't been charged." : "";
  }
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
const FLASH = {
  checkout: { success: { ok: true, text: "Payment received. Your plan is active. Thank you!" }, cancelled: { text: "Checkout was cancelled. You haven't been charged." }, pending: { text: "Your payment is still processing. Refresh this page in a minute." }, error: { text: "We couldn't confirm that payment. If you were charged, email thelazycreatorco@gmail.com and we'll sort it out." } },
  confirmed: { 1: { ok: true, text: "Thanks! Your email is confirmed." }, expired: { text: "That confirmation link has expired. Use “Resend” below to get a new one." } },
  reset: { 1: { ok: true, text: "Your new password is saved and you're signed in." } }
};
async function route() {
  const path = location.pathname;
  const q = new URLSearchParams(location.search);
  const m = path.match(/^\/r\/([a-f0-9-]{20,40})\/?$/i);
  if (m) { followReport(m[1]); return; }
  if (path === "/reset") { const p = panel(`<div class="card-panel auth-panel" id="authBox"></div>`); renderReset($("#authBox", p), q.get("t") || ""); return; }
  if (path === "/account") {
    let flash = null;
    for (const k of Object.keys(FLASH)) if (q.get(k) && FLASH[k][q.get(k)]) flash = FLASH[k][q.get(k)];
    if (me.signedIn) {
      if (flash || q.get("plan")) history.replaceState({}, "", "/account" + location.hash);
      const p = panel(`<div id="dash"></div>`);
      p.firstElementChild.classList.add("wide-panel");
      await renderDashboard($("#dash"), { me, flash, api, upgrade: () => showPaywall({ reason: "upgrade" }), refreshMe: async () => (me = await window.HS.refresh()) });
      if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
      return;
    }
    if (q.get("mode") === "forgot") { const p = panel(`<div class="card-panel auth-panel" id="authBox"></div>`); renderForgot($("#authBox", p), { back: () => showSignIn({ next: "/account" }) }); return; }
    const nx = q.get("next");
    showSignIn({ mode: q.get("mode") === "signup" ? "signup" : "signin", next: nx && nx.startsWith("/") && !nx.startsWith("//") ? nx : "/account" + location.hash });
    return;
  }
  if (q.get("deleted")) { history.replaceState({}, "", "/"); view("home"); errEl.textContent = "Your account and everything in it has been deleted."; errEl.hidden = false; return; }
  if (path === "/pricing") { showPaywall({ reason: "pricing" }); return; }
  const pending = q.get("scan");
  if (pending && cleanInput(pending)) { history.replaceState({}, "", "/"); input.value = pending.replace(/^https?:\/\//, ""); startScan(cleanInput(pending)); return; }
  view("home");
  if (location.hash === "#how") $("#how").scrollIntoView();
}
window.addEventListener("popstate", route);
// "How it works" from the menu while on a report or panel: show the home page there
window.addEventListener("hashchange", () => { if (location.hash === "#how" && location.pathname === "/") { view("home"); $("#how").scrollIntoView(); } });
$("#howScan").addEventListener("click", (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); input.focus({ preventScroll: true }); });
(async () => {
  me = await window.HS.me();
  route();
  loadSaySo();
})();

// approved reviews of HindSited on the landing page (hidden when there are none)
async function loadSaySo() {
  const box = $("#sayso");
  if (!box) return;
  const { data } = await api("/reviews");
  const list = (data && data.reviews) || [];
  if (!list.length) return;
  box.querySelector(".say-grid").innerHTML = list.slice(0, 6).map((r) => `<figure class="say"><div class="stars" aria-label="${r.rating} out of 5 stars">${"★".repeat(r.rating)}<span>${"★".repeat(5 - r.rating)}</span></div><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b>${r.business ? `<span>${esc(r.business)}</span>` : ""}</figcaption></figure>`).join("");
  box.dataset.has = "1";
  if (!$("#hero").hidden) box.hidden = false;
}

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


// findings that one of the fix tools solves (hidden on agency-branded reports)
const FIX_TOOLS = {
  no_reviews_home: { href: "/reviews", label: "Fix this with Review Booster", note: "Get more Google reviews with QR cards, ready-made messages and a review page. Included with every plan." },
  no_cta_fold: { href: "/quotes", label: "Add an instant-quote button", note: "Quote Calculator gives visitors a price on the spot and sends you their details. Included with every plan." },
  no_contact_path: { href: "/quotes", label: "Add an instant-quote form", note: "Quote Calculator gives visitors a price and a way to reach you, and emails you every enquiry." }
};
let reportBrand = null;
function fixToolHtml(f) {
  const t = !reportBrand && FIX_TOOLS[f.rule];
  return t ? `<div class="fix-tool no-print"><a class="btn small-btn" href="${t.href}">${t.label}</a><span>${t.note}</span></div>` : "";
}

async function showReport(report, scan, meta = {}) {
  reportBrand = meta.brand || null;
  shotImg = await phoneImage(scan.render.shots && scan.render.shots.mobile);
  const host = new URL(scan.render.finalUrl).hostname.replace(/^www\./, "");
  const locked = !!meta.locked, hid = meta.hidden || { count: 0, total: report.findings.length, bySeverity: {}, byCat: {} };
  const all = locked ? hid.total : report.findings.length;
  const sevCount = (s) => report.findings.filter((f) => f.severity === s).length + (locked ? hid.bySeverity[s] || 0 : 0);
  const nowN = sevCount("Fix now"), soonN = sevCount("Fix soon"), worthN = all - nowN - soonN;
  const dialColor = report.score >= 90 ? "#1d7347" : report.score >= 75 ? "#b86b00" : "#e5461d";
  const C = 2 * Math.PI * 70;
  const ms = scan.render.shots && scan.render.shots.mobile, ds = scan.render.shots && scan.render.shots.desktop;
  const reportPath = meta.id ? "/r/" + meta.id : location.pathname;

  let html = `<div class="wrap">
  <div class="rep-tools no-print"><button type="button" class="tool" id="copyLink">Copy share link</button>${locked ? "" : `<button type="button" class="tool" id="savePdf">Download PDF</button>`}<span class="tool-note" id="toolNote" role="status"></span></div>
  <div class="rep-head">
    <div class="dial" role="img" aria-label="Score ${report.score} out of 100">
      <svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" fill="none" stroke="#e1dccf" stroke-width="12"/><circle cx="80" cy="80" r="70" fill="none" stroke="${dialColor}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - report.score / 100)}"/></svg>
      <div class="num"><div><b>${report.score}</b><small>out of 100</small></div></div>
    </div>
    <div class="rep-title">
      ${meta.brand ? `<div class="brand-mark-rep">${meta.brand.logo ? `<img src="${esc(meta.brand.logo)}" alt="${esc(meta.brand.name)}">` : ""}<span>Website report by ${esc(meta.brand.name)}</span></div>` : `<p class="eyebrow">${locked ? "Your free HindSited report" : "Your HindSited report"}</p>`}
      <h2><span class="rep-host">${esc(host)}</span> ${esc(report.grade.label)}</h2>
      <p>${esc(report.grade.note)}</p>
      <div class="tally">${nowN ? `<span class="chip now">${nowN} fix now</span>` : ""}${soonN ? `<span class="chip soon">${soonN} fix soon</span>` : ""}${worthN ? `<span class="chip">${worthN} worth fixing</span>` : ""}<span class="chip ok">${report.passed.length} checks passed</span></div>
      <p class="rep-meta">${report.pagesChecked} page${report.pagesChecked === 1 ? "" : "s"} read · ${report.linksChecked} links and images followed${report.platform ? " · built with " + esc(report.platform) : ""} · ${new Date(meta.createdAt || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
    </div>
    <div class="devices" aria-hidden="true">${ms ? `<div class="dev-phone"><img src="${ms.data}" alt=""></div>` : ""}${ds ? `<div class="dev-desk"><img src="${ds.data}" alt=""></div>` : ""}</div>
  </div>`;

  if (locked && hid.count) {
    const sevLine = ["Fix now", "Fix soon", "Worth fixing"].filter((s) => hid.bySeverity[s]).map((s) => `<span class="chip ${sevClass(s)}">${hid.bySeverity[s]} ${s.toLowerCase()}</span>`).join("");
    html += `<div class="lock-bar no-print"><div><p class="lock-k"><span class="lock-ic" aria-hidden="true"></span>Free report: showing ${all - hid.count} of ${all} issues</p>
      <p class="lock-t">The ${hid.count} most serious issue${hid.count === 1 ? " is" : "s are"} hidden. Subscribe to see exactly what ${hid.count === 1 ? "it is" : "they are"}, where ${hid.count === 1 ? "it is" : "they are"} and how to fix ${hid.count === 1 ? "it" : "them"}.</p>
      <div class="tally">${sevLine}</div></div>
      <button class="btn unlock-btn" type="button">Unlock full report</button></div>`;
    const cats = Object.entries(hid.byCat).sort((a, b) => b[1] - a[1]);
    html += `<div class="rep-sec"><h3>Your most serious issues</h3><p class="sub">Hidden on the free report. These are the problems most likely to be costing you customers right now.</p>
      <div class="locked-list">${cats.map(([cat, n]) => `<div class="locked-card"><div class="lc-blur" aria-hidden="true"><span class="lc-sev">Fix now</span><b>████████ ███ ██████ ████</b><p>███████ ██ ████ ████████ ███ ██████ █████ ██ ███████ ████ ███ █████.</p><p>████ ███████ ██ █████ ██████.</p></div>
        <div class="lc-over"><span class="lock-ic" aria-hidden="true"></span><b>${n} hidden issue${n === 1 ? "" : "s"}</b><span>${esc(CATEGORIES[cat] || "Other")}</span></div></div>`).join("")}</div>
      <div class="lock-cta"><button class="btn unlock-btn" type="button">Unlock all ${hid.count} hidden issue${hid.count === 1 ? "" : "s"}</button></div></div>`;
  } else if (report.top && report.top.length) {
    html += `<div class="rep-sec"><h3>Your top ${report.top.length === 1 ? "fix" : report.top.length + " fixes"}</h3><p class="sub">Ranked by how much each one is likely costing you. Highlights show exactly where it is on your page, as a phone sees it.</p><div id="topFixes"></div></div>`;
  } else if (!locked) {
    html += `<div class="rep-sec"><h3>Nothing serious found</h3><p class="sub">Your site passed every check we ran. That's rare. Nice work.</p></div>`;
  }

  // findings by category (in a locked report: only the visible ones)
  const shownList = report.findings;
  const byCat = {};
  for (const f of shownList) (byCat[f.cat] = byCat[f.cat] || []).push(f);
  if (locked ? shownList.length : report.findings.length > report.top.length) {
    html += `<div class="rep-sec"><h3>${locked ? "What else we found" : "Everything we found"}</h3><p class="sub">${locked ? `${shownList.length} of ${all} issues shown on the free report, grouped by what they affect.` : `${report.findings.length} issues in total, grouped by what they affect.`}</p>`;
    for (const [k, label] of Object.entries(CATEGORIES)) {
      const list = byCat[k];
      if (!list) continue;
      html += `<details class="cat"${k === shownList[0]?.cat ? " open" : ""}><summary>${esc(label)}<span class="cat-count">${list.length} issue${list.length === 1 ? "" : "s"}</span></summary><div class="cat-body">` +
        list.map((f) => `<div class="mini"><h5><span class="sev ${sevClass(f.severity)}">${f.severity}</span>${esc(f.title)}</h5><p>${esc(f.why)}</p><p><b>Fix:</b> ${esc(f.fix)}</p>${fixToolHtml(f)}${evidenceList(f, 3)}</div>`).join("") + `</div></details>`;
    }
    html += `</div>`;
  }

  // speed
  const sp = scan.speed || {};
  html += sp.locked
    ? `<div class="rep-sec"><h3>Google speed test</h3><p class="sub">Your speed results include one of the hidden issues.</p><div class="locked-card wide"><div class="lc-blur" aria-hidden="true"><b>Speed ██/100 · Google basics ██/100</b><p>████ ███ ████████ ██████ ███ █████████.</p></div><div class="lc-over"><span class="lock-ic" aria-hidden="true"></span><b>Speed results hidden</b><button class="linkish unlock-btn" type="button">Unlock full report</button></div></div></div>`
    : `<div class="rep-sec"><h3>Google speed test</h3><p class="sub">Scores straight from Google PageSpeed Insights, which runs the same test Google uses.</p><div class="speed-grid">${gauge("On a phone", sp.mobile)}${gauge("On a computer", sp.desktop)}</div></div>`;

  if (report.passed.length) {
    html += `<div class="rep-sec"><h3>What's working</h3><p class="sub">${report.passed.length} checks your site passed.</p><div class="pass-grid">${report.passed.map((p) => `<div class="pass">${esc(p.text)}</div>`).join("")}</div></div>`;
  }

  // about the website: platform + domain (useful when it's time to fix things)
  const dm = scan.domain;
  if (report.platform || dm) {
    const days = dm && dm.expires ? Math.round((Date.parse(dm.expires) - Date.now()) / 86400000) : null;
    const fmt = (iso) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    html += `<div class="rep-sec"><h3>About your website</h3><dl class="site-facts">
      ${report.platform ? `<div><dt>Built with</dt><dd>${esc(report.platform)}</dd></div>` : ""}
      ${dm && dm.registrar ? `<div><dt>Domain registered with</dt><dd>${esc(dm.registrar)}</dd></div>` : ""}
      ${dm && dm.expires ? `<div><dt>Domain renews</dt><dd>${fmt(dm.expires)}${days != null && days <= 60 ? ` <span class="chip ${days <= 14 ? "now" : "soon"}">${days < 0 ? "expired" : "in " + days + " day" + (days === 1 ? "" : "s")}</span>` : ""}</dd></div>` : ""}
      ${dm && dm.created ? `<div><dt>Domain since</dt><dd>${new Date(dm.created).getFullYear()}</dd></div>` : ""}
    </dl><p class="sub small-note">Good to know before anyone works on your site: this is where it's edited and who controls the address.</p></div>`;
  }

  const okPages = (scan.pages || []).filter((p) => p.status >= 200 && p.status < 300);
  html += `<div class="rep-sec"><h3>Pages we read</h3><ol class="pages-list"><li>${esc(pagePath(scan.render.finalUrl))}</li>${okPages.map((p) => `<li>${esc(pagePath(p.finalUrl || p.url))}</li>`).join("")}</ol></div>`;

  html += meta.brand
    ? `<div class="cta"><div><h3>Want these fixed?</h3><p>${esc(meta.brand.name)} can take care of every issue in this report.${meta.brand.site ? ` <span class="print-only">${esc(meta.brand.site.replace(/^https?:\/\//, ""))}</span>` : ""}</p></div>${meta.brand.site ? `<a class="btn" href="${esc(meta.brand.site)}" target="_blank" rel="noopener">Get in touch</a>` : ""}</div>`
    : offersHtml({ locked, paidViewer: !!(me.signedIn && me.plan !== "free"), all });
  html += `<div class="again no-print"><button id="again">Check another site</button></div></div>`;

  const rep = $("#report");
  rep.innerHTML = html;

  const tf = $("#topFixes");
  if (tf) report.top.forEach((f, i) => tf.appendChild(fixCard(f, i + 1, report, scan)));
  $("#again").onclick = goHome;
  const link = location.origin + reportPath;
  $("#copyLink").onclick = async () => {
    try { await navigator.clipboard.writeText(link); $("#toolNote").textContent = "Link copied. Anyone with it can view this report."; }
    catch { $("#toolNote").textContent = link; }
  };
  if ($("#savePdf")) $("#savePdf").onclick = () => { document.title = "HindSited report - " + host; window.print(); };
  window.onbeforeprint = () => document.querySelectorAll("details.cat").forEach((d) => d.setAttribute("open", ""));
  rep.querySelectorAll(".unlock-btn").forEach((b) => (b.onclick = () => showPaywall({ reason: "unlock", site: meta.site || host }, null, reportPath)));
  wireOffers(rep, { reportId: meta.id, host, locked, back: reportPath });
  view("report");
}

// ---------------------------------------------------------------- offers on every report
function offersHtml({ locked, paidViewer, all }) {
  const fixReady = paidViewer && !locked;
  return `<div class="offers no-print" id="offers">
    <div class="offers-head"><p class="eyebrow">Want these fixed?</p><h3>Two ways I can fix this for you</h3>
      <p class="sub">I'm Michael, the one-person web studio behind HindSited (<a href="https://thelazycreatorcompany.com" target="_blank" rel="noopener">The Lazy Creator Company</a>). Pick what suits you.</p></div>
    <div class="offer-grid">
      <article class="offer">
        <p class="offer-k">Option 1</p><h4>A brand-new website</h4>
        <p>A bug-free redesign with a fresh, modern look, hand-built for your business. Every issue in this report is gone for good, not patched.</p>
        <ul class="ticks"><li>Designed for phones first, fast to load</li><li>Clear buttons that turn visitors into calls and bookings</li><li>Google-ready: titles, descriptions, sitemap</li><li>Hosting and updates available</li></ul>
        <p class="offer-price">From <b>$500</b></p>
        <div class="offer-act"><button class="btn" type="button" data-req="redesign">Request a redesign</button><a class="linkish" href="https://thelazycreatorcompany.com" target="_blank" rel="noopener">See my work</a></div>
        <div class="req" data-for="redesign" hidden></div>
      </article>
      <article class="offer">
        <p class="offer-k">Option 2</p><h4>Fix It: keep your site, fix ${all ? "all " + all + " issue" + (all === 1 ? "" : "s") : "the issues"}</h4>
        <p>Subscribe to HindSited and I'll fix the issues in this report for you. You also get monthly checks, so new problems are caught before customers notice.</p>
        <ul class="ticks"><li>Every hidden issue revealed straight away</li><li>Fixes done for you, from this exact report</li><li>Re-check any time to see the score go up</li></ul>
        <p class="offer-price">From <b>$19</b>/month or <b>$299</b> once</p>
        <div class="offer-act">${fixReady ? `<button class="btn" type="button" data-req="fix">Send this report to be fixed</button>` : `<button class="btn" type="button" data-fixit>Fix It</button>`}</div>
        <div class="req" data-for="fix" hidden></div>
      </article>
    </div></div>`;
}
function wireOffers(root, { reportId, host, back }) {
  const fi = root.querySelector("[data-fixit]");
  if (fi) fi.onclick = () => showPaywall({ reason: "unlock", site: host }, null, back);
  root.querySelectorAll("[data-req]").forEach((b) => (b.onclick = () => {
    const kind = b.dataset.req, box = root.querySelector(`.req[data-for="${kind}"]`);
    if (!box.hidden) { box.hidden = true; return; }
    box.innerHTML = `<form class="req-form" novalidate>
      <p class="req-h">${kind === "redesign" ? "Tell me a little about what you need" : "I'll get your report and reply by email"}</p>
      <label>Your name<input name="name" autocomplete="name" maxlength="80" required value="${esc(me.name || "")}"></label>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required value="${esc(me.email || "")}"></label>
      <label><span>Phone <span class="opt">(optional)</span></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      <label><span>Anything I should know? <span class="opt">(optional)</span></span><textarea name="note" rows="3" maxlength="2000"></textarea></label>
      <label class="hp" aria-hidden="true">Leave empty<input name="hp" tabindex="-1" autocomplete="off"></label>
      <p class="form-err" role="alert" hidden></p>
      <button class="btn" type="submit">Send request</button>
      <p class="muted small">Your details go only to The Lazy Creator Company to answer this request. <a href="/privacy" target="_blank">Privacy</a></p></form>`;
    box.hidden = false;
    const f = box.querySelector("form"), err = box.querySelector(".form-err");
    f.onsubmit = async (e) => {
      e.preventDefault();
      err.hidden = true;
      const body = { ...Object.fromEntries(new FormData(f)), kind, report: reportId, website: host };
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      const { data } = await api("/request", { method: "POST", body: JSON.stringify(body) });
      btn.disabled = false;
      if (data.sent) { box.innerHTML = `<p class="flash ok">Thanks${body.name ? ", " + esc(body.name.split(" ")[0]) : ""}! Your request is in. I'll reply to <span class="one-line">${esc(body.email)}</span> soon.</p>`; return; }
      err.textContent = data.error || "That didn't send. Please try again."; err.hidden = false;
    };
  }));
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
    ${fixToolHtml(f)}
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
