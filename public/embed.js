// Drop-in embed: <script src="https://YOUR-HINDSITED-DOMAIN/embed.js" data-calc="your-slug" async></script>
(function () {
  var s = document.currentScript; if (!s) return;
  var slug = s.getAttribute("data-calc"); if (!slug) return;
  var origin = new URL(s.src).origin;
  var f = document.createElement("iframe");
  f.src = origin + "/q/" + encodeURIComponent(slug) + "?embed=1";
  f.title = "Instant quote";
  f.loading = "lazy";
  f.style.cssText = "width:100%;max-width:640px;border:0;height:900px;display:block;margin:0 auto;background:transparent";
  s.parentNode.insertBefore(f, s);
  window.addEventListener("message", function (e) {
    if (e.origin === origin && e.data && e.data.slug === slug && e.data.hindsitedHeight) f.style.height = Math.ceil(e.data.hindsitedHeight) + 4 + "px";
  });
})();
