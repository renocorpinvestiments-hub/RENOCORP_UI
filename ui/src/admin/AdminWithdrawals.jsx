/**
 * admin/AdminWithdrawals.jsx — RENOCORP Withdrawal Activity Feed  v1.0
 * ==========================================================================
 * READ-ONLY transaction monitor. Payouts are processed automatically by
 * the backend (Flutterwave first, Chipper Cash fallback, background worker
 * polling every 30s per the withdrawals module) — this screen exists to
 * WATCH that pipeline, not steer it. No approve, no reject, no manual
 * override. Fairness comes from the same automatic rules applying to every
 * withdrawal; this view just makes that visible.
 *
 * Data source:
 *   GET /api/admin/withdrawals?status=&network=&from_ts=&to_ts=&page=&page_size=
 *   → AdminWithdrawalPage { withdrawals: AdminWithdrawalRecord[], total,
 *                            pending_count, pending_usd, page, page_size, total_pages }
 *
 * Contract notes (from modules/admin/{routes,models,service}.py):
 *  · status values: pending | processing | completed | failed | rejected.
 *    "rejected" still exists in the schema (a withdrawal the system itself
 *    declined, e.g. provider validation failure) — shown here as another
 *    outcome to watch, not a button to press.
 *  · pending_count / pending_usd on every response are GLOBAL queue
 *    totals (system-wide, ignores the current filter) — confirmed against
 *    service.py's separate unfiltered COUNT/SUM query. Used as the
 *    "queue health" indicator regardless of which status tab is open.
 *  · requested_at / processed_at are unix epoch seconds, UTC.
 *  · There is no free-text/email search param on this endpoint (only
 *    user_id, network, from_ts, to_ts) — so unlike AdminUsers.jsx this
 *    screen does NOT pretend to offer server-side search. Filtering is
 *    status tabs + network + date range only, all backend-native.
 *  · This screen intentionally never calls approveWithdrawal /
 *    rejectWithdrawal — those exist in api.js and on the backend but are
 *    out of scope here by design (see header note rendered on screen).
 *
 * Only uses CSS classes already merged into styles.js — identical
 * convention to AdminDashboard.jsx / AdminUsers.jsx / AdminTasks.jsx.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { Badge } from "../components/Badge.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { TabBar } from "../components/TabBar.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ArrowDownCircleIcon,
  RefreshCwIcon,
  DownloadIcon,
  InfoIcon,
  ClockIcon,
  CheckCircle2Icon,
  XCircleIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const PAGE_SIZE        = 20;
const AUTO_REFRESH_MS  = 60_000;

const STATUS_TABS = [
  { key: "all",        label: "All" },
  { key: "completed",  label: "Completed" },
  { key: "processing", label: "Processing" },
  { key: "pending",    label: "Pending" },
  { key: "failed",     label: "Failed" },
  { key: "rejected",   label: "Rejected" },
];

const NETWORK_OPTIONS = [
  { value: "",       label: "All networks" },
  { value: "MTN",    label: "MTN" },
  { value: "AIRTEL", label: "Airtel" },
];

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "3d",     label: "Last 3 days" },
  { value: "7d",     label: "Last 7 days" },
  { value: "all",    label: "All time" },
];

const OUTCOME_STATUSES = ["completed", "failed", "rejected"]; // used for success-rate math

// ─── DATE RANGE HELPER ──────────────────────────────────────────────────────
function rangeToTs(rangeKey, now = new Date()) {
  if (rangeKey === "all") return { fromTs: undefined, toTs: undefined };
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const daysBack = rangeKey === "today" ? 0 : rangeKey === "3d" ? 2 : 6;
  const from = new Date(todayStart.getTime() - daysBack * 86_400_000);
  return {
    fromTs: Math.floor(from.getTime() / 1000),
    toTs:   Math.floor(now.getTime() / 1000),
  };
}

// ─── FORMATTERS ─────────────────────────────────────────────────────────────
function usd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows) {
  const header = ["id", "user_email", "amount_usd", "fee_usd", "net_usd", "network", "provider", "status", "provider_ref", "requested_at_utc", "processed_at_utc"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.id,
      csvEscape(r.user_email ?? ""),
      r.amount_usd,
      r.fee_usd,
      r.net_usd,
      r.network,
      r.provider,
      r.status,
      csvEscape(r.provider_ref ?? ""),
      r.requested_at ? new Date(r.requested_at * 1000).toISOString() : "",
      r.processed_at ? new Date(r.processed_at * 1000).toISOString() : "",
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `renocorp-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Lightweight count-only probe — page_size=1 keeps the payload tiny; we only
// read `.total` from the response, never the row itself.
async function probeCount({ status, network, fromTs, toTs }) {
  const res = await api.admin.withdrawals({
    page: 1,
    page_size: 1,
    status,
    network: network || undefined,
    from_ts: fromTs,
    to_ts: toTs,
  });
  return res?.total ?? 0;
}

async function fetchOutcomeSummary({ network, fromTs, toTs }) {
  const [completed, failed, rejected, processing, pendingProbe] = await Promise.all([
    probeCount({ status: "completed",  network, fromTs, toTs }),
    probeCount({ status: "failed",     network, fromTs, toTs }),
    probeCount({ status: "rejected",   network, fromTs, toTs }),
    probeCount({ status: "processing", network, fromTs, toTs }),
    // page_size=1 on ANY status still returns global pending_count/pending_usd
    api.admin.withdrawals({ page: 1, page_size: 1, status: "pending", network: network || undefined, from_ts: fromTs, to_ts: toTs }),
  ]);
  const pending = pendingProbe?.total ?? 0;
  const attempted = completed + failed + rejected;
  const successRate = attempted > 0 ? (completed / attempted) * 100 : null;
  return {
    completed, failed, rejected, processing, pending,
    successRate,
    queuePendingCount: pendingProbe?.pending_count ?? 0,
    queuePendingUsd:   pendingProbe?.pending_usd ?? 0,
    fetchedAt: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminWithdrawals() {
  const [statusTab, setStatusTab] = useState("all");
  const [network, setNetwork]     = useState("");
  const [rangeKey, setRangeKey]   = useState("3d");
  const [page, setPage]           = useState(1);

  const { fromTs, toTs } = useMemo(() => rangeToTs(rangeKey), [rangeKey]);

  useEffect(() => { setPage(1); }, [statusTab, network, rangeKey]);

  // ── Live transaction feed (server-paginated, latest first) ──────────────
  const {
    data: listData,
    loading: listLoading,
    isRefetching: listRefetching,
    error: listError,
    reload: reloadList,
  } = useApi(
    () => api.admin.withdrawals({
      page,
      page_size: PAGE_SIZE,
      status: statusTab,
      network: network || undefined,
      from_ts: fromTs,
      to_ts: toTs,
      sort_order: "desc",
    }),
    [page, statusTab, network, fromTs, toTs]
  );

  // ── Outcome summary (counts + success rate, independent of status tab) ──
  const {
    data: summary,
    loading: summaryLoading,
    reload: reloadSummary,
  } = useApi(
    () => fetchOutcomeSummary({ network, fromTs, toTs }),
    [network, fromTs, toTs]
  );

  useAutoRefresh(AUTO_REFRESH_MS, () => {
    reloadList();
    reloadSummary();
  });

  const handleRefresh = useCallback(() => {
    reloadList();
    reloadSummary();
  }, [reloadList, reloadSummary]);

  const rows = listData?.withdrawals ?? [];
  const isBusy = (listLoading && !listData) || (summaryLoading && !summary);

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ArrowDownCircleIcon size={18} strokeWidth={2.2} style={{ color: "var(--info)" }} aria-hidden="true" />
            Withdrawal Activity
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {summary?.fetchedAt
              ? `Updated ${new Date(summary.fetchedAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading activity…"}
            {listRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={handleRefresh} disabled={isBusy} aria-label="Refresh" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={listRefetching ? { animation: "rc-wd-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {/* ── Scope notice ── */}
      <div className="rc-alert rc-alert-info" style={{ marginTop: 12, alignItems: "flex-start" }} role="note">
        <InfoIcon size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          Payouts are processed automatically by the system (Flutterwave, with Chipper Cash
          fallback). This is a monitoring view only — no approve, reject, or manual override.
          Every withdrawal follows the same automatic rules.
        </span>
      </div>

      {listError && <Alert type="error" message={`Couldn't load withdrawals: ${listError}`} onDismiss={reloadList} style={{ marginTop: 12 }} />}

      {/* ── Summary KPIs ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          <MiniStat
            icon={<CheckCircle2Icon size={13} strokeWidth={2} />}
            label="Success Rate"
            value={summary?.successRate == null ? "—" : `${summary.successRate.toFixed(1)}%`}
            sub={`${summary?.completed ?? 0} completed / ${(summary?.completed ?? 0) + (summary?.failed ?? 0) + (summary?.rejected ?? 0)} attempted`}
            tone={summary?.successRate == null ? undefined : summary.successRate >= 90 ? "accent" : summary.successRate >= 70 ? "warning" : "danger"}
          />
          <MiniStat icon={<ClockIcon size={13} strokeWidth={2} />} label="In Progress" value={(summary?.processing ?? 0) + (summary?.pending ?? 0)} sub={`${summary?.processing ?? 0} processing · ${summary?.pending ?? 0} pending`} />
          <MiniStat icon={<XCircleIcon size={13} strokeWidth={2} />} label="Failed / Rejected" value={(summary?.failed ?? 0) + (summary?.rejected ?? 0)} tone={(summary?.failed || summary?.rejected) ? "danger" : undefined} />
          <MiniStat label="System-wide Queue" value={summary?.queuePendingCount ?? 0} sub={`${usd(summary?.queuePendingUsd)} awaiting payout`} tone={summary?.queuePendingCount ? "warning" : undefined} />
        </div>
      )}

      {/* ── Controls ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>Latest transactions</h3>
        <button
          className="link-btn"
          onClick={() => downloadCsv(rows)}
          disabled={isBusy || rows.length === 0}
          title="Export current page as CSV"
        >
          <DownloadIcon size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Export CSV
        </button>
      </div>

      <div style={{ marginBottom: 12 }}>
        <TabBar tabs={STATUS_TABS} active={statusTab} onChange={setStatusTab} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <select className="rc-select" value={network} onChange={(e) => setNetwork(e.target.value)} aria-label="Filter by network">
          {NETWORK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="rc-select" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Date range">
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} height={44} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No withdrawals in this window"
          message="Try a wider date range or a different status/network filter."
          action={{ label: "Refresh", onClick: handleRefresh }}
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "right" }}>Fee</th>
                  <th style={{ textAlign: "right" }}>Net</th>
                  <th>Network</th>
                  <th>Status</th>
                  <th>Requested</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{w.user_email ?? "—"}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>{w.phone_number}</div>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{usd(w.amount_usd)}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>{usd(w.fee_usd)}</td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{usd(w.net_usd)}</td>
                    <td style={{ fontSize: 11.5 }}>
                      {w.network}
                      <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{w.provider}</div>
                    </td>
                    <td>
                      <Badge status={w.status} />
                      {w.status === "failed" && w.failure_reason && (
                        <div style={{ fontSize: 9.5, color: "var(--danger)", marginTop: 3, maxWidth: 140 }}>{w.failure_reason}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }} title={formatDateTime(w.requested_at * 1000)}>
                      {timeAgo(w.requested_at * 1000)}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={w.provider_ref ?? ""}>
                      {w.provider_ref ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Showing {rows.length} of {listData?.total ?? rows.length}
          </div>

          <PaginationBar page={page} total={listData?.total ?? 0} limit={PAGE_SIZE} onChange={setPage} />
        </>
      )}

      <style>{`@keyframes rc-wd-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function SkeletonBlock({ height = 76 }) {
  return <div className="rc-skeleton" style={{ height, borderRadius: "var(--radius-lg)" }} />;
}

function MiniStat({ icon, label, value, sub, tone }) {
  const color =
    tone === "danger" ? "var(--danger)" :
    tone === "warning" ? "var(--warning)" :
    tone === "accent"  ? "var(--accent)"  :
    "var(--text)";
  return (
    <div className="dash-card">
      <h3>
        {icon && <span style={{ marginRight: 5, opacity: 0.7, verticalAlign: "-2px", display: "inline-flex" }} aria-hidden="true">{icon}</span>}
        {label}
      </h3>
      <div className="dash-card-value" style={{ color, fontSize: 22 }}>{value ?? "—"}</div>
      {sub && <div className="dash-card-sub">{sub}</div>}
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
