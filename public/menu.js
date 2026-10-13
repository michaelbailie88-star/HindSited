// Phone/tablet header menu: the hamburger button opens and closes the menu.
(function () {
  var btn = document.querySelector(".menu-btn"), menu = document.getElementById("siteMenu");
  if (!btn || !menu) return;
  var wide = window.matchMedia("(min-width: 900px)");
  function set(open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("open", open);
    document.documentElement.classList.toggle("menu-open", open);
  }
  btn.addEventListener("click", function () { set(btn.getAttribute("aria-expanded") !== "true"); });
  // choosing anything in the menu closes it (the account buttons swap views without a page load)
  menu.addEventListener("click", function (e) { if (e.target.closest("a, button")) set(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && menu.classList.contains("open")) { set(false); btn.focus(); } });
  document.addEventListener("click", function (e) { if (menu.classList.contains("open") && !e.target.closest(".top")) set(false); });
  (wide.addEventListener ? wide.addEventListener("change", function () { if (wide.matches) set(false); }) : wide.addListener(function () { if (wide.matches) set(false); }));
  window.addEventListener("popstate", function () { set(false); });
})();
