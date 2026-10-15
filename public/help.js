// Help page: open the question a link points to, and filter by search.
(function () {
  function openHash() {
    var id = decodeURIComponent(location.hash.slice(1)); if (!id) return;
    var el = document.getElementById(id); if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    var inner = el.querySelector && el.querySelector("details.hq"); if (el.tagName === "SECTION" && inner && !el.querySelector("details[open]")) inner.open = true;
    setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 30);
  }
  window.addEventListener("hashchange", openHash);
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
    var el = document.getElementById(a.getAttribute("href").slice(1));
    if (el && el.tagName === "DETAILS") el.open = true;
  });
  openHash();
  var box = document.getElementById("hq"), none = document.querySelector(".hnone");
  if (box) box.addEventListener("input", function () {
    var t = box.value.trim().toLowerCase(), any = false;
    document.querySelectorAll(".hsec").forEach(function (s) {
      var shown = 0;
      s.querySelectorAll(":scope > details.hq").forEach(function (d) {
        var hit = !t || d.textContent.toLowerCase().indexOf(t) !== -1;
        d.hidden = !hit; if (hit) shown++;
        if (t && hit) d.open = true;
      });
      s.hidden = !!t && !shown && s.id !== "contact"; if (shown) any = true;
    });
    none.hidden = !t || any;
  });
})();
