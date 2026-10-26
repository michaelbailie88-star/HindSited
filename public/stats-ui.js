// Owner-only: the funnel. How many people visit, scan, open a report, look at
// plans, pay, or ask for a new website, and where the drop-offs are.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const root = $("#stats");
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
let days = 7;
try { days = Number(localStorage.getItem("hs-stats-days")) || 7; } catch {}

async function load() {
  root.setAttribute("aria-busy", "true");
  let status = 0, data = {};
  try { const r = await fetch("/api/event?days=" + days, { credentials: "same-origin", cache: "no-store" }); status = r.status; data = await r.json(); } catch {}
  root.removeAttribute("aria-busy");
  if (status === 403) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Owner only</h1><p>Sign in with the studio account to see the stats.</p><a class="btn" href="/account?next=/stats">Sign in</a></div>`; return; }
  if (!data.funnel) { root.innerHTML = `<div class="card-panel"><h1 class="panel-h">Stats didn't load</h1><p>Refresh the page in a minute.</p></div>`; return; }
  draw(data);
}

function draw(d) {
  const t = d.total || {};
  const max = Math.max(1, ...d.funnel.map(([k]) => t[k] || 0));
  const name = Object.fromEntries(d.funnel.map(([k, l]) => [k, l]));
  const rows = d.funnel.map(([k, label, from], i) => {
    const n = t[k] || 0, base = from || (i ? d.funnel[i - 1][0] : null), prev = base ? t[base] || 0 : 0;
    const of = from ? `of “${esc(name[from].toLowerCase())}”` : "of the step above";
    return `<li class="st-row${from ? " st-branch" : ""}"><div class="st-top"><b>${esc(label)}</b><span><b class="st-n">${n}</b>${i ? `<span class="muted small"> · ${pct(n, prev)} ${of}</span>` : ""}</span></div>
      <div class="st-bar"><i style="width:${Math.max(n ? 2 : 0, Math.round((n / max) * 100))}%"></i></div></li>`;
  }).join("");
  const tag = (ev) => Object.entries((d.tags || {})[ev] || {}).map(([k, v]) => `${esc(k)} ${v}`).join(" · ");
  const cols = [["home_view", "Visits"], ["scan_start", "Scans"], ["report_view", "Reports"], ["plans_view", "Plans"], ["paid", "Paid"], ["build_click", "Build"], ["lead_sent", "Leads"]];
  const daily = [...d.byDay].reverse().map((r) => `<tr><th scope="row">${esc(day(r.day))}</th>${cols.map(([k]) => `<td>${r.counts[k] || ""}</td>`).join("")}</tr>`).join("");
  const others = d.other.map(([k, label]) => `<li><span>${esc(label)}</span><b>${t[k] || 0}</b></li>`).join("");
  root.innerHTML = `<p class="eyebrow">Owner</p><h1 class="fx-h">Funnel</h1>
    <p class="muted">Counts from the last ${d.days} days. Your own visits and clicks (signed in as the studio) aren't counted, and neither are bots. Nothing personal is stored.</p>
    <div class="st-days" role="group" aria-label="Time range">${[7, 30, 90].map((n) => `<button type="button" class="ba-tab${n === d.days ? " on" : ""}" data-days="${n}" aria-pressed="${n === d.days}">${n} days</button>`).join("")}</div>
    <section class="fx-card st-card"><h2>Where people drop off</h2><ol class="st-funnel">${rows}</ol>
      ${tag("scan_start") ? `<p class="muted small">Scans: ${tag("scan_start")}</p>` : ""}
      ${tag("checkout_start") ? `<p class="muted small">Checkouts: ${tag("checkout_start")}</p>` : ""}
      ${tag("paid") ? `<p class="muted small">Paid: ${tag("paid")}</p>` : ""}
      ${tag("lead_sent") ? `<p class="muted small">Website requests: ${tag("lead_sent")}</p>` : ""}</section>
    <div class="st-two">
      <section class="fx-card st-card"><h2>Where visitors came from</h2>${d.sources.length ? `<ul class="st-list">${d.sources.map(([s, n]) => `<li><span class="one-line">${s === "direct" ? "Typed it in / no referrer" : esc(s)}</span><b>${n}</b></li>`).join("")}</ul>` : `<p class="muted">No visits counted yet.</p>`}</section>
      <section class="fx-card st-card"><h2>Also counted</h2><ul class="st-list">${others}</ul></section>
    </div>
    <section class="fx-card st-card"><h2>Day by day</h2><div class="st-scroll"><table class="st-table"><thead><tr><th scope="col">Day</th>${cols.map(([, l]) => `<th scope="col">${l}</th>`).join("")}</tr></thead><tbody>${daily}</tbody></table></div></section>
    <p class="muted small">Counting started ${esc(day("2026-10-26"))}. Nothing before then was tracked.</p>`;
  root.querySelectorAll("[data-days]").forEach((b) => (b.onclick = () => { days = Number(b.dataset.days); try { localStorage.setItem("hs-stats-days", String(days)); } catch {} load(); }));
}

load();
