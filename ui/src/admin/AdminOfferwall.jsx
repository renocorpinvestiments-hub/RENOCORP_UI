/**
 * admin/AdminOfferwall.jsx — RENOCORP Offerwall Provider Control  v1.0
 * ==========================================================================
 * Live control surface for the offerwall provider registry (CPX Research,
 * Monlix, AdGate, Lootably, Torox, BitLabs). One toggle here changes what
 * every user sees in the Earn/Tasks feed within seconds.
 *
 * Data source (single round trip):
 *   GET /api/offerwall/admin/stats
 *   → OfferwallAdminStats {
 *       total_providers, enabled_providers, disabled_providers,
 *       degraded_providers, total_tasks_today, total_completions_today,
 *       total_payout_today_usd, generated_at,
 *       providers: ProviderHealthSnapshot[] {
 *         provider, display_name, status (ENABLED|DISABLED|DEGRADED|ERROR|UNKNOWN),
 *         enabled, tasks_available, tasks_completed_today, last_synced_at,
 *         last_fetch_latency_ms, circuit_state (CLOSED|HALF_OPEN|OPEN),
 *         last_error, priority
 *       }
 *     }
 * The per-provider list ships embedded in the stats payload, so this screen
 * never has to fan out to /admin/providers separately — one fetch hydrates
 * the whole page. That's the entire "fast" story: no waterfalls.
 *
 * Mutations:
 *   POST /api/offerwall/admin/providers/{name}/toggle  { enabled }
 *     → ToggleProviderResponse { provider, enabled, previous_state, message }
 *     Applied optimistically in local state, rolled back on failure.
 *   POST /api/offerwall/admin/providers/{name}/test
 *     → { provider, success, latency_ms, tasks_found, error }
 *     Fire-and-inspect — fetches one live task from the provider to verify
 *     credentials/connectivity without touching enabled state.
 *
 * Contract notes:
 *  · These endpoints read/write the `provider_config` table — the same
 *    table modules/offerwall/service.py consults when building the live
 *    feed and when it emits `admin.provider_toggled`. This is why this
 *    screen is wired to /api/offerwall/admin/* and NOT to the older
 *    /api/admin/offerwalls surface in modules/admin/ — that one targets a
 *    separate `offerwall_providers` table and can drift out of sync with
 *    what the feed actually serves. If that legacy table is ever retired,
 *    only this file needs to keep working.
 *  · Toggling OFF is treated as the "dangerous" direction (revenue channel
 *    disappears from every user's feed instantly) and requires a confirm
 *    step. Toggling ON is reversible and instant.
 *  · There is no force-sync endpoint on this surface — "Test" (one live
 *    fetch) is the closest equivalent and is intentionally scoped to
 *    verification, not cache-busting.
 *  · last_synced_at is unix epoch seconds, UTC.
 *
 * Only uses CSS classes already merged into styles.js — identical
 * convention to AdminDashboard.jsx / AdminUsers.jsx / AdminWithdrawals.jsx.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { Badge } from "../components/Badge.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  ServerIcon,
  RefreshCwIcon,
  InfoIcon,
  ActivityIcon,
  ZapIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  PlugIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 45_000;

// Maps ProviderStatus (backend enum) → Badge variant + tone
const STATUS_VARIANT = {
  ENABLED:  "green",
  DISABLED: "grey",
  DEGRADED: "orange",
  ERROR:    "red",
  UNKNOWN:  "blue",
};

// Maps circuit_state → color token
const CIRCUIT_TONE = {
  CLOSED:    "accent",   // healthy — requests flowing normally
  HALF_OPEN: "warning",  // probing after a trip — watch closely
  OPEN:      "danger",   // tripped — provider calls are being short-circuited
};

// ─── FORMATTERS ───────────────────────────────────────────────────────────
function usd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ms(value) {
  if (value == null) return "—";
  return value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(2)}s`;
}

function toneColor(tone) {
  if (tone === "danger")  return "var(--danger)";
  if (tone === "warning") return "var(--warning)";
  if (tone === "accent")  return "var(--accent)";
  return "var(--text)";
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminOfferwall() {
  // Server data (single call — providers ship embedded in stats)
  const {
    data: stats,
    loading,
    isRefetching,
    error,
    reload,
  } = useApi(() => api.offerwall.admin.stats(), []);

  // Local, optimistically-mutable copy of the provider list
  const [providers, setProviders] = useState([]);
  const lastGoodRef = useRef([]);

  useEffect(() => {
    if (stats?.providers) {
      const sorted = [...stats.providers].sort(
        (a, b) => (a.priority ?? 100) - (b.priority ?? 100) || a.display_name.localeCompare(b.display_name)
      );
      setProviders(sorted);
      lastGoodRef.current = sorted;
    }
  }, [stats]);

  // Per-row transient state: toggling in-flight, test results, toggle errors
  const [pending, setPending]         = useState(() => new Set());
  const [testResults, setTestResults] = useState({});   // { [name]: { loading, success, latency_ms, tasks_found, error, testedAt } }
  const [toggleError, setToggleError] = useState(null);

  // Confirm-disable flow
  const [confirmTarget, setConfirmTarget] = useState(null); // provider object pending disable confirm

  useAutoRefresh(AUTO_REFRESH_MS, reload);

  const handleRefresh = useCallback(() => {
    setToggleError(null);
    reload();
  }, [reload]);

  const setRowPending = useCallback((name, isPending) => {
    setPending((prev) => {
      const next = new Set(prev);
      isPending ? next.add(name) : next.delete(name);
      return next;
    });
  }, []);

  // ── Toggle (enable is instant; disable requires confirm) ────────────────
  const applyToggle = useCallback(async (provider) => {
    const { provider: name, enabled } = provider;
    const nextEnabled = !enabled;

    setToggleError(null);
    setRowPending(name, true);

    // Optimistic flip
    setProviders((prev) =>
      prev.map((p) => (p.provider === name ? { ...p, enabled: nextEnabled, status: nextEnabled ? "ENABLED" : "DISABLED" } : p))
    );

    try {
      const res = await api.offerwall.admin.toggle(name, nextEnabled);
      // Reconcile with server truth (message/previous_state confirm the write landed)
      setProviders((prev) =>
        prev.map((p) => (p.provider === name ? { ...p, enabled: res?.enabled ?? nextEnabled } : p))
      );
    } catch (err) {
      // Roll back to last known-good snapshot for this row
      setProviders((prev) =>
        prev.map((p) => (p.provider === name ? lastGoodRef.current.find((g) => g.provider === name) ?? p : p))
      );
      setToggleError(`Couldn't ${nextEnabled ? "enable" : "disable"} ${provider.display_name}: ${err?.message ?? "request failed"}`);
    } finally {
      setRowPending(name, false);
    }
  }, [setRowPending]);

  const handleToggleClick = useCallback((provider) => {
    if (provider.enabled) {
      // Turning OFF removes a revenue channel from every user's feed instantly — confirm.
      setConfirmTarget(provider);
    } else {
      applyToggle(provider);
    }
  }, [applyToggle]);

  const handleConfirmDisable = useCallback(async () => {
    if (!confirmTarget) return;
    const target = confirmTarget;
    setConfirmTarget(null);
    await applyToggle(target);
  }, [confirmTarget, applyToggle]);

  // ── Test connectivity ────────────────────────────────────────────────────
  const handleTest = useCallback(async (provider) => {
    const name = provider.provider;
    setTestResults((prev) => ({ ...prev, [name]: { loading: true } }));
    try {
      const res = await api.offerwall.admin.test(name);
      setTestResults((prev) => ({
        ...prev,
        [name]: { loading: false, ...res, testedAt: Date.now() },
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [name]: { loading: false, success: false, error: err?.message ?? "Test failed", testedAt: Date.now() },
      }));
    }
  }, []);

  const isBusy = loading && !stats;

  const kpis = useMemo(() => ({
    total:       stats?.total_providers ?? providers.length,
    enabled:     stats?.enabled_providers ?? providers.filter((p) => p.enabled).length,
    disabled:    stats?.disabled_providers ?? providers.filter((p) => !p.enabled).length,
    degraded:    stats?.degraded_providers ?? 0,
    completions: stats?.total_completions_today ?? 0,
    payout:      stats?.total_payout_today_usd ?? 0,
  }), [stats, providers]);

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ServerIcon size={18} strokeWidth={2.2} style={{ color: "var(--info)" }} aria-hidden="true" />
            Offerwall Providers
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {stats?.generated_at
              ? `Updated ${new Date(stats.generated_at * 1000).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading provider health…"}
            {isRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={handleRefresh} disabled={isBusy} aria-label="Refresh" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={isRefetching ? { animation: "rc-ow-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {/* ── Scope notice ── */}
      <div className="rc-alert rc-alert-info" style={{ marginTop: 12, alignItems: "flex-start" }} role="note">
        <InfoIcon size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          Toggling a provider here takes effect immediately — the feed cache is invalidated
          on write, so users see the change on their next Earn page load, typically within seconds.
        </span>
      </div>

      {error && <Alert type="error" message={`Couldn't load offerwall stats: ${error}`} onDismiss={reload} style={{ marginTop: 12 }} />}
      {toggleError && <Alert type="error" message={toggleError} onDismiss={() => setToggleError(null)} style={{ marginTop: 12 }} />}

      {/* ── KPIs ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          <MiniStat
            icon={<PlugIcon size={13} strokeWidth={2} />}
            label="Providers"
            value={kpis.total}
            sub={`${kpis.enabled} enabled · ${kpis.disabled} disabled`}
          />
          <MiniStat
            icon={<AlertTriangleIcon size={13} strokeWidth={2} />}
            label="Degraded"
            value={kpis.degraded}
            tone={kpis.degraded > 0 ? "warning" : "accent"}
            sub={kpis.degraded > 0 ? "circuit breaker tripped" : "all circuits closed"}
          />
          <MiniStat
            icon={<ActivityIcon size={13} strokeWidth={2} />}
            label="Completions Today"
            value={kpis.completions.toLocaleString?.() ?? kpis.completions}
          />
          <MiniStat
            icon={<ZapIcon size={13} strokeWidth={2} />}
            label="Payout Today"
            value={usd(kpis.payout)}
          />
        </div>
      )}

      {/* ── Provider table ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>Registered providers</h3>
      </div>

      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} height={64} />)}
        </div>
      ) : providers.length === 0 ? (
        <EmptyState
          icon="🔌"
          title="No providers registered"
          message="Provider configs are seeded on offerwall module startup. Check backend logs if this is unexpected."
          action={{ label: "Refresh", onClick: handleRefresh }}
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Circuit</th>
                <th style={{ textAlign: "right" }}>Available</th>
                <th style={{ textAlign: "right" }}>Today</th>
                <th>Last Synced</th>
                <th>Latency</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <ProviderRow
                  key={p.provider}
                  provider={p}
                  isPending={pending.has(p.provider)}
                  testResult={testResults[p.provider]}
                  onToggle={() => handleToggleClick(p)}
                  onTest={() => handleTest(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        onConfirm={handleConfirmDisable}
        title="Disable Provider"
        description={
          confirmTarget
            ? `${confirmTarget.display_name} will disappear from every user's task feed immediately. In-flight completions already recorded are unaffected — only new task discovery stops.`
            : ""
        }
        confirmLabel="Disable"
        danger
        loading={confirmTarget ? pending.has(confirmTarget.provider) : false}
      />

      <style>{`@keyframes rc-ow-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function ProviderRow({ provider, isPending, testResult, onToggle, onTest }) {
  const p = provider;
  const circuitTone = CIRCUIT_TONE[p.circuit_state] ?? undefined;

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.display_name}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>{p.provider}</div>
      </td>
      <td>
        <Badge variant={STATUS_VARIANT[p.status] ?? "grey"}>{p.status}</Badge>
        {p.last_error && (
          <div style={{ fontSize: 9.5, color: "var(--danger)", marginTop: 3, maxWidth: 150 }} title={p.last_error}>
            {p.last_error.length > 48 ? `${p.last_error.slice(0, 48)}…` : p.last_error}
          </div>
        )}
      </td>
      <td>
        <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: toneColor(circuitTone), fontWeight: 600 }}>
          {p.circuit_state ?? "—"}
        </span>
      </td>
      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{p.tasks_available ?? 0}</td>
      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{p.tasks_completed_today ?? 0}</td>
      <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }} title={p.last_synced_at ? formatDateTime(p.last_synced_at * 1000) : ""}>
        {p.last_synced_at ? timeAgo(p.last_synced_at * 1000) : "Never"}
      </td>
      <td style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
        {ms(p.last_fetch_latency_ms)}
      </td>
      <td>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
          {testResult && !testResult.loading && (
            <span
              style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: testResult.success ? "var(--accent)" : "var(--danger)", display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}
              title={testResult.error ?? `${testResult.tasks_found ?? 0} tasks in ${testResult.latency_ms ?? "?"}ms`}
            >
              {testResult.success ? <CheckCircle2Icon size={11} strokeWidth={2} /> : <XCircleIcon size={11} strokeWidth={2} />}
              {testResult.success ? `${testResult.tasks_found ?? 0}·${ms(testResult.latency_ms)}` : "failed"}
            </span>
          )}

          <button
            className="link-btn"
            onClick={onTest}
            disabled={testResult?.loading}
            title="Fetch one live task to verify connectivity"
            style={{ fontSize: 11 }}
          >
            {testResult?.loading ? <Spinner size="sm" /> : "Test"}
          </button>

          <button
            role="switch"
            aria-checked={p.enabled}
            aria-label={`Toggle ${p.display_name}`}
            disabled={isPending}
            onClick={onToggle}
            className={`rc-switch ${p.enabled ? "rc-switch-on" : ""}`}
            title={p.enabled ? "Disable provider" : "Enable provider"}
          >
            <span className="rc-switch-thumb" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function SkeletonBlock({ height = 76 }) {
  return <div className="rc-skeleton" style={{ height, borderRadius: "var(--radius-lg)" }} />;
}

function MiniStat({ icon, label, value, sub, tone }) {
  const color = toneColor(tone);
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
