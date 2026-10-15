// The signed-in account dashboard: who you are, your plan and usage, your
// reports and tools, billing, branding, settings and your review of HindSited.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "");
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return String(u || ""); } };
const scoreCls = (s) => (s == null ? "" : s >= 90 ? "good" : s >= 75 ? "ok" : "bad");

export async function renderDashboard(el, { me, flash, api, upgrade, refreshMe }) {
  const [{ data: d }, kitsR, calcsR, revR] = await Promise.all([api("/me"), api("/kit?mine=1"), api("/calc?mine=1"), api("/reviews" + (me.plan === "owner" ? "?all=1" : ""))]);
  if (!d.signedIn) { location.href = "/account"; return; }
  const kits = (kitsR.data && kitsR.data.kits) || [], calcs = (calcsR.data && calcsR.data.calcs) || [];
  const rv = revR.data || {};
  const free = d.plan === "free", owner = d.plan === "owner";
  const first = (d.name || "").split(" ")[0];
  const leadsTotal = calcs.reduce((n, c) => n + (c.leadCount || 0), 0);

  // plan card
  const planSub = owner ? "Unlimited, all features" : free ? "1 free website check, 1 review kit, 1 calculator trial" : d.lifetime ? "Lifetime access" : "Monthly";
  const renewLine = d.renewal && d.renewal.periodEnd ? (d.renewal.cancelling ? `Ends ${day(d.renewal.periodEnd)}` : `Renews ${day(d.renewal.periodEnd)}`) : "";
  // usage
  let usage;
  if (owner) usage = `<p class="stat-big">${d.scansUsed}</p><p class="stat-sub">checks this month · no limit</p>`;
  else if (free) usage = `<p class="stat-big">${d.freeUsed ? 0 : 1}<small> of 1</small></p><p class="stat-sub">free website check ${d.freeUsed ? "used" : "left"}</p>`;
  else {
    const pct = d.scansAllowed ? Math.min(100, Math.round((d.scansUsed / d.scansAllowed) * 100)) : 0;
    usage = `<p class="stat-big">${d.scansRemaining}<small> left</small></p><div class="meter" role="img" aria-label="${d.scansUsed} of ${d.scansAllowed} checks used"><i style="width:${pct}%"></i></div><p class="stat-sub">${d.scansUsed} of ${d.scansAllowed} used · resets ${day(d.resetsOn)}</p>`;
  }
  const bizAllowed = d.businessesAllowed == null ? "No limit" : d.businessesAllowed;

  const reports = (d.reports || []).map((r) => `<li><a href="/r/${esc(r.id)}"><span class="r-site">${esc(r.site || host(r.url))}</span><span class="r-date">${day(r.at)}</span></a>${r.score != null ? `<span class="score-pill ${scoreCls(r.score)}" title="${esc(r.grade || "")}">${r.score}</span>` : `<span class="score-pill">…</span>`}</li>`).join("");
  const kitRows = kits.map((k) => `<li><a href="/reviews">${esc(k.name)}</a><a class="muted small" href="/review/${esc(k.slug)}" target="_blank">Review page ↗</a></li>`).join("");
  const calcRows = calcs.map((c) => `<li><a href="/quotes">${esc(c.business || c.title)}</a><span class="muted small">${c.leadCount || 0} request${c.leadCount === 1 ? "" : "s"}${c.active === false ? " · paused" : ""}</span></li>`).join("");
  const brand = d.brand || {};
  const myRev = rv.mine;

  el.innerHTML = `<div class="dash">
    ${flash ? `<p class="flash ${flash.ok ? "ok" : ""}">${esc(flash.text)}</p>` : ""}
    ${!d.verified ? `<div class="flash dash-verify"><span>Please confirm your email address. We sent a confirmation link to <b class="nowrap-email verify-mail">${esc(d.email)}</b></span><button type="button" class="linkish" id="resend">Resend link</button></div>` : ""}
    <header class="dash-head">
      <div class="avatar big" aria-hidden="true">${esc(((d.name || d.email)[0] || "?").toUpperCase())}</div>
      <div class="dash-who"><p class="eyebrow">Your dashboard</p><h2 class="dash-h">${first ? "Hi, " + esc(first) : "Welcome"}</h2>
        <p class="dash-meta">${d.business ? `<b>${esc(d.business)}</b>` : ""}${d.website ? `<a href="${esc(d.website)}" target="_blank" rel="noopener">${esc(host(d.website))}</a>` : ""}<span class="email-line">${esc(d.email)}</span></p></div>
    </header>

    <div class="stat-grid">
      <section class="stat"><p class="stat-k">Plan</p><p class="stat-big">${esc(d.planLabel)}</p><p class="stat-sub">${planSub}${renewLine ? " · " + renewLine : ""}</p>
        <div class="stat-act">${free ? `<button class="btn small-btn" id="upgrade" type="button">See plans</button>` : ""}${d.hasBilling ? `<button class="btn ghost small-btn" id="billing" type="button">Manage billing</button>` : ""}</div></section>
      <section class="stat"><p class="stat-k">Website checks</p>${usage}</section>
      <section class="stat"><p class="stat-k">Businesses</p><p class="stat-big">${(d.businesses || []).length}<small> of ${bizAllowed}</small></p><p class="stat-sub">${(d.businesses || []).length ? esc(d.businesses.join(", ")) : "None checked yet"}</p>
        ${d.plan === "agency" ? `<div class="stat-act"><button class="btn ghost small-btn" id="addBiz" type="button">Add a business ($6 CAD/mo)</button></div>` : ""}</section>
      <section class="stat"><p class="stat-k">Quote requests</p><p class="stat-big">${leadsTotal}</p><p class="stat-sub">from ${calcs.length} calculator${calcs.length === 1 ? "" : "s"}</p></section>
    </div>

    <section class="dash-sec"><div class="sec-row"><h3>Run a website check</h3></div>
      <form class="dash-scan" id="dashScan" novalidate><label class="sr" for="dashUrl">Website address</label><input id="dashUrl" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="yourbusiness.com" value="${esc(d.website ? host(d.website) : "")}"><button class="btn" type="submit">Check it</button></form>
      <p class="form-err" id="scanErr" role="alert" hidden></p></section>

    <section class="dash-sec"><div class="sec-row"><h3>Your reports</h3><span class="muted small">${(d.reports || []).length}</span></div>
      ${reports ? `<ul class="dash-list reports">${reports}</ul>` : `<p class="muted">No reports yet. Run a website check above.</p>`}</section>

    <div class="tools-head"><h3 class="sub-h">Your fix tools</h3><p class="muted small">Included with ${free ? "every plan (free to try)" : "your plan"}: they fix the two gaps we find most often. <a href="/help#fix">How fixing works</a></p></div>
    <div class="tool-grid">
      <section class="dash-sec"><div class="sec-row"><h3>Review Booster</h3><a class="linkish" href="/reviews">${kits.length ? "Open" : "Set up"} →</a></div>
        ${kitRows ? `<ul class="dash-list">${kitRows}</ul>` : `<p class="muted">Fixes "no reviews on your homepage": more Google reviews with QR cards, messages and a review page.</p>`}</section>
      <section class="dash-sec"><div class="sec-row"><h3>Quote Calculator</h3><a class="linkish" href="/quotes">${calcs.length ? "Open" : "Set up"} →</a></div>
        ${calcRows ? `<ul class="dash-list">${calcRows}</ul>` : `<p class="muted">Fixes "no easy way to get a price": an instant-quote button that emails you every enquiry.</p>`}</section>
    </div>

    ${d.whiteLabel ? `<section class="dash-sec"><h3>Your branding on reports</h3>
      <p class="muted small">Your name and logo replace HindSited on reports and PDFs you share with clients.</p>
      <form id="brandForm" class="brand-form">
        <label>Business name<input id="bName" maxlength="60" value="${esc(brand.name || "")}" placeholder="Your agency name"></label>
        <label>Website (optional)<input id="bSite" maxlength="120" value="${esc(brand.site || "")}" placeholder="https://youragency.com"></label>
        <label>Logo (PNG, JPG or WebP, under 200 KB)<input id="bLogo" type="file" accept="image/png,image/jpeg,image/webp"></label>
        ${brand.logo ? `<div class="brand-prev"><img src="${esc(brand.logo)}" alt="Your logo"><button type="button" class="linkish" id="bRemove">Remove logo</button></div>` : ""}
        <button class="btn" type="submit">Save branding</button><span class="tool-note" id="bNote" role="status"></span>
      </form></section>` : ""}

    ${owner ? `<section class="dash-sec" id="buildsLink"><div class="sec-row"><h3>New-website builds</h3><a class="btn small-btn" href="/builds">Open builds and payments</a></div><p class="muted small">Make deposit and launch payment links, see who has paid, and who is behind on hosting.</p></section>` : ""}
    ${owner ? `<section class="dash-sec" id="moderate"><div class="sec-row"><h3>Reviews waiting for you</h3><span class="muted small">${(rv.all || []).filter((r) => r.status === "pending").length} pending</span></div>
      ${(rv.all || []).length ? `<ul class="mod-list">${rv.all.map((r) => `<li data-id="${esc(r.id)}"><div><span class="stars">${"★".repeat(r.rating)}<span>${"★".repeat(5 - r.rating)}</span></span> <b>${esc(r.name)}</b>${r.business ? " · " + esc(r.business) : ""} <span class="muted small mod-email">${esc(r.email)} · ${day(r.at)}</span></div><p>${esc(r.text)}</p>
        <div class="mod-act"><span class="mod-st ${esc(r.status)}">${esc(r.status)}</span>${r.status !== "approved" ? `<button class="btn small-btn" data-act="approve" type="button">Approve</button>` : ""}${r.status !== "rejected" ? `<button class="btn ghost small-btn" data-act="reject" type="button">Hide</button>` : ""}<button class="linkish" data-act="delete" type="button">Delete</button></div></li>`).join("")}</ul>` : `<p class="muted">No reviews yet.</p>`}</section>` : ""}

    <section class="dash-sec" id="review"><h3>Review HindSited</h3>
      ${myRev ? `<p class="muted small">Your review is <b>${myRev.status === "approved" ? "published" : myRev.status === "pending" ? "waiting for approval" : "not published"}</b>. You can update it any time.</p>` : `<p class="muted small">Tell other business owners what you think. Reviews are published after a quick check.</p>`}
      <form id="revForm" class="rev-form" novalidate>
        <fieldset class="star-pick"><legend>Your rating</legend>${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}"${myRev && myRev.rating === n ? " checked" : ""}><span aria-hidden="true">★</span><span class="sr">${n} star${n === 1 ? "" : "s"}</span></label>`).join("")}</fieldset>
        <label>Your review<textarea name="text" rows="3" maxlength="1000" placeholder="What did HindSited help you find or fix?">${esc(myRev ? myRev.text : "")}</textarea></label>
        <label class="check"><input type="checkbox" name="showBusiness"${myRev && myRev.showBusiness ? " checked" : ""}> Show my business name with my review</label>
        <p class="form-err" role="alert" hidden></p>
        <div class="row-act"><button class="btn" type="submit">${myRev ? "Update my review" : "Post my review"}</button>${rv.google ? `<a class="btn ghost" href="${esc(rv.google)}" target="_blank" rel="noopener">Review us on Google</a>` : ""}</div>
      </form></section>

    <section class="dash-sec" id="settings"><h3>Account settings</h3>
      <details class="set"><summary>Your details</summary>
        <form id="profForm" class="set-form" novalidate>
          <label>Your name<input name="name" maxlength="80" autocomplete="name" value="${esc(d.name)}"></label>
          <label>Business name<input name="business" maxlength="100" autocomplete="organization" value="${esc(d.business)}"></label>
          <label>Business website<input name="website" maxlength="200" inputmode="url" autocapitalize="off" value="${esc(d.website)}" placeholder="yourbusiness.com"></label>
          <label>Email<input value="${esc(d.email)}" disabled></label>
          <p class="form-err" role="alert" hidden></p><button class="btn" type="submit">Save details</button><span class="tool-note" role="status"></span>
        </form></details>
      <details class="set"><summary>${d.hasPassword ? "Change password" : "Set a password"}</summary>
        <form id="pwForm" class="set-form" novalidate>
          ${d.hasPassword ? `<label>Current password<input name="current" type="password" autocomplete="current-password"></label>` : ""}
          <label><span>New password <span class="opt">(8+ characters)</span></span><input name="password" type="password" autocomplete="new-password" minlength="8"></label>
          <p class="form-err" role="alert" hidden></p><button class="btn" type="submit">Save password</button><span class="tool-note" role="status"></span>
          <p class="muted small">Saving a new password signs you out on your other devices.</p>
        </form></details>
      <details class="set danger"><summary>Delete my account</summary>
        <form id="delForm" class="set-form" novalidate>
          <p>This permanently deletes your account, reports, review kits, calculators and their quote requests${d.monthly && d.monthly.length ? ", and cancels your monthly plan" : ""}. It can't be undone.</p>
          ${d.hasPassword ? `<label>Your password<input name="password" type="password" autocomplete="current-password"></label>` : ""}
          <label>Type DELETE to confirm<input name="confirm" autocomplete="off" autocapitalize="characters"></label>
          <p class="form-err" role="alert" hidden></p><button class="btn danger-btn" type="submit">Delete everything</button>
        </form></details>
      <p class="muted small dash-legal"><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/cancel">Cancellation policy</a> · Member since ${day(d.memberSince)}</p>
    </section>
  </div>`;

  // ---- wiring
  const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) });
  const showErr = (form, m) => { const e = $(".form-err", form); e.textContent = m; e.hidden = !m; };
  if ($("#resend")) $("#resend").onclick = async (e) => { const { data } = await post("/auth/resend", {}); e.target.replaceWith(Object.assign(document.createElement("span"), { textContent: data.sent ? "Sent! Check your inbox." : data.error || "Couldn't send. Try again later." })); };
  if ($("#upgrade")) $("#upgrade").onclick = upgrade;
  if ($("#billing")) $("#billing").onclick = async () => { const r = await post("/billing", {}); if (r.data.url) location.href = r.data.url; else alert(r.data.error || "Billing couldn't open."); };
  if ($("#addBiz")) $("#addBiz").onclick = async () => { const r = await post("/checkout", { plan: "extra", interval: "month" }); if (r.data.url) location.href = r.data.url; else alert(r.data.error || "Couldn't start checkout."); };
  $("#dashScan").onsubmit = (e) => {
    e.preventDefault();
    let v = $("#dashUrl").value.trim();
    if (!v) { $("#scanErr").textContent = "Enter a website address."; $("#scanErr").hidden = false; return; }
    location.href = "/?scan=" + encodeURIComponent(v);
  };
  const bf = $("#brandForm");
  if (bf) {
    let logo;
    if ($("#bRemove")) $("#bRemove").onclick = () => { logo = null; $(".brand-prev").remove(); };
    bf.onsubmit = async (e) => {
      e.preventDefault();
      const f = $("#bLogo").files[0];
      if (f) {
        if (f.size > 200 * 1024) { $("#bNote").textContent = "That logo is over 200 KB."; return; }
        logo = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      }
      const r = await post("/brand", { name: $("#bName").value, site: $("#bSite").value, ...(logo !== undefined ? { logo } : {}) });
      $("#bNote").textContent = r.data.brand ? "Saved. New reports will use your branding." : r.data.error || "Couldn't save.";
    };
  }
  el.querySelectorAll(".mod-list [data-act]").forEach((b) => (b.onclick = async () => {
    const li = b.closest("li");
    if (b.dataset.act === "delete" && !confirm("Delete this review for good?")) return;
    const r = await post("/reviews", { action: b.dataset.act, id: li.dataset.id });
    if (r.data.ok) renderDashboard(el, { me, flash: null, api, upgrade, refreshMe }).then(() => $("#moderate") && $("#moderate").scrollIntoView());
  }));
  const rf = $("#revForm");
  rf.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(rf);
    const r = await post("/reviews", { rating: Number(fd.get("rating")), text: fd.get("text"), showBusiness: fd.get("showBusiness") === "on" });
    if (!r.data.ok) { showErr(rf, r.data.error || "Couldn't save your review."); return; }
    showErr(rf, "");
    rf.insertAdjacentHTML("beforebegin", `<p class="flash ok">Thank you! Your review is saved and will appear once it's been checked.</p>`);
    rf.querySelector("button[type=submit]").textContent = "Update my review";
  };
  const pf = $("#profForm");
  pf.onsubmit = async (e) => {
    e.preventDefault();
    const r = await post("/account", { action: "profile", ...Object.fromEntries(new FormData(pf)) });
    if (!r.data.ok) { showErr(pf, r.data.error || "Couldn't save."); return; }
    showErr(pf, ""); $(".tool-note", pf).textContent = "Saved.";
    await refreshMe();
    renderDashboard(el, { me, flash: { ok: true, text: "Your details are saved." }, api, upgrade, refreshMe });
  };
  const pw = $("#pwForm");
  pw.onsubmit = async (e) => {
    e.preventDefault();
    const r = await post("/account", { action: "password", ...Object.fromEntries(new FormData(pw)) });
    if (!r.data.ok) { showErr(pw, r.data.error || "Couldn't save."); return; }
    showErr(pw, ""); pw.reset(); $(".tool-note", pw).textContent = "Password saved.";
  };
  const df = $("#delForm");
  df.onsubmit = async (e) => {
    e.preventDefault();
    const r = await post("/account", { action: "delete", ...Object.fromEntries(new FormData(df)) });
    if (!r.data.ok) { showErr(df, r.data.error || "Couldn't delete."); return; }
    location.href = "/?deleted=1";
  };
}
