/**
 * admin/AdminUsers.jsx — RENOCORP Admin User Management  v2.0
 * ==============================================================
 * Paginated, filterable, searchable user directory with per-user
 * account controls (status, tier, admin flag) and manual balance
 * credit/debit — the highest-traffic admin screen.
 *
 * Data source:
 *   GET   /api/admin/users                → AdminUserListPage
 *   PATCH /api/admin/users/{id}            → status / tier / is_admin
 *   POST  /api/admin/users/{id}/credit      → manual balance credit
 *   POST  /api/admin/users/{id}/debit       → manual balance debit
 *
 * Contract notes (pulled directly from modules/admin/{routes,models}.py,
 * not the blueprint, which drifted from the real backend):
 *  · There is NO GET /api/admin/users/{id} detail endpoint on the backend
 *    despite the route-map docstring claiming one exists. Every field the
 *    detail panel needs (balance_usd, tasks_completed, total_earned_usd,
 *    total_withdrawn_usd, etc.) is already present on each AdminUserRecord
 *    returned by the list call — so the modal reads straight from the row
 *    already in memory. No extra round-trip, and nothing 404s.
 *  · membership_tier is one of "free" | "pro" | "elite" (NOT the
 *    blueprint's Ordinary/Elite/Premium naming).
 *  · status is one of "active" | "suspended" | "banned".
 *  · AdminBalanceCreditRequest / AdminBalanceDebitRequest require
 *    amount_usd (0 < amount ≤ 10,000), a reason (1–512 chars), AND an
 *    idempotency_key IN THE BODY (not just the header) — generated once
 *    per attempt and reused on retry, exactly like Withdraw.jsx's pattern.
 *  · reason is required for status changes (server-documented rule);
 *    enforced client-side too so admins get instant feedback.
 *  · All money fields here are genuine USD (`_usd` suffix) — shown with
 *    a `$` prefix, not formatUGX() (see AdminDashboard.jsx for the same
 *    convention, inherited from Dashboard.jsx's PackageCard).
 *
 * Only uses CSS classes already merged into styles.js.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { newIdempotencyKey } from "../utils/idempotency.js";
import { timeAgo, formatDate } from "../utils/timeAgo.js";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { Modal } from "../components/Modal.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import { TabBar } from "../components/TabBar.jsx";
import {
  UsersIcon,
  RefreshCwIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ShieldIcon,
  ShieldCheckIcon,
  ZapIcon,
  AlertCircleIcon,
} from "lucide-react";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const PAGE_SIZE       = 20;
const SEARCH_DEBOUNCE  = 400;
const MIN_CREDIT_USD   = 0.0001;
const MAX_CREDIT_USD   = 10_000;
const MAX_REASON_LEN   = 512;
const MAX_NOTE_LEN     = 1024;

const STATUS_TABS = [
  { key: "all",       label: "All" },
  { key: "active",    label: "Active" },
  { key: "suspended", label: "Suspended" },
  { key: "banned",    label: "Banned" },
];

const TIER_OPTIONS = [
  { value: "",      label: "All tiers" },
  { value: "free",  label: "Free" },
  { value: "pro",   label: "Pro" },
  { value: "elite", label: "Elite" },
];

const SORT_OPTIONS = [
  { value: "created_at",      label: "Joined" },
  { value: "balance",         label: "Balance" },
  { value: "tasks_completed", label: "Tasks completed" },
  { value: "email",           label: "Email" },
];

const STATUS_BADGE_VARIANT = { active: "green", suspended: "orange", banned: "red" };
const TIER_BADGE_VARIANT   = { free: "grey", pro: "blue", elite: "purple" };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function usd(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  const n = Number(amount);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function initialsOf(user) {
  const a = user?.first_name?.[0] ?? "";
  const b = user?.last_name?.[0] ?? "";
  return (a + b).toUpperCase() || "U";
}

function fullName(user) {
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.display_name || "Unnamed";
}

// ─── SKELETON ROW ────────────────────────────────────────────────────────────
function SkeletonRows({ count = 8 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i}>
          <td colSpan={6}>
            <div className="rc-skeleton" style={{ height: 18, borderRadius: 6 }} />
          </td>
        </tr>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminUsers() {
  // ── Filters ──────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [status, setStatus]           = useState("all");
  const [tier, setTier]               = useState("");
  const [sortBy, setSortBy]           = useState("created_at");
  const [sortOrder, setSortOrder]     = useState("desc");
  const [page, setPage]               = useState(1);

  // Debounce search input → search (resets to page 1)
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset to page 1 whenever any other filter changes
  useEffect(() => { setPage(1); }, [status, tier, sortBy, sortOrder]);

  const queryParams = useMemo(
    () => ({
      page,
      page_size: PAGE_SIZE,
      search: search || undefined,
      status,
      tier: tier || undefined,
      sort_by: sortBy,
      sort_order: sortOrder,
    }),
    [page, search, status, tier, sortBy, sortOrder]
  );

  const {
    data,
    loading,
    isRefetching,
    error,
    reload,
  } = useApi(() => api.admin.users(queryParams), [JSON.stringify(queryParams)]);

  const users      = data?.users ?? [];
  const total      = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  // ── Selected user for the detail/manage modal ───────────────────────────
  const [selectedUser, setSelectedUser] = useState(null);

  // Patch a single row in-place after a successful mutation, without a
  // full reload — keeps the list snappy and avoids losing scroll position.
  const patchLocalUser = useCallback((userId, patch) => {
    setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, ...patch } : prev));
  }, []);

  const toggleSortOrder = () => setSortOrder((o) => (o === "asc" ? "desc" : "asc"));

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <UsersIcon size={18} strokeWidth={2.2} style={{ color: "var(--warning)" }} aria-hidden="true" />
            Users
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {loading && !data ? "Loading…" : `${total.toLocaleString("en-UG")} total`}
            {isRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={reload} disabled={loading} aria-label="Refresh users" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={isRefetching ? { animation: "spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {error && <Alert type="error" message={`Couldn't load users: ${error}`} onDismiss={reload} />}

      {/* ── Filters ── */}
      <div className="dash-section">
        <div className="rc-field" style={{ marginBottom: 12 }}>
          <input
            className="rc-input"
            type="text"
            placeholder="Search by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            maxLength={256}
            aria-label="Search users"
          />
        </div>

        <div style={{ marginBottom: 12, overflowX: "auto" }}>
          <TabBar tabs={STATUS_TABS} active={status} onChange={setStatus} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <select className="rc-select" value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
            {TIER_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="rc-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort by">
            {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>

        <button className="btn-secondary" style={{ width: "100%" }} onClick={toggleSortOrder}>
          {sortOrder === "asc" ? <ChevronUpIcon size={14} strokeWidth={2} /> : <ChevronDownIcon size={14} strokeWidth={2} />}
          {sortOrder === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      {/* ── Table ── */}
      {!loading && users.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No users found"
          message="Try adjusting your search or filters."
        />
      ) : (
        <div className="dash-section" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Tier</th>
                  <th>Balance</th>
                  <th>Tasks</th>
                  <th aria-label="Manage" />
                </tr>
              </thead>
              <tbody>
                {loading && !data ? (
                  <SkeletonRows count={8} />
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{fullName(u)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {u.email}
                        </div>
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGE_VARIANT[u.status] ?? "grey"}>{u.status}</Badge>
                        {u.is_admin && (
                          <span style={{ marginLeft: 4 }}>
                            <Badge variant="purple">admin</Badge>
                          </span>
                        )}
                      </td>
                      <td><Badge variant={TIER_BADGE_VARIANT[u.membership_tier] ?? "grey"}>{u.membership_tier}</Badge></td>
                      <td style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{usd(u.balance_usd)}</td>
                      <td style={{ fontFamily: "var(--font-mono)" }}>{u.tasks_completed}</td>
                      <td>
                        <ChevronRightIcon size={16} strokeWidth={2} style={{ color: "var(--text-dim)" }} aria-hidden="true" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaginationBar page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />

      {/* ── Manage user modal ── */}
      {selectedUser && (
        <UserManageModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onPatchLocal={patchLocalUser}
          onMutated={reload}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// USER MANAGE MODAL
// ═══════════════════════════════════════════════════════════════════════════
function UserManageModal({ user, onClose, onPatchLocal, onMutated }) {
  const [tab, setTab] = useState("account"); // "account" | "balance"

  return (
    <Modal open onClose={onClose} title={fullName(user)}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{user.email}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Badge variant={STATUS_BADGE_VARIANT[user.status] ?? "grey"}>{user.status}</Badge>
          <Badge variant={TIER_BADGE_VARIANT[user.membership_tier] ?? "grey"}>{user.membership_tier}</Badge>
          {user.is_admin && <Badge variant="purple">admin</Badge>}
          {user.is_verified && <Badge variant="blue">verified</Badge>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12, fontSize: 12 }}>
          <InfoLine label="Balance" value={usd(user.balance_usd)} />
          <InfoLine label="Total earned" value={usd(user.total_earned_usd)} />
          <InfoLine label="Total withdrawn" value={usd(user.total_withdrawn_usd)} />
          <InfoLine label="Tasks completed" value={user.tasks_completed} />
          <InfoLine label="Referral code" value={user.referral_code} />
          <InfoLine label="Joined" value={formatDate(new Date(user.created_at * 1000))} />
          <InfoLine
            label="Last active"
            value={user.last_active_at ? timeAgo(new Date(user.last_active_at * 1000)) : "Never"}
          />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <TabBar
          tabs={[{ key: "account", label: "Account" }, { key: "balance", label: "Balance" }]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "account" ? (
        <AccountControls user={user} onPatchLocal={onPatchLocal} onMutated={onMutated} />
      ) : (
        <BalanceControls user={user} onPatchLocal={onPatchLocal} onMutated={onMutated} />
      )}
    </Modal>
  );
}

function InfoLine({ label, value }) {
  return (
    <div>
      <div style={{ color: "var(--text-muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value ?? "—"}</div>
    </div>
  );
}

// ─── ACCOUNT CONTROLS (status / tier / admin flag) ──────────────────────────
function AccountControls({ user, onPatchLocal, onMutated }) {
  const [newStatus, setNewStatus] = useState(user.status);
  const [newTier, setNewTier]     = useState(user.membership_tier);
  const [reason, setReason]       = useState("");
  const [note, setNote]           = useState("");
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [success, setSuccess]     = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdminToggle, setPendingAdminToggle] = useState(null); // bool | null

  const statusChanged = newStatus !== user.status;
  const tierChanged   = newTier !== user.membership_tier;
  const reasonRequired = statusChanged; // server rule: reason required for status changes
  const reasonValid    = !reasonRequired || reason.trim().length > 0;
  const canSave = (statusChanged || tierChanged) && reasonValid && !saving;

  const submitPatch = async (body) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.updateUser(user.id, body);
      onPatchLocal(user.id, body);
      onMutated?.();
      setSuccess("Saved.");
      setReason("");
      setNote("");
    } catch (e) {
      setError(e.message ?? "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccount = () => {
    if (!canSave) return;
    const body = {};
    if (statusChanged) body.status = newStatus;
    if (tierChanged) body.membership_tier = newTier;
    if (reason.trim()) body.reason = reason.trim().slice(0, MAX_REASON_LEN);
    if (note.trim()) body.note = note.trim().slice(0, MAX_NOTE_LEN);

    // Extra confirmation gate for suspend/ban — irreversible-feeling actions
    if (statusChanged && (newStatus === "suspended" || newStatus === "banned")) {
      setConfirmOpen(true);
      return;
    }
    submitPatch(body);
  };

  const handleConfirmDangerous = () => {
    const body = { status: newStatus };
    if (reason.trim()) body.reason = reason.trim().slice(0, MAX_REASON_LEN);
    if (tierChanged) body.membership_tier = newTier;
    if (note.trim()) body.note = note.trim().slice(0, MAX_NOTE_LEN);
    setConfirmOpen(false);
    submitPatch(body);
  };

  const requestAdminToggle = (next) => setPendingAdminToggle(next);

  const confirmAdminToggle = async () => {
    const next = pendingAdminToggle;
    setPendingAdminToggle(null);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await api.admin.updateUser(user.id, { is_admin: next });
      onPatchLocal(user.id, { is_admin: next });
      onMutated?.();
      setSuccess(next ? "Admin access granted." : "Admin access revoked.");
    } catch (e) {
      setError(e.message ?? "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}
      {success && <Alert type="success" message={success} onDismiss={() => setSuccess(null)} />}

      <div className="rc-field">
        <label className="rc-label" htmlFor="status-select">Status</label>
        <select id="status-select" className="rc-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      <div className="rc-field">
        <label className="rc-label" htmlFor="tier-select">Membership tier</label>
        <select id="tier-select" className="rc-select" value={newTier} onChange={(e) => setNewTier(e.target.value)}>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="elite">Elite</option>
        </select>
      </div>

      {(statusChanged || tierChanged) && (
        <>
          <div className="rc-field">
            <label className="rc-label" htmlFor="reason-input">
              Reason {reasonRequired && <span style={{ color: "var(--danger)" }}>*</span>}
            </label>
            <input
              id="reason-input"
              className="rc-input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REASON_LEN}
              placeholder={reasonRequired ? "Required for status changes" : "Optional"}
            />
          </div>
          <div className="rc-field">
            <label className="rc-label" htmlFor="note-input">Internal note (optional)</label>
            <input
              id="note-input"
              className="rc-input"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={MAX_NOTE_LEN}
              placeholder="Not visible to the user"
            />
          </div>
        </>
      )}

      <button className="btn-primary" style={{ width: "100%" }} disabled={!canSave} onClick={handleSaveAccount}>
        {saving ? <Spinner size="sm" /> : "Save Changes"}
      </button>

      <div className="drawer-divider" style={{ margin: "18px 0" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {user.is_admin ? (
            <ShieldCheckIcon size={16} strokeWidth={2} style={{ color: "var(--purple)" }} aria-hidden="true" />
          ) : (
            <ShieldIcon size={16} strokeWidth={2} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
          )}
          <span style={{ fontSize: 13, fontWeight: 600 }}>Admin access</span>
        </div>
        <button
          role="switch"
          aria-checked={user.is_admin}
          aria-label="Toggle admin access"
          disabled={saving}
          onClick={() => requestAdminToggle(!user.is_admin)}
          className={`rc-switch ${user.is_admin ? "rc-switch-on" : ""}`}
        >
          <span className="rc-switch-thumb" />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmDangerous}
        title={newStatus === "banned" ? "Confirm Ban" : "Confirm Suspension"}
        description={`${fullName(user)} will be ${newStatus === "banned" ? "banned" : "suspended"} immediately. ${reason ? `Reason: "${reason}"` : "No reason was provided."}`}
        confirmLabel={newStatus === "banned" ? "Ban User" : "Suspend User"}
        danger
        loading={saving}
      />

      <ConfirmDialog
        open={pendingAdminToggle !== null}
        onClose={() => setPendingAdminToggle(null)}
        onConfirm={confirmAdminToggle}
        title={pendingAdminToggle ? "Grant Admin Access" : "Revoke Admin Access"}
        description={
          pendingAdminToggle
            ? `${fullName(user)} will gain full admin access to every /admin endpoint.`
            : `${fullName(user)} will lose all admin access immediately.`
        }
        confirmLabel={pendingAdminToggle ? "Grant Access" : "Revoke Access"}
        danger
        loading={saving}
      />
    </div>
  );
}

// ─── BALANCE CONTROLS (credit / debit) ──────────────────────────────────────
function BalanceControls({ user, onPatchLocal, onMutated }) {
  const [mode, setMode] = useState("credit"); // "credit" | "debit"
  const [amountInput, setAmountInput] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Fresh idempotency key per logical attempt; rotates only when the
  // actual request values change, reused across retries of the same one.
  const idempKeyRef = useRef(null);
  useEffect(() => { idempKeyRef.current = null; }, [mode, amountInput, reason]);
  const getIdempKey = useCallback(() => {
    if (!idempKeyRef.current) idempKeyRef.current = newIdempotencyKey();
    return idempKeyRef.current;
  }, []);

  const amt = parseFloat(amountInput);
  const amountValid = !isNaN(amt) && amt >= MIN_CREDIT_USD && amt <= MAX_CREDIT_USD;
  const reasonValid = reason.trim().length > 0;
  const canSubmit = amountValid && reasonValid && !saving;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setError(null);
    setSuccess(null);
    const body = {
      amount_usd: round2(amt),
      reason: reason.trim().slice(0, MAX_REASON_LEN),
      idempotency_key: getIdempKey(),
    };
    try {
      const fn = mode === "credit" ? api.admin.creditUser : api.admin.debitUser;
      await fn(user.id, body);
      const delta = mode === "credit" ? round2(amt) : -round2(amt);
      onPatchLocal(user.id, { balance_usd: round2((user.balance_usd ?? 0) + delta) });
      onMutated?.();
      setSuccess(`${mode === "credit" ? "Credited" : "Debited"} ${usd(amt)}.`);
      setAmountInput("");
      setReason("");
      idempKeyRef.current = null;
    } catch (e) {
      setError(e.message ?? "Transaction failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}
      {success && <Alert type="success" message={success} onDismiss={() => setSuccess(null)} />}

      <div className="dash-section" style={{ marginBottom: 16, textAlign: "center" }}>
        <h3 style={{ marginBottom: 4 }}>Current Balance</h3>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>
          {usd(user.balance_usd)}
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <TabBar
          tabs={[
            { key: "credit", label: "Credit" },
            { key: "debit", label: "Debit" },
          ]}
          active={mode}
          onChange={setMode}
        />
      </div>

      <div className="rc-field">
        <label className="rc-label" htmlFor="amount-input">Amount (USD)</label>
        <input
          id="amount-input"
          className="rc-input"
          type="number"
          inputMode="decimal"
          min={MIN_CREDIT_USD}
          max={MAX_CREDIT_USD}
          step="0.01"
          placeholder="0.00"
          value={amountInput}
          onChange={(e) => setAmountInput(e.target.value)}
        />
        {amountInput && !amountValid && (
          <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
            Enter an amount between $0.0001 and ${MAX_CREDIT_USD.toLocaleString("en-US")}.
          </div>
        )}
      </div>

      <div className="rc-field">
        <label className="rc-label" htmlFor="balance-reason">Reason</label>
        <input
          id="balance-reason"
          className="rc-input"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON_LEN}
          placeholder="Required — visible in the audit log"
        />
      </div>

      <button
        className={`btn-primary${mode === "debit" ? " btn-danger" : ""}`}
        style={
          mode === "debit"
            ? { width: "100%", background: "var(--danger-dim)", border: "1px solid var(--danger-border)", color: "var(--danger)" }
            : { width: "100%" }
        }
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {saving ? (
          <Spinner size="sm" />
        ) : mode === "credit" ? (
          <><ZapIcon size={14} strokeWidth={2} /> Credit {amountValid ? usd(amt) : ""}</>
        ) : (
          <><AlertCircleIcon size={14} strokeWidth={2} /> Debit {amountValid ? usd(amt) : ""}</>
        )}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title={mode === "credit" ? "Confirm Credit" : "Confirm Debit"}
        description={`${mode === "credit" ? "Credit" : "Debit"} ${usd(amt)} ${mode === "credit" ? "to" : "from"} ${fullName(user)}'s balance? Reason: "${reason.trim()}"`}
        confirmLabel={mode === "credit" ? "Credit" : "Debit"}
        danger={mode === "debit"}
        loading={saving}
      />
    </div>
  );
}
