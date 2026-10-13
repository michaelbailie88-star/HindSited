// In-page audit. pageAudit and foldCta run INSIDE the rendered page via
// puppeteer's page.evaluate, so they must stay self-contained. They rely on
// window.__hsTR (from makeTextRules) being injected first.

export function pageAudit(opts) {
  const TR = window.__hsTR;
  const now = opts.now;
  const nowYear = new Date(now).getUTCFullYear();
  const findings = [];
  const counts = {};
  const MAX_PER_RULE = 4;
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const docW = document.documentElement.scrollWidth;

  const rectOf = (r) => ({ x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) });
  const clip = (s, n = 140) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  function add(rule, evidence, rect, extra) {
    counts[rule] = (counts[rule] || 0) + 1;
    if (counts[rule] > MAX_PER_RULE) return;
    findings.push({ rule, evidence: clip(evidence), rect: rect || null, extra: extra || null });
  }

  const visCache = new Map();
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (visCache.has(el)) return visCache.get(el);
    let ok = true;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) ok = false;
    if (ok) {
      const r = el.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) ok = false;
      else if (r.right + window.scrollX < 0 || r.left + window.scrollX > docW + 5) ok = false;
    }
    if (ok) {
      // clipped-away "visually hidden" ancestors
      let p = el, depth = 0;
      while (p && p !== document.body && depth < 6) {
        const cs = getComputedStyle(p);
        if ((cs.clip && cs.clip !== "auto" && /rect\(0(px)?,? 0(px)?/.test(cs.clip)) || /inset\(50%\)/.test(cs.clipPath || "")) { ok = false; break; }
        p = p.parentElement; depth++;
      }
    }
    visCache.set(el, ok);
    return ok;
  }

  // ---------------------------------------------------------------- texts
  const SKIP_SEL = "script,style,noscript,template,code,pre,textarea,select,option,svg";
  const texts = [];
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode()) && texts.length < 8000) {
    const t = n.nodeValue;
    if (!t || !t.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest(SKIP_SEL)) continue;
    if (!visible(el)) continue;
    texts.push({ node: n, el, text: t });
  }
  function rangeRect(node, index, length) {
    try {
      const rg = document.createRange();
      rg.setStart(node, Math.max(0, index));
      rg.setEnd(node, Math.min(node.nodeValue.length, index + Math.max(1, length)));
      const r = rg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return rectOf(r);
    } catch (e) {}
    return rectOf(node.parentElement.getBoundingClientRect());
  }
  const allText = texts.map((t) => t.text).join("\n");

  // Per-text-node rules
  let bestCopyright = null;
  for (const t of texts) {
    for (const h of TR.scanText(t.text, now)) {
      const whole = t.text.trim().length <= 220;
      add(h.rule, t.text.substr(Math.max(0, h.index - 40), h.length + 80), whole ? rangeRect(t.node, t.text.search(/\S/), t.text.trim().length) : rangeRect(t.node, h.index, h.length), h.extra);
    }
    // $0 prices: context = price-like class/id within 4 ancestors
    let ctx = false, p = t.el, d = 0;
    while (p && d < 4) { if (/price|money|amount|cost|total/i.test((p.className && p.className.baseVal !== undefined ? p.className.baseVal : p.className) + " " + p.id)) { ctx = true; break; } p = p.parentElement; d++; }
    const zp = TR.zeroPrice(t.text, ctx);
    if (zp) add("zero_price", t.text, rangeRect(t.node, zp.index, zp.length));
    const cy = TR.copyrightYear(t.text);
    if (cy && (!bestCopyright || cy.year > bestCopyright.year)) bestCopyright = { ...cy, node: t.node, text: t.text };
  }
  // copyright may be split across nodes ("©" + "2021") - fall back to joined text
  if (!bestCopyright) {
    const cy = TR.copyrightYear(allText);
    if (cy) {
      const hit = texts.find((t) => t.text.includes(String(cy.year)));
      if (hit) bestCopyright = { year: cy.year, index: hit.text.indexOf(String(cy.year)), length: 4, node: hit.node, text: hit.text };
    }
  }
  if (bestCopyright && bestCopyright.year < nowYear && bestCopyright.year > 1990) {
    add("old_copyright", bestCopyright.text, rangeRect(bestCopyright.node, bestCopyright.index, bestCopyright.length), { year: bestCopyright.year, current: nowYear });
  }

  // Shopify-style leftover price labels ("Regular price Sale price" with no sale)
  for (const el of Array.from(document.querySelectorAll('[class*="price"]')).slice(0, 300)) {
    if (!visible(el) || el.querySelector('[class*="price"]')) continue;
    const vis = texts.filter((t) => el.contains(t.node)).map((t) => t.text).join(" ");
    if (/regular price/i.test(vis) && /sale price/i.test(vis)) { add("template_text", vis, rectOf(el.getBoundingClientRect()), { kind: "price-labels" }); }
  }

  // ---------------------------------------------------------------- meta
  const title = (document.title || "").trim();
  const descEl = document.querySelector('meta[name="description" i]');
  const desc = descEl ? (descEl.getAttribute("content") || "").trim() : "";
  const robotsMetas = Array.from(document.querySelectorAll("meta[name]"))
    .filter((m) => /robots|bot/i.test(m.getAttribute("name")) && /noindex/i.test(m.getAttribute("content") || ""))
    .map((m) => ({ name: m.getAttribute("name"), content: m.getAttribute("content") }));
  const viewportMeta = !!document.querySelector('meta[name="viewport" i]');
  const h1s = Array.from(document.querySelectorAll("h1")).filter(visible);
  const lang = document.documentElement.getAttribute("lang") || "";

  // ---------------------------------------------------------------- links
  const anchors = Array.from(document.querySelectorAll("a"));
  const origin = location.origin;
  const host = location.hostname.replace(/^www\./, "");
  const links = [];
  const seen = new Set();
  const SOCIAL = { facebook: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/, instagram: /(^|\.)instagram\.com$/, twitter: /(^|\.)(twitter\.com|x\.com)$/, linkedin: /(^|\.)linkedin\.com$/, youtube: /(^|\.)(youtube\.com|youtu\.be)$/, tiktok: /(^|\.)tiktok\.com$/, pinterest: /(^|\.)pinterest\.[a-z.]+$/, yelp: /(^|\.)yelp\.[a-z.]+$/ };
  const LABELNET = { facebook: /facebook|\bfb\b/i, instagram: /instagram/i, twitter: /twitter/i, linkedin: /linked\s?in/i, youtube: /you\s?tube/i, tiktok: /tik\s?tok/i, pinterest: /pinterest/i, yelp: /\byelp\b/i };
  const BUILDER_SOCIAL = /^(?:www\.)?(?:facebook|instagram|twitter|x|youtube|pinterest|linkedin|tiktok)\.com\/(?:wix|squarespace|godaddy|weebly|shopify|wordpress|elementor|webflow|hostinger|jimdo|strikingly|duda)\/?$|^(?:www\.)?(?:facebook|instagram|twitter|x|youtube|pinterest|linkedin|tiktok)\.com\/?(?:#.*)?$|^(?:www\.)?linkedin\.com\/company\/?$/i;
  const DEAD_HREF = /^(?:#!?|javascript:\s*(?:void\(0\);?|;)?|)$/i;
  const TOGGLE_CLASS = /toggle|dropdown|drop-down|menu|trigger|close|tab|accordion|modal|cart|search|burger|nav|slick|swiper|arrow|prev|next|carousel|slide|lightbox|popup|play|filter|sort|skip|back-to-top|scroll|expand|collapse|more-link-js|lang|currency|share/i;
  const hashCandidates = [];
  let telCount = 0, mailCount = 0, privacyLink = false, contactLink = false;

  anchors.forEach((a) => {
    const raw = (a.getAttribute("href") || "").trim();
    const label = clip([a.getAttribute("aria-label"), a.getAttribute("title"), a.innerText, Array.from(a.querySelectorAll("img[alt]")).map((i) => i.alt).join(" "), Array.from(a.querySelectorAll("svg title")).map((s) => s.textContent).join(" ")].filter(Boolean).join(" "), 80);
    const isVis = visible(a);
    if (/^tel:/i.test(raw)) {
      telCount++;
      const num = raw.slice(4).replace(/%20/g, " ");
      const digits = num.replace(/\D/g, "");
      if (digits.length < 7 || /@/.test(num) || /[a-z]{3,}/i.test(num.replace(/ext|x/gi, "")) || TR.R.placeholder_phone.test(num) || /^1?(\d)\1{9}$/.test(digits)) add("bad_tel_link", "Phone link goes to “" + (raw || "nothing") + "”" + (label ? " (labelled “" + label + "”)" : ""), isVis ? rectOf(a.getBoundingClientRect()) : null, { href: raw });
      return;
    }
    if (/^mailto:/i.test(raw)) {
      mailCount++;
      const addr = decodeURIComponent(raw.slice(7).split("?")[0]).trim();
      if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(addr) || TR.R.placeholder_email.test(addr)) add("bad_mailto", "Email link goes to “" + (raw || "nothing") + "”", isVis ? rectOf(a.getBoundingClientRect()) : null, { href: raw });
      return;
    }
    if (a.hasAttribute("href") && DEAD_HREF.test(raw)) {
      if (!isVis) return;
      const cls = (a.className && typeof a.className === "string" ? a.className : "") + " " + (a.id || "") + " " + (a.parentElement ? a.parentElement.className : "");
      const text = (a.innerText || a.getAttribute("aria-label") || "").trim();
      if (!text || a.getAttribute("role") === "button" || a.hasAttribute("onclick") || a.hasAttribute("aria-haspopup") || a.hasAttribute("aria-expanded") || a.hasAttribute("aria-controls") || a.hasAttribute("data-toggle") || a.hasAttribute("data-bs-toggle") || a.hasAttribute("data-target") || a.hasAttribute("data-bs-target") || TOGGLE_CLASS.test(cls)) return;
      if (hashCandidates.length < 15) { a.setAttribute("data-hs-hash", String(hashCandidates.length)); hashCandidates.push({ id: hashCandidates.length, text: clip(text, 60), href: raw || "(empty)", rect: rectOf(a.getBoundingClientRect()) }); }
      return;
    }
    if (/privacy/i.test(raw + " " + label)) privacyLink = true;
    if (/contact|quote|estimate|book|appointment|schedule|consult|enquir|inquir|get in touch|reserv/i.test(raw + " " + label)) contactLink = true;
    let u;
    try { u = new URL(raw, location.href); } catch (e) { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    const uhost = u.hostname.replace(/^www\./, "");
    // social labels vs destinations
    let hrefNet = null;
    for (const k in SOCIAL) if (SOCIAL[k].test(u.hostname)) hrefNet = k;
    if (hrefNet) {
      const lab = label + " " + (typeof a.className === "string" ? a.className : "") + " " + Array.from(a.querySelectorAll("[class]")).map((c) => (typeof c.className === "string" ? c.className : "")).join(" ");
      const named = Object.keys(LABELNET).filter((k) => LABELNET[k].test(lab));
      if (named.length && !named.includes(hrefNet)) add("mislabeled_link", "Link labelled “" + (label || named.join(", ")) + "” goes to " + u.hostname + u.pathname, isVis ? rectOf(a.getBoundingClientRect()) : null, { label: named.join(","), dest: hrefNet });
      if (BUILDER_SOCIAL.test(u.hostname + u.pathname + u.hash)) add("social_placeholder", "Social icon goes to " + u.href + " instead of your own page", isVis ? rectOf(a.getBoundingClientRect()) : null, { href: u.href });
    }
    const internal = uhost === host;
    if (internal && /(?:^|\/)[\w-]*-copy(?:-\d+)?\/?$|\/copy-of-/i.test(u.pathname)) add("copy_slug", "“" + (label || u.pathname) + "” links to " + u.pathname, isVis ? rectOf(a.getBoundingClientRect()) : null, { href: u.href });
    const key = u.href.replace(/#.*$/, "");
    if (!seen.has(key)) {
      seen.add(key);
      links.push({ url: key, text: clip(label, 60), internal, nav: !!a.closest("header,nav,footer,[role=navigation]") });
    }
  });

  // ---------------------------------------------------------------- phones / emails
  const phoneHit = texts.find((t) => TR.R.phone.test(t.text));
  if (phoneHit && telCount === 0) {
    const m = TR.R.phone.exec(phoneHit.text);
    add("no_tap_to_call", phoneHit.text, rangeRect(phoneHit.node, m.index, m[0].length), { phone: m[0] });
  }
  const freeHit = texts.find((t) => TR.R.free_email.test(t.text)) || null;
  const freeMail = anchors.find((a) => /^mailto:/i.test(a.getAttribute("href") || "") && TR.R.free_email.test(a.getAttribute("href")));
  if (freeHit) { const m = TR.R.free_email.exec(freeHit.text); add("free_email", m[0], rangeRect(freeHit.node, m.index, m[0].length), { email: m[0] }); }
  else if (freeMail) add("free_email", freeMail.getAttribute("href").slice(7), visible(freeMail) ? rectOf(freeMail.getBoundingClientRect()) : null, { email: freeMail.getAttribute("href").slice(7) });

  // ---------------------------------------------------------------- images
  const imgs = Array.from(document.images);
  let noAlt = [], fileAlt = [], broken = 0, visImgs = 0;
  const FILEALT = /\.(?:jpe?g|png|webp|gif|avif|svg|heic)$|^(?:img|image|dsc|photo|pxl|screenshot|screen shot|untitled)[\s_-]?\d|^[a-z0-9]+(?:[_-][a-z0-9]+){2,}$/i;
  imgs.forEach((img) => {
    if (!visible(img)) return;
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    visImgs++;
    const src = img.currentSrc || img.src || "";
    if (src && !/^data:/.test(src) && img.complete && img.naturalWidth === 0) { broken++; add("broken_images", "Image did not load: " + src.split("?")[0].split("/").pop(), rectOf(r), { src }); }
    if (!img.hasAttribute("alt")) noAlt.push(img);
    else if (FILEALT.test((img.getAttribute("alt") || "").trim())) fileAlt.push(img);
    let dec = src; try { dec = decodeURIComponent(src); } catch (e) {}
    if (/screen[\s_-]?shot|screenshot/i.test(dec.split("?")[0].split("/").pop())) add("screenshot_images", "Image file named “" + dec.split("?")[0].split("/").pop() + "”", rectOf(r));
  });
  const altBad = noAlt.length + fileAlt.length;
  if (visImgs && (altBad >= 3 || altBad / visImgs >= 0.3)) {
    const ex = (fileAlt[0] || noAlt[0]);
    add("missing_alt", altBad + " of " + visImgs + " images have no description" + (fileAlt.length ? " or use a file name (e.g. “" + clip(fileAlt[0].getAttribute("alt"), 50) + "”)" : ""), ex ? rectOf(ex.getBoundingClientRect()) : null, { bad: altBad, total: visImgs });
  }

  // ---------------------------------------------------------------- empty sections
  const EMPTY_HEAD = /^(?:client |customer |our |patient )?(?:testimonials?|reviews?|what (?:our )?(?:clients|customers|people|patients) (?:are )?say(?:ing)?|gallery|our (?:work|projects|portfolio)|portfolio|recent projects|projects|faqs?|frequently asked questions|our team|meet the team|latest news|upcoming events|events)\b/i;
  Array.from(document.querySelectorAll("h1,h2,h3,h4")).forEach((h) => {
    const ht = (h.innerText || "").trim();
    if (!ht || ht.length > 60 || !EMPTY_HEAD.test(ht) || !visible(h)) return;
    const lvl = +h.tagName[1];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    w.currentNode = h;
    let node, chars = 0, media = 0, steps = 0, ended = false;
    // skip heading's own subtree
    let nx = h; while (nx && !nx.nextSibling) nx = nx.parentNode; if (!nx) return; w.currentNode = nx.nextSibling; node = w.currentNode;
    while (node && steps < 600) {
      steps++;
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (/^H[1-4]$/.test(tag) && +tag[1] <= lvl && visible(node)) { ended = true; break; }
        if (/^(IMG|IFRAME|VIDEO|CANVAS|PICTURE)$/.test(tag) && visible(node)) { const r = node.getBoundingClientRect(); if (r.width > 60 && r.height > 40) media++; }
        if (node.shadowRoot || /^[a-z]+-[a-z-]+$/i.test(tag)) { if (visible(node) && node.getBoundingClientRect().height > 80) media++; }
      } else if (node.nodeType === 3) {
        const pe = node.parentElement;
        if (pe && !pe.closest(SKIP_SEL) && visible(pe)) chars += node.nodeValue.trim().length;
      }
      if (chars >= 25 || media) break;
      node = w.nextNode();
    }
    if (!node) ended = true;
    if (ended && chars < 25 && !media) add("empty_section", "“" + ht + "” heading with nothing under it", rectOf(h.getBoundingClientRect()), { heading: ht });
  });

  // ---------------------------------------------------------------- mobile overflow
  const devW = opts.deviceWidth || window.innerWidth;
  if (opts.mobile && docW > devW + 4) {
    let worst = null, worstR = 0;
    const all = document.body ? document.body.getElementsByTagName("*") : [];
    for (let i = 0; i < all.length && i < 4000; i++) {
      const el = all[i];
      const r = el.getBoundingClientRect();
      if (r.right + window.scrollX > devW + 4 && r.width > 20 && r.height > 10 && r.right > worstR && visible(el)) { worst = el; worstR = r.right; }
    }
    add("mobile_overflow", "The page is " + docW + "px wide on a " + devW + "px phone screen" + (worst ? " (widest part: <" + worst.tagName.toLowerCase() + (worst.className && typeof worst.className === "string" ? " class=“" + clip(worst.className, 40) + "”" : "") + ">)" : ""), worst ? rectOf(worst.getBoundingClientRect()) : null, { width: docW });
  }

  // ---------------------------------------------------------------- forms
  const forms = Array.from(document.querySelectorAll("form")).filter((f) => !f.matches('[role=search], [action*="search"]') && !f.querySelector('input[type=search]'));
  const leadForms = forms.filter((f) => f.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select").length >= 2);
  const collects = forms.some((f) => f.querySelector('input[type=email], input[type=tel], input[name*="email" i], input[name*="phone" i]'));
  const iframesForm = Array.from(document.querySelectorAll("iframe")).some((f) => /form|typeform|jotform|calendly|acuity|square|booking|janeapp|mindbody|vagaro|setmore|hubspot/i.test(f.src || ""));

  // ---------------------------------------------------------------- signals
  const reviewWidget = !!document.querySelector('[class*="elfsight"],[class*="trustindex"],[class*="yotpo"],[class*="jdgm"],[class*="judgeme"],[class*="stamped"],[class*="okendo"],[class*="loox"],[class*="trustpilot"],[class*="testimonial"],[id*="testimonial"],iframe[src*="review"],iframe[src*="elfsight"]');
  const signals = {
    reviews: reviewWidget || TR.R.reviews.test(allText),
    hours: TR.R.hours.test(allText),
    address: TR.R.address.test(allText),
    phoneShown: !!phoneHit,
    tel: telCount, mailto: mailCount,
    leadForms: leadForms.length, forms: forms.length, collects, iframesForm,
    privacyLink, contactLink,
    store: !!document.querySelector('a[href*="/cart"], a[href*="/products/"], [class*="add-to-cart"], button[name="add"]'),
    platform: (function () {
      const html = document.documentElement.outerHTML.slice(0, 400000);
      if (/cdn\.shopify\.com|Shopify\.theme/.test(html)) return "Shopify";
      if (/static\.wixstatic\.com|wix\.com/.test(html)) return "Wix";
      if (/squarespace(-cdn)?\.com/.test(html)) return "Squarespace";
      if (/wp-content|wp-includes/.test(html)) return "WordPress";
      if (/webflow\.(com|io)/.test(html)) return "Webflow";
      if (/godaddy|img1\.wsimg\.com/.test(html)) return "GoDaddy";
      if (/weebly\.com/.test(html)) return "Weebly";
      if (/duda|dudaone/.test(html)) return "Duda";
      return "";
    })(),
    wordCount: allText.split(/\s+/).filter(Boolean).length
  };

  return {
    url: location.href, title, desc, robotsMetas, viewportMeta, h1Count: h1s.length, h1: h1s[0] ? clip(h1s[0].innerText, 100) : "", lang,
    findings, counts, links: links.slice(0, 400), hashCandidates, signals,
    docH, docW, vw: window.innerWidth, vh: window.innerHeight
  };
}

// Is there a visible call to action in the first screen?
export function foldCta(dims) {
  const ACTION = /\b(?:call|phone|contact|quote|estimate|book|schedule|appointment|reserve|reservations?|order|shop|buy|get started|start|sign ?up|subscribe|join|enrol+|register|apply|donate|request|consult(?:ation)?|free|inquire|enquire|visit|find (?:a|us)|locations?|menu|demo|try|hire|talk|chat|message|email|text us|learn more|view|see|explore|discover|browse|watch|download|claim|save|get)\b/i;
  const vh = (dims && dims.h) || window.innerHeight, vw = (dims && dims.w) || window.innerWidth;
  const els = Array.from(document.querySelectorAll('a[href], button, input[type=submit], input[type=button], [role=button]'));
  const hits = [];
  for (const el of els) {
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const r = el.getBoundingClientRect();
    const top = r.top + window.scrollY, left = r.left + window.scrollX;
    if (r.width < 24 || r.height < 16 || top + r.height <= 0 || top >= vh || left + r.width <= 0 || left >= vw) continue;
    const href = (el.getAttribute && el.getAttribute("href")) || "";
    const text = ((el.innerText || el.value || "") + " " + (el.getAttribute("aria-label") || "")).trim();
    if (/^(tel|mailto|sms):/i.test(href) || ACTION.test(text) || /contact|quote|book|appointment|schedule|shop|order|cart|reserv|collections/i.test(href)) {
      hits.push({ text: text.slice(0, 40), rect: { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) } });
    }
  }
  return { count: hits.length, first: hits.slice(0, 3), vw, vh };
}
