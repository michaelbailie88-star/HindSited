// Quote Calculator: one simple structure for any business, shared by the
// browser (live price) and the server (which recomputes every quote).
//   1. services  - what you sell, each with a price (the customer picks one)
//   2. qty       - optional "how much?" with a price per unit
//   3. addons    - optional extras with a price
// Shown as an exact price, a range (± %), or no price at all (request only).

const S = (label, price) => ({ label, price });
// Starting examples, matched from the business type the owner types.
export const PRESETS = [
  { keys: ["clean", "maid", "janitor"], type: "Cleaning", title: "Get an instant cleaning quote", services: [S("Standard clean", 120), S("Deep clean", 200), S("Move-in / move-out clean", 260)], qty: { label: "How many bedrooms?", unit: "bedrooms", perUnit: 25, min: 1, max: 8, def: 2 }, addons: [S("Inside the oven", 30), S("Inside the fridge", 25), S("Interior windows", 40)] },
  { keys: ["lawn", "landscap", "garden", "yard", "snow"], type: "Lawn and garden", title: "Get an instant lawn and garden quote", services: [S("Mowing and edging", 45), S("Spring or fall clean-up", 180), S("Garden maintenance visit", 90)], qty: null, addons: [S("Hedge trimming", 60), S("Leaf removal", 80), S("Mulch refresh", 120)] },
  { keys: ["paint"], type: "Painting", title: "Get an instant painting quote", services: [S("Walls only", 280), S("Walls and ceiling", 350), S("Walls, ceiling and trim", 420)], qty: { label: "How many rooms?", unit: "rooms", perUnit: 0, min: 1, max: 20, def: 1, multiply: true }, addons: [S("Patching and repairs", 80), S("Colour change (dark to light)", 120)] },
  { keys: ["plumb"], type: "Plumbing", title: "Get an instant plumbing estimate", services: [S("Leaky tap or toilet", 150), S("Blocked drain", 180), S("Fixture install (sink, toilet)", 280), S("Water heater install", 1100)], qty: null, addons: [S("Same-day / urgent", 90), S("Evening or weekend", 120)] },
  { keys: ["electric"], type: "Electrical", title: "Get an instant electrical estimate", services: [S("Outlet or switch", 120), S("Light fixture install", 160), S("Panel inspection", 220)], qty: { label: "How many?", unit: "items", perUnit: 0, min: 1, max: 20, def: 1, multiply: true }, addons: [S("Same-day / urgent", 90)] },
  { keys: ["handyman", "repair", "carpent", "contractor", "renovat", "install"], type: "Handyman and repairs", title: "Get an instant job estimate", services: [S("Small job (under 2 hours)", 120), S("Half day", 280), S("Full day", 520)], qty: null, addons: [S("Materials pickup", 40), S("Disposal and clean-up", 60)] },
  { keys: ["mov", "haul", "junk"], type: "Moving", title: "Get an instant moving quote", services: [S("Studio or 1 bedroom", 450), S("2 bedrooms", 750), S("3 bedrooms", 1050), S("4+ bedrooms", 1400)], qty: { label: "Distance", unit: "km", perUnit: 2.5, min: 0, max: 500, def: 15 }, addons: [S("Packing service", 350), S("Piano or safe", 250)] },
  { keys: ["cater", "event", "wedding", "party", "dj"], type: "Events and catering", title: "Get an instant event quote", services: [S("Buffet", 30), S("Plated dinner", 42), S("Appetizers only", 20)], qty: { label: "How many guests?", unit: "guests", perUnit: 0, min: 10, max: 500, def: 50, multiply: true }, addons: [S("Bar service", 400), S("Setup and clean-up staff", 300)] },
  { keys: ["photo", "video", "film"], type: "Photography", title: "Get an instant photography quote", services: [S("Portraits or family", 250), S("Headshots", 180), S("Event (per hour)", 200), S("Wedding (full day)", 2400)], qty: null, addons: [S("Second photographer", 400), S("Printed album", 350), S("Rush editing", 150)] },
  { keys: ["detail", "car wash", "auto"], type: "Auto detailing", title: "Get an instant detailing quote", services: [S("Exterior wash and wax", 90), S("Interior detail", 130), S("Full detail (in and out)", 220)], qty: null, addons: [S("Pet hair removal", 40), S("Headlight restoration", 60), S("Engine bay", 50)] },
  { keys: ["dog", "pet", "groom", "walk"], type: "Pet care", title: "Get an instant pet care quote", services: [S("Dog walk (30 min)", 25), S("Bath and brush", 55), S("Full groom", 85)], qty: { label: "How many pets?", unit: "pets", perUnit: 0, min: 1, max: 6, def: 1, multiply: true }, addons: [S("Nail trim", 15), S("Teeth brushing", 12)] },
  { keys: ["tutor", "lesson", "coach", "teach", "music"], type: "Lessons and tutoring", title: "Get an instant lesson quote", services: [S("Single lesson", 60), S("4-lesson pack", 220), S("10-lesson pack", 520)], qty: null, addons: [S("In-home lesson", 15), S("Learning materials", 25)] },
  { keys: ["hair", "salon", "nail", "lash", "makeup", "barber", "spa", "beauty"], type: "Beauty and salon", title: "Get an instant price", services: [S("Cut and style", 55), S("Colour", 120), S("Special occasion style", 90)], qty: null, addons: [S("Treatment", 25), S("Blow-dry", 20)] },
  { keys: ["fitness", "trainer", "yoga", "pilates", "gym"], type: "Fitness", title: "Get an instant price", services: [S("Single session", 70), S("5-session pack", 325), S("10-session pack", 600)], qty: null, addons: [S("Nutrition plan", 80)] },
  { keys: ["web", "design", "logo", "marketing", "brand", "social media"], type: "Design and marketing", title: "Get an instant project estimate", services: [S("Logo design", 400), S("Website (up to 5 pages)", 1500), S("Social media month", 600)], qty: null, addons: [S("Rush delivery", 200), S("Extra revisions", 150)] },
  { keys: ["law", "legal", "lawyer", "account", "bookkeep", "tax", "consult", "insur", "real estate"], type: "Professional services", title: "Request a quote", noPrice: true, services: [S("Initial consultation", 0), S("Ongoing work", 0), S("Something else", 0)], qty: null, addons: [] }
];
export const TYPE_SUGGESTIONS = PRESETS.map((p) => p.type);

export function presetFor(typed) {
  const t = String(typed || "").toLowerCase();
  if (!t.trim()) return null;
  return PRESETS.find((p) => p.keys.some((k) => t.includes(k))) || null;
}
// a fresh calculator; uses examples when the business type matches one
export function starter(typed = "") {
  const p = presetFor(typed);
  const base = { v: 2, businessType: String(typed || "").slice(0, 60), mode: "range", rangePct: 15, currency: "$" };
  if (!p) return { ...base, title: "Get an instant quote", services: [S("Small job", 100), S("Medium job", 250), S("Large job", 500)], qty: null, addons: [S("Rush / urgent", 75)] };
  return { ...base, mode: p.noPrice ? "none" : "range", title: p.title, services: p.services.map((x) => ({ ...x })), qty: p.qty ? { ...p.qty } : null, addons: p.addons.map((x) => ({ ...x })) };
}

const num = (v, lo = 0, hi = 1e6) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
// Accepts any saved calculator (including the older question-based kind) and
// returns the current shape.
export function normalize(c = {}) {
  if (c.v === 2 || Array.isArray(c.services)) return c;
  const qs = Array.isArray(c.questions) ? c.questions : [];
  const base = Number(c.base) || 0;
  const choice = qs.find((q) => q.type === "choice"), number = qs.find((q) => q.type === "number"), extras = qs.find((q) => q.type === "extras");
  return {
    v: 2, businessType: "", title: c.title || "Get an instant quote", mode: c.mode === "exact" ? "exact" : "range", rangePct: c.rangePct ?? 15, currency: c.currency || "$",
    services: choice ? choice.options.map((o) => S(o.label, Math.round((base + (Number(o.add) || 0)) * (Number(o.mult) || 1)))) : [S("Standard", Math.max(base, Number(c.minimum) || 0))],
    qty: number ? { label: number.label, unit: number.unit || "", perUnit: Number(number.perUnit) || 0, min: number.min ?? 0, max: number.max ?? 20, def: number.def ?? number.min ?? 0 } : null,
    addons: extras ? extras.options.map((o) => S(o.label, Number(o.add) || 0)) : []
  };
}

const round = (v) => (v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5);
// answers: { service: index, qty: number, addons: [indexes] }
export function price(cIn, answers = {}) {
  const c = normalize(cIn);
  const svcs = c.services || [];
  const si = Math.max(0, Math.min(svcs.length - 1, Number(answers.service) || 0));
  const svc = svcs[si];
  const lines = [];
  let total = 0;
  if (svc) { total += Number(svc.price) || 0; lines.push({ q: "Service", a: svc.label }); }
  if (c.qty) {
    const q = c.qty;
    const n = Math.max(Number(q.min) || 0, Math.min(Number(q.max) || 0, Number(answers.qty ?? q.def) || 0));
    if (q.multiply) total = total * Math.max(1, n) + 0;
    total += n * (Number(q.perUnit) || 0);
    lines.push({ q: q.label || "How many?", a: n + (q.unit ? " " + q.unit : "") });
  }
  const picked = [...new Set((Array.isArray(answers.addons) ? answers.addons : []).map(Number).filter((i) => i >= 0 && i < (c.addons || []).length))];
  for (const i of picked) total += Number(c.addons[i].price) || 0;
  if ((c.addons || []).length) lines.push({ q: "Add-ons", a: picked.length ? picked.map((i) => c.addons[i].label).join(", ") : "None" });
  if (c.mode === "none") return { none: true, lines };
  const p = Math.max(0, Math.min(50, Number(c.rangePct) || 0)) / 100;
  return c.mode === "exact" ? { exact: round(total), low: round(total), high: round(total), lines } : { low: round(total * (1 - p)), high: round(total * (1 + p)), exact: round(total), lines };
}
export const money = (v, cur = "$") => cur + Number(v).toLocaleString("en-US");
export const priceText = (r, c) => (r.none ? "Price on request" : c.mode === "exact" || r.low === r.high ? money(r.exact, c.currency) : `${money(r.low, c.currency)} – ${money(r.high, c.currency)}`);

// Server-side clean-up of an owner's calculator before saving.
export function sanitize(cIn) {
  const c = normalize(cIn || {});
  const s = (v, n = 80) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
  const list = (arr, max) => (Array.isArray(arr) ? arr : []).slice(0, max).map((x) => ({ label: s(x.label, 60), price: num(x.price) })).filter((x) => x.label);
  const services = list(c.services, 8);
  let qty = null;
  if (c.qty && typeof c.qty === "object") {
    const min = num(c.qty.min, 0, 100000), max = Math.max(min, num(c.qty.max, 0, 100000));
    qty = { label: s(c.qty.label, 60) || "How many?", unit: s(c.qty.unit, 20), perUnit: num(c.qty.perUnit), min, max, def: Math.max(min, Math.min(max, num(c.qty.def, 0, 100000))), ...(c.qty.multiply ? { multiply: true } : {}) };
  }
  return {
    v: 2, businessType: s(c.businessType, 60), title: s(c.title, 90) || "Get an instant quote",
    mode: ["exact", "range", "none"].includes(c.mode) ? c.mode : "range", rangePct: num(c.rangePct, 0, 50),
    currency: /^[$€£]$|^C\$$|^A\$$/.test(c.currency) ? c.currency : "$",
    services, qty, addons: list(c.addons, 8)
  };
}
