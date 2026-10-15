// "What is this costing you?" The owner enters their own numbers; each issue
// the scan found removes a share of the enquiries a healthy site would get.
// The shares are rule-of-thumb estimates, shown openly under "How we estimate".
//
//   still getting  = product of (1 - share) over every issue   (never below 25%)
//   could be getting = enquiries now / still getting
//   lost enquiries = could be getting - enquiries now
//   lost $ a month = lost enquiries x (customers per 10 enquiries / 10) x customer value
// Each issue's slice of the loss is proportional to -ln(1 - share), so the
// slices add up exactly to the total.

export const STAGES = {
  found: { label: "Getting found on Google", note: "People searching for you who never see your site." },
  stay: { label: "Staying on your site", note: "Visitors who leave because the site is slow or hard to use on a phone." },
  trust: { label: "Trusting you", note: "Visitors who see mistakes or broken parts and go somewhere that looks more reliable." },
  contact: { label: "Getting in touch", note: "Visitors who want to contact you but can't easily do it." },
  hidden: { label: "Hidden issues", note: "The most serious issues, hidden on a free report." }
};
const CAT_STAGE = { google: "found", speed: "stay", trust: "trust", mistakes: "trust", broken: "trust", customers: "contact" };

// share of enquiries each issue is estimated to cost (rule of thumb)
const SHARE = {
  robots_block: 0.25, noindex: 0.2, no_viewport: 0.15, bad_tel_link: 0.15, no_contact_path: 0.15,
  no_https: 0.1, no_cta_fold: 0.08, slow_mobile: 0.08, code_error: 0.08, placeholder_contact: 0.08,
  no_tap_to_call: 0.06, bad_mailto: 0.06, mobile_overflow: 0.06, lorem: 0.05, no_reviews_home: 0.05
};
const BY_SEVERITY = { "Fix now": 0.05, "Fix soon": 0.03, "Worth fixing": 0.01 };
const FLOOR = 0.25;

export function shareOf(f) { return SHARE[f.rule] ?? Math.min(0.06, Math.round((f.w || 3) * 0.6) / 100); }

// findings: visible findings ({rule, w, cat, title, severity}); hidden: {bySeverity}
export function estimate({ findings = [], hidden = null, enquiries, perTen, value }) {
  const items = findings.map((f) => ({ key: f.rule, title: f.title, stage: CAT_STAGE[f.cat] || "trust", share: shareOf(f) }));
  if (hidden) for (const [sev, n] of Object.entries(hidden.bySeverity || {})) for (let i = 0; i < n; i++) items.push({ key: "hidden-" + sev + i, title: `Hidden issue (${sev.toLowerCase()})`, stage: "hidden", share: BY_SEVERITY[sev] || 0.02, hidden: true });
  const raw = items.reduce((p, x) => p * (1 - x.share), 1);
  const still = Math.max(FLOOR, raw);
  const could = enquiries / still;
  const lostEnq = could - enquiries;
  const perEnquiry = (perTen / 10) * value;
  const lostMonth = lostEnq * perEnquiry;
  const weight = items.map((x) => -Math.log(1 - x.share));
  const W = weight.reduce((a, b) => a + b, 0) || 1;
  items.forEach((x, i) => { x.month = lostMonth * (weight[i] / W); x.enq = lostEnq * (weight[i] / W); });
  const stages = {};
  for (const x of items) { const s = (stages[x.stage] = stages[x.stage] || { key: x.stage, month: 0, items: [] }); s.month += x.month; s.items.push(x); }
  for (const s of Object.values(stages)) s.items.sort((a, b) => b.month - a.month);
  return { items, stages: Object.values(stages).sort((a, b) => b.month - a.month), still, capped: raw < FLOOR, could, lostEnq, lostMonth, lostYear: lostMonth * 12 };
}

export const money = (n) => "$" + Math.round(n).toLocaleString("en-CA");
