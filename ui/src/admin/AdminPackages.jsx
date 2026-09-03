/**
 * admin/AdminPackages.jsx — RENOCORP Subscription Tier Management  v1.0
 * ==========================================================================
 * Owns the package/tier catalog (Free/Pro/Elite-style subscription plans)
 * and the subscription log of every user who has ever bought one.
 *
 * Data sources:
 *   GET   /api/admin/packages             → AdminPackageListResponse
 *                                            { packages, total, active_count, inactive_count }
 *   GET   /api/admin/packages/stats       → AdminPackageStats
 *                                            { total_active_subscribers, total_subscribers_all_time,
 *                                              revenue_today_usd, revenue_7d_usd, revenue_all_time_usd,
 *                                              subscribers_by_tier, revenue_by_tier,
 *                                              expiring_soon_count, computed_at }
 *   GET   /api/admin/packages/subscriptions?status=&page=&page_size=
 *                                          → AdminUserSubscriptionPage
 *                                            { records, total, page, page_size, total_pages,
 *                                              active_count, expired_count }
 *   POST  /api/admin/packages             → create (AdminCreatePackageRequest) → Package
 *   PATCH /api/admin/packages/{id}        → update (AdminUpdatePackageRequest) → Package
 *   POST  /api/admin/packages/subscriptions/{id}/cancel → (CancelSubscriptionRequest) → UserPackage
 *
 * Contract notes (from modules/packages/{routes,models,service}.py — not the
 * original blueprint, which pointed several of these at the wrong prefix):
 *  · The catalog CRUD lives under /api/admin/packages, mounted by packages
 *    module's own `admin_router` — NOT under /api/packages. api.js's
 *    previous `admin.subscriptions`/`admin.cancelUserSub` entries pointed at
 *    `${URLS.PACKAGES}/subscriptions` (i.e. /api/packages/subscriptions),
 *    which doesn't exist on the backend. Fixed alongside this file — see
 *    the new `api.admin.packages.*` namespace.
 *  · `slug` and `tier_level` are set once at creation and are NOT part of
 *    AdminUpdatePackageRequest — the backend has no way to change them
 *    after the fact. The edit form shows both read-only; changing tier
 *    requires creating a new package and deactivating the old one.
 *  · Existing active subscribers keep the price/limits they subscribed
 *    under (snapshotted onto UserPackage at purchase time) — editing a
 *    package's price or limits only affects *future* subscribers.
 *  · `task_limit: 0` means unlimited; `withdraw_threshold_usd: 0` means no
 *    minimum. Both are surfaced in the form with that explicit hint so an
 *    admin doesn't accidentally set "0" thinking it means "none allowed".
 *  · `features` is a flat list[str] server-side; edited here as one
 *    feature per line and split/trimmed on submit.
 *  · Cancelling a subscription reverts the user to Free immediately and
 *    fires a notification (packages/service.py `admin_cancel`) — the
 *    reason field is optional on the backend but always shown here since
 *    it lands in the user-facing notification and the audit trail.
 *  · Prices are genuine USD — shown with `$`, not formatUGX().
 *
 * Only uses CSS classes already merged into styles.js — identical
 * convention to AdminUsers.jsx / AdminOfferwall.jsx / AdminInvitations.jsx.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo, formatDate } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { Badge } from "../components/Badge.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { Modal } from "../components/Modal.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import { TabBar } from "../components/TabBar.jsx";
import {
  LayersIcon,
  RefreshCwIcon,
  PlusIcon,
  PencilIcon,
  UsersIcon,
  TrendingUpIcon,
  ClockIcon,
  InfoIcon,
  DollarSignIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const AUTO_REFRESH_MS = 60_000;
const SUB_PAGE_SIZE    = 20;

const TIER_LEVELS = [
  { value: "free",  label: "Free" },
  { value: "pro",   label: "Pro" },
  { value: "elite", label: "Elite" },
];

const TIER_VARIANT = { free: "grey", pro: "blue", elite: "purple" };

const INTERVALS = [
  { value: "MONTHLY",   label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "ANNUAL",    label: "Annual" },
  { value: "ONE_TIME",  label: "One-time (lifetime)" },
];

const SUB_STATUS_TABS = [
  { key: "",          label: "All" },
  { key: "ACTIVE",    label: "Active" },
  { key: "PENDING",   label: "Pending" },
  { key: "EXPIRED",   label: "Expired" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "FAILED",    label: "Failed" },
];

const MAX_FEATURES     = 20;
const MAX_FEATURE_LEN  = 128;
const MAX_DESC_LEN     = 512;
const MAX_PRICE_USD    = 9_999.99;
const MAX_TASK_LIMIT   = 100_000;

const EMPTY_FORM = {
  name: "",
  slug: "",
  tier_level: "free",
  subscription_price_usd: "0.00",
  interval: "MONTHLY",
  task_limit: "0",
  withdraw_threshold_usd: "0.00",
  features: "",
  description: "",
  sort_order: "0",
  active: true,
};

// ─── FORMATTERS ───────────────────────────────────────────────────────────
function usd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

async function fetchOverview() {
  const [stats, list] = await Promise.all([
    api.admin.packages.stats(),
    api.admin.packages.list(),
  ]);
  return { stats, list };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminPackages() {
  // ── Overview: stats + catalog (loaded together, refreshed together) ─────
  const {
    data: overview,
    loading: overviewLoading,
    isRefetching: overviewRefetching,
    error: overviewError,
    reload: reloadOverview,
  } = useApi(fetchOverview, []);

  const [packages, setPackages] = useState([]);
  const lastGoodRef = useRef([]);

  useEffect(() => {
    if (overview?.list?.packages) {
      const sorted = [...overview.list.packages].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
      );
      setPackages(sorted);
      lastGoodRef.current = sorted;
    }
  }, [overview]);

  const stats = overview?.stats;

  // ── Subscriptions log (independently paginated/filtered) ────────────────
  const [subStatus, setSubStatus] = useState("");
  const [subPage, setSubPage]     = useState(1);
  useEffect(() => { setSubPage(1); }, [subStatus]);

  const {
    data: subData,
    loading: subLoading,
    isRefetching: subRefetching,
    error: subError,
    reload: reloadSubs,
  } = useApi(
    () => api.admin.packages.subscriptions({ status: subStatus || undefined, page: subPage, page_size: SUB_PAGE_SIZE }),
    [subStatus, subPage]
  );

  // ── Row-level transient state ────────────────────────────────────────────
  const [togglePending, setTogglePending] = useState(() => new Set());
  const [rowError, setRowError]           = useState(null);

  // ── Create / Edit modal ──────────────────────────────────────────────────
  const [formOpen, setFormOpen]     = useState(false);
  const [formMode, setFormMode]     = useState("create"); // "create" | "edit"
  const [editTarget, setEditTarget] = useState(null);
  const [formError, setFormError]   = useState(null);
  const [formSaving, setFormSaving] = useState(false);

  // ── Cancel subscription modal ────────────────────────────────────────────
  const [cancelTarget, setCancelTarget]   = useState(null);
  const [cancelReason, setCancelReason]   = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError]     = useState(null);

  useAutoRefresh(AUTO_REFRESH_MS, () => { reloadOverview(); reloadSubs(); });

  const handleRefresh = useCallback(() => {
    setRowError(null);
    reloadOverview();
    reloadSubs();
  }, [reloadOverview, reloadSubs]);

  const setRowPending = useCallback((id, isPending) => {
    setTogglePending((prev) => {
      const next = new Set(prev);
      isPending ? next.add(id) : next.delete(id);
      return next;
    });
  }, []);

  // ── Quick toggle: active/inactive (optimistic) ───────────────────────────
  const handleToggleActive = useCallback(async (pkg) => {
    const nextActive = !pkg.active;
    setRowError(null);
    setRowPending(pkg.id, true);
    setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, active: nextActive } : p)));
    try {
      await api.admin.packages.update(pkg.id, { active: nextActive });
    } catch (err) {
      setPackages((prev) => prev.map((p) => (p.id === pkg.id ? lastGoodRef.current.find((g) => g.id === pkg.id) ?? p : p)));
      setRowError(`Couldn't ${nextActive ? "activate" : "deactivate"} ${pkg.name}: ${err?.message ?? "request failed"}`);
    } finally {
      setRowPending(pkg.id, false);
    }
  }, [setRowPending]);

  // ── Open form ─────────────────────────────────────────────────────────────
  const openCreate = useCallback(() => {
    setFormMode("create");
    setEditTarget(null);
    setFormError(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((pkg) => {
    setFormMode("edit");
    setEditTarget(pkg);
    setFormError(null);
    setFormOpen(true);
  }, []);

  // ── Submit create/edit ───────────────────────────────────────────────────
  const handleFormSubmit = useCallback(async (values) => {
    setFormSaving(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        const body = {
          name: values.name.trim(),
          slug: values.slug.trim(),
          tier_level: values.tier_level,
          subscription_price_usd: round2(values.subscription_price_usd),
          interval: values.interval,
          task_limit: Math.round(Number(values.task_limit)),
          withdraw_threshold_usd: round2(values.withdraw_threshold_usd),
          features: values.featuresList,
          description: values.description.trim() || null,
          sort_order: Math.round(Number(values.sort_order) || 0),
          active: values.active,
        };
        await api.admin.packages.create(body);
      } else {
        const body = {
          name: values.name.trim(),
          subscription_price_usd: round2(values.subscription_price_usd),
          interval: values.interval,
          task_limit: Math.round(Number(values.task_limit)),
          withdraw_threshold_usd: round2(values.withdraw_threshold_usd),
          features: values.featuresList,
          description: values.description.trim() || null,
          sort_order: Math.round(Number(values.sort_order) || 0),
          active: values.active,
        };
        await api.admin.packages.update(editTarget.id, body);
      }
      setFormOpen(false);
      reloadOverview();
    } catch (err) {
      setFormError(err?.message ?? "Couldn't save this package. Check the fields and try again.");
    } finally {
      setFormSaving(false);
    }
  }, [formMode, editTarget, reloadOverview]);

  // ── Cancel a user's subscription ─────────────────────────────────────────
  const handleCancelSubmit = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await api.admin.packages.cancelUserSub(cancelTarget.id, { reason: cancelReason.trim() || undefined });
      setCancelTarget(null);
      setCancelReason("");
      reloadSubs();
    } catch (err) {
      setCancelError(err?.message ?? "Couldn't cancel this subscription.");
    } finally {
      setCancelSubmitting(false);
    }
  }, [cancelTarget, cancelReason, reloadSubs]);

  const isBusy = overviewLoading && !overview;
  const subRows = subData?.records ?? [];
  const tierEntries = useMemo(() => Object.entries(stats?.subscribers_by_tier ?? {}), [stats]);

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LayersIcon size={18} strokeWidth={2.2} style={{ color: "var(--purple)" }} aria-hidden="true" />
            Packages & Subscriptions
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {stats?.computed_at
              ? `Updated ${new Date(stats.computed_at * 1000).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}`
              : "Loading subscription data…"}
            {overviewRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={handleRefresh} disabled={isBusy} aria-label="Refresh" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={overviewRefetching ? { animation: "rc-pkg-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {/* ── Scope notice ── */}
      <div className="rc-alert rc-alert-info" style={{ marginTop: 12, alignItems: "flex-start" }} role="note">
        <InfoIcon size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
        <span style={{ flex: 1 }}>
          Editing a package's price or limits only affects future subscribers — existing
          subscribers keep the terms they signed up under.
        </span>
      </div>

      {overviewError && <Alert type="error" message={`Couldn't load package data: ${overviewError}`} onDismiss={reloadOverview} style={{ marginTop: 12 }} />}
      {rowError && <Alert type="error" message={rowError} onDismiss={() => setRowError(null)} style={{ marginTop: 12 }} />}

      {/* ── KPIs ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <>
          <div className="admin-stat-grid" style={{ marginTop: 16 }}>
            <MiniStat icon={<UsersIcon size={13} strokeWidth={2} />} label="Active Subscribers" value={stats?.total_active_subscribers ?? 0} sub={`${stats?.total_subscribers_all_time ?? 0} all-time`} />
            <MiniStat icon={<DollarSignIcon size={13} strokeWidth={2} />} label="Revenue Today" value={usd(stats?.revenue_today_usd)} />
            <MiniStat icon={<TrendingUpIcon size={13} strokeWidth={2} />} label="Revenue 7D" value={usd(stats?.revenue_7d_usd)} sub={`${usd(stats?.revenue_all_time_usd)} all-time`} />
            <MiniStat icon={<ClockIcon size={13} strokeWidth={2} />} label="Expiring Soon" value={stats?.expiring_soon_count ?? 0} tone={stats?.expiring_soon_count > 0 ? "warning" : "accent"} sub="next 7 days" />
          </div>

          {tierEntries.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {tierEntries.map(([tier, count]) => (
                <div key={tier} className="dash-card" style={{ flex: "1 1 140px", padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Badge variant={TIER_VARIANT[tier] ?? "grey"}>{tier}</Badge>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700 }}>{count}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 4 }}>
                    {usd(stats?.revenue_by_tier?.[tier])} revenue
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Package tiers ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>Package tiers</h3>
        <button className="link-btn" onClick={openCreate}>
          <PlusIcon size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          New package
        </button>
      </div>

      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} height={72} />)}
        </div>
      ) : packages.length === 0 ? (
        <EmptyState icon="📦" title="No packages yet" message="Create your first subscription tier to get started." action={{ label: "New package", onClick: openCreate }} />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Tier</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Task limit</th>
                <th style={{ textAlign: "right" }}>Withdraw min</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>{p.slug}</div>
                  </td>
                  <td><Badge variant={TIER_VARIANT[p.tier_level] ?? "grey"}>{p.tier_level}</Badge></td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    {p.is_free ? "Free" : usd(p.subscription_price_usd)}
                    {!p.is_free && <div style={{ fontSize: 9.5, color: "var(--text-dim)" }}>{p.interval}</div>}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {p.task_limit === 0 ? "Unlimited" : p.task_limit.toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                    {p.withdraw_threshold_usd === 0 ? "None" : usd(p.withdraw_threshold_usd)}
                  </td>
                  <td>
                    <button
                      role="switch"
                      aria-checked={p.active}
                      aria-label={`Toggle ${p.name} active`}
                      disabled={togglePending.has(p.id)}
                      onClick={() => handleToggleActive(p)}
                      className={`rc-switch ${p.active ? "rc-switch-on" : ""}`}
                      title={p.active ? "Deactivate (hide from users)" : "Activate (show to users)"}
                    >
                      <span className="rc-switch-thumb" />
                    </button>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-icon" onClick={() => openEdit(p)} aria-label={`Edit ${p.name}`} title="Edit">
                      <PencilIcon size={14} strokeWidth={2} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Subscriptions log ── */}
      <div className="dash-section-header" style={{ marginTop: 24 }}>
        <h3>Subscription log</h3>
      </div>

      <div style={{ marginBottom: 12 }}>
        <TabBar tabs={SUB_STATUS_TABS} active={subStatus} onChange={setSubStatus} />
      </div>

      {subError && <Alert type="error" message={`Couldn't load subscriptions: ${subError}`} onDismiss={reloadSubs} style={{ marginBottom: 12 }} />}

      {(subLoading && !subData) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} height={54} />)}
        </div>
      ) : subRows.length === 0 ? (
        <EmptyState icon="🗂️" title="No subscriptions in this view" message="Try a different status filter." />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Package</th>
                  <th style={{ textAlign: "right" }}>Paid</th>
                  <th>Status</th>
                  <th>Subscribed</th>
                  <th>Expires</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subRows.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--text-muted)" }}>{s.user_id}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{s.package_name}</div>
                      <Badge variant={TIER_VARIANT[s.tier_level] ?? "grey"} style={{ marginTop: 2 }}>{s.tier_level}</Badge>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>{usd(s.price_paid_usd)}</td>
                    <td><Badge status={s.status?.toLowerCase()}>{s.status_label ?? s.status}</Badge></td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }} title={formatDate(s.subscribed_at * 1000)}>
                      {timeAgo(s.subscribed_at * 1000)}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {s.expires_at == null
                        ? "Lifetime"
                        : s.is_active
                          ? `${s.days_remaining ?? 0}d left`
                          : formatDate(s.expires_at * 1000)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {s.is_active && (
                        <button className="link-btn" style={{ color: "var(--danger)", fontSize: 11 }} onClick={() => { setCancelTarget(s); setCancelReason(""); setCancelError(null); }}>
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            Showing {subRows.length} of {subData?.total ?? subRows.length}
            {subRefetching && " · refreshing…"}
          </div>

          <PaginationBar page={subPage} total={subData?.total ?? 0} limit={SUB_PAGE_SIZE} onChange={setSubPage} />
        </>
      )}

      {/* ── Create/Edit modal ── */}
      <PackageFormModal
        open={formOpen}
        mode={formMode}
        initial={editTarget}
        error={formError}
        saving={formSaving}
        onClose={() => !formSaving && setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* ── Cancel subscription modal ── */}
      <Modal open={!!cancelTarget} onClose={!cancelSubmitting ? () => setCancelTarget(null) : undefined} title="Cancel Subscription">
        {cancelTarget && (
          <>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 14 }}>
              {cancelTarget.package_name} will be cancelled immediately for this user. Their tier reverts to Free
              and they'll receive a notification.
            </p>
            {cancelError && <Alert type="error" message={cancelError} onDismiss={() => setCancelError(null)} style={{ marginBottom: 12 }} />}
            <label className="rc-label" htmlFor="cancel-reason">Reason (optional, shown to user)</label>
            <textarea
              id="cancel-reason"
              className="rc-input"
              rows={2}
              style={{ resize: "vertical", minHeight: 44 }}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={512}
              placeholder="e.g. Refund requested"
            />
            <div className="rc-confirm-actions" style={{ marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => setCancelTarget(null)} disabled={cancelSubmitting}>Keep subscription</button>
              <button
                className="btn-primary"
                onClick={handleCancelSubmit}
                disabled={cancelSubmitting}
                style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)", color: "var(--danger)" }}
              >
                {cancelSubmitting ? <Spinner size="sm" /> : "Cancel subscription"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <style>{`@keyframes rc-pkg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── PACKAGE CREATE/EDIT FORM ────────────────────────────────────────────────

function PackageFormModal({ open, mode, initial, error, saving, onClose, onSubmit }) {
  const [values, setValues]           = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setValues({
        name: initial.name ?? "",
        slug: initial.slug ?? "",
        tier_level: initial.tier_level ?? "free",
        subscription_price_usd: String(initial.subscription_price_usd ?? 0),
        interval: initial.interval ?? "MONTHLY",
        task_limit: String(initial.task_limit ?? 0),
        withdraw_threshold_usd: String(initial.withdraw_threshold_usd ?? 0),
        features: (initial.features ?? []).join("\n"),
        description: initial.description ?? "",
        sort_order: String(initial.sort_order ?? 0),
        active: initial.active ?? true,
      });
    } else {
      setValues(EMPTY_FORM);
    }
    setSlugTouched(false);
    setValidationError(null);
  }, [open, mode, initial]);

  const handleNameChange = (name) => {
    setValues((v) => ({ ...v, name, slug: slugTouched || mode === "edit" ? v.slug : slugify(name) }));
  };

  const handleSubmit = () => {
    const name = values.name.trim();
    const slug = values.slug.trim();
    const price = Number(values.subscription_price_usd);
    const taskLimit = Number(values.task_limit);
    const threshold = Number(values.withdraw_threshold_usd);
    const featuresList = values.features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean);

    if (!name) return setValidationError("Package name is required.");
    if (mode === "create") {
      if (!slug || !/^[a-z0-9-]+$/.test(slug)) return setValidationError("Slug must be lowercase letters, numbers, and hyphens only.");
    }
    if (isNaN(price) || price < 0 || price > MAX_PRICE_USD) return setValidationError(`Price must be between $0 and $${MAX_PRICE_USD}.`);
    if (isNaN(taskLimit) || taskLimit < 0 || taskLimit > MAX_TASK_LIMIT) return setValidationError(`Task limit must be between 0 and ${MAX_TASK_LIMIT.toLocaleString()}.`);
    if (isNaN(threshold) || threshold < 0 || threshold > MAX_PRICE_USD) return setValidationError(`Withdraw threshold must be between $0 and $${MAX_PRICE_USD}.`);
    if (featuresList.length > MAX_FEATURES) return setValidationError(`Maximum ${MAX_FEATURES} features.`);
    const tooLong = featuresList.find((f) => f.length > MAX_FEATURE_LEN);
    if (tooLong) return setValidationError(`Feature too long (max ${MAX_FEATURE_LEN} chars): "${tooLong.slice(0, 30)}…"`);
    if (values.description.trim().length > MAX_DESC_LEN) return setValidationError(`Description must be ${MAX_DESC_LEN} characters or fewer.`);

    setValidationError(null);
    onSubmit({ ...values, name, slug, featuresList, subscription_price_usd: price, task_limit: taskLimit, withdraw_threshold_usd: threshold });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? "New Package" : `Edit ${initial?.name ?? "Package"}`}>
      {(error || validationError) && (
        <Alert type="error" message={error ?? validationError} onDismiss={() => setValidationError(null)} style={{ marginBottom: 14 }} />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="rc-label" htmlFor="pkg-name">Name</label>
          <input id="pkg-name" className="rc-input" type="text" value={values.name} onChange={(e) => handleNameChange(e.target.value)} maxLength={64} placeholder="Pro" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="rc-label" htmlFor="pkg-slug">Slug {mode === "edit" && <span style={{ color: "var(--text-dim)" }}>(locked)</span>}</label>
            <input
              id="pkg-slug"
              className="rc-input"
              type="text"
              value={values.slug}
              disabled={mode === "edit"}
              onChange={(e) => { setSlugTouched(true); setValues((v) => ({ ...v, slug: e.target.value })); }}
              maxLength={32}
              placeholder="pro"
            />
          </div>
          <div>
            <label className="rc-label" htmlFor="pkg-tier">Tier {mode === "edit" && <span style={{ color: "var(--text-dim)" }}>(locked)</span>}</label>
            <select
              id="pkg-tier"
              className="rc-select"
              value={values.tier_level}
              disabled={mode === "edit"}
              onChange={(e) => setValues((v) => ({ ...v, tier_level: e.target.value }))}
              style={{ width: "100%" }}
            >
              {TIER_LEVELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="rc-label" htmlFor="pkg-price">Price (USD)</label>
            <input id="pkg-price" className="rc-input" type="number" min={0} max={MAX_PRICE_USD} step="0.01" value={values.subscription_price_usd} onChange={(e) => setValues((v) => ({ ...v, subscription_price_usd: e.target.value }))} />
          </div>
          <div>
            <label className="rc-label" htmlFor="pkg-interval">Billing interval</label>
            <select id="pkg-interval" className="rc-select" value={values.interval} onChange={(e) => setValues((v) => ({ ...v, interval: e.target.value }))} style={{ width: "100%" }}>
              {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="rc-label" htmlFor="pkg-tasklimit">Task limit / day</label>
            <input id="pkg-tasklimit" className="rc-input" type="number" min={0} max={MAX_TASK_LIMIT} value={values.task_limit} onChange={(e) => setValues((v) => ({ ...v, task_limit: e.target.value }))} />
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>0 = unlimited</div>
          </div>
          <div>
            <label className="rc-label" htmlFor="pkg-threshold">Withdraw minimum (USD)</label>
            <input id="pkg-threshold" className="rc-input" type="number" min={0} max={MAX_PRICE_USD} step="0.01" value={values.withdraw_threshold_usd} onChange={(e) => setValues((v) => ({ ...v, withdraw_threshold_usd: e.target.value }))} />
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 3 }}>0 = no minimum</div>
          </div>
        </div>

        <div>
          <label className="rc-label" htmlFor="pkg-features">Features (one per line, up to {MAX_FEATURES})</label>
          <textarea
            id="pkg-features"
            className="rc-input"
            rows={4}
            style={{ resize: "vertical", minHeight: 80 }}
            value={values.features}
            onChange={(e) => setValues((v) => ({ ...v, features: e.target.value }))}
            placeholder={"Unlimited surveys\nPriority task access\nInstant withdrawals"}
          />
        </div>

        <div>
          <label className="rc-label" htmlFor="pkg-desc">Description (optional)</label>
          <textarea
            id="pkg-desc"
            className="rc-input"
            rows={2}
            style={{ resize: "vertical", minHeight: 50 }}
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            maxLength={MAX_DESC_LEN}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
          <div>
            <label className="rc-label" htmlFor="pkg-sort">Sort order</label>
            <input id="pkg-sort" className="rc-input" type="number" min={0} value={values.sort_order} onChange={(e) => setValues((v) => ({ ...v, sort_order: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Visible to users</span>
            <button
              role="switch"
              aria-checked={values.active}
              aria-label="Toggle visible to users"
              onClick={() => setValues((v) => ({ ...v, active: !v.active }))}
              className={`rc-switch ${values.active ? "rc-switch-on" : ""}`}
            >
              <span className="rc-switch-thumb" />
            </button>
          </div>
        </div>

        <div className="rc-confirm-actions" style={{ marginTop: 4 }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <Spinner size="sm" /> : mode === "create" ? "Create package" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function SkeletonBlock({ height = 76 }) {
  return <div className="rc-skeleton" style={{ height, borderRadius: "var(--radius-lg)" }} />;
}

function MiniStat({ icon, label, value, sub, tone }) {
  const color =
    tone === "danger"  ? "var(--danger)" :
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
