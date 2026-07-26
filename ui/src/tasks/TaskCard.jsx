/**
 * tasks/TaskCard.jsx — RENOCORP Task Grid Card  v1.0
 * =====================================================
 * Standalone, reusable collapsed-state task tile used by Tasks.jsx (and
 * anywhere else a task needs to be listed — Home feed, search results, etc).
 *
 * Previously this lived only as a private component inside Tasks.jsx.
 * Extracted here so it can be imported independently, memoized once, and
 * reused without duplicating markup/CSS across screens.
 *
 * Design:
 *  · Matches the RENOCORP dark design system exactly (reads CSS vars from
 *    :root, defined in styles.js — no new tokens introduced).
 *  · Ships its own scoped stylesheet, injected once and idempotently,
 *    the same pattern App.jsx uses for globalStyles. This means the card
 *    renders correctly even before/without any manual CSS wiring.
 *  · Zero layout assumptions — drop it inside any CSS grid.
 *  · Fully keyboard accessible (native <button>, visible focus ring).
 *  · Lazy image loading, graceful fallback to a type-tinted placeholder.
 *
 * Props:
 *   task        — normalized Task object (see offerwall/models.py `Task`):
 *                 { task_id, provider, provider_display, type, type_label,
 *                   title, reward_usd, duration_min, thumbnail, url }
 *   onSelect    — (task) => void — called when the card is tapped
 *
 * Usage:
 *   <TaskCard task={task} onSelect={(t) => setExpandedId(t.task_id)} />
 */

import { memo } from "react";
import {
  PlayCircleIcon,
  ClipboardListIcon,
  GiftIcon,
  DownloadIcon,
  HelpCircleIcon,
  ZapIcon,
} from "lucide-react";
import { formatUGX } from "../utils/formatUGX.js";

// ─── SHARED TYPE MAPS (exported so TaskDetail.jsx stays visually in sync) ───
export const TASK_TYPE_ICONS = {
  VIDEO: PlayCircleIcon,
  SURVEY: ClipboardListIcon,
  OFFER: GiftIcon,
  DOWNLOAD: DownloadIcon,
  QUIZ: HelpCircleIcon,
  CHECKIN: ZapIcon,
};

export const TASK_TYPE_COLORS = {
  VIDEO: { bg: "var(--info-dim)", border: "var(--info-border)", color: "var(--info)" },
  SURVEY: { bg: "var(--purple-dim)", border: "var(--purple-border)", color: "var(--purple)" },
  OFFER: { bg: "var(--accent-dim)", border: "var(--accent-border)", color: "var(--accent)" },
  DOWNLOAD: { bg: "var(--warning-dim)", border: "var(--warning-border)", color: "var(--warning)" },
  QUIZ: { bg: "var(--info-dim)", border: "var(--info-border)", color: "var(--info)" },
  CHECKIN: { bg: "var(--accent-dim)", border: "var(--accent-border)", color: "var(--accent)" },
};

export function getTaskTypeStyle(type) {
  return TASK_TYPE_COLORS[type?.toUpperCase()] ?? TASK_TYPE_COLORS.OFFER;
}

export function TaskTypeIcon({ type, size = 16, ...props }) {
  const Icon = TASK_TYPE_ICONS[type?.toUpperCase()] ?? GiftIcon;
  return <Icon size={size} strokeWidth={2} {...props} />;
}

// ─── SCOPED STYLE INJECTION (idempotent — same pattern as App.jsx) ──────────
const STYLE_ID = "rc-taskcard-styles";
const CSS = `
.rc-tc {
  display: flex;
  flex-direction: column;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  padding: 0;
  width: 100%;
  font: inherit;
  color: inherit;
  transition: border-color var(--transition), background var(--transition),
    transform var(--transition), box-shadow var(--transition);
  animation: rcTcIn 0.22s var(--ease);
}
.rc-tc:hover { border-color: var(--border-hover); background: var(--surface-3); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.25); }
.rc-tc:active { transform: scale(0.98); }
.rc-tc:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.rc-tc-thumb { position: relative; width: 100%; aspect-ratio: 16/10; background: var(--surface-3); overflow: hidden; flex-shrink: 0; }
.rc-tc-thumb img { width: 100%; height: 100%; object-fit: cover; }
.rc-tc-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.rc-tc-duration { position: absolute; bottom: 5px; right: 6px; background: rgba(0,0,0,0.72); color: #fff; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-family: var(--font-mono); backdrop-filter: blur(2px); }
.rc-tc-body { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.rc-tc-title { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.rc-tc-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; }
.rc-tc-type-dot { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.rc-tc-reward { font-size: 11px; font-weight: 800; color: var(--accent); font-family: var(--font-mono); letter-spacing: -0.3px; }
.rc-tc-provider { font-size: 9px; color: var(--text-dim); font-family: var(--font-mono); text-transform: uppercase; letter-spacing: 0.4px; }
@keyframes rcTcIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .rc-tc { animation: none !important; transition: none !important; } }
`;

if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
const TaskCard = memo(function TaskCard({ task, onSelect }) {
  if (!task) return null;

  const typeStyle = getTaskTypeStyle(task.type);
  const rewardUGX = Math.round((task.reward_usd ?? 0) * 3750);

  return (
    <button
      type="button"
      className="rc-tc"
      onClick={() => onSelect?.(task)}
      aria-label={`${task.title} — ${formatUGX(rewardUGX)}`}
    >
      <div className="rc-tc-thumb" aria-hidden="true">
        {task.thumbnail ? (
          <img src={task.thumbnail} alt="" loading="lazy" />
        ) : (
          <div className="rc-tc-placeholder" style={{ background: typeStyle.bg }}>
            <TaskTypeIcon type={task.type} size={28} style={{ color: typeStyle.color, opacity: 0.7 }} />
          </div>
        )}
        {task.duration_min > 0 && (
          <div className="rc-tc-duration">{task.duration_min}m</div>
        )}
      </div>

      <div className="rc-tc-body">
        <div className="rc-tc-title">{task.title}</div>
        {task.provider_display && (
          <div className="rc-tc-provider">{task.provider_display}</div>
        )}
        <div className="rc-tc-footer">
          <div
            className="rc-tc-type-dot"
            style={{ background: typeStyle.bg, border: `1px solid ${typeStyle.border}` }}
            aria-label={task.type_label || task.type}
          >
            <TaskTypeIcon type={task.type} size={11} style={{ color: typeStyle.color }} />
          </div>
          <div className="rc-tc-reward">{formatUGX(rewardUGX)}</div>
        </div>
      </div>
    </button>
  );
});

export default TaskCard;
