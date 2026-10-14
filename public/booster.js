import { $, esc, api, loadMe, signInForm, readFileAsDataUrl } from "./shell.js";
import { TYPES, requestMessages, REPLIES, fill } from "./booster-content.js";
import { MATERIALS, qr, printSvg, downloadPng } from "./materials.js";

let me, state = { kits: [], paid: false, allowed: 1 }, current = null;
const app = $("#app");
const origin = location.origin;
const pageUrl = (k) => `${origin}/review/${k.slug}`;

(async () => {
  me = await loadMe();
  if (!me.signedIn) {
    signInForm($("#signin"), { next: "/reviews", lead: "<b>Start free.</b> Create your account, or sign in if you already have one. Your first review kit is free." });
    return;
  }
  $("#intro").hidden = true;
  app.hidden = false;
  await refresh();
})();

async function refresh(selectSlug) {
  const { data } = await api("/kit?mine=1");
  state = { kits: data.kits || [], paid: !!data.paid, allowed: data.allowed };
  if (!state.kits.length) return editor(null);
  current = state.kits.find((k) => k.slug === selectSlug) || current && state.kits.find((k) => k.slug === current.slug) || state.kits[0];
  dashboard();
}

// ---------------------------------------------------------------- setup / edit
function editor(kit) {
  const k = kit || { name: "", google: "", color: "#e5461d", type: "general", facebook: "", yelp: "", notify: me.email, logo: null };
  app.innerHTML = `<div class="wrap narrow"><div class="card-panel wide">
    <p class="eyebrow">Review Booster</p><h2 class="panel-h">${kit ? "Edit your details" : "Set up your review kit"}</h2>
    <form id="kitForm" class="brand-form wide-form" novalidate>
      <label>Business name<input id="kName" maxlength="60" value="${esc(k.name)}" placeholder="Smith Plumbing" required></label>
      <label>Your Google review link<input id="kGoogle" inputmode="url" value="${esc(k.google)}" placeholder="https://g.page/r/…/review" required></label>
      <details class="help"><summary>Where do I find my Google review link?</summary>
        <ol><li>On a computer or phone, sign in to the Google account that manages your business.</li>
        <li>Search Google for your business name. Your Business Profile appears with controls only you can see.</li>
        <li>Click <b>Ask for reviews</b> (sometimes “Get more reviews”), then <b>Copy link</b>.</li>
        <li>Paste it above. It starts with <b>https://g.page/r/</b>.</li></ol>
        <p class="muted small">You can also find it at business.google.com: open your profile, then “Ask for reviews”.</p></details>
      <label>Type of business<select id="kType">${Object.entries(TYPES).map(([v, t]) => `<option value="${v}"${v === k.type ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
      <div class="row2"><label>Brand colour<input id="kColor" type="color" value="${esc(k.color)}"></label>
      <label>Logo (optional, PNG/JPG/WebP under 200 KB)<input id="kLogo" type="file" accept="image/png,image/jpeg,image/webp"></label></div>
      ${k.logo ? `<div class="brand-prev"><img src="${esc(k.logo)}" alt="Your logo"><button type="button" class="linkish" id="kRemoveLogo">Remove logo</button></div>` : ""}
      <label>Send private feedback to<input id="kNotify" type="email" value="${esc(k.notify || me.email)}"></label>
      <fieldset class="paid-fields" ${state.paid ? "" : "disabled"}><legend>Also ask for reviews on ${state.paid ? "" : "<span class=\"lock\">Paid plans</span>"}</legend>
        <label>Facebook page<input id="kFb" value="${esc(k.facebook)}" placeholder="https://facebook.com/yourbusiness"></label>
        <label>Yelp page<input id="kYelp" value="${esc(k.yelp)}" placeholder="https://yelp.com/biz/yourbusiness"></label></fieldset>
      <button class="btn" type="submit">${kit ? "Save changes" : "Create my review kit"}</button>
      <p class="form-err" id="kErr" role="alert" hidden></p>
    </form>
    ${kit ? `<button type="button" class="linkish" id="kBack">← Back to my kit</button>` : ""}
  </div></div>`;
  let logo;
  if ($("#kRemoveLogo")) $("#kRemoveLogo").onclick = () => { logo = null; $(".brand-prev").remove(); };
  if ($("#kBack")) $("#kBack").onclick = dashboard;
  $("#kitForm").onsubmit = async (e) => {
    e.preventDefault();
    const err = $("#kErr"); err.hidden = true;
    const f = $("#kLogo").files[0];
    if (f) { if (f.size > 200 * 1024) { err.textContent = "That logo is over 200 KB."; err.hidden = false; return; } logo = await readFileAsDataUrl(f); }
    const body = { slug: kit ? kit.slug : undefined, name: $("#kName").value, google: $("#kGoogle").value, type: $("#kType").value, color: $("#kColor").value, notify: $("#kNotify").value, facebook: $("#kFb").value, yelp: $("#kYelp").value };
    if (logo !== undefined) body.logo = logo; else if (kit) body.logo = kit.logo || "";
    const { status, data } = await api("/kit", { method: "POST", body: JSON.stringify(body) });
    if (status === 402) return paywall(data.reason);
    if (!data.kit) { err.textContent = data.error || "Couldn't save."; err.hidden = false; return; }
    current = data.kit;
    await refresh(data.kit.slug);
  };
}

function paywall(reason) {
  const why = { "kit-free-used": "Your free plan includes one review kit.", "kit-listing-used": "That Google listing already has a free review kit.", "kit-limit": "You've used all the businesses on your plan." }[reason] || "That needs a paid plan.";
  app.innerHTML = `<div class="wrap narrow"><div class="card-panel"><p class="eyebrow">Upgrade</p><h2 class="panel-h">${esc(why)}</h2>
    <p>Paid plans include more businesses, Facebook and Yelp buttons, and the ready-made reply library, plus the website check and Quote Calculator.</p>
    <a class="btn" href="/account">See plans</a> ${state.kits.length ? `<button type="button" class="linkish" id="pwBack">← Back to my kit</button>` : ""}</div></div>`;
  if ($("#pwBack")) $("#pwBack").onclick = dashboard;
}

// ---------------------------------------------------------------- dashboard
function dashboard() {
  const k = current;
  const msgs = requestMessages(k.type);
  app.innerHTML = `<div class="wrap">
    <div class="kit-head">
      <div><p class="eyebrow">Review Booster</p><h2 class="panel-h">${esc(k.name)}</h2></div>
      <div class="kit-head-actions">
        ${state.kits.length > 1 ? `<select id="kitPick" aria-label="Choose business">${state.kits.map((x) => `<option value="${esc(x.slug)}"${x.slug === k.slug ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}
        <button class="tool" id="editKit">Edit details</button>
        <button class="tool" id="addKit">Add a business</button>
      </div>
    </div>

    <section class="kit-sec"><h3>1. Your review links</h3>
      <div class="link-grid">
        <div class="link-card"><span class="label">Straight to Google's review box</span><code id="lGoogle">${esc(k.google)}</code>
          <div class="btns"><button class="tool" data-copy="${esc(k.google)}">Copy</button><a class="tool" href="${esc(k.google)}" target="_blank" rel="noopener">Test it</a></div>
          <p class="muted small">Fastest for customers: one tap and they're writing.</p></div>
        <div class="link-card"><span class="label">Your review page</span><code>${esc(pageUrl(k))}</code>
          <div class="btns"><button class="tool" data-copy="${esc(pageUrl(k))}">Copy</button><a class="tool" href="${esc(pageUrl(k))}" target="_blank" rel="noopener">Open</a></div>
          <p class="muted small">Shows your Google button${k.facebook || k.yelp ? " (and Facebook/Yelp)" : ""}, plus a way to message you privately.</p></div>
      </div>
      <p class="rule-note"><b>Following Google's rules:</b> every customer is asked for a Google review. The private message option sits beside the Google button, never in front of it. Filtering unhappy customers away from Google (“review gating”) breaks Google's policy and the FTC's 2024 rule, so this kit never does it.</p>
    </section>

    <section class="kit-sec"><h3>2. Printables</h3>
      <div class="qr-choice"><span>QR codes go to</span>
        <label><input type="radio" name="qrTo" value="google" checked> Google's review box (fastest)</label>
        <label><input type="radio" name="qrTo" value="page"> Your review page</label></div>
      <div class="mat-grid" id="mats"></div>
    </section>

    <section class="kit-sec"><h3>3. Ask your customers</h3>
      <div class="ask-row"><label>Customer's first name<input id="aFirst" placeholder="Sam" maxlength="40"></label>
        <label>Their phone (for texts)<input id="aPhone" inputmode="tel" placeholder="optional"></label>
        <label>Their email<input id="aEmail" type="email" placeholder="optional"></label>
        <label>Link to send<select id="aLink"><option value="google">Google review box</option><option value="page">Your review page</option></select></label></div>
      <div class="msg-grid" id="msgs"></div>
    </section>

    <section class="kit-sec"><h3>4. Reply to your reviews ${state.paid ? "" : '<span class="lock">Paid plans</span>'}</h3>
      ${state.paid ? `<div class="ask-row"><label>Your name (to sign replies)<input id="rOwner" placeholder="Pat" maxlength="40"></label><label>Best contact<input id="rContact" placeholder="555-0100 or you@business.com" maxlength="80"></label></div>
        <div class="reply-list" id="replies"></div>`
        : `<p>Ready-made replies for 5-star praise, mixed reviews, angry customers and reviews from people you can't find. Replying to every review shows future customers you care, and Google notices it too.</p><a class="btn" href="/account">Unlock with a paid plan</a>`}
    </section>
  </div>`;

  app.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(b.dataset.copy, b)));
  $("#editKit").onclick = () => editor(k);
  $("#addKit").onclick = () => (state.paid && state.kits.length < (state.allowed || 1) ? editor(null) : paywall(state.paid ? "kit-limit" : "kit-free-used"));
  if ($("#kitPick")) $("#kitPick").onchange = (e) => { current = state.kits.find((x) => x.slug === e.target.value); dashboard(); };

  const renderMats = () => {
    const to = app.querySelector('input[name="qrTo"]:checked').value;
    const c = qr(pageUrlOr(k, to));
    $("#mats").innerHTML = MATERIALS.map((m) => { const out = m.make(k, c); return `<div class="mat"><div class="mat-prev">${out.svg}</div><b>${esc(m.name)}</b><span class="muted small">${esc(m.size)}. ${esc(m.note)}</span>
      <div class="btns"><button class="tool" data-print="${m.id}">Print or save PDF</button><button class="tool" data-png="${m.id}">Download image</button></div></div>`; }).join("");
    $("#mats").querySelectorAll("[data-print]").forEach((b) => (b.onclick = () => { const m = MATERIALS.find((x) => x.id === b.dataset.print); const out = m.make(k, c); if (!printSvg({ ...out, title: `${k.name} - ${m.name}` })) alert("Allow pop-ups for this site to print."); }));
    $("#mats").querySelectorAll("[data-png]").forEach((b) => (b.onclick = () => { const m = MATERIALS.find((x) => x.id === b.dataset.png); downloadPng(m.make(k, c), `${k.slug}-${m.id}.png`); }));
  };
  app.querySelectorAll('input[name="qrTo"]').forEach((r) => (r.onchange = renderMats));
  renderMats();

  const renderMsgs = () => {
    const vars = { first: $("#aFirst").value.trim() || "there", business: k.name, link: pageUrlOr(k, $("#aLink").value) };
    const phone = $("#aPhone").value.replace(/[^\d+]/g, "");
    const email = $("#aEmail").value.trim();
    const text = fill(msgs.text, vars), wa = fill(msgs.whatsapp, vars), sub = fill(msgs.emailSubject, vars), body = fill(msgs.emailBody, vars), fu = fill(msgs.followUp, vars);
    $("#msgs").innerHTML = `
      <div class="msg"><b>Text message</b><p>${esc(text)}</p><div class="btns"><a class="tool" href="sms:${esc(phone)}${/iPhone|iPad|Mac/.test(navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(text)}">Open in Messages</a><button class="tool" data-copy-t="0">Copy</button></div></div>
      <div class="msg"><b>WhatsApp</b><p>${esc(wa)}</p><div class="btns"><a class="tool" target="_blank" rel="noopener" href="https://wa.me/${esc(phone.replace(/^\+/, ""))}?text=${encodeURIComponent(wa)}">Open in WhatsApp</a><button class="tool" data-copy-t="1">Copy</button></div></div>
      <div class="msg"><b>Email</b><p><i>Subject:</i> ${esc(sub)}</p><p class="pre">${esc(body)}</p><div class="btns"><a class="tool" href="mailto:${esc(email)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}">Open in email</a><button class="tool" data-copy-t="2">Copy</button></div></div>
      <div class="msg"><b>Friendly follow-up</b> <span class="muted small">(send once, a few days later)</span><p>${esc(fu)}</p><div class="btns"><button class="tool" data-copy-t="3">Copy</button></div></div>`;
    const texts = [text, wa, `Subject: ${sub}\n\n${body}`, fu];
    $("#msgs").querySelectorAll("[data-copy-t]").forEach((b) => (b.onclick = () => copy(texts[+b.dataset.copyT], b)));
  };
  ["aFirst", "aPhone", "aEmail", "aLink"].forEach((id) => ($("#" + id).oninput = $("#" + id).onchange = renderMsgs));
  renderMsgs();

  if (state.paid) {
    const renderReplies = () => {
      const v = { business: k.name, owner: $("#rOwner").value.trim() || "the team", contact: $("#rContact").value.trim() || "{contact}" };
      $("#replies").innerHTML = REPLIES.map((r, i) => `<div class="msg"><b>${esc(r.when)}</b><p>${esc(fill(r.text, v))}</p><div class="btns"><button class="tool" data-r="${i}">Copy</button></div></div>`).join("") + `<p class="muted small">Replace anything still in {braces}, like {first} or {detail}, before posting.</p>`;
      $("#replies").querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => copy(fill(REPLIES[+b.dataset.r].text, v), b)));
    };
    $("#rOwner").oninput = $("#rContact").oninput = renderReplies;
    renderReplies();
  }
}

function pageUrlOr(k, which) { return which === "page" ? pageUrl(k) : k.google; }
async function copy(text, btn) {
  try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
  const old = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = old), 1400);
}
