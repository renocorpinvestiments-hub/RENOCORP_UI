/**
 * tasks/Tasks.jsx — RENOCORP Task Feed  v2.1
 * ============================================
 * The primary task-earning screen.
 *
 * v2.1 change: the collapsed grid card and the expanded "widened" detail
 * view now live in their own dedicated files — tasks/TaskCard.jsx and
 * tasks/TaskDetail.jsx — instead of being inlined here. This screen is now
 * purely responsible for: fetching the feed, driving the category tabs,
 * daily progress / check-in, and deciding which task (if any) is expanded.
 *
 * Architecture:
 *  · Task feed fetched from /api/tasks/feed with optional type filter
 *  · Dynamic tab bar — only shows types that exist in the feed (blueprint note)
 *  · 2-column scrollable card grid (blueprint image 1) via <TaskCard />
 *  · Tap card → expands like YouTube video via <TaskDetail /> (blueprint note)
 *  · After task viewed+completed → moves to Rewards (pending) screen
 *  · Daily check-in claim button (idempotent — safe to tap multiple times)
 *  · Daily progress bar visible at top
 *  · Limit-reached gate — blocks new tasks when daily cap hit
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

import { useState, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { formatUGX } from "../utils/formatUGX.js";
// P2 fix (RENOCORP_PRODUCTION_READINESS.md §5, "i18n/currency"):
// used to convert the real checkin bonus amount instead of a
// hardcoded display string — see CheckInButton below.
import { toUGX, useCurrencyConverter } from "../utils/currencyConverter.js";
import { TabBar } from "../components/TabBar.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import TaskCard from "./TaskCard.jsx";
import TaskDetail from "./TaskDetail.jsx";
import {
  AlertCircleIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  StarIcon,
  ZapIcon,
  TrendingUpIcon,
} from "lucide-react";

// ─── DAILY PROGRESS BAR ─────────────────────────────────────────────────────
const DailyProgressBar = memo(function DailyProgressBar({ progress }) {
  if (!progress) return null;

  const {
    earned_today_usd = 0,
    daily_limit_usd = 2,
    progress_pct = 0,
    limit_reached = false,
    tasks_completed_today = 0,
    membership_tier = "free",
  } = progress;

  const { formatUGX: formatCurrencyUGX } = useCurrencyConverter();
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
            {formatCurrencyUGX(earned_today_usd, "USD")}
          </span>
          <span className="tasks-progress-sep">/</span>
          <span className="tasks-progress-limit">
            {formatCurrencyUGX(daily_limit_usd, "USD")}
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
  // P2 fix: previously the success message was the hardcoded literal
  // "+UGX 188 check-in bonus earned!" — tied by coincidence to the
  // backend bonus amount. If the backend bonus amount ever changes (modules/tasks/service.py
  // `_CHECKIN_BONUS_USD`), this would silently keep telling users
  // the old number. Now reads the real `amount_usd` the backend
  // returns from POST /api/tasks/checkin and converts it through
  // the shared currency utility.
  const [earnedUsd, setEarnedUsd] = useState(null);

  const available = progress?.checkin_available ?? false;
  const claimed = progress?.checkin_claimed_at != null;

  const handleCheckin = useCallback(async () => {
    if (status === "loading" || claimed || !available) return;
    setStatus("loading");
    try {
      const result = await onCheckin();
      if (result?.already_claimed) {
        setStatus("already");
      } else if (result?.success) {
        setEarnedUsd(typeof result?.amount_usd === "number" ? result.amount_usd : null);
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
    const bonusLabel =
      earnedUsd != null ? formatUGX(toUGX(earnedUsd, "USD"), true) : "+your bonus";
    return (
      <div className="checkin-success" aria-live="assertive">
        <StarIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        {bonusLabel} check-in bonus earned!
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

// ─── LIMIT GATE ─────────────────────────────────────────────────────────────
function LimitGateBanner({ progress }) {
  const navigate = useNavigate();
  if (!progress?.limit_reached) return null;

  const tierName = progress.membership_tier;

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

  const tasks = feed?.tasks ?? [];
  const progress = feed?.daily_progress ?? null;
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
      setTimeout(() => reloadFeed(), 400);
      return result;
    } finally {
      setCheckingIn(false);
    }
  }, [reloadFeed]);

  // ── Toggle expand ────────────────────────────────────────────────────────
  const handleSelect = useCallback((task) => {
    setExpandedId((prev) => (prev === task.task_id ? null : task.task_id));
  }, []);

  const handleCollapse = useCallback(() => setExpandedId(null), []);

  // ── Complete a task (delegated to TaskDetail's own confirm flow) ────────
  const handleComplete = useCallback(
    async (task) => {
      const idemKey = `${task.provider}:${task.task_id}:${Date.now()}`;
      await api.tasks.complete(task.task_id, { idempotency_key: idemKey });
      setTimeout(() => reloadFeed(), 1000);
    },
    [reloadFeed]
  );

  const handleDone = useCallback(() => {
    setExpandedId(null);
    navigate("/rewards");
  }, [navigate]);

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
        <CheckInButton progress={progress} onCheckin={handleCheckin} loading={checkingIn} />
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
                <div key={task.task_id} className="task-grid-expanded-slot">
                  <TaskDetail
                    task={task}
                    onCollapse={handleCollapse}
                    onComplete={handleComplete}
                    onDone={handleDone}
                  />
                </div>
              ) : (
                <TaskCard key={task.task_id} task={task} onSelect={handleSelect} />
              )
            )}
          </div>
        )}
      </section>

      {/* Bottom spacer */}
      <div style={{ height: 20 }} aria-hidden="true" />
    </div>
  );
}
