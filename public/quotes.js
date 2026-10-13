import { $, esc, api, loadMe, signInForm, readFileAsDataUrl } from "./shell.js";
import { INDUSTRIES, template } from "./calc-core.js";
import { renderCalculator } from "./calc-ui.js";
import { qr } from "./materials.js";

let me, state = { calcs: [], paid: false, allowed: 1 }, current = null;
const app = $("#app");
const pubUrl = (c) => `${location.origin}/q/${c.slug}`;

(async () => {
  me = await loadMe();
  if (!me.signedIn) { signInForm($("#signin"), { next: "/quotes", lead: "<b>Start free.</b> Your first calculator runs free for 14 days or 10 quote requests." }); return; }
  $("#intro").hidden = true; app.hidden = false;
  await refresh();
})();

async function refresh(slug) {
  const { data } = await api("/calc?mine=1");
  state = { calcs: data.calcs || [], paid: !!data.paid, allowed: data.allowed };
  if (!state.calcs.length) return pickTemplate();
  current = state.calcs.find((c) => c.slug === slug) || (current && state.calcs.find((c) => c.slug === current.slug)) || state.calcs[0];
  dashboard();
}

function pickTemplate() {
  app.innerHTML = `<div class="wrap narrow"><div class="card-panel wide"><p class="eyebrow">Quote Calculator</p>
    <h2 class="panel-h">What kind of business is it for?</h2><p>Pick the closest match. You'll change every question and price next.</p>
    <div class="tpl-grid">${Object.entries(INDUSTRIES).map(([k, v]) => `<button class="tpl" data-k="${k}">${esc(v)}</button>`).join("")}</div>
    ${state.calcs.length ? `<button class="linkish" id="tBack">← Back</button>` : ""}</div></div>`;
  app.querySelectorAll(".tpl").forEach((b) => (b.onclick = () => builder(null, template(b.dataset.k))));
  if ($("#tBack")) $("#tBack").onclick = dashboard;
}

// ---------------------------------------------------------------- builder
function builder(existing, cfgIn) {
  const cfg = JSON.parse(JSON.stringify(cfgIn || pick(existing)));
  const meta = { business: existing ? existing.business : "", notify: existing ? existing.notify : me.email, phone: existing ? existing.phone : "", color: existing ? existing.color : "#e5461d", logo: existing ? existing.logo : null };
  app.innerHTML = `<div class="wrap"><div class="builder">
    <div class="b-edit card-panel">
      <p class="eyebrow">${existing ? "Edit calculator" : "New calculator"}</p>
      <div class="brand-form wide-form">
        <label>Business name<input id="bBiz" maxlength="60" value="${esc(meta.business)}" placeholder="Bright Spark Cleaning"></label>
        <label>Headline<input id="bTitle" maxlength="90" value="${esc(cfg.title)}"></label>
        <div class="row3"><label>Starting price<input id="bBase" type="number" min="0" value="${cfg.base}"></label>
          <label>Minimum job<input id="bMin" type="number" min="0" value="${cfg.minimum}"></label>
          <label>Currency<select id="bCur">${["$", "C$", "A$", "€", "£"].map((c) => `<option${c === cfg.currency ? " selected" : ""}>${c}</option>`).join("")}</select></label></div>
        <div class="row3"><label>Show visitors<select id="bMode"><option value="range"${cfg.mode === "range" ? " selected" : ""}>A price range</option><option value="exact"${cfg.mode === "exact" ? " selected" : ""}>An exact price</option></select></label>
          <label>Range (± %)<input id="bPct" type="number" min="0" max="50" value="${cfg.rangePct}"></label><span></span></div>
      </div>
      <h3 class="sub-h">Questions</h3>
      <p class="muted small">Prices are added up, then the “×” multipliers are applied (for example ×0.85 for a 15% discount). Example prices are placeholders: change them to yours.</p>
      <div id="qList"></div>
      <div class="btns"><button class="tool" data-add="choice">+ Pick-one question</button><button class="tool" data-add="extras">+ Add-ons question</button><button class="tool" data-add="number">+ Number question</button></div>
      <h3 class="sub-h">Where requests go</h3>
      <div class="brand-form wide-form">
        <label>Email quote requests to<input id="bNotify" type="email" value="${esc(meta.notify)}"></label>
        <label>Your phone (shown if quotes pause, optional)<input id="bPhone" value="${esc(meta.phone)}"></label>
        <fieldset class="paid-fields" ${state.paid ? "" : "disabled"}><legend>Your look ${state.paid ? "" : '<span class="lock">Paid plans</span>'}</legend>
          <div class="row2"><label>Colour<input id="bColor" type="color" value="${esc(meta.color)}"></label>
          <label>Logo (PNG/JPG/WebP under 200 KB)<input id="bLogo" type="file" accept="image/png,image/jpeg,image/webp"></label></div>
          <p class="muted small">Paid plans also drop the “by HindSited” badge and email each visitor their estimate automatically.</p></fieldset>
      </div>
      <div class="btns save-row"><button class="btn" id="bSave">${existing ? "Save changes" : "Save and get my link"}</button>${existing || state.calcs.length ? `<button class="linkish" id="bCancel">Cancel</button>` : `<button class="linkish" id="bCancel">← Pick another template</button>`}</div>
      <p class="form-err" id="bErr" role="alert" hidden></p>
    </div>
    <div class="b-prev"><p class="label">Live preview</p><div class="prev-frame" id="prev"></div></div>
  </div></div>`;

  const qList = $("#qList");
  const drawQs = () => {
    qList.innerHTML = cfg.questions.map((q, qi) => `<div class="qe" data-qi="${qi}">
      <div class="qe-top"><input class="qe-label" data-f="label" value="${esc(q.label)}" aria-label="Question"><span class="qe-type">${q.type === "number" ? "Number" : q.type === "choice" ? "Pick one" : "Add-ons"}</span>
        <button class="icon" data-act="up" aria-label="Move up">↑</button><button class="icon" data-act="down" aria-label="Move down">↓</button><button class="icon" data-act="del" aria-label="Delete question">✕</button></div>
      ${q.type === "number" ? `<div class="row4"><label>Price each<input type="number" data-f="perUnit" value="${q.perUnit}"></label><label>Unit<input data-f="unit" value="${esc(q.unit)}" placeholder="e.g. km"></label><label>Min<input type="number" data-f="min" value="${q.min}"></label><label>Max<input type="number" data-f="max" value="${q.max}"></label><label>Starts at<input type="number" data-f="def" value="${q.def}"></label></div>`
        : `<div class="opt-ed">${q.options.map((o, oi) => `<div class="oe" data-oi="${oi}"><input data-o="label" value="${esc(o.label)}" aria-label="Option"><label>+ ${esc(cfg.currency)}<input type="number" data-o="add" value="${o.add}"></label>${q.type === "choice" ? `<label>×<input type="number" step="0.05" data-o="mult" value="${o.mult}"></label>` : ""}<button class="icon" data-act="odel" aria-label="Delete option">✕</button></div>`).join("")}
          <button class="linkish" data-act="oadd">+ Add option</button></div>`}
    </div>`).join("");
  };
  const preview = () => renderCalculator($("#prev"), { ...cfg, business: $("#bBiz").value || "Your business", color: state.paid ? $("#bColor").value : "#e5461d", logo: state.paid ? meta.logo : null, badge: !state.paid, active: true }, { preview: true });
  const rerender = () => { drawQs(); preview(); };
  rerender();

  const num = (v) => (v === "" ? 0 : Number(v));
  qList.addEventListener("input", (e) => {
    const qe = e.target.closest(".qe"); if (!qe) return;
    const q = cfg.questions[+qe.dataset.qi];
    if (e.target.dataset.f) q[e.target.dataset.f] = ["label", "unit"].includes(e.target.dataset.f) ? e.target.value : num(e.target.value);
    const oe = e.target.closest(".oe");
    if (oe && e.target.dataset.o) q.options[+oe.dataset.oi][e.target.dataset.o] = e.target.dataset.o === "label" ? e.target.value : num(e.target.value);
    preview();
  });
  qList.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    e.preventDefault();
    const qi = +b.closest(".qe").dataset.qi, Q = cfg.questions;
    if (b.dataset.act === "del") Q.splice(qi, 1);
    if (b.dataset.act === "up" && qi > 0) [Q[qi - 1], Q[qi]] = [Q[qi], Q[qi - 1]];
    if (b.dataset.act === "down" && qi < Q.length - 1) [Q[qi + 1], Q[qi]] = [Q[qi], Q[qi + 1]];
    if (b.dataset.act === "oadd") Q[qi].options.push(Q[qi].type === "choice" ? { label: "New option", add: 0, mult: 1 } : { label: "New add-on", add: 0 });
    if (b.dataset.act === "odel") { const oi = +b.closest(".oe").dataset.oi; if (Q[qi].options.length > 1) Q[qi].options.splice(oi, 1); }
    rerender();
  });
  app.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => {
    if (cfg.questions.length >= 12) return;
    const id = "n" + Date.now();
    cfg.questions.push(b.dataset.add === "number" ? { id, type: "number", label: "How many?", perUnit: 10, unit: "", min: 0, max: 20, def: 1 }
      : b.dataset.add === "choice" ? { id, type: "choice", label: "Pick one", options: [{ label: "Option A", add: 0, mult: 1 }, { label: "Option B", add: 50, mult: 1 }] }
      : { id, type: "extras", label: "Add-ons", options: [{ label: "Add-on", add: 25 }] });
    rerender();
  }));
  const bind = (id, key, isNum) => ($("#" + id).oninput = (e) => { cfg[key] = isNum ? num(e.target.value) : e.target.value; preview(); });
  bind("bTitle", "title"); bind("bBase", "base", 1); bind("bMin", "minimum", 1); bind("bPct", "rangePct", 1);
  $("#bCur").onchange = (e) => { cfg.currency = e.target.value; rerender(); };
  $("#bMode").onchange = (e) => { cfg.mode = e.target.value; preview(); };
  $("#bBiz").oninput = preview;
  $("#bColor").oninput = preview;
  $("#bLogo").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 200 * 1024) { alert("That logo is over 200 KB."); return; } meta.logo = await readFileAsDataUrl(f); preview(); };
  $("#bCancel").onclick = () => (existing || state.calcs.length ? dashboard() : pickTemplate());
  $("#bSave").onclick = async () => {
    const err = $("#bErr"); err.hidden = true;
    const body = { slug: existing && existing.slug, business: $("#bBiz").value, config: cfg, notify: $("#bNotify").value, phone: $("#bPhone").value, color: $("#bColor").value, logo: meta.logo };
    const { status, data } = await api("/calc", { method: "POST", body: JSON.stringify(body) });
    if (status === 402) return paywall(data.reason);
    if (!data.calc) { err.textContent = data.error || "Couldn't save."; err.hidden = false; return; }
    await refresh(data.calc.slug);
  };
}
const pick = (c) => ({ industry: c.industry, title: c.title, base: c.base, minimum: c.minimum, mode: c.mode, rangePct: c.rangePct, currency: c.currency, questions: c.questions });

function paywall(reason) {
  const why = { "calc-free-used": "Your free plan includes one quote calculator.", "calc-limit": "You've used all the businesses on your plan." }[reason] || "That needs a paid plan.";
  app.innerHTML = `<div class="wrap narrow"><div class="card-panel"><p class="eyebrow">Upgrade</p><h2 class="panel-h">${esc(why)}</h2>
    <p>Paid plans keep every calculator running with unlimited quote requests, your own colours and logo, no HindSited badge, and an automatic email to each visitor with their estimate.</p>
    <a class="btn" href="/account">See plans</a> ${state.calcs.length ? `<button class="linkish" id="pwBack">← Back</button>` : ""}</div></div>`;
  if ($("#pwBack")) $("#pwBack").onclick = dashboard;
}

// ---------------------------------------------------------------- dashboard
async function dashboard() {
  const c = current;
  const url = pubUrl(c);
  const embed = `<script src="${location.origin}/embed.js" data-calc="${c.slug}" async></script>`;
  const code = qr(url);
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${code.n + 4} ${code.n + 4}" width="180" height="180"><rect width="100%" height="100%" fill="#fff"/><path transform="translate(2 2)" d="${code.d}" fill="#111"/></svg>`;
  const status = c.active ? (c.freeEnds ? `<span class="chip soon">Free trial: ${Math.max(0, 10 - c.leadCount)} requests or ${Math.max(0, Math.ceil((Date.parse(c.freeEnds) - Date.now()) / 86400000))} days left</span>` : `<span class="chip ok">Live</span>`)
    : `<span class="chip now">Paused: ${c.pausedReason === "leads" ? "free plan's 10 requests used" : "free 14 days are up"}</span>`;
  app.innerHTML = `<div class="wrap">
    <div class="kit-head"><div><p class="eyebrow">Quote Calculator</p><h2 class="panel-h">${esc(c.business)}</h2>${status}</div>
      <div class="kit-head-actions">${state.calcs.length > 1 ? `<select id="cPick" aria-label="Choose calculator">${state.calcs.map((x) => `<option value="${esc(x.slug)}"${x.slug === c.slug ? " selected" : ""}>${esc(x.business)}</option>`).join("")}</select>` : ""}
        <button class="tool" id="cEdit">Edit questions and prices</button><button class="tool" id="cNew">New calculator</button></div></div>
    ${!c.active ? `<div class="kit-sec"><p><b>Your calculator is paused.</b> Visitors see your phone number instead of prices. Upgrade to switch it back on with unlimited quote requests.</p><a class="btn" href="/account">See plans</a></div>` : ""}
    <section class="kit-sec"><h3>1. Put it on your website</h3>
      <p>Paste this one line where you want the calculator to appear. It works on WordPress, Wix, Squarespace, Shopify, GoDaddy and hand-built sites (use an “HTML” or “Embed code” block).</p>
      <code class="embed-code" id="emb">${esc(embed)}</code>
      <div class="btns"><button class="tool" data-copy="${esc(embed)}">Copy code</button></div>
    </section>
    <section class="kit-sec"><h3>2. Or share the link and QR code</h3>
      <div class="share-row"><div><code class="embed-code">${esc(url)}</code><div class="btns"><button class="tool" data-copy="${esc(url)}">Copy link</button><a class="tool" href="${esc(url)}" target="_blank" rel="noopener">Open</a></div>
        <p class="muted small">Great for Instagram bios, Google Business Profile, email signatures and flyers. No website needed.</p></div>
        <div class="qr-box">${qrSvg}<button class="tool" id="qrDl">Download QR</button></div></div>
    </section>
    <section class="kit-sec"><h3>3. Quote requests <span class="muted small" id="leadCount"></span></h3>
      <div id="leads"><p class="muted">Loading…</p></div>
    </section>
  </div>`;
  app.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); } catch {} const o = b.textContent; b.textContent = "Copied"; setTimeout(() => (b.textContent = o), 1400); }));
  $("#cEdit").onclick = () => builder(c);
  $("#cNew").onclick = () => (state.paid && state.calcs.length < (state.allowed || 1) ? pickTemplate() : paywall(state.paid ? "calc-limit" : "calc-free-used"));
  if ($("#cPick")) $("#cPick").onchange = (e) => { current = state.calcs.find((x) => x.slug === e.target.value); dashboard(); };
  $("#qrDl").onclick = () => { const a = document.createElement("a"); a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrSvg); a.download = c.slug + "-qr.svg"; a.click(); };
  const { data } = await api("/calc-leads?slug=" + encodeURIComponent(c.slug));
  const L = data.leads || [];
  $("#leadCount").textContent = `(${L.length})`;
  $("#leads").innerHTML = L.length ? `<div class="btns"><a class="tool" href="/api/calc-leads?slug=${encodeURIComponent(c.slug)}&format=csv">Download spreadsheet (CSV)</a></div>
    <div class="lead-table"><table><thead><tr><th>When</th><th>Name</th><th>Contact</th><th>Quote</th><th>Details</th></tr></thead><tbody>${L.map((l) => `<tr><td>${esc(new Date(l.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</td><td>${esc(l.name)}</td><td>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a><br>` : ""}${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : ""}</td><td><b>${esc(l.quote)}</b></td><td class="muted small">${(l.lines || []).map((x) => `${esc(x.q)}: ${esc(x.a)}`).join("<br>")}${l.note ? `<br><i>${esc(l.note)}</i>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No requests yet. They'll appear here, and in your inbox, as soon as someone asks for a quote.</p>`;
}
