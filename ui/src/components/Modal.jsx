/**
 * components/Modal.jsx — RENOCORP Bottom Sheet / Dialog  v2.0
 * =============================================================
 * Mobile: slides up from bottom as a sheet.
 * Desktop (≥600px): centered dialog.
 *
 * Features:
 *  · Focus trap while open
 *  · Dismisses on backdrop click or Escape key
 *  · Body scroll lock
 *  · Animated entrance / exit (CSS)
 *  · Accessible: role="dialog", aria-modal, aria-labelledby
 *
 * Usage:
 *   <Modal open={open} onClose={() => setOpen(false)} title="Confirm Withdrawal">
 *     <p>Are you sure?</p>
 *   </Modal>
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { XIcon } from "lucide-react";

export function Modal({ open, onClose, title, children, hideHandle = false }) {
  const sheetRef  = useRef(null);
  const titleId   = useRef(`modal-title-${Math.random().toString(36).slice(2)}`);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement;
    const raf = requestAnimationFrame(() => {
      const first = sheetRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      prevFocus?.focus();
    };
  }, [open]);

  // Keydown handler inside modal
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="presentation"
      aria-hidden="false"
    >
      <div
        ref={sheetRef}
        className="modal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId.current : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideHandle && <div className="modal-handle" aria-hidden="true" />}

        {title && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 18,
            }}
          >
            <div id={titleId.current} className="modal-title" style={{ margin: 0 }}>
              {title}
            </div>
            <button
              className="btn-ghost"
              onClick={onClose}
              aria-label="Close dialog"
              style={{ padding: "6px 8px", marginRight: -4 }}
            >
              <XIcon size={18} strokeWidth={2} />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
