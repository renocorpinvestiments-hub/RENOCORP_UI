/**
 * admin/AdminDashboard.jsx — RENOCORP Admin Overview  v2.0
 * ==========================================================
 * The admin landing screen. First admin route hit after login
 * (guarded client-side by <AdminRoute> in AppShell, and
 * server-side by _require_admin on every /api/admin/* route).
 *
 * Data sources (both cached 60s server-side):
 *   GET /api/admin/dashboard/stats  → AdminDashboardStats
 *   GET /api/admin/system/health    → SystemHealthSnapshot
 *
 * Design notes:
 *  · Uses ONLY classes already merged into styles.js (dash-body,
 *    dash-section, admin-stat-grid, admin-table, health-dot, rc-*).
 *    Does NOT depend on dashboard.css.js / tasks.css.js — those are
 *    staged snippets that haven't been merged into the live
 *    stylesheet yet, so screens can't safely rely on their classes.
 *  · Money fields on AdminDashboardStats are explicitly suffixed
 *    `_usd` (real USD, e.g. total_credits_today_usd) — these are
 *    rendered with a raw `$` prefix, matching the convention already
 *    established in Dashboard.jsx's PackageCard (withdraw_threshold_usd).
 *    Fields WITHOUT a _usd suffix elsewhere in the app are pre-converted
 *    UGX and go through formatUGX() — there are none of those on this
 *    particular model, so formatUGX/formatUGXCompact are unused here.
 *  · Auto-refreshes every 60s (matches server cache TTL) plus a manual
 *    refresh button. Both requests run in parallel and independently
 *    show stale-while-revalidate via useApi's isRefetching flag.
 */

import { useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import {
  ActivityIcon,
  ShieldIcon,
  ArrowDownCircleIcon,
  CheckSquareIcon,
  ClockIcon,
  ToggleLeftIcon,
  ServerIcon,
  DatabaseIcon,
  RefreshCwIcon,
  ChevronRightIcon,
  UserIcon,
  BarChart3Icon,
  SendIcon,
  GiftIcon,
  PackageIcon,
  BellIcon,
  KeyIcon,
} from "lucide-react";

const AUTO_REFRESH_MS = 60_000; // matches server-side 60s cache

// ─── QUICK ACTIONS ───────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { path: "/admin/users",       label: "Users",        Icon: UserIcon,        desc: "Search, credit, suspend" },
  { path: "/admin/tasks",       label: "Task Queue",    Icon: CheckSquareIcon, desc: "Approve completions" },
  { path: "/admin/withdrawals", label: "Withdrawals",   Icon: ArrowDownCircleIcon, desc: "Approve payouts" },
  { path: "/admin/earnings",    label: "Earnings Audit",Icon: BarChart3Icon,   desc: "Cross-user ledger" },
  { path: "/admin/offerwall",   label: "Offerwall",     Icon: ToggleLeftIcon,  desc: "Provider control" },
  { path: "/admin/packages",    label: "Packages",      Icon: PackageIcon,     desc: "Plans & revenue" },
  { path: "/admin/invitations", label: "Invitations",   Icon: SendIcon,        desc: "Invite new users" },
  { path: "/admin/referrals",   label: "Referrals",     Icon: GiftIcon,        desc: "Bonus config" },
  { path: "/admin/broadcast",   label: "Broadcast",     Icon: BellIcon,        desc: "Notify all users" },
  { path: "/admin/vault",       label: "Vault",         Icon: KeyIcon,         desc: "Credentials" },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function usd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function compactUsd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatUptime(seconds) {
  if (seconds == null || isNaN(seconds)) return "—";
  const s = Number(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function tsToDate(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000);
}

// ─── SKELETON ────────────────────────────────────────────────────────────────
function SkeletonBlock({ height = 76 }) {
  return <div className="rc-skeleton" style={{ height, borderRadius: "var(--radius-lg)" }} />;
}

// ─── STAT MINI CARD (local — mirrors StatCard but denser for admin grid) ────
function MiniStat({ label, value, sub, tone }) {
  const color =
    tone === "danger" ? "var(--danger)" :
    tone === "warning" ? "var(--warning)" :
    tone === "accent"  ? "var(--accent)"  :
    "var(--text)";
  return (
    <div className="dash-card">
      <h3>{label}</h3>
      <div className="dash-card-value" style={{ color, fontSize: 22 }}>
        {value ?? "—"}
      </div>
      {sub && <div className="dash-card-sub">{sub}</div>}
    </div>
  );
}

// ─── SECTION HEADER W/ LINK ──────────────────────────────────────────────────
function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <div className="dash-section-header">
      <h3>{title}</h3>
      {onAction && (
        <button className="link-btn" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const navigate = useNavigate();

  const {
    data: stats,
    loading: statsLoading,
    isRefetching: statsRefetching,
    error: statsError,
    reload: reloadStats,
  } = useApi(() => api.admin.stats(), []);

  const {
    data: health,
    loading: healthLoading,
    error: healthError,
    reload: reloadHealth,
  } = useApi(() => api.admin.health(), [], {
    // Poll independently every 60s — health is cheap and time-sensitive
  });

  // ── Auto refresh both, every 60s ─────────────────────────────────────────
  useAutoRefresh(AUTO_REFRESH_MS, () => {
    reloadStats();
    reloadHealth();
  });

  const computedAt = useMemo(() => tsToDate(stats?.computed_at), [stats]);
  const isBusy = statsLoading || healthLoading;
  const isRefetching = statsRefetching;

  const handleRefresh = () => {
    reloadStats();
    reloadHealth();
  };

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldIcon size={18} strokeWidth={2.2} style={{ color: "var(--warning)" }} aria-hidden="true" />
            Admin Dashboard
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {computedAt
              ? `Updated ${computedAt.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading stats…"}
            {isRefetching && " · refreshing…"}
          </div>
        </div>
        <button
          className="btn-icon"
          onClick={handleRefresh}
          disabled={isBusy}
          aria-label="Refresh dashboard"
          title="Refresh"
        >
          <RefreshCwIcon
            size={16}
            strokeWidth={2}
            style={isRefetching ? { animation: "spin 0.8s linear infinite" } : undefined}
          />
        </button>
      </div>

      {statsError && (
        <Alert type="error" message={`Couldn't load dashboard stats: ${statsError}`} onDismiss={reloadStats} />
      )}
      {healthError && (
        <Alert type="warning" message={`Couldn't load system health: ${healthError}`} onDismiss={reloadHealth} />
      )}

      {/* ── Users ── */}
      <SectionHeader title="Users" actionLabel="Manage →" onAction={() => navigate("/admin/users")} />
      {statsLoading && !stats ? (
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={84} />)}
        </div>
      ) : (
        <div className="admin-stat-grid">
          <MiniStat label="Total Users" value={stats?.total_users?.toLocaleString("en-UG")} sub={`${stats?.admin_users ?? 0} admins`} />
          <MiniStat label="New Today" value={stats?.new_users_today} sub={`${stats?.new_users_7d ?? 0} this week`} tone="accent" />
          <MiniStat label="Active Today" value={stats?.active_users_today} sub="completed a task" tone="accent" />
          <MiniStat
            label="Suspended / Banned"
            value={`${stats?.suspended_users ?? 0} / ${stats?.banned_users ?? 0}`}
            tone={(stats?.suspended_users || stats?.banned_users) ? "warning" : undefined}
          />
        </div>
      )}

      {/* ── Earnings ── */}
      <SectionHeader title="Earnings" actionLabel="Audit →" onAction={() => navigate("/admin/earnings")} />
      {statsLoading && !stats ? (
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={84} />)}
        </div>
      ) : (
        <div className="admin-stat-grid">
          <MiniStat label="Credited Today" value={compactUsd(stats?.total_credits_today_usd)} tone="accent" />
          <MiniStat label="Credited (7d)" value={compactUsd(stats?.total_credits_7d_usd)} />
          <MiniStat label="Credited All-Time" value={compactUsd(stats?.total_credits_all_usd)} />
          <MiniStat label="Debited Today" value={compactUsd(stats?.total_debits_today_usd)} sub={`${stats?.total_transactions_today ?? 0} txns today`} />
        </div>
      )}

      {/* ── Withdrawals & Tasks ── */}
      <SectionHeader title="Withdrawals & Tasks" actionLabel="Withdrawals →" onAction={() => navigate("/admin/withdrawals")} />
      {statsLoading && !stats ? (
        <div className="admin-stat-grid">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={84} />)}
        </div>
      ) : (
        <div className="admin-stat-grid">
          <MiniStat
            label="Pending Withdrawals"
            value={stats?.pending_withdrawals ?? 0}
            sub={usd(stats?.pending_withdrawal_usd)}
            tone={stats?.pending_withdrawals ? "warning" : undefined}
          />
          <MiniStat label="Completed Today" value={stats?.completed_withdrawals_today ?? 0} tone="accent" />
          <MiniStat
            label="Failed Today"
            value={stats?.failed_withdrawals_today ?? 0}
            tone={stats?.failed_withdrawals_today ? "danger" : undefined}
          />
          <MiniStat
            label="Pending Task Approvals"
            value={stats?.pending_task_approvals ?? 0}
            sub={`${stats?.task_completions_today ?? 0} completed today`}
            tone={stats?.pending_task_approvals ? "warning" : undefined}
          />
        </div>
      )}

      {/* ── Offerwalls ── */}
      <SectionHeader title="Offerwalls" actionLabel="Configure →" onAction={() => navigate("/admin/offerwall")} />
      {statsLoading && !stats ? (
        <SkeletonBlock height={70} />
      ) : (
        <div className="dash-section">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              className={`health-dot ${stats?.active_providers > 0 ? "health-dot-green" : "health-dot-yellow"}`}
              aria-hidden="true"
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              {stats?.active_providers ?? 0} / {stats?.total_providers ?? 0} providers active
            </span>
            <button
              className="link-btn"
              style={{ marginLeft: "auto" }}
              onClick={() => navigate("/admin/offerwall")}
            >
              Manage <ChevronRightIcon size={12} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle" }} />
            </button>
          </div>
        </div>
      )}

      {/* ── System Health ── */}
      <SectionHeader title="System Health" />
      {healthLoading && !health ? (
        <SkeletonBlock height={140} />
      ) : health ? (
        <div className="dash-section">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <span
              className={`health-dot ${health.overall_healthy ? "health-dot-green" : "health-dot-red"}`}
              aria-hidden="true"
            />
            <span style={{ fontSize: 14, fontWeight: 700 }}>
              {health.overall_healthy ? "All systems operational" : "Degraded"}
            </span>
            <Badge variant={health.overall_healthy ? "green" : "red"}>
              {health.overall_healthy ? "Healthy" : "Issues detected"}
            </Badge>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginBottom: health.module_health?.length ? 16 : 0,
            }}
          >
            <HealthMetric
              Icon={DatabaseIcon}
              label="DB Pool"
              value={`${health.db_pool_checked_out ?? 0} / ${health.db_pool_size ?? 0}`}
              healthy={health.db_pool_size > 0}
            />
            <HealthMetric
              Icon={ServerIcon}
              label="Redis"
              value={health.redis_connected ? `${health.redis_memory_mb?.toFixed(1) ?? "0"} MB` : "Disconnected"}
              healthy={health.redis_connected}
            />
            <HealthMetric
              Icon={ClockIcon}
              label="Uptime"
              value={formatUptime(health.uptime_seconds)}
              healthy
            />
            <HealthMetric
              Icon={ActivityIcon}
              label="Workers"
              value={String(health.worker_count ?? 0)}
              healthy={(health.worker_count ?? 0) > 0}
            />
          </div>

          {health.module_health?.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Status</th>
                    <th>Workers</th>
                    <th>Startup</th>
                  </tr>
                </thead>
                <tbody>
                  {health.module_health.map((m) => (
                    <tr key={m.name}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{m.name}</td>
                      <td>
                        <span
                          className={`health-dot ${m.healthy ? "health-dot-green" : "health-dot-red"}`}
                          aria-hidden="true"
                        />
                        {m.healthy ? "Healthy" : (m.error ?? "Error")}
                      </td>
                      <td>{m.workers_running}</td>
                      <td>{m.startup_duration_ms != null ? `${m.startup_duration_ms}ms` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <EmptyState icon="🩺" title="No health data" message="Couldn't reach the system health endpoint." />
      )}

      {/* ── Quick actions ── */}
      <SectionHeader title="Quick Actions" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 10,
        }}
      >
        {QUICK_ACTIONS.map(({ path, label, Icon, desc }) => (
          <button
            key={path}
            className="dash-section"
            onClick={() => navigate(path)}
            style={{
              cursor: "pointer",
              textAlign: "left",
              background: "var(--surface)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "var(--accent-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={14} strokeWidth={2} style={{ color: "var(--accent)" }} aria-hidden="true" />
              </div>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{desc}</span>
          </button>
        ))}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── HEALTH METRIC TILE ──────────────────────────────────────────────────────
function HealthMetric({ Icon, label, value, healthy }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Icon size={15} strokeWidth={2} style={{ color: healthy ? "var(--text-muted)" : "var(--danger)", flexShrink: 0 }} aria-hidden="true" />
      <div>
        <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── AUTO REFRESH HOOK (local, tiny — pauses when tab hidden) ───────────────
function useAutoRefresh(intervalMs, callback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") cbRef.current();
    }, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs]);
}
