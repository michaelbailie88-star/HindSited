// Text rules shared by the in-browser audit and the server-side crawler.
// makeTextRules MUST stay self-contained (no imports, no outer variables):
// its source is injected into the page with Function.prototype.toString().

export function makeTextRules() {
  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const DAY = 86400000;

  // Wording that only ever appears as builder placeholder text.
  const TEMPLATE_PHRASES = [
    "this is a paragraph", "click here to add your own", "click to edit", "add your own content",
    "i'm a paragraph", "i\u2019m a paragraph", "i'm a title", "i\u2019m a title", "your title here",
    "insert text here", "your text here", "enter your text", "text goes here", "heading goes here",
    "subheading goes here", "company name here", "business name here", "this is the space to",
    "product name here", "double click to edit", "write your caption here", "your headline here",
    "add paragraph text", "change this text", "edit this text"
  ];
  // Wording that is a placeholder only when it stands alone (a whole line),
  // because real copy can contain it ("protecting your business name").
  const TEMPLATE_ALONE = /^\s*(?:your (?:business|company) name|add a (?:title|heading|description)|add your text|sample text|tell your visitors.{0,60}|describe your business.{0,40}|use this space to.{0,80}|write a short description.{0,40}|start writing here|placeholder(?: text)?)\s*[.!:]?\s*$/i;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const R = {
    lorem: /lorem ipsum|dolor sit amet|consectetur adipiscing/i,
    template_text: new RegExp(TEMPLATE_PHRASES.map(esc).join("|"), "i"),
    placeholder_phone: /\(?\b123\)?[\s.-]?456[\s.-]?7890\b|\(?\b(\d)\1\1\)?[\s.-]?\1\1\1[\s.-]?\1\1\1\1\b|\(?\b\d{3}\)?[\s.-]?555[\s.-]?01\d\d\b|\b1234567890\b/,
    placeholder_email: /\b[\w.+-]+@(?:example\.(?:com|org|net)|domain\.com|yourdomain\.[a-z]+|yoursite\.[a-z]+|mysite\.com|website\.com|email\.com|yourcompany\.[a-z]+|test\.com)\b|\b(?:youremail|your-email|your\.email|yourname|john\.?doe|jane\.?doe|name|email|user|username)@(?:gmail|email|mail|domain|example|company)\.com\b/i,
    code_error: /Liquid (?:syntax )?error|Translation missing:|Fatal error:|Parse error:|Warning: [a-z_]+\(|Notice: Undefined|Uncaught (?:Type|Reference|Syntax)Error|\{\{\s*[\w.]+\s*\}\}|\{%-?\s*\w+|\[object Object\]|\bNaN\b|\$\{[\w.]+\}|(?:\$|price:?)\s*undefined\b/,
    zero_price: /(?:^|[^\d.,])\$\s?0(?:\.00)?(?![\d.,%])/,
    zero_price_exclude: /^\s*(?:down|deposit|interest|fee|fees|delivery|shipping|apr|financ|due today|setup|to start|enrol|enroll|membership fee)/i,
    copyright: /(?:©|\(c\)|copyright)[^\d\n]{0,25}((?:19|20)\d{2})(?:\s*[-–—]\s*((?:19|20)\d{2}))?/gi,
    markup_leftover: /#{3,}|\*\*[^*\n]{2,40}\*\*|\[\/[\w\-/]+\]|&(?:nbsp|amp|quot|lt|gt|#\d{2,5});/,
    phone: /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}\b/,
    free_email: /\b[\w.+-]+@(?:gmail|hotmail|yahoo|outlook|aol|icloud|live|msn|ymail|rogers|sympatico|shaw|telus|bell)\.(?:com|ca|net|co\.uk)\b/i,
    hours: /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s*(?:(?:-|–|—|to|&|through|thru)\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?)?\s*:?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\bhours\b|\bopen (?:daily|7 days|24)/i,
    address: /\b\d{1,6}\s+[A-Za-z0-9][\w.'-]*(?:\s+[\w.'-]+){0,4}\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|cres|crescent|sq|square|cir|circle|ter|terrace|trl|trail)\b|\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/,
    reviews: /testimonials?|\breviews?\b|★|⭐|what (?:our )?(?:clients|customers|patients|people|members|guests) (?:are )?say|google rating|trustpilot|\brated\b|five[- ]star|5[- ]star|happy (?:clients|customers)/i,
    explicit_deadline: /\b(?:ends?|ending|until|through|thru|expires?|valid (?:until|through)|deadline|register by|book by|order by)\s+(?:on\s+)?(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?,?\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})\b/i,
    promo_word: /\b(?:sale|deals?|specials?|offers?|promo(?:tion)?s?|discounts?|savings|blowout|clearance|coupons?|bogo|doorbusters?)\b|\d+\s?% off/i
  };

  // ---- holidays -----------------------------------------------------------
  function nthWeekday(y, m, wd, n) { const d = new Date(Date.UTC(y, m, 1)); const off = (wd - d.getUTCDay() + 7) % 7; return Date.UTC(y, m, 1 + off + (n - 1) * 7); }
  function lastWeekday(y, m, wd) { const d = new Date(Date.UTC(y, m + 1, 0)); const off = (d.getUTCDay() - wd + 7) % 7; return Date.UTC(y, m + 1, 0 - off); }
  function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); const mo = Math.floor((h + l - 7 * m + 114) / 31) - 1, da = ((h + l - 7 * m + 114) % 31) + 1; return Date.UTC(y, mo, da); }
  const thanksUS = (y) => nthWeekday(y, 10, 4, 4);
  const HOLIDAYS = [
    { name: "New Year's", re: /new year'?s?/i, at: (y) => Date.UTC(y, 0, 1) },
    { name: "Valentine's Day", re: /valentine/i, at: (y) => Date.UTC(y, 1, 14) },
    { name: "St. Patrick's Day", re: /st\.? patrick|paddy'?s day/i, at: (y) => Date.UTC(y, 2, 17) },
    { name: "Easter", re: /\beaster\b/i, at: easter },
    { name: "Mother's Day", re: /mother'?s day/i, at: (y) => nthWeekday(y, 4, 0, 2) },
    { name: "Memorial Day", re: /memorial day/i, at: (y) => lastWeekday(y, 4, 1) },
    { name: "Father's Day", re: /father'?s day/i, at: (y) => nthWeekday(y, 5, 0, 3) },
    { name: "Canada Day", re: /canada day/i, at: (y) => Date.UTC(y, 6, 1) },
    { name: "Fourth of July", re: /4th of july|fourth of july|independence day|july 4th/i, at: (y) => Date.UTC(y, 6, 4) },
    { name: "Labor Day", re: /labou?r day/i, at: (y) => nthWeekday(y, 8, 1, 1) },
    { name: "Halloween", re: /hallowe'?en/i, at: (y) => Date.UTC(y, 9, 31) },
    { name: "Black Friday", re: /black friday/i, at: (y) => thanksUS(y) + DAY },
    { name: "Cyber Monday", re: /cyber monday/i, at: (y) => thanksUS(y) + 4 * DAY },
    { name: "Christmas", re: /christmas|x-?mas\b/i, at: (y) => Date.UTC(y, 11, 25) },
    { name: "Boxing Day", re: /boxing day/i, at: (y) => Date.UTC(y, 11, 26) }
  ];

  function staleHoliday(text, now) {
    if (!R.promo_word.test(text)) return null;
    const y = new Date(now).getUTCFullYear();
    for (const h of HOLIDAYS) {
      const m = h.re.exec(text);
      if (!m) continue;
      const dates = [h.at(y - 1), h.at(y), h.at(y + 1)];
      const last = Math.max(...dates.filter((d) => d <= now));
      const next = Math.min(...dates.filter((d) => d > now));
      const since = (now - last) / DAY, until = (next - now) / DAY;
      if (since >= 10 && until > 60) return { index: m.index, length: m[0].length, extra: { holiday: h.name, daysAgo: Math.round(since) } };
    }
    return null;
  }

  function explicitDeadline(text, now) {
    const m = R.explicit_deadline.exec(text);
    if (!m) return null;
    const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const d = Date.UTC(+m[3], mo, +m[2]);
    if (mo < 0 || isNaN(d)) return null;
    if (now - d > DAY) return { index: m.index, length: m[0].length, extra: { date: new Date(d).toISOString().slice(0, 10) } };
    return null;
  }

  function gibberish(text) {
    if (/https?:|www\.|@|\.(?:com|ca|net|org)\b/i.test(text)) return null;
    const re = /[A-Za-z]{12,}/g;
    let m;
    while ((m = re.exec(text))) {
      const w = m[0];
      if (/[a-z][A-Z]/.test(w)) continue; // camelCase / brand-like
      if (/[bcdfghjklmnpqrstvwxz]{7,}/i.test(w)) return { index: m.index, length: w.length, extra: { word: w } };
    }
    return null;
  }

  function first(re, text) {
    const m = re.exec(text);
    return m ? { index: m.index, length: m[0].length } : null;
  }

  // Rules that run on any single run of visible text.
  function scanText(text, now) {
    const hits = [];
    if (!text || text.length < 2) return hits;
    let h;
    if ((h = first(R.lorem, text))) hits.push({ rule: "lorem", ...h });
    if ((h = first(R.template_text, text))) hits.push({ rule: "template_text", ...h });
    else if (TEMPLATE_ALONE.test(text)) hits.push({ rule: "template_text", index: text.search(/\S/), length: text.trim().length });
    if ((h = first(R.placeholder_phone, text)) || (h = first(R.placeholder_email, text))) hits.push({ rule: "placeholder_contact", ...h });
    if ((h = first(R.code_error, text))) hits.push({ rule: "code_error", ...h });
    if ((h = first(R.markup_leftover, text))) hits.push({ rule: "markup_leftover", ...h });
    if ((h = gibberish(text))) hits.push({ rule: "gibberish", ...h });
    if ((h = staleHoliday(text, now))) hits.push({ rule: "stale_promo", ...h });
    else if ((h = explicitDeadline(text, now))) hits.push({ rule: "stale_promo", ...h });
    return hits;
  }

  function zeroPrice(text, contextIsPrice) {
    const m = R.zero_price.exec(text);
    if (!m) return null;
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
    if (R.zero_price_exclude.test(after)) return null;
    if (!contextIsPrice && !/price/i.test(text)) return null;
    const lead = m[0].match(/^[^$]*/)[0].length;
    return { index: m.index + lead, length: m[0].length - lead };
  }

  function copyrightYear(text) {
    let max = 0, idx = -1, len = 0, m;
    R.copyright.lastIndex = 0;
    while ((m = R.copyright.exec(text))) {
      const yr = Math.max(+m[1], m[2] ? +m[2] : 0);
      if (yr > max) { max = yr; idx = m.index; len = m[0].length; }
    }
    return max ? { year: max, index: idx, length: len } : null;
  }

  return { R, scanText, zeroPrice, copyrightYear, staleHoliday, explicitDeadline, gibberish };
}
