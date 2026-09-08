/**
 * shell/NotificationBell.jsx — RENOCORP Notification Bell  v1.0
 * =================================================================
 * Standalone bell icon + live unread badge, previously inlined directly
 * inside TopNavBar.jsx. Extracted so it can be reused anywhere (e.g. a
 * desktop sidebar, an admin top bar) without duplicating the polling
 * wiring or the shake-on-new-notification animation.
 *
 * Self-contained:
 *  · Reads unread count from the existing useNotifications() hook
 *    (which already polls /api/notifications/summary — no new requests).
 *  · No required props — drop it in anywhere.
 *  · Ships its own scoped, idempotently-injected CSS so it renders
 *    correctly regardless of global stylesheet wiring.
 *
 * Props (all optional):
 *   onClick   — override navigation target (defaults to /notifications)
 *   size      — icon size in px (default 20)
 *
 * Usage:
 *   <NotificationBell />
 *   <NotificationBell onClick={() => setDrawerOpen(true)} />
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellIcon } from "lucide-react";
import { useNotifications } from "../hooks/useNotifications.js";

// ─── SCOPED STYLE INJECTION (idempotent) ────────────────────────────────────
const STYLE_ID = "rc-notifbell-styles";
const CSS = `
.rc-nb-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 6px; border-radius: 999px; transition: color var(--transition), background var(--transition); }
.rc-nb-btn:hover { color: var(--text); background: var(--surface-3); }
.rc-nb-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rc-nb-badge { position: absolute; top: 1px; right: 1px; min-width: 15px; height: 15px; padding: 0 3px; display: flex; align-items: center; justify-content: center; background: var(--danger); color: #fff; font-size: 9px; font-weight: 800; font-family: var(--font-mono); border-radius: 999px; border: 1.5px solid var(--surface); line-height: 1; animation: rcNbPop 0.25s var(--ease-spring); }
.rc-nb-shake { animation: rcNbShake 0.6s ease 0.05s both; }
@keyframes rcNbPop { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes rcNbShake { 0%,100% { transform: rotate(0); } 15% { transform: rotate(14deg); } 30% { transform: rotate(-12deg); } 45% { transform: rotate(9deg); } 60% { transform: rotate(-7deg); } 75% { transform: rotate(4deg); } 90% { transform: rotate(-2deg); } }
@media (prefers-reduced-motion: reduce) { .rc-nb-badge, .rc-nb-shake { animation: none !important; } }
`;

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export default function NotificationBell({ onClick, size = 20 }) {
  const navigate = useNavigate();
  const unread = useNotifications();
  const prevUnread = useRef(unread);
  const [shake, setShake] = useState(false);

  // Shake whenever unread count rises (new notification arrived)
  useEffect(() => {
    if (unread > prevUnread.current && unread > 0) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 700);
      prevUnread.current = unread;
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
  }, [unread]);

  const handleClick = onClick ?? (() => navigate("/notifications"));

  return (
    <button
      type="button"
      className="rc-nb-btn"
      onClick={handleClick}
      aria-label={unread > 0 ? `Notifications — ${unread} unread` : "Notifications"}
    >
      <BellIcon size={size} strokeWidth={2} className={shake ? "rc-nb-shake" : ""} />
      {unread > 0 && (
        <span className="rc-nb-badge" aria-hidden="true">
          {unread > 99 ? "99+" : unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}
