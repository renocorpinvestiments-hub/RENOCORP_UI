/**
 * tasks/TaskDetail.jsx — RENOCORP Expanded Task View  v1.0
 * ===========================================================
 * Standalone "widened" task view — tapping a TaskCard expands in-place into
 * this component (per blueprint: "Tap card → expands like YouTube video").
 *
 * Extracted from Tasks.jsx so the expanded-state markup, the completion
 * confirmation modal, and the submit flow live in one dedicated,
 * independently testable file instead of being inlined in the screen.
 *
 * Uses the shared <Modal /> component for the confirmation step so styling
 * stays consistent with every other confirm dialog in the app (Withdraw,
 * Packages, Settings, etc).
 *
 * Props:
 *   task        — normalized Task object (same shape as TaskCard)
 *   onCollapse  — () => void — collapse back to the grid
 *   onComplete  — async (task) => Promise<void> — calls api.tasks.complete()
 *                 upstream; should throw on failure so this component can
 *                 surface the error inline.
 *   onDone      — () => void — called after a successful submission once the
 *                 user dismisses the success state (e.g. navigate to /rewards)
 *
 * Usage:
 *   <TaskDetail
 *     task={expandedTask}
 *     onCollapse={() => setExpandedId(null)}
 *     onComplete={(t) => api.tasks.complete(t.task_id, { idempotency_key })}
 *     onDone={() => navigate('/rewards')}
 *   />
 */

import { useCallback, useState } from "react";
import {
  ChevronDownIcon,
  ClockIcon,
  ExternalLinkIcon,
  CheckCircleIcon,
} from "lucide-react";
import { Modal } from "../components/Modal.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { formatUGX } from "../utils/formatUGX.js";
// P2 fix (same rationale as TaskCard.jsx): route through the shared
// converter instead of a private hardcoded rate.
import { toUGX } from "../utils/currencyConverter.js";
import { getTaskTypeStyle, TaskTypeIcon } from "./TaskCard.jsx";

// ─── SCOPED STYLE INJECTION (idempotent) ────────────────────────────────────
const STYLE_ID = "rc-taskdetail-styles";
const CSS = `
.rc-td { display: flex; flex-direction: column; gap: 12px; padding: 16px; background: var(--surface-2); border: 1px solid var(--accent-border); border-radius: var(--radius-lg); animation: rcTdIn 0.28s var(--ease-spring); }
.rc-td-collapse { display: inline-flex; align-items: center; gap: 5px; background: none; border: none; color: var(--text-muted); font-size: 12px; font-family: var(--font-mono); cursor: pointer; padding: 0; align-self: flex-start; transition: color var(--transition); }
.rc-td-collapse:hover { color: var(--text); }
.rc-td-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.rc-td-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 20px; border: 1px solid; font-size: 10px; font-weight: 700; font-family: var(--font-mono); letter-spacing: 0.5px; }
.rc-td-provider { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); }
.rc-td-title { font-size: 16px; font-weight: 700; color: var(--text); line-height: 1.4; font-family: var(--font-display); margin: 0; }
.rc-td-desc { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin: 0; }
.rc-td-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.rc-td-reward { display: flex; align-items: baseline; gap: 6px; }
.rc-td-reward-ugx { font-size: 22px; font-weight: 800; color: var(--accent); font-family: var(--font-display); letter-spacing: -0.5px; }
.rc-td-reward-usd { font-size: 11px; color: var(--text-dim); font-family: var(--font-mono); }
.rc-td-time-chip { display: flex; align-items: center; gap: 4px; background: var(--surface-3); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.rc-td-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.rc-td-actions a, .rc-td-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; }
.rc-td-error { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--danger-dim); border: 1px solid var(--danger-border); border-radius: var(--radius); color: var(--danger); font-size: 12px; }
@keyframes rcTdIn { from { opacity: 0; transform: scaleY(0.92); transform-origin: top; } to { opacity: 1; transform: scaleY(1); } }
@media (prefers-reduced-motion: reduce) { .rc-td { animation: none !important; } }
`;

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export default function TaskDetail({ task, onCollapse, onComplete, onDone }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { success:true } | { error }

  const openConfirm = useCallback(() => {
    setResult(null);
    setModalOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onComplete?.(task);
      setResult({ success: true });
    } catch (err) {
      setResult({ error: err?.message ?? "Submission failed. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }, [task, onComplete, submitting]);

  const handleModalClose = useCallback(() => {
    if (submitting) return;
    const wasSuccess = result?.success;
    setModalOpen(false);
    setResult(null);
    if (wasSuccess) onDone?.();
  }, [submitting, result, onDone]);

  if (!task) return null;

  const typeStyle = getTaskTypeStyle(task.type);
  const rewardUGX = toUGX(task.reward_usd ?? 0, "USD");

  return (
    <div className="rc-td" aria-expanded="true">
      <button className="rc-td-collapse" onClick={onCollapse} aria-label="Collapse task">
        <ChevronDownIcon size={15} strokeWidth={2} aria-hidden="true" />
        Collapse
      </button>

      <div className="rc-td-header">
        <div
          className="rc-td-chip"
          style={{ background: typeStyle.bg, borderColor: typeStyle.border, color: typeStyle.color }}
        >
          <TaskTypeIcon type={task.type} size={12} />
          {task.type_label || task.type}
        </div>
        <span className="rc-td-provider">{task.provider_display || task.provider}</span>
      </div>

      <h3 className="rc-td-title">{task.title}</h3>

      {task.description && <p className="rc-td-desc">{task.description}</p>}

      <div className="rc-td-meta">
        <div className="rc-td-reward">
          <span className="rc-td-reward-ugx">{formatUGX(rewardUGX)}</span>
          <span className="rc-td-reward-usd">(${task.reward_usd?.toFixed?.(4) ?? "0.0000"})</span>
        </div>
        {task.duration_min > 0 && (
          <div className="rc-td-time-chip">
            <ClockIcon size={12} strokeWidth={2} aria-hidden="true" />
            {task.duration_min} min
          </div>
        )}
      </div>

      <div className="rc-td-actions">
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          aria-label={`Start task: ${task.title}`}
        >
          <ExternalLinkIcon size={14} strokeWidth={2} aria-hidden="true" />
          Start Task
        </a>
        <button
          className="btn-secondary"
          onClick={openConfirm}
          disabled={submitting}
          aria-label="Mark task as complete"
        >
          <CheckCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
          I'm Done
        </button>
      </div>

      <Modal open={modalOpen} onClose={handleModalClose} title="Submit Completion">
        {result?.success ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">✅</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-display)" }}>
              Task Submitted!
            </div>
            <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 300, margin: 0 }}>
              Your completion for <strong>{task.title}</strong> has been submitted for review. You'll
              receive <strong style={{ color: "var(--accent)" }}>{formatUGX(rewardUGX)}</strong> once
              approved. Check <strong>Rewards → Pending</strong> to track it.
            </p>
            <button className="btn-primary" onClick={handleModalClose} style={{ width: "100%" }}>
              View Rewards
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 6 }}>
              Confirm you have completed:
            </p>
            <div
              style={{
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "12px 14px",
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: 14, color: "var(--text)" }}>{task.title}</strong>
            </div>
            {result?.error && (
              <div className="rc-td-error" role="alert" style={{ marginBottom: 12 }}>
                {result.error}
              </div>
            )}
            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 18 }}>
              ⚠️ Only submit if you genuinely completed the task. False submissions may result in
              account suspension.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button className="btn-secondary" onClick={handleModalClose} disabled={submitting}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleConfirm} disabled={submitting}>
                {submitting ? <Spinner size="sm" /> : "Confirm Submission"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
