import { $, esc, api, loadMe, signInForm, readFileAsDataUrl } from "./shell.js";
import { starter, presetFor, TYPE_SUGGESTIONS, normalize } from "./calc-core.js";
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
  if (!state.calcs.length) return builder(null);
  current = state.calcs.find((c) => c.slug === slug) || (current && state.calcs.find((c) => c.slug === current.slug)) || state.calcs[0];
  dashboard();
}

// ---------------------------------------------------------------- builder: 3 simple steps
function builder(existing) {
  const cfg = existing ? JSON.parse(JSON.stringify(normalize(pick(existing)))) : starter(me.business || "");
  if (!existing) { const p = presetFor(me.business || ""); cfg.businessType = p ? p.type : ""; }
  let touched = !!existing; // once they edit services, typing a business type no longer replaces them
  const meta = { business: existing ? existing.business : me.business || "", notify: existing ? existing.notify : me.email, phone: existing ? existing.phone : "", color: existing ? existing.color : "#e5461d", logo: existing ? existing.logo : null };
  const cur = () => cfg.currency;
  app.innerHTML = `<div class="wrap"><div class="builder">
    <div class="b-edit card-panel">
      <p class="eyebrow">${existing ? "Edit calculator" : "New quote calculator"}</p>
      <h2 class="panel-h b-h">${existing ? "Your services and prices" : "Set it up in 3 steps"}</h2>
      <div class="brand-form wide-form">
        <label>Business name<input id="bBiz" maxlength="60" value="${esc(meta.business)}" placeholder="Bright Spark Cleaning"></label>
        <label>What kind of business is it?<input id="bType" maxlength="60" list="typeList" value="${esc(cfg.businessType)}" placeholder="e.g. house cleaning, dog grooming, photography"></label>
        <datalist id="typeList">${TYPE_SUGGESTIONS.map((t) => `<option value="${esc(t)}">`).join("")}</datalist>
        <p class="b-hint" id="typeHint" hidden></p>
        <label>Headline<input id="bTitle" maxlength="90" value="${esc(cfg.title)}"></label>
      </div>

      <section class="b-step"><h3 class="b-sh"><span>1</span>Your services</h3>
        <p class="muted small">What customers can choose from, and what each costs. They pick one.</p>
        <div id="svcList" class="row-list"></div>
        <button class="linkish" type="button" id="svcAdd">+ Add a service</button></section>

      <section class="b-step"><h3 class="b-sh"><span>2</span>How much? <span class="opt">(optional)</span></h3>
        <label class="check"><input type="checkbox" id="qOn"${cfg.qty ? " checked" : ""}> The price depends on a number (rooms, hours, guests, km…)</label>
        <div id="qBox"></div></section>

      <section class="b-step"><h3 class="b-sh"><span>3</span>Add-ons <span class="opt">(optional)</span></h3>
        <p class="muted small">Extras customers can tick, added on top.</p>
        <div id="addList" class="row-list"></div>
        <button class="linkish" type="button" id="addAdd">+ Add an add-on</button></section>

      <section class="b-step"><h3 class="b-sh">How visitors see the price</h3>
        <div class="mode-pick">
          <label><input type="radio" name="bMode" value="range"${cfg.mode === "range" ? " checked" : ""}><span><b>A price range</b>e.g. $200 – $270. Safest when jobs vary.</span></label>
          <label><input type="radio" name="bMode" value="exact"${cfg.mode === "exact" ? " checked" : ""}><span><b>An exact price</b>Best when your prices are fixed.</span></label>
          <label><input type="radio" name="bMode" value="none"${cfg.mode === "none" ? " checked" : ""}><span><b>No price</b>Just collect the request. For jobs you need to see first.</span></label>
        </div>
        <div class="row3 mode-extra"><label>Currency<select id="bCur">${["$", "C$", "A$", "€", "£"].map((c) => `<option${c === cfg.currency ? " selected" : ""}>${c}</option>`).join("")}</select></label>
          <label id="pctWrap">Range (± %)<input id="bPct" type="number" min="0" max="50" value="${cfg.rangePct}"></label><span></span></div>
      </section>

      <h3 class="sub-h">Where requests go</h3>
      <div class="brand-form wide-form">
        <label>Email quote requests to<input id="bNotify" type="email" value="${esc(meta.notify)}"></label>
        <label><span>Your phone <span class="opt">(shown if quotes pause, optional)</span></span><input id="bPhone" value="${esc(meta.phone)}"></label>
        <fieldset class="paid-fields" ${state.paid ? "" : "disabled"}><legend>Your look ${state.paid ? "" : '<span class="lock">Paid plans</span>'}</legend>
          <div class="row2"><label>Colour<input id="bColor" type="color" value="${esc(meta.color)}"></label>
          <label>Logo (PNG/JPG/WebP under 200 KB)<input id="bLogo" type="file" accept="image/png,image/jpeg,image/webp"></label></div>
          <p class="muted small">Paid plans also drop the “by HindSited” badge and email each visitor their estimate automatically.</p></fieldset>
      </div>
      <div class="btns save-row"><button class="btn" id="bSave">${existing ? "Save changes" : "Save and get my link"}</button>${existing || state.calcs.length ? `<button class="linkish" id="bCancel">Cancel</button>` : ""}</div>
      <p class="form-err" id="bErr" role="alert" hidden></p>
    </div>
    <div class="b-prev"><p class="label">Live preview</p><div class="prev-frame" id="prev"></div></div>
  </div></div>`;

  const noPrice = () => cfg.mode === "none";
  const row = (list, i, kind) => `<div class="row-ed" data-kind="${kind}" data-i="${i}">
      <input data-f="label" value="${esc(list[i].label)}" aria-label="${kind === "svc" ? "Service" : "Add-on"} name" maxlength="60">
      <label class="price-in"${noPrice() ? " hidden" : ""}><span>${kind === "svc" ? "" : "+"}${esc(cur())}</span><input data-f="price" type="number" min="0" step="any" value="${list[i].price}" aria-label="Price"></label>
      <button class="icon" type="button" data-del aria-label="Remove">✕</button></div>`;
  const drawLists = () => {
    $("#svcList").innerHTML = cfg.services.map((_, i) => row(cfg.services, i, "svc")).join("");
    $("#addList").innerHTML = cfg.addons.map((_, i) => row(cfg.addons, i, "add")).join("");
    $("#svcAdd").hidden = cfg.services.length >= 8; $("#addAdd").hidden = cfg.addons.length >= 8;
  };
  const drawQty = () => {
    const q = cfg.qty;
    $("#qBox").innerHTML = q ? `<div class="qty-ed">
      <label>Question<input id="qLabel" maxlength="60" value="${esc(q.label)}"></label>
      <div class="row4"><label>Unit<input id="qUnit" maxlength="20" value="${esc(q.unit)}" placeholder="rooms"></label>
        <label${noPrice() ? " hidden" : ""}>Price each (${esc(cur())})<input id="qPer" type="number" min="0" step="any" value="${q.perUnit}"></label>
        <label>Lowest<input id="qMin" type="number" min="0" value="${q.min}"></label><label>Highest<input id="qMax" type="number" min="0" value="${q.max}"></label><label>Starts at<input id="qDef" type="number" min="0" value="${q.def}"></label></div>
      ${noPrice() ? "" : `<label class="check"><input type="checkbox" id="qMul"${q.multiply ? " checked" : ""}> My service prices are per ${esc(q.unit || "unit")} (multiply by this number)</label>`}</div>` : "";
    if (!q) return;
    const set = (id, key, isNum) => ($("#" + id).oninput = (e) => { q[key] = isNum ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value; if (key === "unit") { const m = $("#qMul"); if (m) m.nextSibling.textContent = ` My service prices are per ${q.unit || "unit"} (multiply by this number)`; } preview(); });
    set("qLabel", "label"); set("qUnit", "unit"); set("qMin", "min", 1); set("qMax", "max", 1); set("qDef", "def", 1);
    if ($("#qPer")) set("qPer", "perUnit", 1);
    if ($("#qMul")) $("#qMul").onchange = (e) => { q.multiply = e.target.checked; preview(); };
  };
  const drawMode = () => { $("#pctWrap").hidden = cfg.mode !== "range"; };
  const preview = () => renderCalculator($("#prev"), { ...cfg, business: $("#bBiz").value || "Your business", color: state.paid ? $("#bColor").value : "#e5461d", logo: state.paid ? meta.logo : null, badge: !state.paid, active: true }, { preview: true });
  const all = () => { drawLists(); drawQty(); drawMode(); preview(); };
  all();

  // lists: services and add-ons
  for (const id of ["svcList", "addList"]) {
    $("#" + id).addEventListener("input", (e) => {
      const r = e.target.closest(".row-ed"); if (!r) return;
      const list = r.dataset.kind === "svc" ? cfg.services : cfg.addons;
      const it = list[+r.dataset.i];
      if (e.target.dataset.f === "label") it.label = e.target.value; else it.price = e.target.value === "" ? 0 : Number(e.target.value);
      touched = true; preview();
    });
    $("#" + id).addEventListener("click", (e) => {
      const d = e.target.closest("[data-del]"); if (!d) return;
      const r = d.closest(".row-ed"); const list = r.dataset.kind === "svc" ? cfg.services : cfg.addons;
      if (r.dataset.kind === "svc" && list.length <= 1) return;
      list.splice(+r.dataset.i, 1); touched = true; drawLists(); preview();
    });
  }
  $("#svcAdd").onclick = () => { cfg.services.push({ label: "New service", price: 0 }); touched = true; drawLists(); preview(); const ins = $("#svcList").querySelectorAll('input[data-f="label"]'); ins[ins.length - 1].select(); };
  $("#addAdd").onclick = () => { cfg.addons.push({ label: "New add-on", price: 0 }); touched = true; drawLists(); preview(); const ins = $("#addList").querySelectorAll('input[data-f="label"]'); ins[ins.length - 1].select(); };
  $("#qOn").onchange = (e) => { cfg.qty = e.target.checked ? { label: "How many?", unit: "", perUnit: 10, min: 1, max: 20, def: 1 } : null; drawQty(); preview(); };

  // business type -> examples
  const hint = $("#typeHint");
  const applyType = (force) => {
    cfg.businessType = $("#bType").value;
    const p = presetFor(cfg.businessType);
    if (!p) { hint.hidden = true; return; }
    if (!touched || force) {
      const s = starter(cfg.businessType);
      Object.assign(cfg, { services: s.services, qty: s.qty, addons: s.addons, mode: s.mode, title: s.title });
      $("#bTitle").value = cfg.title; $("#qOn").checked = !!cfg.qty;
      document.querySelectorAll('input[name="bMode"]').forEach((r) => (r.checked = r.value === cfg.mode));
      touched = false; all();
      hint.innerHTML = `Filled in example services for <b>${esc(p.type)}</b>. Change the names and prices to yours.`; hint.hidden = false;
    } else {
      hint.innerHTML = `Want example services for <b>${esc(p.type)}</b>? <button type="button" class="linkish" id="useEx">Use examples</button> (replaces your list)`; hint.hidden = false;
      $("#useEx").onclick = () => applyType(true);
    }
  };
  $("#bType").onchange = () => applyType(false);
  $("#bType").onblur = () => applyType(false);

  $("#bTitle").oninput = (e) => { cfg.title = e.target.value; preview(); };
  $("#bPct").oninput = (e) => { cfg.rangePct = e.target.value === "" ? 0 : Number(e.target.value); preview(); };
  $("#bCur").onchange = (e) => { cfg.currency = e.target.value; all(); };
  document.querySelectorAll('input[name="bMode"]').forEach((r) => (r.onchange = () => { cfg.mode = r.value; all(); }));
  $("#bBiz").oninput = preview;
  $("#bColor").oninput = preview;
  $("#bLogo").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 200 * 1024) { alert("That logo is over 200 KB."); return; } meta.logo = await readFileAsDataUrl(f); preview(); };
  if ($("#bCancel")) $("#bCancel").onclick = dashboard;
  $("#bSave").onclick = async () => {
    const err = $("#bErr"); err.hidden = true;
    cfg.businessType = $("#bType").value;
    const body = { slug: existing && existing.slug, business: $("#bBiz").value, config: cfg, notify: $("#bNotify").value, phone: $("#bPhone").value, color: $("#bColor").value, logo: meta.logo };
    const { status, data } = await api("/calc", { method: "POST", body: JSON.stringify(body) });
    if (status === 402) return paywall(data.reason);
    if (!data.calc) { err.textContent = data.error || "Couldn't save."; err.hidden = false; return; }
    await refresh(data.calc.slug);
  };
}
const pick = (c) => ({ v: c.v, businessType: c.businessType, title: c.title, mode: c.mode, rangePct: c.rangePct, currency: c.currency, services: c.services, qty: c.qty, addons: c.addons, questions: c.questions, base: c.base, minimum: c.minimum });

function paywall(reason) {
  const why = { "calc-free-used": "Your free plan includes one quote calculator.", "calc-limit": "You've used all the businesses on your plan." }[reason] || "That needs a paid plan.";
  app.innerHTML = `<div class="wrap narrow"><div class="card-panel"><p class="eyebrow">Upgrade</p><h2 class="panel-h">${esc(why)}</h2>
    <p>Paid plans keep every calculator running with unlimited quote requests, your own colours and logo, no HindSited badge, and an automatic email to each visitor with their estimate.</p>
    <a class="btn" href="/account">See plans</a> ${state.calcs.length ? `<button class="linkish" id="pwBack">← Back</button>` : ""}</div></div>`;
  if ($("#pwBack")) $("#pwBack").onclick = dashboard;
}

// step-by-step embed instructions, checked against each platform's help pages
const INSTALL = [
  ["Wix", ["Open your site in the Wix Editor.", "Click <b>Add Elements</b> (the + on the left), then <b>Embed Code</b>, then <b>Popular Embeds</b>, then <b>Embed HTML</b>.", "Click the new box on your page, then <b>Enter Code</b>.", "Paste your code and click <b>Apply</b>.", "Drag the box where you want it, make it wide enough, then <b>Publish</b>."]],
  ["Squarespace", ["Open the page and click <b>Edit</b>.", "Click <b>Add Block</b> where you want it and choose <b>Code</b>.", "Click the block's pencil icon and paste your code.", "Click <b>Save</b>."], "Some Squarespace plans don't run code in code blocks. If it doesn't appear, use the button method."],
  ["WordPress", ["Edit the page.", "Click the <b>+</b> (block inserter) and search for <b>Custom HTML</b>.", "Paste your code into the block.", "Click <b>Update</b> (or <b>Publish</b>)."], "On WordPress.com, adding code needs a plan that allows it. If it doesn't show, use the button method."],
  ["Shopify", ["In Shopify admin go to <b>Online Store</b>, then <b>Themes</b>, then <b>Customize</b>.", "Open the page you want, click <b>Add section</b> and choose <b>Custom Liquid</b>.", "Paste your code into the Custom Liquid box.", "Click <b>Save</b>."], "Most current Shopify themes include Custom Liquid. If yours doesn't, use the button method."],
  ["GoDaddy", ["Open your Websites + Marketing site and click <b>Edit Website</b>.", "Click <b>Add Section</b>, search for <b>HTML</b>, and add it.", "Paste your code into the <b>Custom Code</b> box.", "Click <b>Publish</b>."]],
  ["Webflow", ["In the Designer, open the <b>Add</b> panel and drag a <b>Code Embed</b> onto the page.", "Paste your code and click <b>Save & Close</b>.", "<b>Publish</b> the site. It shows as a placeholder in the Designer and appears on the live site."], "Webflow needs a paid site or workspace plan for code embeds. If you don't have one, use the button method."]
];

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
        <button class="tool" id="cEdit">Edit services and prices</button><button class="tool" id="cNew">New calculator</button></div></div>
    ${!c.active ? `<div class="kit-sec"><p><b>Your calculator is paused.</b> Visitors see your phone number instead of prices. Upgrade to switch it back on with unlimited quote requests.</p><a class="btn" href="/account">See plans</a></div>` : ""}
    <section class="kit-sec"><h3>How it works</h3>
      <ol class="qc-how"><li>A visitor picks a service, sets the quantity and ticks extras, and <b>sees a price straight away</b>.</li><li>They leave their name and email or phone to get the quote.</li><li><b>You get an email instantly</b> with what they picked and the price they saw${c.notify ? ` (sent to <span class="nowrap-email">${esc(c.notify)}</span>)` : ""}. It's also saved below.</li><li>Reply fast: people who hear back within the hour are far more likely to book.</li></ol>
      <p class="muted small">Your calculator lives at its own link on HindSited. Put it in front of customers with any of the options below. <a href="/help#quotes" target="_blank">Full help ↗</a></p>
    </section>
    <section class="kit-sec"><h3>1. Add it to your website</h3>
      <div class="qc-opt"><h4>Easiest: a button (works on every website, no code)</h4>
        <ol><li>In your website editor, add a <b>Button</b> where you want it (near the top of your homepage is best).</li><li>Set the text to something like <b>Get an instant price</b>.</li><li>Set the button's link to your calculator link: <code class="embed-code">${esc(url)}</code> <button class="tool" data-copy="${esc(url)}">Copy link</button></li><li>Publish your site.</li></ol></div>
      <div class="qc-opt"><h4>Or show it right on a page (embed code)</h4>
        <p>Copy this one line, then follow the steps for your website builder:</p>
        <code class="embed-code" id="emb">${esc(embed)}</code>
        <div class="btns"><button class="tool" data-copy="${esc(embed)}">Copy code</button></div>
        ${INSTALL.map(([n, steps, note]) => `<details class="hq hq-sub"><summary>${esc(n)}</summary><div class="hq-a"><ol>${steps.map((x) => `<li>${x}</li>`).join("")}</ol>${note ? `<p class="muted small">${note}</p>` : ""}</div></details>`).join("")}
        <p class="muted small">Don't know what your site is built on? Your HindSited report shows it under <b>About your website</b>. If the calculator doesn't appear on your live site, use the button method instead.</p></div>
    </section>
    <section class="kit-sec"><h3>2. Share the link and QR code too</h3>
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
  $("#cNew").onclick = () => (state.paid && state.calcs.length < (state.allowed || 1) ? builder(null) : paywall(state.paid ? "calc-limit" : "calc-free-used"));
  if ($("#cPick")) $("#cPick").onchange = (e) => { current = state.calcs.find((x) => x.slug === e.target.value); dashboard(); };
  $("#qrDl").onclick = () => { const a = document.createElement("a"); a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qrSvg); a.download = c.slug + "-qr.svg"; a.click(); };
  const { data } = await api("/calc-leads?slug=" + encodeURIComponent(c.slug));
  const L = data.leads || [];
  $("#leadCount").textContent = `(${L.length})`;
  $("#leads").innerHTML = L.length ? `<div class="btns"><a class="tool" href="/api/calc-leads?slug=${encodeURIComponent(c.slug)}&format=csv">Download spreadsheet (CSV)</a></div>
    <div class="lead-table"><table><thead><tr><th>When</th><th>Name</th><th>Contact</th><th>Quote</th><th>Details</th></tr></thead><tbody>${L.map((l) => `<tr><td>${esc(new Date(l.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</td><td>${esc(l.name)}</td><td>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a><br>` : ""}${l.phone ? `<a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : ""}</td><td><b>${esc(l.quote)}</b></td><td class="muted small">${(l.lines || []).map((x) => `${esc(x.q)}: ${esc(x.a)}`).join("<br>")}${l.note ? `<br><i>${esc(l.note)}</i>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted">No requests yet. They'll appear here, and in your inbox, as soon as someone asks for a quote.</p>`;
}
