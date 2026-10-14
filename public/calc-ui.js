// Draws a quote calculator: questions, live price, and the "send my exact
// quote" form. Used by the public page and the owner's live preview.
import { price, priceText } from "./calc-core.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function renderCalculator(el, calc, { preview = false, onLead } = {}) {
  const color = calc.color || "#e5461d";
  el.style.setProperty("--brand", color);
  const answers = {};
  for (const q of calc.questions) answers[q.id] = q.type === "number" ? q.def ?? q.min ?? 0 : q.type === "choice" ? 0 : [];
  const qHtml = calc.questions.map((q) => {
    if (q.type === "number") return `<div class="cq"><label class="cq-l" for="in-${q.id}">${esc(q.label)}</label>
      <div class="stepper"><button type="button" data-step="-1" data-q="${q.id}" aria-label="Fewer">−</button><input id="in-${q.id}" data-q="${q.id}" type="number" inputmode="numeric" min="${q.min}" max="${q.max}" value="${answers[q.id]}"><button type="button" data-step="1" data-q="${q.id}" aria-label="More">+</button>${q.unit ? `<span class="unit">${esc(q.unit)}</span>` : ""}</div></div>`;
    if (q.type === "choice") return `<fieldset class="cq"><legend class="cq-l">${esc(q.label)}</legend><div class="opts">${q.options.map((o, i) => `<label class="opt"><input type="radio" name="${preview ? "p" : ""}${q.id}" data-q="${q.id}" value="${i}"${i === 0 ? " checked" : ""}><span>${esc(o.label)}</span></label>`).join("")}</div></fieldset>`;
    return `<fieldset class="cq"><legend class="cq-l">${esc(q.label)} <span class="muted small">(pick any)</span></legend><div class="opts">${q.options.map((o, i) => `<label class="opt"><input type="checkbox" data-q="${q.id}" value="${i}"><span>${esc(o.label)}</span></label>`).join("")}</div></fieldset>`;
  }).join("");
  el.innerHTML = `<div class="calc">
    <div class="calc-top">${calc.logo ? `<img src="${esc(calc.logo)}" alt="${esc(calc.business)}">` : `<span class="calc-biz">${esc(calc.business || "")}</span>`}</div>
    <h1 class="calc-h">${esc(calc.title)}</h1>
    ${calc.active === false ? `<p class="calc-paused">Online quotes are paused right now.${calc.phone ? ` Call <a href="tel:${esc(calc.phone)}">${esc(calc.phone)}</a> for a price.` : " Please contact the business directly."}</p>` : `
    <form class="calc-form" novalidate>${qHtml}</form>
    <div class="calc-price" aria-live="polite"><span class="label">Your estimate</span><b class="calc-amount"></b><span class="muted small">${calc.mode === "exact" ? "Based on your answers." : "Based on your answers. Your exact price is confirmed after a quick chat."}</span></div>
    <form class="calc-lead" novalidate>
      <p class="cq-l">Get your exact quote</p>
      <label>Your name<input name="name" autocomplete="name" required maxlength="80"></label>
      <label>Email<input name="email" type="email" autocomplete="email" maxlength="120"></label>
      <label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
      <label>Anything else? (optional)<textarea name="note" rows="2" maxlength="1000"></textarea></label>
      <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="calc-btn" type="submit">Send me my exact quote</button>
      <p class="calc-privacy">Your details go only to ${esc(calc.business || "this business")}, to answer your request. <a href="${location.origin}/privacy" target="_blank" rel="noopener">Privacy</a></p>
      <p class="calc-msg" role="status"></p>
    </form>`}
    ${calc.badge ? `<p class="calc-badge">Quote calculator by <a href="${location.origin}/quotes" target="_blank" rel="noopener">HindSited</a></p>` : ""}
  </div>`;
  if (calc.active === false) return;
  const amount = el.querySelector(".calc-amount");
  const update = () => { amount.textContent = priceText(price(calc, answers), calc); };
  el.querySelectorAll("input[data-q]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const q = calc.questions.find((x) => x.id === inp.dataset.q);
      if (q.type === "number") answers[q.id] = Math.max(q.min, Math.min(q.max, Number(inp.value) || 0));
      else if (q.type === "choice") answers[q.id] = Number(inp.value);
      else answers[q.id] = [...el.querySelectorAll(`input[data-q="${q.id}"]:checked`)].map((x) => Number(x.value));
      update();
    });
    inp.addEventListener("change", () => inp.dispatchEvent(new Event("input")));
  });
  el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const q = calc.questions.find((x) => x.id === b.dataset.q);
    const inp = el.querySelector(`#in-${q.id}`);
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
    if (res.sent) lf.innerHTML = `<p class="calc-done">Thanks, ${esc(fd.name.trim().split(" ")[0])}! Your request was sent to ${esc(calc.business)}. They'll be in touch soon to confirm your exact price.</p>`;
    else msg.textContent = res.error || "That didn't send. Please try again.";
  });
}
