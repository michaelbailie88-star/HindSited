// HindSited rulebook: every check, its plain-English explanation and its
// weight. Written in advance so the report can never invent a problem.
// Shared by the browser report (and later the server).

export const CATEGORIES = {
  customers: "Getting customers",
  mistakes: "Embarrassing mistakes",
  broken: "Broken things",
  trust: "Trust",
  google: "Being found on Google",
  speed: "Speed and phones"
};

// weight: points off the score. 8-10 = fix now, 5-7 = fix soon, 1-4 = worth fixing.
export const RULES = {
  // ---------------- Getting customers
  no_cta_fold: { cat: "customers", weight: 7, title: "Nothing to tap at the top of the page on phones",
    why: "When the page opens on a phone, there's no button or link telling people what to do next: no call, book, quote or shop button.",
    cost: "Visitors who don't see a next step in the first few seconds tend to leave instead of scrolling to find one.",
    fix: "Put one clear button in the first screen, such as “Call now”, “Get a quote” or “Book online”.",
    pass: "There's a clear call to action in the first screen on phones" },
  no_contact_path: { cat: "customers", weight: 8, title: "No way to get in touch from the homepage",
    why: "We couldn't find a contact form, a phone link, an email link or a contact page link on your homepage.",
    cost: "People who are ready to buy have no obvious next step, so they go to whoever is easier to reach.",
    fix: "Add a short contact or quote form, a tap-to-call number and an email link to the homepage.",
    pass: "Visitors can reach you from the homepage" },
  no_tap_to_call: { cat: "customers", weight: 6, title: "Your phone number can't be tapped on phones",
    why: "Your number is on the page as plain text, so on a phone people have to copy it or type it out by hand to call you.",
    cost: "Every extra step between “I'll call them” and the call loses some callers.",
    fix: "Turn the number into a tap-to-call link (a tel: link) everywhere it appears.",
    pass: "Your phone number is tappable" },
  bad_tel_link: { cat: "customers", weight: 9, title: "Your phone link calls the wrong number",
    why: "A phone link on your site points to a placeholder, an empty number, or something that isn't a phone number at all.",
    cost: "Customers who tap to call you get nowhere, at the exact moment they wanted to buy.",
    fix: "Point every tel: link at your real number, written with digits only (for example tel:+15195550199).",
    pass: "Phone links point to real numbers" },
  bad_mailto: { cat: "customers", weight: 7, title: "Your email link is broken",
    why: "An email link on your site points to a placeholder or a badly written address.",
    cost: "People who tap it can't email you, and many won't try another way.",
    fix: "Set every mailto: link to your real address.",
    pass: "Email links point to real addresses" },

  // ---------------- Embarrassing mistakes
  lorem: { cat: "mistakes", weight: 9, title: "Placeholder “lorem ipsum” text is showing",
    why: "Dummy Latin text from a template is visible on your site.",
    cost: "It tells visitors the site was never finished, and that makes them doubt the business behind it.",
    fix: "Replace it with your own words, or delete the section.",
    pass: "No dummy “lorem ipsum” text" },
  template_text: { cat: "mistakes", weight: 8, title: "Leftover template text is showing",
    why: "Wording that came with your website template, such as “This is a paragraph” or empty price labels, is visible to visitors.",
    cost: "It looks unfinished and makes customers wonder what else was never checked.",
    fix: "Replace or delete every leftover template line shown below.",
    pass: "No leftover template wording" },
  placeholder_contact: { cat: "mistakes", weight: 9, title: "A fake phone number or email is on your site",
    why: "Your site shows contact details from a template, like 123-456-7890 or name@example.com.",
    cost: "Customers who try them can't reach you, and they look unprofessional to everyone else.",
    fix: "Replace them with your real phone number and email address.",
    pass: "No fake phone numbers or emails" },
  code_error: { cat: "mistakes", weight: 10, title: "An error message is showing on your site",
    why: "Visitors can see a raw code or template error on the page.",
    cost: "Error messages make a site look broken and unsafe, especially anywhere near a buy or contact button.",
    fix: "Have whoever manages the site fix the template or plugin that's causing it.",
    pass: "No visible error messages" },
  zero_price: { cat: "mistakes", weight: 8, title: "Something is priced at $0",
    why: "A product or service shows a $0 or $0.00 price.",
    cost: "It confuses shoppers, looks like a mistake, and can lead to orders you don't want to honour.",
    fix: "Set the real price, or hide the price for items that are quote-only.",
    pass: "No $0 prices" },
  old_copyright: { cat: "mistakes", weight: 5, title: "Your footer says the site is out of date",
    why: "The copyright year at the bottom of your site is old.",
    cost: "Visitors notice it and quietly assume the business isn't looking after its website, or may not be active.",
    fix: "Update the year, or set it to update itself automatically.",
    pass: "The copyright year is current" },
  stale_promo: { cat: "mistakes", weight: 7, title: "An expired offer is still on your site",
    why: "Your site is still promoting a sale or deadline that has already passed.",
    cost: "Customers who come for the offer feel misled, and it signals nobody is updating the site.",
    fix: "Take the expired offer down, or replace it with a current one.",
    pass: "No expired offers or deadlines" },
  markup_leftover: { cat: "mistakes", weight: 5, title: "Stray formatting symbols are showing",
    why: "Characters that were meant to be formatting, like ###, ** or raw link brackets, are showing as text.",
    cost: "Small slips like this make the whole site feel less trustworthy.",
    fix: "Edit the text shown below and remove the stray symbols.",
    pass: "No stray formatting symbols" },
  gibberish: { cat: "mistakes", weight: 5, title: "There's a garbled word on your site",
    why: "A run of letters on your page doesn't look like any real word, which usually means a typing slip that was never caught.",
    cost: "Typos on a business site make careful customers wonder about the care in your work.",
    fix: "Fix the word shown below.",
    pass: "No garbled words found" },
  empty_section: { cat: "mistakes", weight: 6, title: "A section has a heading but nothing under it",
    why: "A heading such as “Testimonials” or “Gallery” appears with no content below it.",
    cost: "An empty section draws attention to what's missing. It reads worse than having no section at all.",
    fix: "Fill the section, or remove the heading until you have content for it.",
    pass: "No empty sections" },
  screenshot_images: { cat: "mistakes", weight: 3, title: "Some photos are screenshots",
    why: "Some images on your site are screenshots rather than proper photos.",
    cost: "Screenshots are usually blurry and badly cropped, which makes products and work look cheaper than they are.",
    fix: "Replace them with the original photos.",
    pass: "Images are proper photos, not screenshots" },
  free_email: { cat: "mistakes", weight: 3, title: "You're using a personal email address",
    why: "Your site lists a Gmail, Hotmail or similar personal address for the business.",
    cost: "A branded address (you@yourbusiness.com) looks more established and gets trusted more.",
    fix: "Set up an email address on your own domain and use it on the site.",
    pass: "Business email uses your own domain" },
  copy_slug: { cat: "mistakes", weight: 4, title: "Links point to copied pages",
    why: "Some links go to pages with “copy” in the address, which usually means a duplicated draft page went live.",
    cost: "Visitors may land on the wrong or outdated page.",
    fix: "Point those links at the real pages, then delete the copies.",
    pass: "No links to copied draft pages" },

  // ---------------- Broken things
  dead_links: { cat: "broken", weight: 9, title: "Some links lead to pages that don't exist",
    why: "We followed the links on your site and some of them go to error pages or websites that no longer exist.",
    cost: "Every dead end is a visitor who gave up. Google also notices broken links.",
    fix: "Update or remove each link listed below.",
    pass: "Every link we checked works" },
  broken_images: { cat: "broken", weight: 8, title: "Some images don't load",
    why: "Some pictures on your site show up as empty boxes because the image file is missing.",
    cost: "Broken images make the site look abandoned and hide the products or work you're trying to show.",
    fix: "Re-upload each missing image or remove it.",
    pass: "All images load" },
  dead_buttons: { cat: "broken", weight: 7, title: "Buttons that do nothing when clicked",
    why: "We clicked these links ourselves and nothing happened: no new page, no menu, no pop-up.",
    cost: "People click, nothing happens, and they assume the site is broken.",
    fix: "Link each one to the right page, or remove it.",
    pass: "Every button we tested does something" },
  mislabeled_link: { cat: "broken", weight: 5, title: "Links are labelled wrong",
    why: "Some links say they go to one place but actually go somewhere else, like a Facebook icon labelled “Twitter”.",
    cost: "It confuses visitors and screen readers, and makes the site look careless.",
    fix: "Match each link's label to where it goes.",
    pass: "Link labels match where they go" },
  social_placeholder: { cat: "broken", weight: 6, title: "Your social icons don't go to your pages",
    why: "Your social media icons point to the platform's homepage or your website builder's own page, not to your business.",
    cost: "Customers who want to follow you or check your reviews can't find you.",
    fix: "Link each icon to your business's own profile, or remove the ones you don't use.",
    pass: "Social icons go to your own profiles" },

  // ---------------- Trust
  no_https: { cat: "trust", weight: 10, title: "Your site isn't secure",
    why: "Your site loads without a secure (https) connection, so browsers mark it “Not secure”.",
    cost: "Many visitors leave as soon as they see the warning, and Google ranks secure sites higher.",
    fix: "Turn on a free SSL certificate with your host and redirect every page to https.",
    pass: "The site is secure (https)" },
  no_reviews_home: { cat: "trust", weight: 6, title: "No reviews or testimonials on your homepage",
    why: "We couldn't find any reviews, star ratings or customer quotes on your homepage.",
    cost: "Most people check what others say before they buy or book. If it's not on your site, they go looking elsewhere, and may not come back.",
    fix: "Add three or four real reviews with names, plus your star rating, near the top of the page.",
    pass: "Reviews or testimonials are on the homepage" },
  no_privacy: { cat: "trust", weight: 4, title: "You collect details but have no privacy policy",
    why: "Your site has a form that collects emails or phone numbers, but we couldn't find a privacy policy.",
    cost: "Careful customers hesitate to hand over their details, and privacy laws in many places require one.",
    fix: "Add a short privacy policy page and link it from your footer and forms.",
    pass: "There's a privacy policy for the details you collect" },
  no_location_hours: { cat: "trust", weight: 3, title: "No address or opening hours",
    why: "We couldn't find a street address or opening hours on the pages we checked.",
    cost: "Local customers want to know where you are and when you're open before they call or visit.",
    fix: "Add your address (or service area) and hours to the footer or contact page.",
    pass: "Address or hours are listed" },

  // ---------------- Google
  noindex: { cat: "google", weight: 10, title: "Your site is telling Google not to list it",
    why: "Your homepage has a “noindex” instruction, which tells Google to leave it out of search results.",
    cost: "People searching for you on Google may not find you at all.",
    fix: "Remove the noindex tag (often a “discourage search engines” or “hide from search” setting).",
    pass: "Google is allowed to list your homepage" },
  noindex_broken: { cat: "google", weight: 5, title: "A broken “don't list me” tag is in your code",
    why: "Your site has a tag that looks like it was meant to tell search engines not to list the site, but its name is misspelled.",
    cost: "Someone may have meant to hide the site, or meant to remove this. Either way, it's worth checking it's doing what you intend.",
    fix: "Delete the tag if you want to be found on Google.",
    pass: "No broken search-engine tags" },
  robots_block: { cat: "google", weight: 10, title: "Your site blocks Google completely",
    why: "Your robots.txt file tells search engines not to read any page on your site.",
    cost: "Your site can drop out of Google results entirely.",
    fix: "Change the “Disallow: /” line in robots.txt, or turn off the “hide from search engines” setting.",
    pass: "Search engines are allowed to read your site" },
  no_title: { cat: "google", weight: 8, title: "Your homepage has no title",
    why: "Your homepage has no page title, the text Google shows as the blue headline in search results.",
    cost: "Google has to guess what to show, and you lose the single most important line for getting clicks.",
    fix: "Add a title like “Your Service in Your Town | Business Name”.",
    pass: "The homepage has a title" },
  weak_title: { cat: "google", weight: 5, title: "Your page title doesn't say what you do or where",
    why: "Your homepage title is too short or vague. It doesn't tell Google (or searchers) what you do or where.",
    cost: "When people search for your service in your area, a vague title makes it harder for Google to match you.",
    fix: "Use a title like “Roof Repair in Guelph | Smith Roofing” (about 50–60 characters).",
    pass: "The page title says what you do" },
  no_meta_desc: { cat: "google", weight: 6, title: "Google has no description for your site",
    why: "Your homepage has no meta description, the two lines of text under your name in Google results.",
    cost: "Google fills the gap with random text from your page, which is rarely your best sales pitch.",
    fix: "Write a 150-character description that says what you do, where, and why to choose you.",
    pass: "There's a description for Google" },
  pages_missing_desc: { cat: "google", weight: 3, title: "Many pages have no Google description",
    why: "Several of your other pages also have no meta description.",
    cost: "Each of those pages is less likely to get clicked when it shows up in search.",
    fix: "Add a short, unique description to each page listed below.",
    pass: "Your other pages have descriptions" },
  no_h1: { cat: "google", weight: 4, title: "No main heading on your homepage",
    why: "Your homepage has no main heading (an H1), which tells Google and visitors what the page is about.",
    cost: "It's a missed chance to say clearly what you do, for both people and search engines.",
    fix: "Add one main heading near the top that says what you offer and where.",
    pass: "There's a main heading" },
  missing_alt: { cat: "google", weight: 4, title: "Images have no descriptions",
    why: "Many of your images have no description (alt text), or just use a file name like “IMG_2041.jpg”.",
    cost: "Google can't tell what your photos show, so they don't help you appear in image or local searches. People using screen readers miss them too.",
    fix: "Give each image a short description of what it shows.",
    pass: "Images have descriptions" },
  no_sitemap: { cat: "google", weight: 2, title: "No sitemap for Google",
    why: "We couldn't find a sitemap, the file that lists your pages for search engines.",
    cost: "New or deep pages can take longer to show up on Google.",
    fix: "Most website builders can create one automatically. Turn it on and submit it in Google Search Console.",
    pass: "There's a sitemap" },

  // ---------------- Speed and phones
  slow_mobile: { cat: "speed", weight: 8, title: "Your site is slow on phones",
    why: "Google's own speed test rates your site as slow on a phone.",
    cost: "Slow pages lose visitors before they even see you, and speed is part of how Google ranks sites.",
    fix: "Start with the biggest causes listed below, usually oversized images and heavy add-ons.",
    pass: "Fast enough on phones" },
  slow_desktop: { cat: "speed", weight: 4, title: "Your site is slow on computers",
    why: "Google's speed test also rates your site as slow on a desktop computer.",
    cost: "Even on fast connections, visitors wait for your page to appear.",
    fix: "Shrink large images and remove add-ons you don't use.",
    pass: "Fast enough on computers" },
  layout_shift: { cat: "speed", weight: 5, title: "The page jumps around while it loads",
    why: "Parts of your page move after they appear, as images or banners load in.",
    cost: "People tap the wrong thing or lose their place, which is frustrating, especially on phones.",
    fix: "Give images and banners fixed sizes so space is saved for them while they load.",
    pass: "The page stays steady while loading" },
  heavy_images: { cat: "speed", weight: 5, title: "Your images are much bigger than they need to be",
    why: "Your images are larger files than the page needs, so phones download far more than they show.",
    cost: "It's usually the biggest single reason a small-business site is slow.",
    fix: "Resize and compress images, and use a modern format like WebP.",
    pass: "Images are sized sensibly" },
  mobile_overflow: { cat: "speed", weight: 7, title: "Your page is wider than a phone screen",
    why: "On a phone, part of your page sticks out past the edge of the screen, so it slides sideways.",
    cost: "It makes the site feel broken on phones, and text or buttons get cut off.",
    fix: "Find the part shown below and make it fit the screen width.",
    pass: "Fits a phone screen" },
  no_viewport: { cat: "speed", weight: 9, title: "Your site isn't set up for phones",
    why: "Your site is missing the setting that tells phones to show it at phone size, so it appears as a tiny desktop page.",
    cost: "Most visitors are on phones. Pinching and zooming to read a page makes them leave.",
    fix: "Add a viewport tag, or move to a mobile-friendly theme.",
    pass: "Set up for phones" },
  small_text: { cat: "speed", weight: 4, title: "Text or buttons are too small on phones",
    why: "Google's mobile test found text that's too small to read, or buttons too close together to tap easily.",
    cost: "Visitors have to zoom in or mis-tap, which makes the site harder to use.",
    fix: "Use at least 16px text, and give buttons more room.",
    pass: "Text and buttons are easy to use on phones" }
};

export function severity(w) { return w >= 8 ? "Fix now" : w >= 5 ? "Fix soon" : "Worth fixing"; }
export function grade(score) {
  if (score >= 90) return { label: "Sharp", note: "A few small things to tidy up." };
  if (score >= 75) return { label: "A few blind spots", note: "Good bones, but some things are quietly costing you." };
  if (score >= 50) return { label: "Costing you customers", note: "Visitors are running into problems you probably haven't seen." };
  return { label: "Needs urgent attention", note: "Several problems are turning visitors away right now." };
}

// Turn raw scan data into the report. Every finding maps to a rule above.
export function buildReport(scan) {
  const { render, pages = [], site, links = [], speed = {} } = scan;
  const a = render.audit;
  const sig = a.signals;
  const F = [];
  const ran = new Set();
  const push = (rule, items, extra) => { if (!RULES[rule]) return; F.push({ rule, ...RULES[rule], items: items || [], extra: extra || null }); };
  const homeUrl = render.finalUrl;

  // homepage findings from the browser
  const byRule = {};
  for (const f of a.findings) (byRule[f.rule] = byRule[f.rule] || []).push({ ...f, page: homeUrl });
  // extra pages
  for (const p of pages) for (const f of p.findings || []) (byRule[f.rule] = byRule[f.rule] || []).push({ ...f, page: p.finalUrl || p.url });
  const PAGE_RULES = ["lorem", "template_text", "placeholder_contact", "code_error", "zero_price", "old_copyright", "stale_promo", "markup_leftover", "gibberish", "empty_section", "screenshot_images", "free_email", "copy_slug", "bad_tel_link", "bad_mailto", "no_tap_to_call", "mislabeled_link", "social_placeholder", "missing_alt", "mobile_overflow"];
  PAGE_RULES.forEach((r) => ran.add(r));
  for (const r of PAGE_RULES) if (byRule[r]) push(r, dedupeItems(byRule[r]));

  // broken images (browser + network + crawl link check)
  ran.add("broken_images");
  const bi = (byRule.broken_images || []).slice();
  const biSrc = new Set(bi.map((x) => x.extra && x.extra.src));
  for (const u of render.net404 || []) if (!biSrc.has(u)) bi.push({ evidence: "Image not found: " + short(u), page: homeUrl, rect: null });
  for (const l of links) if (l.broken && l.kind === "image") bi.push({ evidence: "Image not found: " + short(l.url) + (l.reason ? " (" + reasonText(l.reason) + ")" : ""), page: l.from || homeUrl, rect: null });
  if (bi.length) push("broken_images", dedupeItems(bi));

  // dead links (link checker + crawled pages that errored)
  if (scan.linksChecked) {
    ran.add("dead_links");
    const dl = links.filter((l) => l.broken && l.kind !== "image").map((l) => ({ evidence: (l.text ? "“" + l.text + "” → " : "") + short(l.url) + " (" + reasonText(l.reason) + ")", page: l.from || homeUrl, rect: null }));
    if (dl.length) push("dead_links", dl);
  }

  // clicked-and-nothing-happened
  if (render.audit.hashCandidates) {
    ran.add("dead_buttons");
    if (render.deadLinks && render.deadLinks.length) push("dead_buttons", render.deadLinks.map((d) => ({ evidence: "“" + d.text + "” does nothing when clicked", page: homeUrl, rect: d.rect })));
  }

  // customers
  ran.add("no_cta_fold"); ran.add("no_contact_path");
  if (render.mobileFold && render.mobileFold.count === 0) push("no_cta_fold", [{ evidence: "First screen on a phone: no call, book, quote or shop button" + (render.desktopFold ? (render.desktopFold.count ? " (computers do see one)" : ", and none on computers either") : ""), page: homeUrl, rect: { x: 0, y: 0, w: 390, h: Math.min(844, render.shots?.mobile?.h || 844) }, frame: true }]);
  if (!sig.leadForms && !sig.tel && !sig.mailto && !sig.contactLink && !sig.iframesForm) push("no_contact_path", [{ evidence: "No form, phone link, email link or contact page link found", page: homeUrl }]);

  // trust
  ran.add("no_https"); ran.add("no_reviews_home"); ran.add("no_privacy"); ran.add("no_location_hours");
  if (!render.https) push("no_https", [{ evidence: homeUrl, page: homeUrl }]);
  if (!sig.reviews) push("no_reviews_home", [{ evidence: "No reviews, ratings or testimonials found on the homepage", page: homeUrl }]);
  const privacyAnywhere = sig.privacyLink || pages.some((p) => p.signals && p.signals.privacy);
  if (sig.collects && !privacyAnywhere) push("no_privacy", [{ evidence: "A form asks for contact details, but no privacy policy link was found", page: homeUrl }]);
  const hoursAny = sig.hours || pages.some((p) => p.signals && p.signals.hours);
  const addrAny = sig.address || pages.some((p) => p.signals && p.signals.address);
  if (sig.phoneShown && !sig.store && !hoursAny && !addrAny) push("no_location_hours", [{ evidence: "No street address or hours on " + (pages.length + 1) + " pages checked", page: homeUrl }]);

  // google
  ["noindex", "noindex_broken", "no_title", "weak_title", "no_meta_desc", "no_h1"].forEach((r) => ran.add(r));
  const realNoindex = (a.robotsMetas || []).filter((m) => /^(robots|googlebot)$/i.test(m.name));
  const brokenNoindex = (a.robotsMetas || []).filter((m) => !/^(robots|googlebot|bingbot|googlebot-news)$/i.test(m.name));
  if (realNoindex.length || /noindex/i.test(render.xRobots || "")) push("noindex", [{ evidence: realNoindex.length ? '<meta name="' + realNoindex[0].name + '" content="' + realNoindex[0].content + '">' : "X-Robots-Tag: " + render.xRobots, page: homeUrl }]);
  else if (brokenNoindex.length) push("noindex_broken", [{ evidence: '<meta name="' + brokenNoindex[0].name + '" content="' + brokenNoindex[0].content + '">', page: homeUrl }]);
  if (site) {
    ran.add("robots_block"); ran.add("no_sitemap");
    if (site.robotsBlocksAll) push("robots_block", [{ evidence: "robots.txt contains “Disallow: /”", page: new URL("/robots.txt", homeUrl).href }]);
    if (!site.sitemap) push("no_sitemap", [{ evidence: "No sitemap.xml found", page: homeUrl }]);
  }
  if (!a.title) push("no_title", [{ evidence: "No <title> on the homepage", page: homeUrl }]);
  else if (a.title.length < 20 || /^(home|homepage|index|untitled|welcome)$/i.test(a.title.trim()) || a.title.trim().split(/\s+/).length < 3) push("weak_title", [{ evidence: "Title: “" + a.title + "”", page: homeUrl }], { serp: true });
  if (!a.desc) push("no_meta_desc", [{ evidence: "No description set", page: homeUrl }], { serp: true });
  if (!a.h1Count) push("no_h1", [{ evidence: "No main heading (H1) found", page: homeUrl }]);
  const okPages = pages.filter((p) => p.status >= 200 && p.status < 300 && !p.error && (p.finalUrl || p.url));
  if (okPages.length >= 3) {
    ran.add("pages_missing_desc");
    const nod = okPages.filter((p) => !p.desc);
    if (nod.length >= 2 && nod.length / okPages.length >= 0.4) push("pages_missing_desc", nod.slice(0, 8).map((p) => ({ evidence: short(p.finalUrl || p.url), page: p.finalUrl || p.url })), { count: nod.length, total: okPages.length });
  }

  // phones / speed
  ran.add("no_viewport");
  if (!a.viewportMeta) push("no_viewport", [{ evidence: "No viewport tag on the homepage", page: homeUrl }]);
  const m = speed.mobile && !speed.mobile.error ? speed.mobile : null;
  const d = speed.desktop && !speed.desktop.error ? speed.desktop : null;
  if (m) {
    ["slow_mobile", "layout_shift", "heavy_images", "small_text"].forEach((r) => ran.add(r));
    const ps = m.scores.performance;
    if (ps != null && ps < 50) push("slow_mobile", speedItems(m), { score: ps });
    else if (ps != null && ps < 75) push("slow_mobile", speedItems(m), { score: ps, weightOverride: 5 });
    const cls = m.audits["cumulative-layout-shift"];
    if (cls && cls.value != null && cls.value > 0.25) push("layout_shift", [{ evidence: "Layout shift score " + cls.display + " (good is under 0.1)", page: homeUrl }]);
    const imgSave = ["uses-responsive-images", "modern-image-formats", "uses-optimized-images", "offscreen-images"].reduce((s, k) => s + ((m.audits[k] && m.audits[k].savingsBytes) || 0), 0);
    if (imgSave > 300 * 1024) {
      const its = [];
      ["uses-responsive-images", "modern-image-formats", "uses-optimized-images"].forEach((k) => (m.audits[k]?.items || []).forEach((it) => { if (it.url && its.length < 4) its.push({ evidence: short(it.url) + (it.bytes ? " (" + kb(it.bytes) + " could be saved)" : ""), page: homeUrl }); }));
      push("heavy_images", its.length ? its : [{ evidence: "About " + kb(imgSave) + " of image data could be saved", page: homeUrl }], { bytes: imgSave });
    }
    const fs = m.audits["font-size"], tt = m.audits["tap-targets"];
    if ((fs && fs.score === 0) || (tt && tt.score === 0)) push("small_text", [{ evidence: [fs && fs.score === 0 ? "Text too small: " + (fs.display || "") : "", tt && tt.score === 0 ? "Buttons too close: " + (tt.display || "") : ""].filter(Boolean).join(" · "), page: homeUrl }]);
  }
  if (d) {
    ran.add("slow_desktop");
    if (d.scores.performance != null && d.scores.performance < 50) push("slow_desktop", [{ evidence: "Google desktop speed score: " + d.scores.performance + "/100", page: homeUrl }], { score: d.scores.performance });
  }

  // score
  let penalty = 0;
  for (const f of F) {
    const w = (f.extra && f.extra.weightOverride) || f.weight;
    f.w = w;
    f.severity = severity(w);
    penalty += w + Math.min(3, Math.max(0, (f.items.length || 1) - 1));
  }
  const score = Math.max(5, Math.min(100, Math.round(100 - penalty)));
  F.sort((x, y) => y.w - x.w || y.items.length - x.items.length);
  const passed = [...ran].filter((r) => !F.some((f) => f.rule === r)).map((r) => ({ rule: r, cat: RULES[r].cat, text: RULES[r].pass }));
  return { score, grade: grade(score), findings: F, top: F.slice(0, 5), passed, pagesChecked: 1 + okPages.length, linksChecked: links.length + pages.length, platform: sig.platform };
}

function speedItems(m) {
  const out = [{ evidence: "Google phone speed score: " + m.scores.performance + "/100" + (m.audits["largest-contentful-paint"] ? " · main content appears after " + m.audits["largest-contentful-paint"].display : "") }];
  const causes = [["render-blocking-resources", "Files that block the page from showing"], ["unused-javascript", "Unused code downloaded"], ["server-response-time", "Slow server response"], ["total-byte-weight", "Total page size"]];
  for (const [k, label] of causes) { const a = m.audits[k]; if (a && a.score != null && a.score < 0.9 && a.display) out.push({ evidence: label + ": " + a.display }); }
  return out.slice(0, 4);
}
function dedupeItems(items) { const s = new Set(); return items.filter((i) => { const k = (i.evidence || "") + "|" + (i.page || ""); if (s.has(k)) return false; s.add(k); return true; }); }
function short(u) { try { const x = new URL(u); const p = (x.hostname.replace(/^www\./, "") + x.pathname).replace(/\/$/, ""); return p.length > 70 ? p.slice(0, 69) + "…" : p; } catch { return String(u).slice(0, 70); } }
function kb(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB"; }
function reasonText(r) { return r === "404" || r === "410" ? "page not found" : r === "dead-domain" ? "website no longer exists" : r === "refused" ? "server refused" : r === "certificate" ? "security certificate error" : /^5/.test(r) ? "server error " + r : r || "error"; }
