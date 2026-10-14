// How many of a free report's findings are withheld: the most serious 40%
// (findings arrive sorted most serious first).
export function lockCount(n, first) {
  if (n >= 2) return Math.ceil(n * 0.4);
  return n === 1 && first && first.severity === "Fix now" ? 1 : 0;
}
