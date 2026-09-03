/**
 * components/Spinner.jsx — RENOCORP Loading Spinner  v2.0
 * =========================================================
 * Variants: default (32px) and small (18px).
 * CSS-only, GPU-accelerated, matches design system tokens.
 */

export function Spinner({ size = "default", style }) {
  return (
    <div
      className={`rc-spinner${size === "sm" ? " rc-spinner-sm" : ""}`}
      role="status"
      aria-label="Loading"
      style={style}
    />
  );
}

export function SpinnerWrap({ size, style }) {
  return (
    <div className="rc-spinner-wrap" style={style}>
      <Spinner size={size} />
    </div>
  );
}

export default Spinner;
