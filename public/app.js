import { buildReport, CATEGORIES } from "./rules.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const API = window.HS_API || "/api";

const form = $("#scanForm"), input = $("#url"), go = $("#go"), errEl = $("#formErr");

async function post(path, body, timeoutMs = 70000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
    let data = null;
    try { data = await res.json(); } catch {}
    if (res.status === 429) return { error: "You're checking sites a little fast. Wait a minute and try again.", status: 429 };
    if (!res.ok) return { error: (data && data.error) || "Something went wrong (" + res.status + ").", status: res.status, ...(data || {}) };
    return data;
  } catch (e) {
    return { error: e.name === "AbortError" ? "That took too long. The site may be very slow." : "Couldn't reach the checker. Check your connection.", status: 0 };
  } finally { clearTimeout(t); }
}

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

const SKIP_PATH = /\/(cart|checkout|account|login|log-in|signin|sign-in|register|wp-admin|wp-login|search|cdn-cgi|feed|tag|tags|author|wp-json|xmlrpc|cgi-bin)(\/|$)|\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3|mov)$/i;

async function run(url) {
  go.disabled = true;
  $("#hero").hidden = true; $("#checks").hidden = true; $("#report").hidden = true;
  const prog = $("#progress"); prog.hidden = false;
  $("#progHost").textContent = new URL(url).hostname.replace(/^www\./, "");
  ["render", "click", "pages", "links", "speed"].forEach((s) => step(s, null));
  window.scrollTo({ top: 0 });

  step("render", "active"); step("speed", "active");
  const speedP = Promise.all([post("/speed", { url, strategy: "mobile" }), post("/speed", { url, strategy: "desktop" })]);

  const render = await post("/render", { url });
  if (!render || render.error) { showError(render ? render.error : "Unknown error"); return; }
  step("render", "done");
  step("click", "done", render.audit.hashCandidates.length ? `Tested ${Math.min(render.audit.hashCandidates.length, 15)} link${render.audit.hashCandidates.length === 1 ? "" : "s"} that should do something` : "No suspicious buttons to test");

  // ---- other pages
  step("pages", "active");
  const home = new URL(render.finalUrl);
  const homeKey = home.origin + home.pathname.replace(/\/$/, "");
  const sameSite = (u) => u.hostname.replace(/^www\./, "") === home.hostname.replace(/^www\./, "");
  const cand = [];
  const seenPath = new Set([homeKey]);
  let productCount = 0;
  const ordered = [...render.audit.links.filter((l) => l.internal && l.nav), ...render.audit.links.filter((l) => l.internal && !l.nav)];
  for (const l of ordered) {
    let u; try { u = new URL(l.url); } catch { continue; }
    if (!sameSite(u) || SKIP_PATH.test(u.pathname) || u.search.length > 60) continue;
    const key = u.origin + u.pathname.replace(/\/$/, "");
    if (seenPath.has(key)) continue;
    if (/\/products?\//.test(u.pathname)) { if (productCount >= 4) continue; productCount++; }
    seenPath.add(key);
    cand.push(u.href);
    if (cand.length >= 24) break;
  }
  $("#pagesNote").textContent = cand.length ? `Reading ${cand.length} more page${cand.length === 1 ? "" : "s"}` : "No other pages found";
  const batches = [];
  for (let i = 0; i < cand.length; i += 8) batches.push(cand.slice(i, i + 8));
  if (!batches.length) batches.push([]);
  const crawlRes = await Promise.all(batches.map((b, i) => post("/crawl", { urls: b, origin: i === 0 ? home.origin : undefined })));
  const pages = crawlRes.flatMap((r) => (r && r.pages) || []);
  const site = (crawlRes.find((r) => r && r.site) || {}).site || null;
  const okCount = pages.filter((p) => p.status >= 200 && p.status < 300).length;
  step("pages", "done", `Checked ${okCount + 1} page${okCount ? "s" : ""}`);

  // ---- links
  step("links", "active");
  const linkMap = new Map();
  const addLink = (url, meta) => { const k = url.replace(/#.*$/, ""); if (!linkMap.has(k) && !seenPath.has(k.replace(/\/$/, "")) && k.replace(/\/$/, "") !== homeKey) linkMap.set(k, { url: k, ...meta }); };
  for (const l of render.audit.links) addLink(l.url, { internal: l.internal, text: l.text, from: render.finalUrl, kind: "page" });
  for (const p of pages) {
    for (const l of p.links || []) addLink(l.url, { internal: l.internal, text: l.text, from: p.finalUrl || p.url, kind: "page" });
  }
  const imgList = [];
  for (const p of pages) for (const im of p.images || []) if (!linkMap.has(im) && imgList.length < 40) { imgList.push(im); linkMap.set(im, { url: im, internal: sameSite(new URL(im)), from: p.finalUrl || p.url, kind: "image" }); }
  // internal pages first, then external, images last; cap
  const all = [...linkMap.values()];
  const queue = [...all.filter((x) => x.kind === "page" && x.internal), ...all.filter((x) => x.kind === "page" && !x.internal), ...all.filter((x) => x.kind === "image")].slice(0, 160);
  $("#linksNote").textContent = `Following ${queue.length} link${queue.length === 1 ? "" : "s"} and images`;
  const linkResults = [];
  const lb = [];
  for (let i = 0; i < queue.length; i += 40) lb.push(queue.slice(i, i + 40));
  for (let i = 0; i < lb.length; i += 2) {
    const rs = await Promise.all(lb.slice(i, i + 2).map((b) => post("/links", { items: b.map((x) => ({ url: x.url, internal: x.internal })) })));
    rs.forEach((r, j) => (r && r.results || []).forEach((res, k) => { const src = lb[i + j][k]; linkResults.push({ ...src, ...res }); }));
  }
  // crawled pages that errored count as broken internal links
  for (const p of pages) if (p.status === 404 || p.status === 410 || p.status >= 500) {
    const from = render.audit.links.find((l) => l.url.replace(/\/$/, "") === p.url.replace(/\/$/, ""));
    linkResults.push({ url: p.url, broken: true, reason: String(p.status), kind: "page", internal: true, text: from ? from.text : "", from: render.finalUrl });
  }
  step("links", "done", `Followed ${linkResults.length} links and images`);

  // ---- speed
  const [mobile, desktop] = await speedP;
  const speedOk = (mobile && !mobile.error) || (desktop && !desktop.error);
  step("speed", speedOk ? "done" : "skipped", speedOk ? "Done" : "Google's speed test didn't respond this time");

  const scan = { render, pages, site, links: linkResults, linksChecked: true, speed: { mobile, desktop } };
  const report = buildReport(scan);
  try { sessionStorage.setItem("hs-last", JSON.stringify({ url, at: Date.now() })); } catch {}
  await showReport(report, scan);
  go.disabled = false;
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

function cropCanvas(rect, frame) {
  if (!shotImg || !rect) return null;
  const W = shotImg.naturalWidth, H = shotImg.naturalHeight;
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
  shotImg = await loadImg(scan.render.shots && scan.render.shots.mobile && scan.render.shots.mobile.data);
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
