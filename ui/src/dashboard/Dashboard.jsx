/**
 * dashboard/Dashboard.jsx — RENOCORP User Dashboard  v2.0
 * =========================================================
 * The primary authenticated landing screen.
 *
 * Architecture:
 *  · Parallel data fetching — user, balance, package all fire at once
 *  · Stale-while-revalidate via useApi (previous data visible during refetch)
 *  · Skeleton loading states — zero layout shift on load
 *  · Status feed with expand-on-tap (matches blueprint)
 *  · Subscription card with subscribe gate
 *  · Invite & Withdraw quick actions
 *  · Pull-to-refresh (PTR) via touch event detection
 *  · Auto-refresh every 2 minutes while tab is active
 *  · Zero localStorage — all state in memory
 *
 * API calls (parallel):
 *  GET /api/users/me
 *  GET /api/users/me/balance
 *  GET /api/packages/mine
 *  GET /api/referrals/my-code   (for invite card)
 *  GET /api/tasks/progress      (for today's progress)
 *
 * Screens shown (from blueprint sketches):
 *  1. Stats row  — Balance · Commission · Today's Earnings · Invites · Subscription
 *  2. Status feed — scrollable with expand toggle
 *  3. Quick actions — Invite User | Packages | Withdraw Cash
 *
 * Blueprint notes honoured:
 *  - "Green header card that can stretch up and down"
 *  - Hamburger → SideDrawer (handled by TopNavBar)
 *  - Status block expandable via ▼ button
 *  - Subscribe button shown when NOT subscribed; tier info shown when subscribed
 *  - Invite = share sheet (WhatsApp / SMS / Copy link)
 *  - Withdraw opens Withdraw page
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { formatUGX, formatUGXCompact } from "../utils/formatUGX.js";
import { timeAgo, formatDate } from "../utils/timeAgo.js";
import { StatCard } from "../components/StatCard.jsx";
import { Badge } from "../components/Badge.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Modal } from "../components/Modal.jsx";
import {
  ArrowDownCircleIcon,
  UsersIcon,
  PackageIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CheckIcon,
  ShareIcon,
  ZapIcon,
  TrendingUpIcon,
  CalendarIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
} from "lucide-react";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 120_000; // 2 min
const PTR_THRESHOLD   = 72;      // px pull distance to trigger refresh

// ─── SKELETON COMPONENTS ────────────────────────────────────────────────────
function SkeletonCard({ height = 76, width = "100%" }) {
  return (
    <div
      className="rc-skeleton"
      style={{ height, width, borderRadius: "var(--radius)" }}
      aria-hidden="true"
    />
  );
}

function SkeletonStatRow() {
  return (
    <div className="dash-stats-grid">
      {[1, 2, 3, 4].map((i) => (
        <SkeletonCard key={i} height={76} />
      ))}
    </div>
  );
}

// ─── BALANCE HERO ───────────────────────────────────────────────────────────
// The big green stretchable card at the top (from blueprint image 4)
function BalanceHero({ user, balance, pkg, loading }) {
  const navigate = useNavigate();
  const isSubscribed = pkg?.is_active === true;
  const tierName     = pkg?.package_name ?? "Free";
  const daysLeft     = pkg?.days_remaining;

  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "U"
    : "U";

  return (
    <div className="dash-hero-card" role="region" aria-label="Account summary">
      {/* Header row */}
      <div className="dash-hero-top">
        <div className="dash-hero-identity">
          <div className="dash-avatar-hero" aria-hidden="true">
            {initials}
          </div>
          <div>
            <div className="dash-hero-greeting">
              Welcome back,{" "}
              <span className="dash-hero-name">
                {user?.first_name ?? "User"}
              </span>
            </div>
            <div className="dash-hero-email">{user?.email ?? ""}</div>
          </div>
        </div>

        {/* Tier badge */}
        {isSubscribed ? (
          <Badge variant="green" style={{ flexShrink: 0 }}>
            {tierName}
          </Badge>
        ) : (
          <button
            className="btn-primary btn-sm"
            onClick={() => navigate("/packages")}
            aria-label="Subscribe to a package"
            style={{ flexShrink: 0, padding: "6px 14px", fontSize: 12 }}
          >
            Subscribe
          </button>
        )}
      </div>

      {/* Balance display */}
      <div className="dash-hero-balance-section">
        <div className="dash-hero-balance-label">Account Balance</div>
        <div className="dash-hero-balance-value" aria-live="polite">
          {loading ? (
            <SkeletonCard height={44} width={180} />
          ) : (
            formatUGX(balance?.balance ?? balance?.wallet_balance ?? 0)
          )}
        </div>
        {balance?.pending_balance != null && balance.pending_balance > 0 && (
          <div className="dash-hero-pending">
            <ZapIcon size={11} strokeWidth={2.5} aria-hidden="true" />
            {formatUGX(balance.pending_balance)} pending
          </div>
        )}
      </div>

      {/* Subscription meta */}
      {isSubscribed && daysLeft != null && (
        <div className="dash-hero-sub-meta">
          <CalendarIcon size={11} strokeWidth={2} aria-hidden="true" />
          <span>
            {daysLeft === 0
              ? "Expires today"
              : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`}
          </span>
          {daysLeft <= 3 && (
            <button
              className="dash-hero-renew-btn"
              onClick={() => navigate("/packages")}
            >
              Renew
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── STATS GRID ─────────────────────────────────────────────────────────────
// Balance · Commission · Today's Earnings · Invites (from blueprint)
function StatsGrid({ user, balance, referrals, tasks, loading }) {
  const navigate = useNavigate();

  const todayEarnings = balance?.today_earnings ?? tasks?.earned_today ?? 0;
  const commission    = balance?.commission_balance ?? balance?.commission ?? 0;
  const inviteCount   = referrals?.total_referrals ?? referrals?.referral_count ?? 0;

  if (loading) return <SkeletonStatRow />;

  return (
    <div className="dash-stats-grid" role="list" aria-label="Account statistics">
      <StatCard
        label="Balance"
        value={formatUGXCompact(balance?.balance ?? balance?.wallet_balance ?? 0)}
        sub="Available"
        accent
        onClick={() => navigate("/withdraw")}
      />
      <StatCard
        label="Commission"
        value={formatUGXCompact(commission)}
        sub="Referral earnings"
        onClick={() => navigate("/rewards")}
      />
      <StatCard
        label="Today"
        value={formatUGXCompact(todayEarnings)}
        sub="Earned today"
        icon={<TrendingUpIcon size={14} strokeWidth={2} />}
      />
      <StatCard
        label="Invites"
        value={inviteCount}
        sub="Referred users"
        onClick={() => navigate("/invite")}
      />
    </div>
  );
}

// ─── STATUS FEED ────────────────────────────────────────────────────────────
// Expandable "channel" feed — admin can push updates here (blueprint image 4)
function StatusFeed({ notifications, loading }) {
  const [expanded, setExpanded] = useState(false);

  const items = notifications?.items ?? notifications?.notifications ?? [];
  // Show first 3 collapsed, all when expanded
  const visible = expanded ? items : items.slice(0, 3);

  return (
    <section className="dash-status-section" aria-label="Status updates">
      <div className="dash-section-header">
        <h2 className="dash-section-title">Status</h2>
        {items.length > 3 && (
          <button
            className="dash-expand-btn"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            aria-controls="status-feed-list"
          >
            {expanded ? (
              <>
                <ChevronUpIcon size={15} strokeWidth={2} aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDownIcon size={15} strokeWidth={2} aria-hidden="true" />
                Show all ({items.length})
              </>
            )}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2].map((i) => (
            <SkeletonCard key={i} height={62} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="📡"
          title="No updates yet"
          message="Admin announcements and system updates appear here."
        />
      ) : (
        <ul
          id="status-feed-list"
          className="dash-status-list"
          role="list"
        >
          {visible.map((item) => (
            <StatusFeedItem key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusFeedItem({ item }) {
  const [open, setOpen] = useState(false);
  const hasBody = item.body && item.body.length > 0;

  return (
    <li className="dash-status-item">
      <button
        className="dash-status-item-inner"
        onClick={() => hasBody && setOpen((o) => !o)}
        aria-expanded={hasBody ? open : undefined}
        style={{ cursor: hasBody ? "pointer" : "default" }}
      >
        <div className="dash-status-dot" aria-hidden="true" />
        <div className="dash-status-content">
          <div className="dash-status-title">{item.title ?? item.message}</div>
          {item.created_at && (
            <div className="dash-status-time">
              {timeAgo(item.created_at)}
            </div>
          )}
        </div>
        {hasBody && (
          <ChevronDownIcon
            size={14}
            strokeWidth={2}
            className={`dash-status-chevron${open ? " open" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>
      {open && hasBody && (
        <div className="dash-status-body" role="region">
          {item.body}
        </div>
      )}
    </li>
  );
}

// ─── INVITE CARD ────────────────────────────────────────────────────────────
// "Like a share button — tab comes up via WhatsApp, SMS, etc." (blueprint)
function InviteCard({ referralData, loading }) {
  const [copied,      setCopied]      = useState(false);
  const [shareOpen,   setShareOpen]   = useState(false);
  const copyTimeoutRef                = useRef(null);

  const code     = referralData?.code ?? referralData?.referral_code ?? "";
  const appUrl   = import.meta.env.VITE_APP_URL ?? window.location.origin;
  const shareUrl = code ? `${appUrl}/?ref=${code}` : appUrl;
  const shareText = `Join RENOCORP and start earning! Use my invite code: ${code}\n${shareUrl}`;

  const copyCode = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select + copy
      const el = document.createElement("textarea");
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl, code]);

  const openWhatsApp = () => {
    const encoded = encodeURIComponent(shareText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank", "noopener");
    setShareOpen(false);
  };

  const openSms = () => {
    const encoded = encodeURIComponent(shareText);
    window.open(`sms:?body=${encoded}`, "_blank", "noopener");
    setShareOpen(false);
  };

  const nativeShare = useCallback(async () => {
    if (!navigator.share) { setShareOpen(true); return; }
    try {
      await navigator.share({ title: "RENOCORP Invite", text: shareText, url: shareUrl });
    } catch {
      setShareOpen(true);
    }
  }, [shareText, shareUrl]);

  useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

  return (
    <>
      <div className="dash-action-card invite-card">
        <div className="dash-action-card-header">
          <div className="dash-action-icon-wrap invite-icon">
            <UsersIcon size={18} strokeWidth={2} aria-hidden="true" />
          </div>
          <div>
            <div className="dash-action-title">Invite Users</div>
            <div className="dash-action-sub">
              Earn commission for every referral
            </div>
          </div>
        </div>

        {loading ? (
          <SkeletonCard height={36} />
        ) : code ? (
          <div className="dash-invite-code-row">
            <div className="dash-invite-code">
              <span className="dash-invite-code-label">Your code</span>
              <span className="dash-invite-code-value">{code}</span>
            </div>
            <div className="dash-invite-actions">
              <button
                className="btn-ghost btn-icon"
                onClick={copyCode}
                aria-label={copied ? "Link copied!" : "Copy invite link"}
              >
                {copied ? (
                  <CheckIcon size={16} strokeWidth={2.5} style={{ color: "var(--accent)" }} />
                ) : (
                  <CopyIcon size={16} strokeWidth={2} />
                )}
              </button>
              <button
                className="btn-primary btn-sm"
                onClick={nativeShare}
                aria-label="Share invite link"
              >
                <ShareIcon size={14} strokeWidth={2} aria-hidden="true" />
                Share
              </button>
            </div>
          </div>
        ) : (
          <div className="dash-action-empty-msg">
            Invite code unavailable — try refreshing.
          </div>
        )}
      </div>

      {/* Share sheet modal (fallback for browsers without Web Share API) */}
      <Modal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share Your Invite"
      >
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
          Invite friends to RENOCORP and earn commission when they subscribe.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            className="btn-secondary"
            onClick={openWhatsApp}
            style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">💬</span>
            Share via WhatsApp
          </button>
          <button
            className="btn-secondary"
            onClick={openSms}
            style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">📱</span>
            Share via SMS
          </button>
          <button
            className="btn-secondary"
            onClick={() => { copyCode(); setShareOpen(false); }}
            style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}
          >
            <CopyIcon size={16} strokeWidth={2} aria-hidden="true" />
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
      </Modal>
    </>
  );
}

// ─── PACKAGE CARD ───────────────────────────────────────────────────────────
// Subscribe button → /packages when not subscribed; tier summary when subscribed
function PackageCard({ pkg, loading }) {
  const navigate = useNavigate();

  const isSubscribed = pkg?.is_active === true;
  const tierName     = pkg?.package_name ?? "Free";
  const taskLimit    = pkg?.task_limit;
  const threshold    = pkg?.withdraw_threshold_usd;

  return (
    <div className="dash-action-card package-card">
      <div className="dash-action-card-header">
        <div className="dash-action-icon-wrap package-icon">
          <PackageIcon size={18} strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <div className="dash-action-title">Packages</div>
          <div className="dash-action-sub">
            {isSubscribed ? `${tierName} plan` : "Upgrade your account"}
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonCard height={36} />
      ) : isSubscribed ? (
        <div className="dash-pkg-meta">
          <div className="dash-pkg-stat">
            <span className="dash-pkg-stat-label">Tasks/day</span>
            <span className="dash-pkg-stat-value">
              {taskLimit === 0 || taskLimit == null ? "Unlimited" : taskLimit}
            </span>
          </div>
          {threshold != null && threshold > 0 && (
            <div className="dash-pkg-stat">
              <span className="dash-pkg-stat-label">Min withdraw</span>
              <span className="dash-pkg-stat-value">${threshold.toFixed(2)}</span>
            </div>
          )}
          <button
            className="btn-ghost btn-sm"
            onClick={() => navigate("/packages")}
            aria-label="View package details"
          >
            <ExternalLinkIcon size={13} strokeWidth={2} aria-hidden="true" />
            Details
          </button>
        </div>
      ) : (
        <button
          className="btn-primary"
          onClick={() => navigate("/packages")}
          aria-label="Subscribe to a package"
          style={{ width: "100%" }}
        >
          <ZapIcon size={14} strokeWidth={2} aria-hidden="true" />
          Subscribe Now
        </button>
      )}
    </div>
  );
}

// ─── WITHDRAW CARD ──────────────────────────────────────────────────────────
function WithdrawCard({ balance, loading }) {
  const navigate = useNavigate();
  const available = balance?.balance ?? balance?.wallet_balance ?? 0;

  return (
    <div className="dash-action-card withdraw-card">
      <div className="dash-action-card-header">
        <div className="dash-action-icon-wrap withdraw-icon">
          <ArrowDownCircleIcon size={18} strokeWidth={2} aria-hidden="true" />
        </div>
        <div>
          <div className="dash-action-title">Withdraw Cash</div>
          <div className="dash-action-sub">
            {loading
              ? "Loading..."
              : available > 0
              ? `${formatUGX(available)} available`
              : "No funds available"}
          </div>
        </div>
      </div>

      <button
        className={`btn-primary${available <= 0 && !loading ? " btn-disabled" : ""}`}
        onClick={() => navigate("/withdraw")}
        aria-label="Go to withdraw page"
        disabled={!loading && available <= 0}
        style={{ width: "100%" }}
      >
        <ArrowDownCircleIcon size={14} strokeWidth={2} aria-hidden="true" />
        Withdraw
      </button>
    </div>
  );
}

// ─── PULL-TO-REFRESH ────────────────────────────────────────────────────────
function usePullToRefresh(onRefresh) {
  const startY      = useRef(0);
  const pulling     = useRef(false);
  const [pullPx, setPullPx] = useState(0);

  useEffect(() => {
    const el = document.querySelector(".main-content");
    if (!el) return;

    const onTouchStart = (e) => {
      if (el.scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && el.scrollTop === 0) {
        setPullPx(Math.min(dy * 0.4, PTR_THRESHOLD + 20));
      }
    };

    const onTouchEnd = () => {
      if (pullPx >= PTR_THRESHOLD) onRefresh();
      pulling.current = false;
      setPullPx(0);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove",  onTouchMove,  { passive: true });
    el.addEventListener("touchend",   onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
    };
  }, [onRefresh, pullPx]);

  return pullPx;
}

// ─── TASK PROGRESS BAR ──────────────────────────────────────────────────────
function TaskProgressRow({ tasks, pkg, loading }) {
  const navigate = useNavigate();

  const completed = tasks?.completed_today ?? 0;
  const limit     = tasks?.task_limit ?? pkg?.task_limit ?? 0;
  const pct       = limit > 0 ? Math.min(100, Math.round((completed / limit) * 100)) : 0;
  const unlimited = limit === 0;

  return (
    <div className="dash-task-progress-card" role="region" aria-label="Today's task progress">
      <div className="dash-task-header">
        <div className="dash-task-title">Tasks Today</div>
        <button
          className="btn-ghost btn-sm"
          onClick={() => navigate("/tasks")}
          aria-label="Go to tasks"
        >
          View Tasks
        </button>
      </div>

      {loading ? (
        <SkeletonCard height={44} />
      ) : (
        <>
          <div className="dash-task-count" aria-label={`${completed} of ${unlimited ? "unlimited" : limit} tasks completed`}>
            <span className="dash-task-num">{completed}</span>
            <span className="dash-task-sep">/</span>
            <span className="dash-task-denom">
              {unlimited ? "∞" : limit}
            </span>
            <span className="dash-task-label">completed</span>
          </div>
          {!unlimited && (
            <div className="dash-task-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="dash-task-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          {!unlimited && limit - completed <= 5 && limit - completed > 0 && (
            <div className="dash-task-nudge">
              <AlertCircleIcon size={12} strokeWidth={2} aria-hidden="true" />
              {limit - completed} task{limit - completed !== 1 ? "s" : ""} remaining today
            </div>
          )}
          {!unlimited && completed >= limit && (
            <div className="dash-task-done">
              <CheckIcon size={12} strokeWidth={2.5} aria-hidden="true" />
              All tasks done for today!
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ERROR BANNER ───────────────────────────────────────────────────────────
function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="dash-error-banner" role="alert">
      <AlertCircleIcon size={15} strokeWidth={2} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button className="btn-ghost btn-sm" onClick={onRetry}>
          <RefreshCwIcon size={13} strokeWidth={2} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

// ─── MAIN DASHBOARD ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  // ── Parallel data fetching ──────────────────────────────────────────────
  const {
    data: balance,
    loading: balLoading,
    error: balError,
    reload: reloadBal,
  } = useApi(() => api.users.balance(), [refreshKey]);

  const {
    data: pkg,
    loading: pkgLoading,
    error: pkgError,
    reload: reloadPkg,
  } = useApi(() => api.packages.mine(), [refreshKey]);

  const {
    data: referrals,
    loading: refLoading,
    reload: reloadRef,
  } = useApi(() => api.referrals.myCode(), [refreshKey]);

  const {
    data: tasks,
    loading: tasksLoading,
    reload: reloadTasks,
  } = useApi(() => api.tasks.progress(), [refreshKey]);

  // Notifications used for status feed
  const {
    data: notifications,
    loading: notifLoading,
    reload: reloadNotif,
  } = useApi(
    () => api.notifications.list({ limit: 20, type: "broadcast" }),
    [refreshKey]
  );

  // ── Auto-refresh every 2 minutes while visible ──────────────────────────
  useEffect(() => {
    let timer = null;

    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") {
          reload();
        }
        schedule();
      }, AUTO_REFRESH_MS);
    };

    schedule();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        reload();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reload]);

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  const pullPx = usePullToRefresh(reload);

  // ── Combined loading / error states ─────────────────────────────────────
  const isInitialLoad = balLoading && balance === null;
  const anyError      = balError ?? pkgError;

  const reloadAll = useCallback(() => {
    reloadBal();
    reloadPkg();
    reloadRef();
    reloadTasks();
    reloadNotif();
  }, [reloadBal, reloadPkg, reloadRef, reloadTasks, reloadNotif]);

  // ── PTR indicator ────────────────────────────────────────────────────────
  const showPtrIndicator = pullPx > 8;

  return (
    <div className="dash-screen" aria-label="Dashboard">

      {/* Pull-to-refresh indicator */}
      {showPtrIndicator && (
        <div
          className="dash-ptr-indicator"
          style={{ height: pullPx, opacity: Math.min(1, pullPx / PTR_THRESHOLD) }}
          aria-hidden="true"
        >
          <RefreshCwIcon
            size={18}
            strokeWidth={2}
            style={{
              color: "var(--accent)",
              transform: `rotate(${(pullPx / PTR_THRESHOLD) * 360}deg)`,
            }}
          />
        </div>
      )}

      {/* Error banner */}
      {anyError && !isInitialLoad && (
        <ErrorBanner
          message="Some data failed to load."
          onRetry={reloadAll}
        />
      )}

      {/* ── Balance Hero ── */}
      <BalanceHero
        user={user}
        balance={balance}
        pkg={pkg}
        loading={isInitialLoad}
      />

      {/* ── Stats Grid ── */}
      <StatsGrid
        user={user}
        balance={balance}
        referrals={referrals}
        tasks={tasks}
        loading={isInitialLoad}
      />

      {/* ── Task Progress ── */}
      <TaskProgressRow
        tasks={tasks}
        pkg={pkg}
        loading={tasksLoading && tasks === null}
      />

      {/* ── Status Feed ── */}
      <StatusFeed
        notifications={notifications}
        loading={notifLoading && notifications === null}
      />

      {/* ── Quick Action Cards ── */}
      <section className="dash-actions-section" aria-label="Quick actions">
        <h2 className="dash-section-title" style={{ marginBottom: 12 }}>
          Quick Actions
        </h2>

        {/* Invite + Packages row */}
        <div className="dash-action-row">
          <InviteCard
            referralData={referrals}
            loading={refLoading && referrals === null}
          />
          <PackageCard
            pkg={pkg}
            loading={pkgLoading && pkg === null}
          />
        </div>

        {/* Withdraw — full width */}
        <WithdrawCard
          balance={balance}
          loading={balLoading && balance === null}
        />
      </section>

      {/* Bottom spacer for bottom nav */}
      <div style={{ height: 24 }} aria-hidden="true" />
    </div>
  );
}
