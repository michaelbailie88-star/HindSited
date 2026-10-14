// Draws a quote calculator: pick a service, how much, add-ons, the live price,
// and the "send my request" form. Used by the public page and the live preview.
import { price, priceText, normalize, money } from "./calc-core.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderCalculator(el, calcIn, { preview = false, onLead } = {}) {
  const calc = { ...calcIn, ...normalize(calcIn) };
  const color = calc.color || "#e5461d";
  el.style.setProperty("--brand", color);
  const noPrice = calc.mode === "none";
  const q = calc.qty;
  const answers = { service: 0, qty: q ? q.def ?? q.min ?? 0 : 0, addons: [] };
  const nm = preview ? "p" : "";
  const plus = (v) => (!noPrice && Number(v) ? ` <span class="opt-price">+${esc(money(v, calc.currency))}</span>` : "");
  const svcHtml = (calc.services || []).length ? `<fieldset class="cq"><legend class="cq-l">What do you need?</legend><div class="opts">${calc.services.map((s, i) => `<label class="opt"><input type="radio" name="${nm}svc" data-k="service" value="${i}"${i === 0 ? " checked" : ""}><span>${esc(s.label)}</span></label>`).join("")}</div></fieldset>` : "";
  const qtyHtml = q ? `<div class="cq"><label class="cq-l" for="${nm}qty">${esc(q.label)}</label>
      <div class="stepper"><button type="button" data-step="-1" aria-label="Fewer">−</button><input id="${nm}qty" data-k="qty" type="number" inputmode="numeric" min="${q.min}" max="${q.max}" value="${answers.qty}"><button type="button" data-step="1" aria-label="More">+</button>${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div></div>` : "";
  const addHtml = (calc.addons || []).length ? `<fieldset class="cq"><legend class="cq-l">Add-ons <span class="muted small">(pick any)</span></legend><div class="opts">${calc.addons.map((a, i) => `<label class="opt"><input type="checkbox" data-k="addons" value="${i}"><span>${esc(a.label)}${plus(a.price)}</span></label>`).join("")}</div></fieldset>` : "";
  el.innerHTML = `<div class="calc">
    <div class="calc-top">${calc.logo ? `<img src="${esc(calc.logo)}" alt="${esc(calc.business)}">` : `<span class="calc-biz">${esc(calc.business || "")}</span>`}</div>
    <h1 class="calc-h">${esc(calc.title)}</h1>
    ${calc.active === false ? `<p class="calc-paused">Online quotes are paused right now.${calc.phone ? ` Call <a href="tel:${esc(calc.phone)}">${esc(calc.phone)}</a> for a price.` : " Please contact the business directly."}</p>` : `
    <form class="calc-form" novalidate>${svcHtml}${qtyHtml}${addHtml}</form>
    ${noPrice ? "" : `<div class="calc-price" aria-live="polite"><span class="label">Your estimate</span><b class="calc-amount"></b><span class="muted small">${calc.mode === "exact" ? "Based on your answers." : "Based on your answers. Your exact price is confirmed after a quick chat."}</span></div>`}
    <form class="calc-lead" novalidate>
      <p class="cq-l">${noPrice ? "Request your quote" : "Get your exact quote"}</p>
      <label>Your name<input name="name" autocomplete="name" required maxlength="80"></label>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="120"></label>
      <label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      <label>${noPrice ? "Tell us about the job" : "Anything else? (optional)"}<textarea name="note" rows="${noPrice ? 3 : 2}" maxlength="1000"></textarea></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="calc-btn" type="submit">${noPrice ? "Send my request" : "Send me my exact quote"}</button>
      <p class="calc-privacy">Your details go only to ${esc(calc.business || "this business")}, to answer your request. <a href="${location.origin}/privacy" target="_blank" rel="noopener">Privacy</a></p>
      <p class="calc-msg" role="status"></p>
    </form>`}
    ${calc.badge ? `<p class="calc-badge">Quote calculator by <a href="${location.origin}/" target="_blank" rel="noopener">HindSited</a></p>` : ""}
  </div>`;
  if (calc.active === false) return;
  const amount = el.querySelector(".calc-amount");
  const update = () => { if (amount) amount.textContent = priceText(price(calc, answers), calc); };
  el.querySelectorAll("input[data-k]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.k;
      if (k === "service") answers.service = Number(inp.value);
      else if (k === "qty") answers.qty = Math.max(q.min, Math.min(q.max, Number(inp.value) || 0));
      else answers.addons = [...el.querySelectorAll('input[data-k="addons"]:checked')].map((x) => Number(x.value));
      update();
    });
    inp.addEventListener("change", () => inp.dispatchEvent(new Event("input")));
  });
  el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const inp = el.querySelector('input[data-k="qty"]');
    inp.value = Math.max(q.min, Math.min(q.max, (Number(inp.value) || 0) + Number(b.dataset.step)));
    inp.dispatchEvent(new Event("input"));
  }));
  update();
  const lf = el.querySelector(".calc-lead");
  lf.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = lf.querySelector(".calc-msg");
    if (preview) { msg.textContent = "This is a preview. Real requests go to your inbox."; return; }
    const fd = Object.fromEntries(new FormData(lf));
    if (!fd.name.trim()) { msg.textContent = "Please enter your name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(fd.email) && fd.phone.replace(/\D/g, "").length < 7) { msg.textContent = "Please add an email or phone number."; return; }
    const btn = lf.querySelector("button"); btn.disabled = true;
    const res = onLead ? await onLead({ ...fd, answers }) : { sent: false };
    btn.disabled = false;
    if (res.sent) lf.innerHTML = `<p class="calc-done">Thanks, ${esc(fd.name.trim().split(" ")[0])}! Your request was sent to ${esc(calc.business)}. They'll be in touch soon${noPrice ? " with your quote" : " to confirm your exact price"}.</p>`;
    else msg.textContent = res.error || "That didn't send. Please try again.";
  });
}
