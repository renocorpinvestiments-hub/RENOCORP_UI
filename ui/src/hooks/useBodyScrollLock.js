/**
 * hooks/useBodyScrollLock.js — RENOCORP Body Scroll Lock  v1.0
 * ================================================================
 * NEW FILE — P2 fix (RENOCORP_PRODUCTION_READINESS.md §5,
 * "Accessibility": "run an automated a11y pass... given this is a
 * consumer-facing money app.")
 *
 * WHAT WAS FOUND
 * ------------------------------------------------------------
 * Both components/Modal.jsx and shell/SideDrawer.jsx document
 * "Body scroll lock while open" as a shipped feature in their own
 * file-header docstrings — but neither actually implements it.
 * With a dialog/drawer open, the page behind it keeps scrolling on
 * touch/wheel input, which:
 *   1. Contradicts the WAI-ARIA modal dialog pattern, which
 *      requires content OUTSIDE an open modal to be inert — not
 *      just visually dimmed, but unreachable by scroll or focus —
 *      so a screen reader or keyboard user can't accidentally
 *      interact with a "background" balance/withdraw amount while
 *      a confirmation dialog is open over it.
 *   2. Is a real (non-a11y) UX bug on mobile: the page visibly
 *      scrolls underneath the sheet while dragging inside it.
 *
 * This hook is idempotent and nesting-safe (a ref-counted lock —
 * if Modal opens a second modal opens on top, releasing the inner
 * one doesn't unlock scroll while the outer one is still open).
 *
 * Usage:
 *   useBodyScrollLock(open); // open: boolean
 */

import { useEffect } from "react";

let _lockCount = 0;
let _originalOverflow = null;
let _originalPaddingRight = null;

function _acquireLock() {
  if (_lockCount === 0) {
    const scrollbarWidth =
      typeof window !== "undefined"
        ? window.innerWidth - document.documentElement.clientWidth
        : 0;

    _originalOverflow = document.body.style.overflow;
    _originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = "hidden";
    // Compensate for the disappearing scrollbar so page content
    // doesn't visibly shift width when the lock engages — a small
    // but real polish detail on desktop.
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  _lockCount += 1;
}

function _releaseLock() {
  _lockCount = Math.max(0, _lockCount - 1);
  if (_lockCount === 0) {
    document.body.style.overflow = _originalOverflow ?? "";
    document.body.style.paddingRight = _originalPaddingRight ?? "";
  }
}

/**
 * Lock/unlock body scroll based on a boolean flag. Safe to use in
 * multiple components simultaneously (ref-counted).
 *
 * @param {boolean} active
 */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    if (!active) return undefined;

    _acquireLock();
    return () => _releaseLock();
  }, [active]);
}

export default useBodyScrollLock;
