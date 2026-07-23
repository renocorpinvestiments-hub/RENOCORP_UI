/**
 * admin/AdminEarnings.jsx — RENOCORP Earnings Ledger Audit  v1.0
 * ==========================================================================
 * READ-ONLY cross-user audit of the immutable earnings ledger. The ledger
 * (modules/earnings) is append-only — every credit and debit for every user,
 * ever. This screen is a forensic/reporting view: it does not create,
 * amend, or reverse ledger rows (that only happens via `Adjustment` actions
 * on AdminUsers.jsx, which itself writes ADJUSTMENT / DEBIT_ADJUSTMENT rows
 * back into this same ledger).
 *
 * Data source:
 *   GET /api/admin/earnings?page=&page_size=&user_id=&type_filter=&provider=
 *                            &direction=&from_ts=&to_ts=&sort_order=
 *   → AdminEarningsPage { records: AdminEarningsRecord[], total, page,
 *                          page_size, total_pages }
 *
 * Contract notes (from modules/admin/{routes,models,service}.py and
 * modules/earnings/models.py):
 *  · `type` is one of the EarningType enum values: SURVEY, VIDEO, OFFER,
 *    QUIZ, DOWNLOAD, REFERRAL, BONUS, ADJUSTMENT (credits, amount_usd > 0)
 *    or WITHDRAWAL, DEBIT_ADJUSTMENT (debits, amount_usd < 0). The backend
 *    stores amount_usd already signed — we never re-derive the sign here.
 *  · `direction` query param is server-native: "all" | "credits" | "debits"
 *    (maps to `amount_usd > 0` / `< 0` in the SQL WHERE clause) — used for
 *    both the visible tab AND the summary count probes below.
 *  · `user_id` is an exact-match filter (no free-text email search exists
 *    on this endpoint — same limitation noted in AdminWithdrawals.jsx).
 *  · `provider` is a free-text exact match (offerwall provider slug, e.g.
 *    "cpx_research") — left as a text input since the provider registry is
 *    admin-configurable and not a fixed enum on the frontend.
 *  · `created_at` is unix epoch seconds, UTC.
 *  · There is no dedicated SUM/aggregate endpoint — AdminEarningsPage only
 *    carries `total` (a row COUNT). Rather than mislead with a fabricated
 *    "total volume" figure, the summary strip below shows COUNT-based KPIs
 *    (via cheap page_size=1 probes, identical pattern to
 *    AdminWithdrawals.jsx's probeCount) plus a clearly-labelled "this page"
 *    net total computed only from the rows actually on screen.
 *
 * Only uses CSS classes already merged into styles.js — identical
 * convention to AdminDashboard.jsx / AdminUsers.jsx / AdminWithdrawals.jsx.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { TabBar } from "../components/TabBar.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ScrollTextIcon,
  RefreshCwIcon,
  DownloadIcon,
  InfoIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ScaleIcon,
  HashIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const PAGE_SIZE       = 25;
const AUTO_REFRESH_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 450;

const DIRECTION_TABS = [
  { key: "all",     label: "All" },
  { key: "credits", label: "Credits" },
  { key: "debits",  label: "Debits" },
];

// Mirrors modules/earnings/models.py EarningType — kept as a frontend copy
// since this is a display concern, not a validation one (the backend is
// always the source of truth and will 400 on anything it doesn't recognize).
const TYPE_OPTIONS = [
  { value: "",                 label: "All types" },
  { value: "SURVEY",           label: "Survey Reward" },
  { value: "VIDEO",            label: "Video Reward" },
  { value: "OFFER",            label: "Offer Reward" },
  { value: "QUIZ",             label: "Quiz Reward" },
  { value: "DOWNLOAD",         label: "App Download Reward" },
  { value: "REFERRAL",         label: "Referral Bonus" },
  { value: "BONUS",            label: "Daily Bonus" },
  { value: "ADJUSTMENT",       label: "Admin Credit" },
  { value: "WITHDRAWAL",       label: "Withdrawal" },
  { value: "DEBIT_ADJUSTMENT", label: "Admin Debit" },
];

const TYPE_LABELS = Object.fromEntries(TYPE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]));

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d",     label: "Last 7 days" },
  { value: "30d",    label: "Last 30 days" },
  { value: "all",    label: "All time" },
];

const SORT_OPTIONS = [
  { value: "desc", label: "Newest first" },
  { value: "asc",  label: "Oldest first" },
];

// ─── DATE RANGE HELPER ──────────────────────────────────────────────────────
function rangeToTs(rangeKey, now = new Date()) {
  if (rangeKey === "all") return { fromTs: undefined, toTs: undefined };
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const daysBack = rangeKey === "today" ? 0 : rangeKey === "7d" ? 6 : 29;
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
  const header = ["id", "user_id", "user_email", "type", "amount_usd", "ref_id", "provider", "idempotency_key", "description", "created_at_utc"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.id,
      r.user_id,
      csvEscape(r.user_email ?? ""),
      r.type,
      r.amount_usd,
      csvEscape(r.ref_id ?? ""),
      csvEscape(r.provider ?? ""),
      r.idempotency_key,
      csvEscape(r.description ?? ""),
      r.created_at ? new Date(r.created_at * 1000).toISOString() : "",
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `renocorp-earnings-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Lightweight count-only probe — page_size=1 keeps the payload tiny; we only
// read `.total` from the response, never the row itself. Identical pattern
// to AdminWithdrawals.jsx's probeCount.
async function probeCount({ direction, userId, typeFilter, provider, fromTs, toTs }) {
  const res = await api.admin.earnings({
    page: 1,
    page_size: 1,
    direction,
    user_id: userId || undefined,
    type_filter: typeFilter || undefined,
    provider: provider || undefined,
    from_ts: fromTs,
    to_ts: toTs,
  });
  return res?.total ?? 0;
}

async function fetchSummary({ userId, typeFilter, provider, fromTs, toTs }) {
  const [all, credits, debits] = await Promise.all([
    probeCount({ direction: "all",     userId, typeFilter, provider, fromTs, toTs }),
    probeCount({ direction: "credits", userId, typeFilter, provider, fromTs, toTs }),
    probeCount({ direction: "debits",  userId, typeFilter, provider, fromTs, toTs }),
  ]);
  return { all, credits, debits, fetchedAt: Date.now() };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminEarnings() {
  const [direction, setDirection]     = useState("all");
  const [typeFilter, setTypeFilter]   = useState("");
  const [providerRaw, setProviderRaw] = useState("");
  const [provider, setProvider]       = useState("");
  const [userIdRaw, setUserIdRaw]     = useState("");
  const [userId, setUserId]           = useState("");
  const [rangeKey, setRangeKey]       = useState("7d");
  const [sortOrder, setSortOrder]     = useState("desc");
  const [page, setPage]               = useState(1);

  const { fromTs, toTs } = useMemo(() => rangeToTs(rangeKey), [rangeKey]);

  // Debounce free-text inputs so every keystroke doesn't fire a request.
  useEffect(() => {
    const id = setTimeout(() => setProvider(providerRaw.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [providerRaw]);

  useEffect(() => {
    const id = setTimeout(() => setUserId(userIdRaw.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [userIdRaw]);

  useEffect(() => { setPage(1); }, [direction, typeFilter, provider, userId, rangeKey, sortOrder]);

  // ── Ledger page (server-paginated) ───────────────────────────────────────
  const {
    data: listData,
    loading: listLoading,
    isRefetching: listRefetching,
    error: listError,
    reload: reloadList,
  } = useApi(
    () => api.admin.earnings({
      page,
      page_size: PAGE_SIZE,
      direction,
      type_filter: typeFilter || undefined,
      provider: provider || undefined,
      user_id: userId || undefined,
      from_ts: fromTs,
      to_ts: toTs,
      sort_order: sortOrder,
    }),
    [page, direction, typeFilter, provider, userId, fromTs, toTs, sortOrder]
  );

  // ── Summary counts (independent of the direction tab, follows other filters) ──
  const {
    data: summary,
    loading: summaryLoading,
    reload: reloadSummary,
  } = useApi(
    () => fetchSummary({ userId, typeFilter, provider, fromTs, toTs }),
    [userId, typeFilter, provider, fromTs, toTs]
  );

  useAutoRefresh(AUTO_REFRESH_MS, () => {
    reloadList();
    reloadSummary();
  });

  const handleRefresh = useCallback(() => {
    reloadList();
    reloadSummary();
  }, [reloadList, reloadSummary]);

  const rows = listData?.records ?? [];
  const isBusy = (listLoading && !listData) || (summaryLoading && !summary);

  // "This page" net — explicitly scoped to visible rows only, never implied
  // to be a global total (see header note above on why no SUM endpoint exists).
  const pageNet = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.amount_usd) || 0), 0),
    [rows]
  );

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ScrollTextIcon size={18} strokeWidth={2.2} style={{ color: "var(--info)" }} aria-hidden="true" />
            Earnings Ledger
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {summary?.fetchedAt
              ? `Updated ${new Date(summary.fetchedAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading ledger…"}
            {listRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={handleRefresh} disabled={isBusy} aria-label="Refresh" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={listRefetching ? { animation: "rc-eg-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {/* ── Scope notice ── */}
      <div className="rc-alert rc-alert-info" style={{ marginTop: 12, alignItems: "flex-start" }} role="note">
        <InfoIcon size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          The ledger is append-only — this is a read-only audit trail. To correct a balance,
          use "Adjust balance" on a user's profile in Users; that action writes its own
          ADJUSTMENT / DEBIT_ADJUSTMENT row here rather than editing history.
        </span>
      </div>

      {listError && <Alert type="error" message={`Couldn't load earnings: ${listError}`} onDismiss={reloadList} style={{ marginTop: 12 }} />}

      {/* ── Summary KPIs ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          <MiniStat icon={<HashIcon size={13} strokeWidth={2} />} label="Total Entries" value={(summary?.all ?? 0).toLocaleString("en-US")} sub="matching current filters" />
          <MiniStat icon={<TrendingUpIcon size={13} strokeWidth={2} />} label="Credits" value={(summary?.credits ?? 0).toLocaleString("en-US")} tone="accent" />
          <MiniStat icon={<TrendingDownIcon size={13} strokeWidth={2} />} label="Debits" value={(summary?.debits ?? 0).toLocaleString("en-US")} tone={summary?.debits ? "danger" : undefined} />
          <MiniStat
            icon={<ScaleIcon size={13} strokeWidth={2} />}
            label="Net (this page)"
            value={usd(pageNet)}
            sub={`${rows.length} row${rows.length === 1 ? "" : "s"} shown`}
            tone={pageNet > 0 ? "accent" : pageNet < 0 ? "danger" : undefined}
          />
        </div>
      )}

      {/* ── Controls ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>Ledger entries</h3>
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
        <TabBar tabs={DIRECTION_TABS} active={direction} onChange={setDirection} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <select className="rc-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="rc-select" value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} aria-label="Date range">
          {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="rc-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} aria-label="Sort order">
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          className="rc-select"
          style={{ flex: "1 1 200px", minWidth: 160 }}
          type="text"
          placeholder="User ID (exact match)"
          value={userIdRaw}
          onChange={(e) => setUserIdRaw(e.target.value)}
          aria-label="Filter by user ID"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <input
          className="rc-select"
          style={{ flex: "1 1 200px", minWidth: 160 }}
          type="text"
          placeholder="Provider (e.g. cpx_research)"
          value={providerRaw}
          onChange={(e) => setProviderRaw(e.target.value)}
          aria-label="Filter by provider"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      {/* ── Table ── */}
      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} height={44} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="📒"
          title="No ledger entries in this window"
          message="Try a wider date range or a different type/direction filter."
          action={{ label: "Refresh", onClick: handleRefresh }}
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Type</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Provider / Ref</th>
                  <th>Description</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.user_email ?? "—"}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-dim)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.user_id}>
                        {r.user_id}
                      </div>
                    </td>
                    <td>
                      <TypePill type={r.type} />
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, color: Number(r.amount_usd) < 0 ? "var(--danger)" : "var(--accent)" }}>
                      {Number(r.amount_usd) > 0 ? "+" : ""}{usd(r.amount_usd)}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {r.provider ?? "—"}
                      {r.ref_id && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--text-dim)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.ref_id}>
                          {r.ref_id}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.description ?? ""}>
                      {r.description ?? "—"}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }} title={formatDateTime(r.created_at * 1000)}>
                      {timeAgo(r.created_at * 1000)}
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

      <style>{`@keyframes rc-eg-spin { to { transform: rotate(360deg); } }`}</style>
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

// Small, purpose-built pill for ledger entry types — distinct from the
// generic <Badge status=.../> mapping (which targets lifecycle statuses
// like "pending"/"completed", not ledger transaction types). Credit types
// render green, debit types render red, matching the sign of amount_usd.
const DEBIT_TYPES = new Set(["WITHDRAWAL", "DEBIT_ADJUSTMENT"]);

function TypePill({ type }) {
  const isDebit = DEBIT_TYPES.has(type);
  const label = TYPE_LABELS[type] ?? type ?? "—";
  return (
    <span
      className={`rc-badge ${isDebit ? "rc-badge-red" : "rc-badge-green"}`}
      style={{ whiteSpace: "nowrap" }}
    >
      {label}
    </span>
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
