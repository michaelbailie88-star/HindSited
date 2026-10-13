// Quote Calculator: templates and the pricing maths. Shared by the browser
// (live price) and the server (which recomputes every quote it receives).

export const INDUSTRIES = {
  cleaning: "House cleaning", landscaping: "Landscaping and lawn care", painting: "Painting",
  plumbing: "Plumbing", moving: "Moving", events: "Events and catering", detailing: "Auto detailing",
  photography: "Photography", general: "Something else"
};

let n = 0;
const id = () => "q" + (++n);
const num = (label, perUnit, opts = {}) => ({ id: id(), type: "number", label, perUnit, unit: opts.unit || "", min: opts.min ?? 0, max: opts.max ?? 100, def: opts.def ?? opts.min ?? 0 });
const choice = (label, options) => ({ id: id(), type: "choice", label, options: options.map(([l, add = 0, mult = 1]) => ({ label: l, add, mult })) });
const extras = (label, options) => ({ id: id(), type: "extras", label, options: options.map(([l, add]) => ({ label: l, add })) });

export function template(kind) {
  n = 0;
  const T = {
    cleaning: { title: "Get an instant cleaning quote", base: 60, minimum: 100, questions: [
      num("Bedrooms", 25, { min: 1, max: 8, def: 2 }), num("Bathrooms", 20, { min: 1, max: 6, def: 1 }),
      choice("Type of clean", [["Standard clean"], ["Deep clean", 0, 1.5], ["Move-in / move-out", 0, 1.8]]),
      choice("How often?", [["One time"], ["Monthly", 0, 0.9], ["Every two weeks", 0, 0.85], ["Weekly", 0, 0.8]]),
      extras("Extras", [["Inside the oven", 30], ["Inside the fridge", 25], ["Interior windows", 40], ["Laundry", 20]])] },
    landscaping: { title: "Get an instant lawn and garden quote", base: 30, minimum: 45, questions: [
      choice("Yard size", [["Small (under 2,500 sq ft)", 20], ["Medium (2,500-6,000 sq ft)", 45], ["Large (6,000-10,000 sq ft)", 75], ["Very large (10,000+ sq ft)", 120]]),
      choice("Service", [["Mowing and edging"], ["Spring or fall clean-up", 0, 3], ["Full garden maintenance", 0, 2]]),
      choice("How often?", [["One time"], ["Every two weeks", 0, 0.92], ["Weekly", 0, 0.85]]),
      extras("Add-ons", [["Hedge trimming", 60], ["Leaf removal", 80], ["Fertilizing", 45], ["Mulch refresh", 120]])] },
    painting: { title: "Get an instant painting quote", base: 150, minimum: 300, questions: [
      num("Rooms", 280, { min: 1, max: 20, def: 2 }),
      choice("Ceilings too?", [["No"], ["Yes", 0, 1.25]]),
      choice("Wall condition", [["Good shape"], ["Some patching", 0, 1.1], ["Lots of repairs", 0, 1.25]]),
      extras("Extras", [["Trim and baseboards", 150], ["Doors (all)", 120], ["Colour change (dark to light)", 200]])] },
    plumbing: { title: "Get an instant plumbing estimate", base: 95, minimum: 125, questions: [
      choice("What do you need?", [["Leaky tap or toilet", 60], ["Blocked drain", 90], ["Water heater install", 900], ["Fixture install (sink, toilet)", 180], ["Something else", 75]]),
      choice("When?", [["This week"], ["Today (urgent)", 0, 1.3], ["Evening or weekend", 0, 1.5]]),
      num("Number of fixtures", 45, { min: 1, max: 10, def: 1 })] },
    moving: { title: "Get an instant moving quote", base: 150, minimum: 300, questions: [
      choice("Home size", [["Studio or 1 bedroom", 200], ["2 bedrooms", 450], ["3 bedrooms", 750], ["4+ bedrooms", 1100]]),
      num("Distance (km)", 2.5, { unit: "km", min: 0, max: 500, def: 15 }),
      num("Flights of stairs", 60, { min: 0, max: 6, def: 0 }),
      extras("Extras", [["Packing service", 350], ["Piano or safe", 250], ["Storage (1 month)", 180]])] },
    events: { title: "Get an instant event quote", base: 250, minimum: 500, questions: [
      num("Guests", 28, { min: 10, max: 500, def: 50 }),
      choice("Menu", [["Buffet"], ["Plated dinner", 0, 1.35], ["Appetizers only", 0, 0.7]]),
      choice("Day", [["Weekday"], ["Saturday", 0, 1.15]]),
      extras("Extras", [["Bar service", 400], ["Staff for setup and cleanup", 300], ["Dessert table", 250]])] },
    detailing: { title: "Get an instant detailing quote", base: 0, minimum: 80, questions: [
      choice("Vehicle", [["Car", 90], ["SUV or minivan", 120], ["Truck", 130]]),
      choice("Package", [["Exterior wash and wax"], ["Interior detail", 0, 1.3], ["Full detail (in and out)", 0, 1.9]]),
      extras("Add-ons", [["Ceramic coating", 450], ["Pet hair removal", 40], ["Headlight restoration", 60], ["Engine bay", 50]])] },
    photography: { title: "Get an instant photography quote", base: 150, minimum: 250, questions: [
      choice("Type of shoot", [["Portraits or family", 150], ["Headshots", 100], ["Event", 300], ["Wedding", 1800], ["Product", 250]]),
      num("Hours", 150, { min: 1, max: 12, def: 2 }),
      extras("Extras", [["Second photographer", 400], ["Printed album", 350], ["Rush editing (48 hours)", 150]])] },
    general: { title: "Get an instant quote", base: 100, minimum: 100, questions: [
      choice("Size of job", [["Small", 0], ["Medium", 150], ["Large", 400]]),
      choice("How soon?", [["Flexible"], ["Within a week", 0, 1.1], ["Urgent", 0, 1.3]]),
      extras("Extras", [["Extra item A", 50], ["Extra item B", 75]])] }
  };
  const t = T[kind] || T.general;
  return { industry: kind in T ? kind : "general", title: t.title, base: t.base, minimum: t.minimum, mode: "range", rangePct: 15, currency: "$", questions: t.questions };
}

const round = (v) => (v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v / 5) * 5);
// answers: { [questionId]: number | optionIndex | [optionIndexes] }
export function price(calc, answers = {}) {
  let add = Number(calc.base) || 0, mult = 1;
  const lines = [];
  for (const q of calc.questions || []) {
    const a = answers[q.id];
    if (q.type === "number") {
      const v = Math.max(q.min ?? 0, Math.min(q.max ?? 1e6, Number(a ?? q.def ?? 0) || 0));
      add += v * (Number(q.perUnit) || 0);
      lines.push({ q: q.label, a: String(v) + (q.unit ? " " + q.unit : "") });
    } else if (q.type === "choice") {
      const o = q.options[Math.max(0, Math.min(q.options.length - 1, Number(a) || 0))];
      if (o) { add += Number(o.add) || 0; mult *= Number(o.mult) || 1; lines.push({ q: q.label, a: o.label }); }
    } else if (q.type === "extras") {
      const picked = (Array.isArray(a) ? a : []).map(Number).filter((i) => i >= 0 && i < q.options.length);
      const uniq = [...new Set(picked)];
      for (const i of uniq) add += Number(q.options[i].add) || 0;
      lines.push({ q: q.label, a: uniq.length ? uniq.map((i) => q.options[i].label).join(", ") : "None" });
    }
  }
  const total = Math.max(Number(calc.minimum) || 0, add * mult);
  const p = Math.max(0, Math.min(50, Number(calc.rangePct) || 0)) / 100;
  return calc.mode === "exact"
    ? { exact: round(total), low: round(total), high: round(total), lines }
    : { low: round(total * (1 - p)), high: round(total * (1 + p)), exact: round(total), lines };
}
export const money = (v, cur = "$") => cur + Number(v).toLocaleString("en-US");
export const priceText = (r, calc) => (calc.mode === "exact" || r.low === r.high ? money(r.exact, calc.currency) : `${money(r.low, calc.currency)} – ${money(r.high, calc.currency)}`);

// Server-side clean-up of an owner's calculator before saving.
export function sanitize(c) {
  const s = (v, n = 80) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, n);
  const f = (v, lo = -1e6, hi = 1e6) => { const x = Number(v); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0; };
  const qs = (Array.isArray(c.questions) ? c.questions : []).slice(0, 12).map((q, i) => {
    const base = { id: "q" + (i + 1), label: s(q.label) || "Question " + (i + 1) };
    if (q.type === "number") return { ...base, type: "number", perUnit: f(q.perUnit), unit: s(q.unit, 20), min: f(q.min, 0), max: Math.max(f(q.min, 0), f(q.max, 0)), def: f(q.def, 0) };
    const type = q.type === "extras" ? "extras" : "choice";
    const opts = (Array.isArray(q.options) ? q.options : []).slice(0, 12).map((o) => ({ label: s(o.label, 60) || "Option", add: f(o.add), ...(type === "choice" ? { mult: f(o.mult ?? 1, 0, 10) || 1 } : {}) }));
    if (!opts.length) opts.push({ label: "Option", add: 0, ...(type === "choice" ? { mult: 1 } : {}) });
    return { ...base, type, options: opts };
  });
  return {
    industry: c.industry in INDUSTRIES ? c.industry : "general", title: s(c.title, 90) || "Get an instant quote",
    base: f(c.base, 0), minimum: f(c.minimum, 0), mode: c.mode === "exact" ? "exact" : "range", rangePct: f(c.rangePct, 0, 50),
    currency: /^[$€£]$|^C\$$|^A\$$/.test(c.currency) ? c.currency : "$", questions: qs
  };
}
