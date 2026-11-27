// Money is always integer paise in the API (docs/02). These helpers only format for display.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 18134500 -> "₹1,81,345" (Indian digit grouping, rupees rounded). */
export function formatINR(paise, { decimals = false } = {}) {
  const value = Number(paise || 0) / 100;
  return `₹${decimals ? inr2.format(value) : inr.format(Math.round(value))}`;
}

/** 386000000 -> "₹38.6 L" (lakh, one decimal). */
export function formatLakh(paise) {
  const lakh = Number(paise || 0) / 100 / 100000;
  return `₹${lakh.toFixed(1)} L`;
}

/** User-typed rupees ("1,350" or "1350.5") -> integer paise, or null when not a number. */
export function rupeesToPaise(input) {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[,\s₹]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Plain-rupee CSV amount: 845000 -> "8450.00". */
export function paiseToCsvAmount(paise) {
  return (Number(paise || 0) / 100).toFixed(2);
}
