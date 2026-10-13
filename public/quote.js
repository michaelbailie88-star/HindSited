// Public quote calculator page (/q/<slug>). With ?embed=1 it renders bare for
// use inside an iframe on the business's own website.
import { renderCalculator } from "./calc-ui.js";
const root = document.querySelector("#qp");
const slug = (location.pathname.match(/^\/q\/([\w-]{3,60})\/?$/) || [])[1];
const embed = new URLSearchParams(location.search).get("embed") === "1";
if (embed) document.documentElement.classList.add("embed");

function postHeight() { if (embed && parent !== window) parent.postMessage({ hindsitedHeight: document.documentElement.scrollHeight, slug }, "*"); }
new ResizeObserver(postHeight).observe(document.body);

(async () => {
  if (!slug) { root.innerHTML = "<p>This quote calculator doesn't exist.</p>"; return; }
  let c;
  try { const r = await fetch("/api/calc?slug=" + encodeURIComponent(slug)); c = await r.json(); if (!r.ok) throw 0; }
  catch { root.innerHTML = `<div class="calc"><h1 class="calc-h">This quote calculator isn't available.</h1></div>`; return; }
  document.title = c.title + " | " + c.business;
  renderCalculator(root, c, {
    onLead: async (d) => {
      try {
        const r = await fetch("/api/calc-lead", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...d, slug, page: embed ? document.referrer : location.href }) });
        return await r.json();
      } catch { return { error: "Couldn't send. Check your connection and try again." }; }
    }
  });
  postHeight();
})();
