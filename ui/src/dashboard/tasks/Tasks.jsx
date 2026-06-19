/**
 * tasks/Tasks.jsx — RENOCORP Task Feed  v2.0
 * ============================================
 * The primary task-earning screen.
 *
 * Architecture:
 *  · Task feed fetched from /api/tasks/feed with optional type filter
 *  · Dynamic tab bar — only shows types that exist in the feed (blueprint note)
 *  · 2-column scrollable card grid (blueprint image 1)
 *  · Tap card → expands like YouTube video (blueprint note)
 *  · After task viewed+completed → moves to Rewards (pending) screen
 *  · Daily check-in claim button (idempotent — safe to tap multiple times)
 *  · Daily progress bar visible at top
 *  · Limit-reached gate — blocks new tasks when daily cap hit
 *  · TaskDetail embedded (inline expand, not separate route for mobile feel)
 *  · AbortController on every fetch, stale-while-revalidate
 *  · Zero localStorage — all in-memory
 *
 * API calls:
 *  GET  /api/tasks/feed?type={filter}    — task list + daily progress
 *  POST /api/tasks/checkin               — daily check-in bonus
 *  POST /api/tasks/{task_id}/complete    — mark task as completed
 *
 * Blueprint notes honoured:
 *  - "Category menu — if no tasks for type, that type doesn't appear"
 *  - "Each task card has icon bottom-left indicating task type"
 *  - "Tap card → widens like YouTube videos"
 *  - "After viewed + finished → leaves page to pending/rewarded page"
 *  - "When no tasks → shows 'no tasks available'"
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { formatUGX } from "../utils/formatUGX.js";
import { TabBar } from "../components/TabBar.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { Badge } from "../components/Badge.jsx";
import { Modal } from "../components/Modal.jsx";
import {
  PlayCircleIcon,
  ClipboardListIcon,
  GiftIcon,
  DownloadIcon,
  HelpCircleIcon,
  ZapIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ClockIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  TrendingUpIcon,
  StarIcon,
} from "lucide-react";

// ─── TASK TYPE ICONS ────────────────────────────────────────────────────────
const TYPE_ICONS = {
  VIDEO:    PlayCircleIcon,
  SURVEY:   ClipboardListIcon,
  OFFER:    GiftIcon,
  DOWNLOAD: DownloadIcon,
  QUIZ:     HelpCircleIcon,
  CHECKIN:  ZapIcon,
};

const TYPE_COLORS = {
  VIDEO:    { bg: "var(--info-dim)",    border: "var(--info-border)",    color: "var(--info)" },
  SURVEY:   { bg: "var(--purple-dim)",  border: "var(--purple-border)",  color: "var(--purple)" },
  OFFER:    { bg: "var(--accent-dim)",  border: "var(--accent-border)",  color: "var(--accent)" },
  DOWNLOAD: { bg: "var(--warning-dim)", border: "var(--warning-border)", color: "var(--warning)" },
  QUIZ:     { bg: "var(--info-dim)",    border: "var(--info-border)",    color: "var(--info)" },
  CHECKIN:  { bg: "var(--accent-dim)",  border: "var(--accent-border)",  color: "var(--accent)" },
};

function getTypeStyle(type) {
  return TYPE_COLORS[type?.toUpperCase()] ?? TYPE_COLORS.OFFER;
}

function TaskTypeIcon({ type, size = 16, ...props }) {
  const Icon = TYPE_ICONS[type?.toUpperCase()] ?? GiftIcon;
  return <Icon size={size} strokeWidth={2} {...props} />;
}

// ─── DAILY PROGRESS BAR ─────────────────────────────────────────────────────
const DailyProgressBar = memo(function DailyProgressBar({ progress }) {
  if (!progress) return null;

  const {
    earned_today_usd    = 0,
    daily_limit_usd     = 2,
    progress_pct        = 0,
    limit_reached       = false,
    checkin_available   = false,
    tasks_completed_today = 0,
    membership_tier     = "free",
  } = progress;

  const pct = Math.min(100, Math.max(0, progress_pct));

  return (
    <div
      className={`tasks-progress-bar-card${limit_reached ? " limit-reached" : ""}`}
      role="region"
      aria-label="Daily earning progress"
    >
      <div className="tasks-progress-row">
        <div className="tasks-progress-label">
          <TrendingUpIcon size={13} strokeWidth={2} aria-hidden="true" />
          Today's Earnings
        </div>
        <div className="tasks-progress-value">
          <span className={limit_reached ? "tasks-limit-reached-text" : ""}>
            {formatUGX(Math.round(earned_today_usd * 3750))}
          </span>
          <span className="tasks-progress-sep">/</span>
          <span className="tasks-progress-limit">
            {formatUGX(Math.round(daily_limit_usd * 3750))}
          </span>
        </div>
      </div>

      <div
        className="tasks-progress-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${Math.round(pct)}% of daily limit reached`}
      >
        <div
          className={`tasks-progress-fill${limit_reached ? " tasks-progress-fill-done" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="tasks-progress-meta">
        <span className="tasks-progress-meta-item">
          <CheckCircleIcon size={11} strokeWidth={2} aria-hidden="true" />
          {tasks_completed_today} completed
        </span>
        <span className="tasks-tier-badge" data-tier={membership_tier}>
          {membership_tier.toUpperCase()}
        </span>
        {limit_reached && (
          <span className="tasks-limit-msg">
            Daily limit reached · Resets at midnight
          </span>
        )}
      </div>
    </div>
  );
});

// ─── CHECK-IN BUTTON ────────────────────────────────────────────────────────
function CheckInButton({ progress, onCheckin, loading }) {
  const [status, setStatus] = useState("idle"); // idle | loading | success | already

  const available = progress?.checkin_available ?? false;
  const claimed   = progress?.checkin_claimed_at != null;

  const handleCheckin = useCallback(async () => {
    if (status === "loading" || claimed || !available) return;
    setStatus("loading");
    try {
      const result = await onCheckin();
      if (result?.already_claimed) {
        setStatus("already");
      } else if (result?.success) {
        setStatus("success");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }, [status, claimed, available, onCheckin]);

  if (claimed || status === "already") {
    return (
      <div className="checkin-claimed" aria-live="polite">
        <CheckCircleIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        Daily check-in claimed!
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="checkin-success" aria-live="assertive">
        <StarIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        +UGX 188 check-in bonus earned!
      </div>
    );
  }

  return (
    <button
      className="checkin-btn"
      onClick={handleCheckin}
      disabled={status === "loading" || !available || loading}
      aria-label="Claim daily check-in bonus"
    >
      {status === "loading" ? (
        <Spinner size="sm" />
      ) : (
        <ZapIcon size={15} strokeWidth={2.5} aria-hidden="true" />
      )}
      {status === "loading" ? "Claiming…" : "Daily Check-In"}
    </button>
  );
}

// ─── TASK CARD ───────────────────────────────────────────────────────────────
// Collapsed grid card — tapping expands (blueprint: "widens like YouTube")
const TaskCard = memo(function TaskCard({ task, expanded, onToggle, onComplete, completing }) {
  const navigate    = useNavigate();
  const typeStyle   = getTypeStyle(task.type);
  const rewardUGX   = Math.round((task.reward_usd ?? 0) * 3750);

  // Expanded view — the "widened" YouTube-style detail
  if (expanded) {
    return (
      <div className="task-card task-card-expanded" aria-expanded="true">
        {/* Close / collapse strip */}
        <button
          className="task-card-collapse-btn"
          onClick={() => onToggle(null)}
          aria-label="Collapse task"
        >
          <ChevronDownIcon size={15} strokeWidth={2} aria-hidden="true" />
          Collapse
        </button>

        {/* Type badge + provider */}
        <div className="task-expanded-header">
          <div
            className="task-type-chip"
            style={{
              background: typeStyle.bg,
              borderColor: typeStyle.border,
              color: typeStyle.color,
            }}
          >
            <TaskTypeIcon type={task.type} size={12} />
            {task.type_label || task.type}
          </div>
          <span className="task-provider-label">
            {task.provider_display || task.provider}
          </span>
        </div>

        {/* Title */}
        <h3 className="task-expanded-title">{task.title}</h3>

        {/* Description */}
        {task.description && (
          <p className="task-expanded-desc">{task.description}</p>
        )}

        {/* Reward + time row */}
        <div className="task-expanded-meta">
          <div className="task-reward-display">
            <span className="task-reward-ugx">{formatUGX(rewardUGX)}</span>
            <span className="task-reward-usd">(${task.reward_usd?.toFixed(4)})</span>
          </div>
          {task.duration_min > 0 && (
            <div className="task-meta-chip">
              <ClockIcon size={12} strokeWidth={2} aria-hidden="true" />
              {task.duration_min} min
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="task-expanded-actions">
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary task-start-btn"
            onClick={() => {
              // After clicking the external link, show the "Mark Complete" option
            }}
            aria-label={`Start task: ${task.title}`}
          >
            <ExternalLinkIcon size={14} strokeWidth={2} aria-hidden="true" />
            Start Task
          </a>
          <button
            className="btn-secondary task-done-btn"
            onClick={() => onComplete(task)}
            disabled={completing}
            aria-label="Mark task as complete"
          >
            {completing ? (
              <Spinner size="sm" />
            ) : (
              <CheckCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
            )}
            {completing ? "Submitting…" : "I'm Done"}
          </button>
        </div>
      </div>
    );
  }

  // ── Collapsed grid card ──────────────────────────────────────────────────
  return (
    <button
      className="task-card task-card-grid"
      onClick={() => onToggle(task.task_id)}
      aria-expanded="false"
      aria-label={`${task.title} — ${formatUGX(rewardUGX)}`}
    >
      {/* Thumbnail or gradient placeholder */}
      <div className="task-card-thumb" aria-hidden="true">
        {task.thumbnail ? (
          <img
            src={task.thumbnail}
            alt=""
            loading="lazy"
            className="task-thumb-img"
          />
        ) : (
          <div
            className="task-thumb-placeholder"
            style={{ background: typeStyle.bg }}
          >
            <TaskTypeIcon
              type={task.type}
              size={28}
              style={{ color: typeStyle.color, opacity: 0.7 }}
            />
          </div>
        )}
        {/* Duration pill */}
        {task.duration_min > 0 && (
          <div className="task-duration-pill" aria-hidden="true">
            {task.duration_min}m
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="task-card-body">
        <div className="task-card-title">{task.title}</div>
        <div className="task-card-footer">
          {/* Type icon — bottom left (blueprint) */}
          <div
            className="task-type-icon-dot"
            style={{
              background: typeStyle.bg,
              border: `1px solid ${typeStyle.border}`,
            }}
            aria-label={task.type_label || task.type}
          >
            <TaskTypeIcon type={task.type} size={11} style={{ color: typeStyle.color }} />
          </div>
          <div className="task-card-reward">{formatUGX(rewardUGX)}</div>
        </div>
      </div>
    </button>
  );
});

// ─── LIMIT GATE ─────────────────────────────────────────────────────────────
function LimitGateBanner({ progress }) {
  if (!progress?.limit_reached) return null;

  const tierName = progress.membership_tier;
  const navigate = useNavigate();

  return (
    <div className="tasks-limit-gate" role="alert">
      <AlertCircleIcon size={16} strokeWidth={2} aria-hidden="true" />
      <div className="tasks-limit-gate-text">
        <strong>Daily limit reached.</strong>
        <span> Resets at midnight. Upgrade for a higher limit.</span>
      </div>
      {tierName === "free" && (
        <button
          className="btn-primary btn-sm"
          onClick={() => navigate("/packages")}
          style={{ flexShrink: 0 }}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

// ─── COMPLETE CONFIRMATION MODAL ─────────────────────────────────────────────
function CompleteModal({ task, open, onClose, onConfirm, loading, result }) {
  if (!task) return null;
  const rewardUGX = Math.round((task.reward_usd ?? 0) * 3750);

  return (
    <Modal open={open} onClose={!loading ? onClose : undefined} title="Submit Completion">
      {result ? (
        // Success state
        <div className="complete-modal-result">
          <div className="complete-modal-success-icon" aria-hidden="true">✅</div>
          <div className="complete-modal-success-title">Task Submitted!</div>
          <p className="complete-modal-success-msg">
            Your completion for <strong>{task.title}</strong> has been submitted for review.
            You'll receive{" "}
            <strong style={{ color: "var(--accent)" }}>{formatUGX(rewardUGX)}</strong>{" "}
            once approved. Check <strong>Rewards → Pending</strong> to track it.
          </p>
          <button className="btn-primary" onClick={onClose} style={{ width: "100%" }}>
            View Rewards
          </button>
        </div>
      ) : (
        // Confirm state
        <>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 6 }}>
            Confirm you have completed:
          </p>
          <div className="complete-modal-task-preview">
            <strong style={{ fontSize: 14, color: "var(--text)" }}>{task.title}</strong>
            <div
              className="task-type-chip"
              style={{ ...getTypeStyle(task.type), width: "fit-content", marginTop: 6 }}
            >
              <TaskTypeIcon type={task.type} size={12} />
              {task.type_label || task.type}
            </div>
          </div>
          <div className="complete-modal-reward-row">
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Pending reward</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--accent)", fontFamily: "var(--font-display)" }}>
              {formatUGX(rewardUGX)}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 18 }}>
            ⚠️ Only submit if you genuinely completed the task. False submissions may result in account suspension.
          </p>
          <div className="rc-confirm-actions">
            <button className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onConfirm} disabled={loading}>
              {loading ? <Spinner size="sm" /> : "Confirm Submission"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── SKELETON GRID ───────────────────────────────────────────────────────────
function TaskGridSkeleton() {
  return (
    <div className="task-grid">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="task-card-skeleton rc-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}

// ─── MAIN TASKS SCREEN ───────────────────────────────────────────────────────
export default function Tasks() {
  const navigate = useNavigate();

  // ── Filter state ─────────────────────────────────────────────────────────
  const [activeType, setActiveType] = useState("all");

  // ── Expanded task (only one at a time — like YouTube) ────────────────────
  const [expandedId, setExpandedId] = useState(null);

  // ── Complete modal state ─────────────────────────────────────────────────
  const [completeTask,    setCompleteTask]    = useState(null);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completing,      setCompleting]      = useState(false);
  const [completeResult,  setCompleteResult]  = useState(null);

  // ── Check-in state ───────────────────────────────────────────────────────
  const [checkingIn, setCheckingIn] = useState(false);

  // ── Fetch key for manual reload ──────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setExpandedId(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // ── Task feed ────────────────────────────────────────────────────────────
  const feedParams = useMemo(() => {
    const p = { country: "UG" };
    if (activeType !== "all") p.type = activeType;
    return p;
  }, [activeType]);

  const {
    data: feed,
    loading,
    isRefetching,
    error,
    reload: reloadFeed,
  } = useApi(() => api.tasks.feed(feedParams), [refreshKey, activeType]);

  const tasks        = feed?.tasks ?? [];
  const progress     = feed?.daily_progress ?? null;
  const available_types = feed?.available_types ?? [];

  // ── Dynamic tabs (blueprint: "if no tasks for type, tab doesn't show") ──
  const tabs = useMemo(() => {
    const all = [{ key: "all", label: "All", count: feed?.total ?? 0 }];
    const typeTabs = available_types.map((t) => ({
      key: t,
      label: t.charAt(0) + t.slice(1).toLowerCase(),
    }));
    return [...all, ...typeTabs];
  }, [available_types, feed?.total]);

  // ── Check-in handler ─────────────────────────────────────────────────────
  const handleCheckin = useCallback(async () => {
    setCheckingIn(true);
    try {
      const result = await api.tasks.checkin();
      // Refresh to update daily progress bar
      setTimeout(() => reloadFeed(), 400);
      return result;
    } finally {
      setCheckingIn(false);
    }
  }, [reloadFeed]);

  // ── Toggle expand ────────────────────────────────────────────────────────
  const handleToggle = useCallback((taskId) => {
    setExpandedId((prev) => (prev === taskId ? null : taskId));
  }, []);

  // ── Open complete modal ───────────────────────────────────────────────────
  const handleCompleteOpen = useCallback((task) => {
    setCompleteTask(task);
    setCompleteResult(null);
    setCompleteModalOpen(true);
  }, []);

  // ── Submit completion ─────────────────────────────────────────────────────
  const handleCompleteSubmit = useCallback(async () => {
    if (!completeTask || completing) return;
    setCompleting(true);
    try {
      // Generate idempotency key: provider:taskId:timestamp
      const idemKey = `${completeTask.provider}:${completeTask.task_id}:${Date.now()}`;
      await api.tasks.complete(completeTask.task_id, { idempotency_key: idemKey });
      setCompleteResult({ success: true });
      setExpandedId(null);
      // Refresh feed + progress after short delay
      setTimeout(() => reloadFeed(), 1000);
    } catch (err) {
      setCompleteResult({
        error: err?.message ?? "Submission failed. Please try again.",
      });
    } finally {
      setCompleting(false);
    }
  }, [completeTask, completing, reloadFeed]);

  const handleCompleteClose = useCallback(() => {
    setCompleteModalOpen(false);
    setCompleteTask(null);
    setCompleteResult(null);
    // If completed successfully, go to rewards
    if (completeResult?.success) {
      navigate("/rewards");
    }
  }, [completeResult, navigate]);

  // ── Limit gate ───────────────────────────────────────────────────────────
  const limitReached = progress?.limit_reached === true;

  // ── Filter tasks by type for display ─────────────────────────────────────
  const displayTasks = useMemo(() => {
    if (activeType === "all") return tasks;
    return tasks.filter((t) => t.type?.toUpperCase() === activeType.toUpperCase());
  }, [tasks, activeType]);

  return (
    <div className="tasks-screen">

      {/* ── Daily Progress ── */}
      <DailyProgressBar progress={progress} />

      {/* ── Check-in + Limit ── */}
      <div className="tasks-top-row">
        <CheckInButton
          progress={progress}
          onCheckin={handleCheckin}
          loading={checkingIn}
        />
        {isRefetching && (
          <div className="tasks-refetch-indicator" aria-label="Refreshing tasks">
            <RefreshCwIcon size={13} strokeWidth={2} className="spin" aria-hidden="true" />
          </div>
        )}
      </div>

      <LimitGateBanner progress={progress} />

      {/* ── Error banner ── */}
      {error && !loading && (
        <div className="tasks-error-banner" role="alert">
          <AlertCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
          <button className="btn-ghost btn-sm" onClick={reload}>
            <RefreshCwIcon size={13} strokeWidth={2} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* ── Category Tab Bar (blueprint) ── */}
      {!loading && tabs.length > 1 && (
        <TabBar
          tabs={tabs}
          active={activeType}
          onChange={(key) => {
            setActiveType(key);
            setExpandedId(null);
          }}
        />
      )}

      {/* ── Task Grid ── */}
      <section className="tasks-feed-section" aria-label="Available tasks">
        <h2 className="sr-only">Tasks</h2>

        {loading ? (
          <TaskGridSkeleton />
        ) : displayTasks.length === 0 ? (
          <EmptyState
            icon="📋"
            title={
              limitReached
                ? "Daily limit reached"
                : activeType !== "all"
                ? `No ${activeType.toLowerCase()} tasks available`
                : "No tasks available"
            }
            message={
              limitReached
                ? "You've hit your daily earning limit. Come back tomorrow or upgrade your plan."
                : "Check back soon — new tasks are added daily."
            }
            action={
              limitReached
                ? { label: "Upgrade Plan", onClick: () => navigate("/packages") }
                : { label: "Refresh", onClick: reload }
            }
          />
        ) : (
          <div className="task-grid">
            {displayTasks.map((task) =>
              expandedId === task.task_id ? (
                // Expanded card spans full width
                <div key={task.task_id} className="task-grid-expanded-slot">
                  <TaskCard
                    task={task}
                    expanded={true}
                    onToggle={handleToggle}
                    onComplete={handleCompleteOpen}
                    completing={completing && completeTask?.task_id === task.task_id}
                  />
                </div>
              ) : (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  expanded={false}
                  onToggle={handleToggle}
                  onComplete={handleCompleteOpen}
                  completing={false}
                />
              )
            )}
          </div>
        )}
      </section>

      {/* ── Complete Confirmation Modal ── */}
      <CompleteModal
        task={completeTask}
        open={completeModalOpen}
        onClose={handleCompleteClose}
        onConfirm={handleCompleteSubmit}
        loading={completing}
        result={completeResult}
      />

      {/* Bottom spacer */}
      <div style={{ height: 20 }} aria-hidden="true" />
    </div>
  );
}
