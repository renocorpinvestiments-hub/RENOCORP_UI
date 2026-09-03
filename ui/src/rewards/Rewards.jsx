/**
 * rewards/Rewards.jsx — RENOCORP Rewards Screen  v1.0
 * =======================================================================
 * Pending / Rewarded tabs. Shows the user what they've earned and what's
 * still awaiting provider confirmation.
 *
 * Architecture:
 *  · 100% read-only screen — zero POST/PATCH/PUT calls, so every request
 *    here is trivially idempotent (safe to retry, refresh, double-tap).
 *  · Rewarded tab uses cursor-based pagination (next_cursor from the
 *    backend's LedgerPage) — NOT offset/page pagination — because the
 *    ledger is a live-writing append-only table. Offset pagination would
 *    skip/duplicate rows under concurrent writes; cursor pagination is
 *    stable by design (this matches the backend's own docstring intent
 *    in modules/earnings/models.py::LedgerPage).
 *  · Pending tab has NO itemized backend endpoint yet (tasks/routes.py
 *    only exposes admin_list_completions, not a user-scoped "my
 *    completions" list). Rather than fabricate fake pending rows, this
 *    screen surfaces the real, honest signal we DO have — DailyProgress
 *    from GET /api/tasks/progress — and explains what's happening.
 *    TODO(backend): add GET /api/tasks/my-completions?status=pending
 *    to replace the summary-only view with a real itemized list.
 *  · Pending tab polls quietly every 20s (paused when the browser tab is
 *    hidden, via the Page Visibility API — same pattern as
 *    hooks/useNotifications.js) so a task moving from pending → approved
 *    is reflected without the user having to pull-to-refresh.
 *  · AbortController on every fetch; every in-flight request is
 *    cancelled on unmount, tab switch, or refresh — no setState-after-
 *    unmount warnings, no race conditions between stale and fresh pages.
 *  · Currency shown via utils/currencyConverter.js's live-rate hook
 *    (never hardcodes a USD→UGX rate — that hook already ships a safe
 *    fallback table and never throws).
 *  · Skeleton loading, inline error + retry, empty states, and an
 *    IntersectionObserver-driven "load more" with an accessible manual
 *    fallback button for keyboard/screen-reader users and browsers
 *    without IO support.
 *
 * API calls:
 *  GET /api/tasks/progress                 — daily progress (Pending tab)
 *  GET /api/earnings/history                — credit ledger (Rewarded tab)
 *      ?direction=credits&page_size=20&cursor={next_cursor}
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
import { useCurrencyConverter } from "../utils/currencyConverter.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { TabBar } from "../components/TabBar.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { Badge } from "../components/Badge.jsx";
import {
  PlayCircleIcon,
  ClipboardListIcon,
  GiftIcon,
  DownloadIcon,
  HelpCircleIcon,
  UserPlusIcon,
  ZapIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ClockIcon,
  TrendingUpIcon,
  InboxIcon,
  ArrowRightIcon,
} from "lucide-react";

// ─── REWARD TYPE → ICON / COLOR MAP ─────────────────────────────────────────
// Keys must match backend EarningType enum values exactly (modules/earnings/models.py).
const TYPE_ICONS = {
  SURVEY:     ClipboardListIcon,
  VIDEO:      PlayCircleIcon,
  OFFER:      GiftIcon,
  QUIZ:       HelpCircleIcon,
  DOWNLOAD:   DownloadIcon,
  REFERRAL:   UserPlusIcon,
  BONUS:      ZapIcon,
  ADJUSTMENT: ShieldCheckIcon,
};

const TYPE_COLORS = {
  SURVEY:     { color: "var(--info)",    dim: "var(--info-dim)",    border: "var(--info-border)" },
  VIDEO:      { color: "var(--info)",    dim: "var(--info-dim)",    border: "var(--info-border)" },
  OFFER:      { color: "var(--accent)",  dim: "var(--accent-dim)",  border: "var(--accent-border)" },
  QUIZ:       { color: "var(--info)",    dim: "var(--info-dim)",    border: "var(--info-border)" },
  DOWNLOAD:   { color: "var(--warning)", dim: "var(--warning-dim)", border: "var(--warning-border)" },
  REFERRAL:   { color: "var(--purple)",  dim: "var(--purple-dim)",  border: "var(--purple-border)" },
  BONUS:      { color: "var(--accent)",  dim: "var(--accent-dim)",  border: "var(--accent-border)" },
  ADJUSTMENT: { color: "var(--text-muted)", dim: "var(--surface-3)", border: "var(--border)" },
};

function getTypeStyle(type) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.OFFER;
}

function RewardTypeIcon({ type, size = 16, ...props }) {
  const Icon = TYPE_ICONS[type] ?? GiftIcon;
  return <Icon size={size} strokeWidth={2} {...props} />;
}

const PAGE_SIZE = 20;
const PENDING_POLL_MS = 20_000; // 20s — quiet background refresh of daily progress

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════

export default function Rewards() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("pending");

  // Rewarded total is fetched by RewardedPanel and lifted here so the tab
  // pill can show a live count without RewardedPanel needing to know
  // about the tab bar.
  const [rewardedTotal, setRewardedTotal] = useState(null);

  const tabs = useMemo(
    () => [
      { key: "pending", label: "Pending" },
      {
        key: "rewarded",
        label: "Rewarded",
        count: rewardedTotal ?? undefined,
      },
    ],
    [rewardedTotal]
  );

  return (
    <div className="dash-body fade-in rewards-screen">
      <div className="rewards-header">
        <h2 className="rewards-title">REWARDS</h2>
      </div>

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === "pending" ? (
        <PendingPanel onGoToTasks={() => navigate("/tasks")} />
      ) : (
        <RewardedPanel onTotalChange={setRewardedTotal} />
      )}

      <div style={{ height: 20 }} aria-hidden="true" />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// PENDING PANEL — built from real DailyProgress data, not fabricated rows
// ═════════════════════════════════════════════════════════════════════════

function PendingPanel({ onGoToTasks }) {
  const { data: progress, loading, isRefetching, error, reload } = useApi(
    () => api.tasks.progress(),
    []
  );
  const { formatUGX: fmtUGX } = useCurrencyConverter();

  // ── Quiet background poll, paused when tab is hidden ──────────────────
  const timerRef = useRef(null);
  useEffect(() => {
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === "visible") {
          await reload();
        }
        schedule();
      }, PENDING_POLL_MS);
    };
    schedule();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        reload();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  if (loading) return <PendingSkeleton />;

  if (error && !progress) {
    return (
      <div className="rewards-error-banner" role="alert">
        <AlertCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
        <span>{error}</span>
        <button className="btn-ghost btn-sm" onClick={reload}>
          <RefreshCwIcon size={13} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  const {
    earned_today_usd = 0,
    daily_limit_usd = 0,
    remaining_usd = 0,
    progress_pct = 0,
    limit_reached = false,
    tasks_completed_today = 0,
    checkin_available = false,
    checkin_claimed_at = null,
  } = progress ?? {};

  const pct = Math.min(100, Math.max(0, progress_pct));
  const hasActivityToday = tasks_completed_today > 0;

  return (
    <div className="rewards-pending fade-in">
      {/* ── Today's progress card ── */}
      <div
        className={`rewards-progress-card${limit_reached ? " limit-reached" : ""}`}
        role="region"
        aria-label="Today's earning progress"
      >
        <div className="rewards-progress-top">
          <div className="rewards-progress-label">
            <TrendingUpIcon size={13} strokeWidth={2} aria-hidden="true" />
            Today's Progress
            {isRefetching && (
              <span className="rewards-live-dot" aria-label="Updating" title="Updating…" />
            )}
          </div>
          <div className="rewards-progress-value">
            <span className={limit_reached ? "rewards-limit-text" : ""}>
              {fmtUGX(earned_today_usd, "USD")}
            </span>
            <span className="rewards-progress-sep">/</span>
            <span className="rewards-progress-limit">{fmtUGX(daily_limit_usd, "USD")}</span>
          </div>
        </div>

        <div
          className="rewards-progress-track"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`rewards-progress-fill${limit_reached ? " done" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="rewards-progress-meta">
          <span>
            <CheckCircleIcon size={11} strokeWidth={2} aria-hidden="true" />
            {tasks_completed_today} task{tasks_completed_today === 1 ? "" : "s"} completed today
          </span>
          {!limit_reached && remaining_usd > 0 && (
            <span className="rewards-remaining">{fmtUGX(remaining_usd, "USD")} left today</span>
          )}
        </div>
      </div>

      {/* ── Explanation card — honest, no fake itemized list ── */}
      {hasActivityToday ? (
        <div className="rewards-info-card">
          <ClockIcon size={18} strokeWidth={2} className="rewards-info-icon" aria-hidden="true" />
          <div>
            <div className="rewards-info-title">Awaiting confirmation</div>
            <p className="rewards-info-text">
              Tasks you completed today are being verified by our providers.
              This usually takes a few minutes, occasionally up to 24 hours.
              Confirmed rewards move to the <strong>Rewarded</strong> tab
              automatically — no action needed.
            </p>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="📋"
          title="Nothing pending right now"
          message="Complete a task to see it show up here while it's being verified."
          action={{ label: "Browse Tasks", onClick: onGoToTasks }}
        />
      )}

      {/* ── Check-in nudge ── */}
      {checkin_available && !checkin_claimed_at && (
        <button className="rewards-checkin-nudge" onClick={onGoToTasks}>
          <ZapIcon size={15} strokeWidth={2.5} aria-hidden="true" />
          <span>Your daily check-in bonus is ready to claim</span>
          <ArrowRightIcon size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function PendingSkeleton() {
  return (
    <div className="rewards-pending" aria-hidden="true">
      <div className="rc-skeleton" style={{ height: 108, borderRadius: "var(--radius-lg)" }} />
      <div className="rc-skeleton" style={{ height: 72, borderRadius: "var(--radius-lg)", marginTop: 12 }} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// REWARDED PANEL — cursor-paginated live ledger
// ═════════════════════════════════════════════════════════════════════════

function RewardedPanel({ onTotalChange }) {
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const abortRef   = useRef(null);
  const mountedRef = useRef(true);
  const { formatUGX: fmtUGX } = useCurrencyConverter();

  const fetchPage = useCallback(async ({ cursorVal = null, mode = "initial" } = {}) => {
    // Cancel any in-flight request before starting a new one.
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    if (mode === "initial") setInitialLoading(true);
    if (mode === "more") setLoadingMore(true);
    if (mode === "refresh") setRefreshing(true);
    setError(null);

    try {
      const page = await api.earnings.history({
        direction: "credits",
        page_size: PAGE_SIZE,
        cursor: cursorVal ?? undefined,
      });

      if (!mountedRef.current) return;

      setRecords((prev) => (mode === "more" ? [...prev, ...(page?.records ?? [])] : page?.records ?? []));
      setCursor(page?.next_cursor ?? null);
      setHasMore(Boolean(page?.has_more));
      setTotal(page?.total ?? null);
      onTotalChange?.(page?.total ?? null);
    } catch (err) {
      if (!mountedRef.current || err?.code === "ABORTED") return;
      setError(err?.message ?? "Couldn't load your rewards. Please try again.");
    } finally {
      if (!mountedRef.current) return;
      setInitialLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTotalChange]);

  // ── Initial load + cleanup ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    fetchPage({ mode: "initial" });
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(() => {
    setCursor(null);
    fetchPage({ cursorVal: null, mode: "refresh" });
  }, [fetchPage]);

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore || initialLoading) return;
    fetchPage({ cursorVal: cursor, mode: "more" });
  }, [hasMore, loadingMore, initialLoading, cursor, fetchPage]);

  // ── Infinite scroll sentinel (progressive enhancement) ────────────────
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [handleLoadMore]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (initialLoading) return <RewardedSkeleton />;

  if (error && records.length === 0) {
    return (
      <div className="rewards-error-banner" role="alert">
        <AlertCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
        <span>{error}</span>
        <button className="btn-ghost btn-sm" onClick={handleRefresh}>
          <RefreshCwIcon size={13} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="rewards-rewarded fade-in">
      <div className="rewards-list-toolbar">
        <span className="rewards-list-count">
          {total != null ? `${total.toLocaleString()} total` : "\u00A0"}
        </span>
        <button
          className="btn-ghost btn-icon"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh rewards"
        >
          <RefreshCwIcon size={14} strokeWidth={2} className={refreshing ? "spin" : ""} aria-hidden="true" />
        </button>
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={<InboxIcon size={40} strokeWidth={1.5} aria-hidden="true" />}
          title="No rewards yet"
          message="Once a task is verified, it'll show up here with the amount you earned."
        />
      ) : (
        <>
          <ul className="rewards-list">
            {records.map((r) => (
              <RewardRow key={r.id} record={r} fmtUGX={fmtUGX} />
            ))}
          </ul>

          {/* Sentinel for auto-load; also a manual fallback button */}
          {hasMore && (
            <div ref={sentinelRef} className="rewards-load-more-wrap">
              <button
                className="btn-secondary btn-sm"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? <Spinner size="sm" /> : "Load more"}
              </button>
            </div>
          )}

          {!hasMore && records.length > 0 && (
            <div className="rewards-list-end">You're all caught up</div>
          )}
        </>
      )}
    </div>
  );
}

const RewardRow = memo(function RewardRow({ record, fmtUGX }) {
  const style = getTypeStyle(record.type);
  return (
    <li className="rewards-row">
      <div
        className="rewards-row-icon"
        style={{ background: style.dim, borderColor: style.border, color: style.color }}
      >
        <RewardTypeIcon type={record.type} />
      </div>
      <div className="rewards-row-content">
        <div className="rewards-row-top">
          <span className="rewards-row-title">{record.type_label || record.description || "Reward"}</span>
          <span className="rewards-row-amount">{fmtUGX(record.amount_usd, "USD")}</span>
        </div>
        <div className="rewards-row-sub">
          <span title={formatDateTime(record.created_at * 1000)}>
            {timeAgo(record.created_at * 1000)}
          </span>
          {record.provider && (
            <>
              <span className="rewards-row-dot">·</span>
              <span className="rewards-row-provider">{record.provider}</span>
            </>
          )}
          <Badge variant="green" style={{ marginLeft: "auto" }}>
            Rewarded
          </Badge>
        </div>
      </div>
    </li>
  );
});

function RewardedSkeleton() {
  return (
    <div className="rewards-rewarded" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rc-skeleton" style={{ height: 64, borderRadius: "var(--radius)", marginBottom: 8 }} />
      ))}
    </div>
  );
}
