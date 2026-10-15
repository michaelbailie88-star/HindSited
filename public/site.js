// Shared on every HindSited page: who's signed in, the header account control
// (always visible, on every screen size), and the phone menu.
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var listeners = [];
  function fetchMe() {
    return fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && d.signedIn ? d : { signedIn: false }; })
      .catch(function () { return { signedIn: false }; });
  }
  var mePromise = fetchMe();
  var HS = window.HS = {
    me: function () { return mePromise; },
    refresh: function () { mePromise = fetchMe(); mePromise.then(function (m) { renderAcct(m); listeners.forEach(function (f) { f(m); }); }); return mePromise; },
    onChange: function (f) { listeners.push(f); },
    signOut: function () { return fetch("/api/me", { method: "POST", credentials: "same-origin" }).catch(function () {}).then(function () { location.href = "/"; }); },
    esc: esc
  };

  // ---------------------------------------------------------- account control
  function initials(m) {
    var src = (m.name || "").trim() || (m.email || "").split("@")[0];
    var parts = src.split(/[\s._-]+/).filter(Boolean);
    return ((parts[0] || "?")[0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }
  function here() { return location.pathname + location.search; }
  function renderAcct(m) {
    var el = $("#acct");
    if (!el) return;
    if (!m.signedIn) {
      var nx = /^\/(account|reset)/.test(location.pathname) ? "" : "?next=" + encodeURIComponent(here());
      el.innerHTML = '<a class="acct-create" href="/account?mode=signup' + (nx ? "&" + nx.slice(1) : "") + '">Create account</a><a class="acct-signin" href="/account' + nx + '">Sign in</a>';
      return;
    }
    el.innerHTML = '<button type="button" class="acct-btn" id="acctBtn" aria-haspopup="true" aria-expanded="false" aria-controls="acctPop">' +
      '<span class="avatar" aria-hidden="true">' + esc(initials(m)) + '</span><span class="acct-label">Account</span><span class="caret" aria-hidden="true"></span></button>' +
      '<div class="acct-pop" id="acctPop" hidden>' +
        '<div class="acct-who"><b>' + esc(m.name || m.email) + '</b>' + (m.business ? '<span>' + esc(m.business) + '</span>' : "") + '<span class="acct-mail">' + esc(m.email) + '</span><span class="acct-plan">' + esc(m.planLabel || "Free") + ' plan</span></div>' +
        '<a href="/account">My dashboard</a><a href="/">Website check</a><a href="/reviews">Review Booster</a><a href="/quotes">Quote Calculator</a>' +
        '<button type="button" id="signOut">Sign out</button>' +
      '</div>';
    var btn = $("#acctBtn"), pop = $("#acctPop");
    btn.addEventListener("click", function (e) { e.stopPropagation(); setPop(pop.hidden); });
    $("#signOut").addEventListener("click", function () { HS.signOut(); });
    pop.addEventListener("click", function (e) { if (e.target.closest("a")) setPop(false); });
  }
  function setPop(open) {
    var btn = $("#acctBtn"), pop = $("#acctPop");
    if (!btn || !pop) return;
    if (open) setMenu(false);
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  // ---------------------------------------------------------- phone menu
  function setMenu(open) {
    var btn = $(".menu-btn"), menu = $("#siteMenu");
    if (!btn || !menu) return;
    if (open) setPop(false);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("open", open);
  }
  function initMenu() {
    var btn = $(".menu-btn"), menu = $("#siteMenu");
    if (!btn || !menu) return;
    btn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(btn.getAttribute("aria-expanded") !== "true"); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a, button")) setMenu(false); });
    var wide = window.matchMedia("(min-width: 900px)");
    var onWide = function () { if (wide.matches) setMenu(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else wide.addListener(onWide);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var pop = $("#acctPop");
    if (pop && !pop.hidden) { setPop(false); $("#acctBtn").focus(); }
    var menu = $("#siteMenu");
    if (menu && menu.classList.contains("open")) { setMenu(false); $(".menu-btn").focus(); }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".acct")) setPop(false);
    if (!e.target.closest(".top")) setMenu(false);
  });
  window.addEventListener("popstate", function () { setMenu(false); setPop(false); });

  // ---------------------------------------------------------- footer
  var STUDIO = "thelazycreatorco@gmail.com";
  function renderFoot() {
    var el = $("#siteFoot");
    if (!el) return;
    var yr = new Date().getFullYear();
    el.innerHTML =
      '<section class="foot-review" aria-labelledby="footRevH"><div class="wrap fr-in">' +
        '<div><h2 id="footRevH">Leave a review</h2><p>Has HindSited helped your business? A quick review helps other owners find it.</p></div>' +
        '<div class="fr-act"><a class="btn" href="/account#review" id="footWrite">Write a review</a><a class="btn ghost-light" id="footGoogle" href="#" target="_blank" rel="noopener" hidden>Review us on Google</a></div>' +
      '</div></section>' +
      '<div class="wrap foot-grid">' +
        '<div class="foot-brand"><a class="brand" href="/" aria-label="HindSited home"><span class="brand-mark" aria-hidden="true"></span><span class="wm">Hind<span>Sited</span></span></a>' +
          '<p>Made by <a href="https://thelazycreatorcompany.com" rel="noopener" target="_blank">The Lazy Creator Company</a>, a one-person web studio in Guelph, Ontario.</p>' +
          '<p class="foot-trust">Built for business owners. Your information is never sold, shared or used for marketing.</p></div>' +
        '<nav class="foot-col" aria-label="Tools"><h3>Tools</h3><a href="/">Website check</a><a href="/reviews">Review Booster</a><a href="/quotes">Quote Calculator</a><a href="/account">My dashboard</a><a href="/help">Help: how everything works</a></nav>' +
        '<nav class="foot-col" aria-label="Policies"><h3>Policies</h3><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/cancel">Cancellation and refunds</a><a href="/account#settings">Manage or cancel my plan</a></nav>' +
        '<div class="foot-col"><h3>Contact</h3><a class="foot-mail" href="mailto:' + STUDIO + '">' + STUDIO + '</a><a href="https://thelazycreatorcompany.com" target="_blank" rel="noopener">thelazycreatorcompany.com</a><p>Guelph, ON, Canada</p></div>' +
      '</div>' +
      '<div class="wrap foot-base"><p>\u00a9 ' + yr + ' The Lazy Creator Company. HindSited only reads what\u2019s publicly visible on a website and never fills in or submits forms.</p></div>';
    fetch("/api/reviews", { cache: "no-store", credentials: "same-origin" }).then(function (r) { return r.json(); }).then(function (d) {
      var g = $("#footGoogle");
      if (d && d.google && g) { g.href = d.google; g.hidden = false; }
    }).catch(function () {});
  }

  function start() { initMenu(); renderFoot(); mePromise.then(renderAcct); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
