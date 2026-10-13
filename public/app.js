import { buildReport, CATEGORIES } from "./rules.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const API = window.HS_API || "/api";

const form = $("#scanForm"), input = $("#url"), go = $("#go"), errEl = $("#formErr");

function cleanInput(v) {
  v = v.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try { const u = new URL(v); if (!/\./.test(u.hostname)) return null; return u.href; } catch { return null; }
}

function step(name, state, note) {
  const li = document.querySelector(`[data-step="${name}"]`);
  if (!li) return;
  li.classList.remove("active", "done", "skipped");
  if (state) li.classList.add(state);
  if (note) { const s = li.querySelector("small"); if (s) s.textContent = note; }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  errEl.hidden = true;
  const url = cleanInput(input.value);
  if (!url) { errEl.textContent = "Enter your website address, like yourbusiness.com."; errEl.hidden = false; input.focus(); return; }
  run(url);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The scan runs on the server in the background (it can take a minute or two
// on slow sites); this page starts it and follows its progress.
async function run(url) {
  go.disabled = true;
  $("#hero").hidden = true; $("#checks").hidden = true; $("#report").hidden = true;
  const prog = $("#progress"); prog.hidden = false;
  $("#progHost").textContent = new URL(url).hostname.replace(/^www\./, "");
  ["render", "click", "pages", "links", "speed"].forEach((s) => step(s, null));
  window.scrollTo({ top: 0 });
  step("render", "active");

  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^a-z0-9-]/gi, "");
  try {
    const r = await fetch(API + "/check-bg?id=" + encodeURIComponent(id) + "&url=" + encodeURIComponent(url));
    if (r.status === 429) { showError("You're checking sites a little fast. Wait a minute and try again."); return; }
    if (!r.ok && r.status !== 202) { showError("Couldn't start the check (" + r.status + "). Try again in a minute."); return; }
  } catch { showError("Couldn't reach the checker. Check your connection."); return; }

  const deadline = Date.now() + 6 * 60 * 1000;
  let data = null, misses = 0, lastCount = -1, lastChange = Date.now();
  while (Date.now() < deadline) {
    await sleep(2500);
    try {
      const r = await fetch(API + "/check?id=" + encodeURIComponent(id), { cache: "no-store" });
      data = await r.json();
    } catch { if (++misses > 8) { showError("Lost touch with the checker. Check your connection and try again."); return; } continue; }
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
  ["render", "click", "pages", "links"].forEach((s) => step(s, "done"));
  const speedOk = (scan.speed.mobile && !scan.speed.mobile.error) || (scan.speed.desktop && !scan.speed.desktop.error);
  step("speed", speedOk ? "done" : "skipped", speedOk ? "Done" : "Google's speed test didn't respond this time");
  const report = buildReport(scan);
  await showReport(report, scan);
  go.disabled = false;
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
  $("#progress").hidden = true;
  const rep = $("#report");
  rep.hidden = false;
  rep.innerHTML = `<div class="wrap narrow"><div class="err-box"><h3>We couldn't check that site</h3><p>${esc(msg)}</p><button class="btn" id="tryAgain">Try another address</button></div></div>`;
  $("#tryAgain").onclick = reset;
  go.disabled = false;
}

function reset() {
  $("#report").hidden = true; $("#progress").hidden = true;
  $("#hero").hidden = false; $("#checks").hidden = false;
  window.scrollTo({ top: 0 }); input.focus();
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

async function showReport(report, scan) {
  shotImg = await phoneImage(scan.render.shots && scan.render.shots.mobile);
  const host = new URL(scan.render.finalUrl).hostname.replace(/^www\./, "");
  const nowN = report.findings.filter((f) => f.severity === "Fix now").length;
  const soonN = report.findings.filter((f) => f.severity === "Fix soon").length;
  const worthN = report.findings.length - nowN - soonN;
  const dialColor = report.score >= 90 ? "#1d7347" : report.score >= 75 ? "#b86b00" : "#e5461d";
  const C = 2 * Math.PI * 70;
  const ms = scan.render.shots && scan.render.shots.mobile, ds = scan.render.shots && scan.render.shots.desktop;

  let html = `<div class="wrap">
  <div class="rep-head">
    <div class="dial" role="img" aria-label="Score ${report.score} out of 100">
      <svg viewBox="0 0 160 160"><circle cx="80" cy="80" r="70" fill="none" stroke="#e1dccf" stroke-width="12"/><circle cx="80" cy="80" r="70" fill="none" stroke="${dialColor}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - report.score / 100)}"/></svg>
      <div class="num"><div><b>${report.score}</b><small>out of 100</small></div></div>
    </div>
    <div class="rep-title">
      <p class="eyebrow">Your HindSited report</p>
      <h2>${esc(host)}: ${esc(report.grade.label)}</h2>
      <p>${esc(report.grade.note)}</p>
      <div class="tally">${nowN ? `<span class="chip now">${nowN} fix now</span>` : ""}${soonN ? `<span class="chip soon">${soonN} fix soon</span>` : ""}${worthN ? `<span class="chip">${worthN} worth fixing</span>` : ""}<span class="chip ok">${report.passed.length} checks passed</span></div>
      <p class="rep-meta">${report.pagesChecked} page${report.pagesChecked === 1 ? "" : "s"} read · ${report.linksChecked} links and images followed${report.platform ? " · built with " + esc(report.platform) : ""} · ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</p>
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

  html += `<div class="cta"><div><h3>Want these fixed?</h3><p>The Lazy Creator Company builds fast, hand-coded websites from $500, with every issue in this report handled.</p></div><a class="btn" href="https://thelazycreatorcompany.com" target="_blank" rel="noopener">See my work</a></div>
  <div class="again"><button id="again">Check another site</button></div></div>`;

  const rep = $("#report");
  rep.innerHTML = html;

  const tf = $("#topFixes");
  if (tf) report.top.forEach((f, i) => tf.appendChild(fixCard(f, i + 1, report, scan)));
  $("#again").onclick = reset;
  $("#progress").hidden = true;
  rep.hidden = false;
  window.scrollTo({ top: 0 });
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
