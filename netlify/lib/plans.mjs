// Plan limits. Prices live in Stripe (Phase 3); these are the allowances.
export const PLANS = {
  free: { label: "Free", businesses: 1, scansPerMonth: 1 },
  solo: { label: "Solo", businesses: 1, scansPerMonth: 30 },
  agency: { label: "Agency", businesses: 10, scansPerMonth: 300, whiteLabel: true },
  owner: { label: "Owner", businesses: Infinity, scansPerMonth: Infinity, whiteLabel: true }
};
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);
