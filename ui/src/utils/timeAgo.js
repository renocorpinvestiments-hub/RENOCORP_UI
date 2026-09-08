/**
 * utils/timeAgo.js — RENOCORP Relative Time Formatter  v2.0
 * ===========================================================
 * Converts ISO timestamps to human-readable relative strings.
 *
 * Usage:
 *   timeAgo("2024-01-01T10:00:00Z") → "2 hours ago"
 *   timeAgo(new Date())              → "just now"
 */

const DIVISIONS = [
  { amount: 60,          name: "seconds" },
  { amount: 60,          name: "minutes" },
  { amount: 24,          name: "hours"   },
  { amount: 7,           name: "days"    },
  { amount: 4.34524,     name: "weeks"   },
  { amount: 12,          name: "months"  },
  { amount: Number.POSITIVE_INFINITY, name: "years" },
];

const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(dateInput) {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" || typeof dateInput === "number"
    ? new Date(dateInput)
    : dateInput;

  if (isNaN(date.getTime())) return "—";

  let duration = (date.getTime() - Date.now()) / 1000;

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      return formatter.format(Math.round(duration), division.name);
    }
    duration /= division.amount;
  }
  return "—";
}

/**
 * Format date as readable string for display in lists.
 * formatDate("2024-06-14T10:00:00Z") → "Jun 14, 2024"
 */
export function formatDate(dateInput, opts = {}) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...opts,
  });
}

/**
 * Format date + time.
 * formatDateTime("2024-06-14T10:30:00Z") → "Jun 14, 2024, 10:30 AM"
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return "—";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-UG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default timeAgo;
