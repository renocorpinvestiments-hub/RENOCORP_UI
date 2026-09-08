/**
 * components/Badge.jsx — RENOCORP Status Badge  v2.0
 * ====================================================
 * Colored pill badge for status display.
 *
 * Variants: green | orange | red | blue | purple | grey
 *
 * Usage:
 *   <Badge variant="green">Completed</Badge>
 *   <Badge variant="orange">Pending</Badge>
 *   <Badge status="approved" />   ← auto-maps status strings
 */

const STATUS_MAP = {
  // Completed / success states
  completed:  "green",
  approved:   "green",
  active:     "green",
  rewarded:   "green",
  paid:       "green",
  success:    "green",
  verified:   "green",
  // Pending / warning states
  pending:    "orange",
  processing: "orange",
  review:     "orange",
  awaiting:   "orange",
  // Failed / danger states
  rejected:   "red",
  failed:     "red",
  cancelled:  "red",
  banned:     "red",
  expired:    "red",
  revoked:    "red",
  // Info states
  info:       "blue",
  current:    "blue",
  // Premium states
  premium:    "purple",
  elite:      "purple",
  mfa:        "purple",
  // Default
  inactive:   "grey",
  ordinary:   "grey",
};

export function Badge({ variant, status, children, style }) {
  const resolvedVariant = variant ?? STATUS_MAP[status?.toLowerCase()] ?? "grey";
  return (
    <span
      className={`rc-badge rc-badge-${resolvedVariant}`}
      style={style}
    >
      {children ?? status ?? "—"}
    </span>
  );
}

export default Badge;
