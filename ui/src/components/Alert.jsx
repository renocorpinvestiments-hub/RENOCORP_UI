/**
 * components/Alert.jsx — RENOCORP Inline Alert  v2.0
 * ====================================================
 * Displays error, success, info, or warning messages inline.
 *
 * Usage:
 *   <Alert type="error" message={error} />
 *   <Alert type="success">Withdrawal submitted!</Alert>
 *   {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}
 */

import { XIcon } from "lucide-react";

const TYPE_MAP = {
  error:   "rc-alert-error",
  success: "rc-alert-success",
  info:    "rc-alert-info",
  warning: "rc-alert-warning",
};

const ICON_MAP = {
  error:   "✕",
  success: "✓",
  info:    "ℹ",
  warning: "⚠",
};

export function Alert({ type = "error", message, children, onDismiss, style }) {
  const content = message ?? children;
  if (!content) return null;

  return (
    <div
      className={`rc-alert ${TYPE_MAP[type] ?? TYPE_MAP.error}`}
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      style={style}
    >
      <span aria-hidden="true" style={{ flexShrink: 0, fontWeight: 700 }}>
        {ICON_MAP[type]}
      </span>
      <span style={{ flex: 1 }}>{content}</span>
      {onDismiss && (
        <button
          className="btn-ghost"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ padding: "2px 4px", marginLeft: 4, flexShrink: 0 }}
        >
          <XIcon size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export default Alert;
