/**
 * utils/formatUGX.js — RENOCORP Currency Formatter  v2.0
 * ========================================================
 * Formats numbers as Ugandan Shillings (UGX).
 * Handles null, undefined, strings, and negative values safely.
 *
 * Usage:
 *   formatUGX(10000)     → "UGX 10,000"
 *   formatUGX(null)      → "UGX —"
 *   formatUGX(500, true) → "+UGX 500"
 */

export function formatUGX(amount, showSign = false) {
  if (amount == null || amount === "") return "UGX —";
  const num = Number(amount);
  if (isNaN(num)) return "UGX —";
  const formatted = Math.abs(num).toLocaleString("en-UG");
  if (showSign && num > 0) return `+UGX ${formatted}`;
  if (num < 0) return `-UGX ${formatted}`;
  return `UGX ${formatted}`;
}

/**
 * Compact format for large numbers in stat cards.
 * formatUGXCompact(2_400_000) → "UGX 2.4M"
 */
export function formatUGXCompact(amount) {
  if (amount == null) return "UGX —";
  const num = Number(amount);
  if (isNaN(num)) return "UGX —";
  if (Math.abs(num) >= 1_000_000)
    return `UGX ${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000)
    return `UGX ${(num / 1_000).toFixed(0)}K`;
  return `UGX ${num.toLocaleString("en-UG")}`;
}

export default formatUGX;
