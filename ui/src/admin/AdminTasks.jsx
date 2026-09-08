/**
 * admin/AdminTasks.jsx — RENOCORP Task Activity Report  v1.0
 * ================================================================
 * READ-ONLY fairness/activity view. Shows how many tasks each user
 * has completed — Today, Yesterday, 2 days ago, and a rolling 3-day
 * total — with zero ability to approve, reject, or otherwise control
 * who gets paid. That decision surface is intentionally NOT exposed
 * here so payout eligibility stays governed by the automated backend
 * rules (offerwall postbacks / earnings ledger), not admin discretion.
 *
 * Data source:
 *   GET /api/admin/tasks?from_ts=&to_ts=&page=&page_size=&status=all&sort_order=desc
 *   → AdminTaskPage { tasks: AdminTaskRecord[], total, page, page_size, total_pages }
 *
 * Contract notes (from modules/admin/{routes,models}.py):
 *  · AdminTaskRecord has NO admin-only "identity" fields beyond
 *    user_id / user_email — nothing here reveals more than the
 *    other admin screens already do.
 *  · status is pending | approved | rejected — this report counts
 *    EVERY completion regardless of status, because it's an
 *    activity signal, not a payment signal. Approval status governs
 *    money; it does not appear or matter on this screen.
 *  · completed_at is unix epoch seconds, UTC (confirmed against
 *    modules/tasks/service.py: EXTRACT(EPOCH FROM completed_at)::BIGINT).
 *  · page_size is capped at 100 server-side (Query(ge=1, le=100)) —
 *    this screen paginates through the window server-side and
 *    aggregates client-side, capped at MAX_PAGES as a circuit
 *    breaker against pathological windows (see fetchActivityWindow).
 *  · This screen intentionally does NOT call approveTask / rejectTask
 *    / bulkApprove / bulkReject — those endpoints exist on the
 *    backend and in api.js but are out of scope here by design.
 *
 * Only uses CSS classes already merged into styles.js (dash-body,
 * dash-section-header, admin-stat-grid, admin-table, rc-input,
 * rc-select, rc-skeleton, rc-empty, btn-icon, link-btn) — identical
 * convention to AdminDashboard.jsx / AdminUsers.jsx.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ActivityIcon,
  RefreshCwIcon,
  SearchIcon,
  DownloadIcon,
  UsersIcon,
  ClockIcon,
  AlertTriangleIcon,
  InfoIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const ROWS_PER_PAGE     = 20;   // client-side pagination over aggregated users
const FETCH_PAGE_SIZE   = 100;  // server max per page
const MAX_FETCH_PAGES   = 60;   // circuit breaker → 6,000 completions/window cap
const AUTO_REFRESH_MS   = 60_000;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
  { value: "today_desc", label: "Most today" },
  { value: "3d_desc",    label: "Most (3 days)" },
  { value: "recent",     label: "Most recently active" },
  { value: "email_asc",  label: "Email A–Z" },
];

// ─── DATE WINDOW HELPERS ────────────────────────────────────────────────────
// Local-midnight boundaries so "Today" matches what the admin's clock says,
// not a UTC-day cutover that could misattribute a completion made an hour
// ago into "yesterday".
function computeWindow(now = new Date()) {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const day1Start   = new Date(todayStart.getTime() - 86_400_000);      // yesterday
  const day0Start   = new Date(todayStart.getTime() - 2 * 86_400_000);  // 2 days ago

  const toSec = (d) => Math.floor(d.getTime() / 1000);

  return {
    fromTs: toSec(day0Start),
    toTs:   toSec(now),
    // Bucket boundaries, ascending: [2 days ago, yesterday, today]
    boundaries: [toSec(day0Start), toSec(day1Start), toSec(todayStart)],
    labels: [
      day0Start.toLocaleDateString("en-UG", { weekday: "short" }),
      "Yesterday",
      "Today",
    ],
  };
}

function bucketIndex(completedAtSec, boundaries) {
  // boundaries = [day0Start, day1Start, day2Start(today)] ascending
  if (completedAtSec >= boundaries[2]) return 2; // today
  if (completedAtSec >= boundaries[1]) return 1; // yesterday
  if (completedAtSec >= boundaries[0]) return 0; // 2 days ago
  return -1; // outside window (shouldn't happen given from_ts filter, guarded anyway)
}

// ─── SERVER PAGINATION LOOP ─────────────────────────────────────────────────
// Walks every page of the window via the existing admin tasks endpoint and
// flattens into one array for client-side aggregation. Bounded by
// MAX_FETCH_PAGES so an unexpectedly huge window can never hang the tab or
// hammer the backend — surfaces a "showing partial data" notice instead.
async function fetchActivityWindow({ fromTs, toTs }) {
  let page = 1;
  let total = 0;
  let totalPages = 1;
  const records = [];

  do {
    const res = await api.admin.tasks({
      page,
      page_size: FETCH_PAGE_SIZE,
      status: "all",
      from_ts: fromTs,
      to_ts: toTs,
      sort_order: "desc",
    });
    const batch = res?.tasks ?? [];
    records.push(...batch);
    total = res?.total ?? records.length;
    totalPages = res?.total_pages ?? Math.max(1, Math.ceil(total / FETCH_PAGE_SIZE));
    if (batch.length === 0) break;
    page += 1;
  } while (page <= totalPages && page <= MAX_FETCH_PAGES);

  return {
    records,
    total,
    truncated: page > MAX_FETCH_PAGES && totalPages > MAX_FETCH_PAGES,
    fetchedAt: Date.now(),
  };
}

// ─── CSV EXPORT (pure client-side, no extra requests) ───────────────────────
function downloadCsv(rows, window) {
  const header = [
    "user_id",
    "user_email",
    window.labels[0],
    window.labels[1],
    "Today",
    "3-day total",
    "last_completed_utc",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const lastIso = r.lastCompletedAt ? new Date(r.lastCompletedAt * 1000).toISOString() : "";
    lines.push([
      r.user_id,
      csvEscape(r.email ?? ""),
      r.counts[0],
      r.counts[1],
      r.counts[2],
      r.total3d,
      lastIso,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `renocorp-task-activity-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminTasks() {
  // Window is computed once per mount / manual refresh — not on every render,
  // so bucket boundaries stay stable across re-renders within one fetch cycle.
  const [windowAnchor, setWindowAnchor] = useState(() => Date.now());
  const window = useMemo(() => computeWindow(new Date(windowAnchor)), [windowAnchor]);

  const {
    data,
    loading,
    isRefetching,
    error,
    reload,
  } = useApi(
    () => fetchActivityWindow({ fromTs: window.fromTs, toTs: window.toTs }),
    [window.fromTs, window.toTs]
  );

  // ── Auto-refresh every 60s (also nudges the window forward at midnight) ──
  useAutoRefresh(AUTO_REFRESH_MS, () => {
    setWindowAnchor(Date.now());
  });

  const handleRefresh = useCallback(() => {
    setWindowAnchor(Date.now());
    reload();
  }, [reload]);

  // ── Aggregate raw completions → per-user counts ─────────────────────────
  const perUser = useMemo(() => {
    if (!data?.records) return [];
    const map = new Map();

    for (const rec of data.records) {
      const idx = bucketIndex(rec.completed_at, window.boundaries);
      if (idx === -1) continue;

      let entry = map.get(rec.user_id);
      if (!entry) {
        entry = {
          user_id: rec.user_id,
          email: rec.user_email ?? null,
          counts: [0, 0, 0], // [2 days ago, yesterday, today]
          lastCompletedAt: 0,
        };
        map.set(rec.user_id, entry);
      }
      entry.counts[idx] += 1;
      if (rec.completed_at > entry.lastCompletedAt) entry.lastCompletedAt = rec.completed_at;
      if (!entry.email && rec.user_email) entry.email = rec.user_email;
    }

    return Array.from(map.values()).map((u) => ({
      ...u,
      today:   u.counts[2],
      total3d: u.counts[0] + u.counts[1] + u.counts[2],
    }));
  }, [data, window.boundaries]);

  // ── Summary KPIs ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const totalToday = perUser.reduce((sum, u) => sum + u.today, 0);
    const total3d    = perUser.reduce((sum, u) => sum + u.total3d, 0);
    const activeToday = perUser.filter((u) => u.today > 0).length;
    const active3d     = perUser.length;
    const avgToday = activeToday > 0 ? totalToday / activeToday : 0;
    return { totalToday, total3d, activeToday, active3d, avgToday };
  }, [perUser]);

  // ── Search (debounced, client-side over already-fetched aggregate) ──────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const [sortBy, setSortBy] = useState("today_desc");
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [search, sortBy, data]);

  const filteredSorted = useMemo(() => {
    let list = perUser;
    if (search) {
      list = list.filter(
        (u) => (u.email ?? "").toLowerCase().includes(search) || u.user_id.toLowerCase().includes(search)
      );
    }
    const sorted = [...list];
    switch (sortBy) {
      case "3d_desc":
        sorted.sort((a, b) => b.total3d - a.total3d || b.today - a.today);
        break;
      case "recent":
        sorted.sort((a, b) => b.lastCompletedAt - a.lastCompletedAt);
        break;
      case "email_asc":
        sorted.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
        break;
      case "today_desc":
      default:
        sorted.sort((a, b) => b.today - a.today || b.total3d - a.total3d);
        break;
    }
    return sorted;
  }, [perUser, search, sortBy]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return filteredSorted.slice(start, start + ROWS_PER_PAGE);
  }, [filteredSorted, page]);

  const maxCountAcrossUsers = useMemo(
    () => perUser.reduce((m, u) => Math.max(m, u.counts[0], u.counts[1], u.counts[2]), 1),
    [perUser]
  );

  const isBusy = loading && !data;

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ActivityIcon size={18} strokeWidth={2.2} style={{ color: "var(--info)" }} aria-hidden="true" />
            Task Activity
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {data?.fetchedAt
              ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading activity…"}
            {isRefetching && " · refreshing…"}
          </div>
        </div>
        <button
          className="btn-icon"
          onClick={handleRefresh}
          disabled={isBusy}
          aria-label="Refresh activity"
          title="Refresh"
        >
          <RefreshCwIcon size={16} strokeWidth={2} style={isRefetching ? { animation: "rc-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {/* ── Fairness / scope notice — sets expectations up front ── */}
      <div
        className="rc-alert rc-alert-info"
        style={{ marginTop: 12, alignItems: "flex-start" }}
        role="note"
      >
        <InfoIcon size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          Activity counts only — every completion regardless of approval status. This
          screen has no approve, reject, or payout controls; who gets paid is decided
          automatically by the earnings ledger, not from here.
        </span>
      </div>

      {error && (
        <Alert type="error" message={`Couldn't load task activity: ${error}`} onDismiss={reload} style={{ marginTop: 12 }} />
      )}
      {data?.truncated && (
        <Alert
          type="warning"
          message={`This window has more completions than could be loaded (capped at ${MAX_FETCH_PAGES * FETCH_PAGE_SIZE}). Counts below may be understated — narrow your search or check back after peak load.`}
          style={{ marginTop: 12 }}
        />
      )}

      {/* ── Summary KPIs ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          <MiniStat icon={<ClockIcon size={13} strokeWidth={2} />} label="Completions Today" value={summary.totalToday.toLocaleString("en-UG")} tone="accent" />
          <MiniStat icon={<ActivityIcon size={13} strokeWidth={2} />} label="Completions (3 days)" value={summary.total3d.toLocaleString("en-UG")} />
          <MiniStat icon={<UsersIcon size={13} strokeWidth={2} />} label="Active Today" value={summary.activeToday.toLocaleString("en-UG")} sub={`of ${summary.active3d} active in 3d`} />
          <MiniStat label="Avg / Active User Today" value={summary.avgToday.toFixed(1)} sub="tasks per active user" />
        </div>
      )}

      {/* ── Controls ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>Per-user breakdown</h3>
        <button
          className="link-btn"
          onClick={() => downloadCsv(filteredSorted, window)}
          disabled={isBusy || filteredSorted.length === 0}
          title="Export current view as CSV"
        >
          <DownloadIcon size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Export CSV
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <SearchIcon
            size={14}
            strokeWidth={2}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)", pointerEvents: "none" }}
            aria-hidden="true"
          />
          <input
            className="rc-input"
            type="text"
            placeholder="Search by email or user ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{ paddingLeft: 30, width: "100%" }}
            aria-label="Search users"
          />
        </div>
        <select
          className="rc-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort by"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} height={44} />)}
        </div>
      ) : filteredSorted.length === 0 ? (
        <EmptyState
          icon="📋"
          title={search ? "No matching users" : "No task activity in this window"}
          message={search ? "Try a different email or user ID." : "No completions recorded in the last 3 days yet."}
          action={search ? { label: "Clear search", onClick: () => setSearchInput("") } : { label: "Refresh", onClick: handleRefresh }}
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th style={{ textAlign: "center" }}>{window.labels[0]}</th>
                  <th style={{ textAlign: "center" }}>{window.labels[1]}</th>
                  <th style={{ textAlign: "center" }}>{window.labels[2]}</th>
                  <th style={{ textAlign: "center" }}>3-day total</th>
                  <th>Trend</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => (
                  <tr key={u.user_id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{u.email ?? "—"}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>
                        {u.user_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>{u.counts[0]}</td>
                    <td style={{ textAlign: "center", fontFamily: "var(--font-mono)" }}>{u.counts[1]}</td>
                    <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", color: u.today > 0 ? "var(--accent)" : undefined, fontWeight: 700 }}>
                      {u.counts[2]}
                    </td>
                    <td style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{u.total3d}</td>
                    <td><TrendBars counts={u.counts} max={maxCountAcrossUsers} /></td>
                    <td style={{ fontSize: 11.5, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {u.lastCompletedAt ? timeAgo(u.lastCompletedAt * 1000) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Showing {pageRows.length} of {filteredSorted.length} user{filteredSorted.length === 1 ? "" : "s"}
            {search ? ` (filtered)` : ""}
          </div>

          <PaginationBar page={page} total={filteredSorted.length} limit={ROWS_PER_PAGE} onChange={setPage} />
        </>
      )}

      <style>{`@keyframes rc-spin { to { transform: rotate(360deg); } }`}</style>
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
      <div className="dash-card-value" style={{ color, fontSize: 22 }}>
        {value ?? "—"}
      </div>
      {sub && <div className="dash-card-sub">{sub}</div>}
    </div>
  );
}

// Tiny 3-bar sparkline: [2 days ago, yesterday, today]. Pure CSS, zero deps.
function TrendBars({ counts, max }) {
  const safeMax = Math.max(1, max);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 22 }} title={`${counts[0]} · ${counts[1]} · ${counts[2]}`}>
      {counts.map((c, i) => {
        const h = c === 0 ? 2 : Math.max(3, Math.round((c / safeMax) * 20));
        const isToday = i === 2;
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 2,
              background: isToday && c > 0 ? "var(--accent)" : "var(--surface-4)",
              transition: "height var(--transition)",
            }}
          />
        );
      })}
    </div>
  );
}

// ─── AUTO REFRESH HOOK (local, tiny — pauses when tab hidden) ───────────────
// Mirrors AdminDashboard.jsx's implementation exactly for consistency.
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
