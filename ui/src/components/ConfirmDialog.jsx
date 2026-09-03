/**
 * components/ConfirmDialog.jsx — RENOCORP Confirm Action Dialog  v2.0
 * =====================================================================
 * Bottom-sheet modal requiring user confirmation before destructive
 * or financial actions.
 *
 * Usage:
 *   <ConfirmDialog
 *     open={confirmOpen}
 *     onClose={() => setConfirmOpen(false)}
 *     onConfirm={handleWithdraw}
 *     title="Confirm Withdrawal"
 *     description="UGX 10,000 will be deducted from your account."
 *     confirmLabel="Withdraw"
 *     danger
 *     loading={submitting}
 *   />
 */

import Modal from "./Modal.jsx";
import { Spinner } from "./Spinner.jsx";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
}) {
  return (
    <Modal open={open} onClose={!loading ? onClose : undefined} title={title}>
      {description && (
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            lineHeight: 1.6,
            marginBottom: 4,
          }}
        >
          {description}
        </p>
      )}
      <div className="rc-confirm-actions">
        <button
          className="btn-secondary"
          onClick={onClose}
          disabled={loading}
        >
          {cancelLabel}
        </button>
        <button
          className={`btn-primary${danger ? " btn-danger" : ""}`}
          onClick={onConfirm}
          disabled={loading}
          style={danger ? {
            background: "var(--danger-dim)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger)",
          } : undefined}
        >
          {loading ? <Spinner size="sm" /> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
