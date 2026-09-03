/**
 * admin/AdminInvitations.jsx — RENOCORP Invitation Manager  v1.0
 * ====================================================================
 * Admin-driven onboarding: create single or bulk invitations, track
 * delivery + redemption lifecycle, resend or revoke — everything the
 * invitations module exposes.
 *
 * Data source (modules/invitations/{routes,models}.py):
 *   GET  /api/admin/invitations              → InvitationPage
 *   GET  /api/admin/invitations/stats        → InvitationStats (cached 60s)
 *   POST /api/admin/invitations              → CreateInvitationResponse
 *   POST /api/admin/invitations/bulk         → BulkCreateResponse (max 100)
 *   POST /api/admin/invitations/{id}/resend  → dict (max 3 attempts)
 *   POST /api/admin/invitations/{id}/revoke  → dict (reason required)
 *
 * Contract notes (pulled from the real backend, not the blueprint):
 *  · InvitationStatus values are UPPERCASE strings — PENDING, SENT,
 *    DELIVERY_FAILED, REDEEMED, EXPIRED, REVOKED. REDEEMED/EXPIRED/
 *    REVOKED are terminal (is_terminal); only SENT/DELIVERY_FAILED are
 *    redeemable/resendable (is_redeemable). Every row already carries
 *    backend-computed status_label + status_color + is_expired +
 *    days_until_expiry — this screen renders those directly rather
 *    than re-deriving them, so labels never drift from the source of
 *    truth.
 *  · temp_password is NEVER returned after creation (security-by-
 *    design in the backend model) — the create-success panel is the
 *    ONLY place a password-adjacent confirmation appears, and even
 *    there we only confirm delivery, never redisplay the password.
 *  · idempotency_key is a REQUIRED BODY field on
 *    AdminCreateInvitationRequest (min 8 chars) — not just a header.
 *    Generated once per create attempt and reused across retries,
 *    exactly like Withdraw.jsx / AdminUsers.jsx credit-debit.
 *  · RevokeInvitationRequest.reason is REQUIRED (min_length=1).
 *    api.js's revokeInvitation()/resendInvitation() previously sent an
 *    empty body — that would 422 on every single revoke. Patched both
 *    to accept an optional `body` argument (backward compatible; see
 *    api.js diff). This screen always sends a real { reason }.
 *  · Resend is capped at 3 attempts server-side (429 past that) — the
 *    UI disables the button at delivery_attempts >= 3 instead of
 *    letting the admin hit a wall.
 *  · No free-text server-side search exists for withdrawals, but
 *    invitations DOES support it (`search` matches email/name/phone)
 *    — used here with a 400ms debounce, matching AdminUsers.jsx.
 *  · package_id comes from the same catalog as api.packages.list()
 *    (PackageListResponse.packages) — the public package list used by
 *    Packages.jsx, filtered to active tiers for the create form.
 *
 * Only uses CSS classes already merged into styles.js — identical
 * convention to AdminUsers.jsx / AdminTasks.jsx / AdminWithdrawals.jsx.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { newIdempotencyKey } from "../utils/idempotency.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { Modal } from "../components/Modal.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import { TabBar } from "../components/TabBar.jsx";
import {
  UserPlusIcon,
  UsersIcon,
  RefreshCwIcon,
  SendIcon,
  BanIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  AlertCircleIcon,
  InfoIcon,
  ChevronRightIcon,
  MailIcon,
  PlusIcon,
} from "lucide-react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────
const PAGE_SIZE           = 20;
const AUTO_REFRESH_MS     = 60_000;
const SEARCH_DEBOUNCE_MS  = 400;
const MAX_RESEND_ATTEMPTS = 3;
const MAX_BULK_SIZE       = 100;
const MAX_NOTE_LEN        = 512;
const MAX_REASON_LEN      = 512;
const DEFAULT_EXPIRY_DAYS = 7;
const MAX_EXPIRY_DAYS     = 30;

const STATUS_TABS = [
  { key: "",                label: "All" },
  { key: "PENDING",         label: "Pending" },
  { key: "SENT",            label: "Sent" },
  { key: "DELIVERY_FAILED", label: "Failed" },
  { key: "REDEEMED",        label: "Redeemed" },
  { key: "EXPIRED",         label: "Expired" },
  { key: "REVOKED",         label: "Revoked" },
];

const CHANNEL_OPTIONS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS",       label: "SMS" },
  { value: "BOTH",      label: "WhatsApp + SMS" },
];

// Mirrors backend's Uganda phone validator exactly (modules/invitations/models.py)
const UG_PHONE_RE = /^(?:\+?256|0)(7[0-9]{8})$/;
const NAME_RE     = /^[A-Za-z\s'-]+$/;
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── HELPERS ────────────────────────────────────────────────────────────────
function normalizeUgPhone(raw) {
  const cleaned = String(raw ?? "").trim().replace(/[\s-]/g, "");
  const m = UG_PHONE_RE.exec(cleaned);
  return m ? `+256${m[1]}` : null;
}

// status_color from the backend is a CSS-var name (--info, --danger, etc.) —
// map it to the Badge component's variant vocabulary instead of duplicating
// the color logic. Falls back gracefully if the backend ever adds a status
// this map doesn't know about yet.
function badgeVariantForStatus(status) {
  switch (status) {
    case "PENDING":         return "orange";
    case "SENT":             return "blue";
    case "DELIVERY_FAILED":  return "red";
    case "REDEEMED":         return "green";
    case "EXPIRED":          return "grey";
    case "REVOKED":          return "red";
    default:                 return "grey";
  }
}

function expiryLabel(inv) {
  if (inv.status === "REDEEMED") return "—";
  if (inv.is_expired) return "Expired";
  if (inv.days_until_expiry == null) return "—";
  if (inv.days_until_expiry <= 0) return "Expires today";
  return `${inv.days_until_expiry}d left`;
}

function fullName(inv) {
  return `${inv.first_name ?? ""} ${inv.last_name ?? ""}`.trim() || "—";
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export default function AdminInvitations() {
  const navigate = useNavigate();

  const [statusTab, setStatusTab]     = useState("");
  const [packageId, setPackageId]     = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [page, setPage]               = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen]     = useState(false);
  const [activeInvite, setActiveInvite] = useState(null);

  // ── Debounced search ──────────────────────────────────────────────────
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [statusTab, packageId, search]);

  // ── Packages catalog (for create/bulk dropdowns + filter) ──────────────
  const { data: packagesData, loading: packagesLoading } = useApi(() => api.packages.list(), []);
  const packages = useMemo(
    () => (packagesData?.packages ?? []).filter((p) => p.active !== false),
    [packagesData]
  );

  // ── Stats ────────────────────────────────────────────────────────────
  const { data: stats, loading: statsLoading, reload: reloadStats } = useApi(
    () => api.admin.invitationStats(),
    []
  );

  // ── List ─────────────────────────────────────────────────────────────
  const {
    data: listData,
    loading: listLoading,
    isRefetching: listRefetching,
    error: listError,
    reload: reloadList,
  } = useApi(
    () => api.admin.invitations({
      page,
      page_size: PAGE_SIZE,
      status: statusTab || undefined,
      package_id: packageId || undefined,
      search: search || undefined,
      sort_by: "created_at",
      sort_order: "desc",
    }),
    [page, statusTab, packageId, search]
  );

  useAutoRefresh(AUTO_REFRESH_MS, () => { reloadList(); reloadStats(); });

  const handleRefresh = useCallback(() => { reloadList(); reloadStats(); }, [reloadList, reloadStats]);
  const handleMutated = useCallback(() => { reloadList(); reloadStats(); }, [reloadList, reloadStats]);

  const rows = listData?.invitations ?? [];
  const isBusy = (listLoading && !listData) || (statsLoading && !stats);

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div className="dash-greeting" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MailIcon size={18} strokeWidth={2.2} style={{ color: "var(--info)" }} aria-hidden="true" />
            Invitations
          </h2>
          <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {stats ? `Updated ${new Date(stats.computed_at * 1000).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}` : "Loading…"}
            {listRefetching && " · refreshing…"}
          </div>
        </div>
        <button className="btn-icon" onClick={handleRefresh} disabled={isBusy} aria-label="Refresh" title="Refresh">
          <RefreshCwIcon size={16} strokeWidth={2} style={listRefetching ? { animation: "rc-inv-spin 0.8s linear infinite" } : undefined} />
        </button>
      </div>

      {listError && <Alert type="error" message={`Couldn't load invitations: ${listError}`} onDismiss={reloadList} style={{ marginTop: 12 }} />}

      {/* ── Stats ── */}
      {isBusy ? (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} />)}
        </div>
      ) : (
        <div className="admin-stat-grid" style={{ marginTop: 16 }}>
          <MiniStat label="Redemption Rate" value={`${(stats?.redemption_rate_pct ?? 0).toFixed(1)}%`} sub={`${stats?.total_redeemed ?? 0} of ${stats?.total_sent ?? 0} sent`} tone="accent" />
          <MiniStat label="Awaiting Redemption" value={stats?.pending_redemption ?? 0} tone={stats?.pending_redemption ? "warning" : undefined} />
          <MiniStat label="Created Today" value={stats?.created_today ?? 0} sub={`${stats?.redeemed_today ?? 0} redeemed today`} />
          <MiniStat label="Delivery Failures" value={stats?.total_failed_delivery ?? 0} tone={stats?.total_failed_delivery ? "danger" : undefined} />
        </div>
      )}

      {/* ── Controls ── */}
      <div className="dash-section-header" style={{ marginTop: 20 }}>
        <h3>All invitations</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="link-btn" onClick={() => setBulkOpen(true)}>
            <UsersIcon size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            Bulk Invite
          </button>
          <button className="link-btn" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={13} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            New Invitation
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <TabBar tabs={STATUS_TABS} active={statusTab} onChange={setStatusTab} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <input
          className="rc-input"
          type="text"
          placeholder="Search email, name, or phone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 180 }}
          aria-label="Search invitations"
        />
        <select className="rc-select" value={packageId} onChange={(e) => setPackageId(e.target.value)} aria-label="Filter by package">
          <option value="">All packages</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* ── Table ── */}
      {isBusy ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} height={44} />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="✉️"
          title={search || statusTab || packageId ? "No matching invitations" : "No invitations yet"}
          message={search || statusTab || packageId ? "Try a different filter or search term." : "Create your first invitation to onboard a user."}
          action={{ label: "New Invitation", onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invitee</th>
                  <th>Package</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Created</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id} onClick={() => setActiveInvite(inv)} style={{ cursor: "pointer" }}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{fullName(inv)}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{inv.email}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {inv.package_name}
                      <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>{inv.package_tier}</div>
                    </td>
                    <td>
                      <Badge variant={badgeVariantForStatus(inv.status)}>{inv.status_label}</Badge>
                    </td>
                    <td style={{ fontSize: 11.5, color: inv.is_expired ? "var(--danger)" : "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {expiryLabel(inv)}
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeAgo(inv.created_at * 1000)}</td>
                    <td>
                      <ChevronRightIcon size={15} strokeWidth={2} style={{ color: "var(--text-dim)" }} aria-hidden="true" />
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

      {/* ── Modals ── */}
      <CreateInvitationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        packages={packages}
        packagesLoading={packagesLoading}
        onCreated={handleMutated}
        onGoToPackages={() => navigate("/admin/packages")}
      />
      <BulkInviteModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        packages={packages}
        packagesLoading={packagesLoading}
        onCreated={handleMutated}
        onGoToPackages={() => navigate("/admin/packages")}
      />
      <InvitationDetailModal
        invitation={activeInvite}
        onClose={() => setActiveInvite(null)}
        onMutated={handleMutated}
      />

      <style>{`@keyframes rc-inv-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CREATE INVITATION MODAL
// ═══════════════════════════════════════════════════════════════════════════
function CreateInvitationModal({ open, onClose, packages, packagesLoading, onCreated, onGoToPackages }) {
  const [firstName, setFirstName]   = useState("");
  const [lastName, setLastName]     = useState("");
  const [email, setEmail]           = useState("");
  const [phone, setPhone]           = useState("");
  const [pkgId, setPkgId]           = useState("");
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [channel, setChannel]       = useState("WHATSAPP");
  const [note, setNote]             = useState("");

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [result, setResult]           = useState(null); // CreateInvitationResponse

  const idemKeyRef = useRef(null);

  // Reset form + mint a fresh idempotency key every time the modal opens
  useEffect(() => {
    if (!open) return;
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setPkgId(packages[0]?.id ?? "");
    setExpiryDays(DEFAULT_EXPIRY_DAYS);
    setChannel("WHATSAPP");
    setNote("");
    setFieldErrors({});
    setServerError(null);
    setResult(null);
    idemKeyRef.current = newIdempotencyKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validate = () => {
    const errs = {};
    if (!NAME_RE.test(firstName.trim())) errs.firstName = "Letters, spaces, hyphens only.";
    if (!NAME_RE.test(lastName.trim())) errs.lastName = "Letters, spaces, hyphens only.";
    if (!EMAIL_RE.test(email.trim())) errs.email = "Enter a valid email.";
    if (!normalizeUgPhone(phone)) errs.phone = "Uganda number, e.g. 0700000000 or +256700000000.";
    if (!pkgId) errs.pkgId = "Select a package.";
    if (expiryDays < 1 || expiryDays > MAX_EXPIRY_DAYS) errs.expiryDays = `1–${MAX_EXPIRY_DAYS} days.`;
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.admin.createInvitation({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone_number: normalizeUgPhone(phone),
        package_id: pkgId,
        expiry_days: Number(expiryDays),
        delivery_channel: channel,
        personal_note: note.trim() || null,
        idempotency_key: idemKeyRef.current,
      });
      setResult(res);
    } catch (e) {
      setServerError(e.message ?? "Couldn't create the invitation.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => {
    onCreated?.();
    onClose();
  };

  const noPackages = !packagesLoading && packages.length === 0;

  return (
    <Modal open={open} onClose={!submitting ? onClose : undefined} title={result ? "Invitation Sent" : "New Invitation"}>
      {result ? (
        <div>
          <Alert type="success" style={{ marginBottom: 14 }}>
            {result.message ?? `Invitation created for ${result.email}.`}
          </Alert>
          <div className="rc-field">
            <div className="rc-label">Invitation Code</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{result.invitation_code}</div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <div>
              <div className="rc-label">Delivery</div>
              <div style={{ fontSize: 13 }}>
                {result.whatsapp_sent ? (
                  <span style={{ color: "var(--accent)" }}>✓ Sent via WhatsApp</span>
                ) : (
                  <span style={{ color: "var(--warning)" }}>Queued — delivery status: {result.delivery_status}</span>
                )}
              </div>
            </div>
            <div>
              <div className="rc-label">Expires</div>
              <div style={{ fontSize: 13 }}>{formatDateTime(result.expires_at * 1000)}</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 16 }}>
            The temporary password was sent directly to the invitee via WhatsApp and cannot be
            retrieved here — this is by design. If they lose it, revoke this invitation and
            create a new one.
          </p>
          <button className="btn-primary" style={{ width: "100%" }} onClick={handleDone}>Done</button>
        </div>
      ) : (
        <div>
          {serverError && <Alert type="error" message={serverError} onDismiss={() => setServerError(null)} />}

          {noPackages && (
            <Alert type="warning" style={{ marginBottom: 4 }}>
              No packages configured yet.{" "}
              <button className="link-btn" style={{ padding: 0 }} onClick={onGoToPackages}>Set one up →</button>
            </Alert>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="inv-first">First name</label>
              <input id="inv-first" className="rc-input" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={128} />
              {fieldErrors.firstName && <FieldError text={fieldErrors.firstName} />}
            </div>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="inv-last">Last name</label>
              <input id="inv-last" className="rc-input" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={128} />
              {fieldErrors.lastName && <FieldError text={fieldErrors.lastName} />}
            </div>
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="inv-email">Email</label>
            <input id="inv-email" className="rc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            {fieldErrors.email && <FieldError text={fieldErrors.email} />}
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="inv-phone">Phone (Uganda)</label>
            <input id="inv-phone" className="rc-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0700000000" />
            {fieldErrors.phone && <FieldError text={fieldErrors.phone} />}
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="inv-pkg">Package</label>
            <select id="inv-pkg" className="rc-select" value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={noPackages}>
              <option value="">{packagesLoading ? "Loading…" : "Select a package"}</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>{p.name} — {p.price_display || "Free"}</option>
              ))}
            </select>
            {fieldErrors.pkgId && <FieldError text={fieldErrors.pkgId} />}
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="inv-expiry">Expires in (days)</label>
              <input id="inv-expiry" className="rc-input" type="number" min={1} max={MAX_EXPIRY_DAYS} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
              {fieldErrors.expiryDays && <FieldError text={fieldErrors.expiryDays} />}
            </div>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="inv-channel">Delivery</label>
              <select id="inv-channel" className="rc-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="inv-note">Personal note (optional)</label>
            <textarea id="inv-note" className="rc-input" rows={2} style={{ resize: "vertical", minHeight: 44 }} value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE_LEN} placeholder="Appended to the WhatsApp message" />
          </div>

          <button className="btn-primary" style={{ width: "100%" }} disabled={submitting || noPackages} onClick={handleSubmit}>
            {submitting ? <Spinner size="sm" /> : "Send Invitation"}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK INVITE MODAL
// ═══════════════════════════════════════════════════════════════════════════
function BulkInviteModal({ open, onClose, packages, packagesLoading, onCreated, onGoToPackages }) {
  const [pkgId, setPkgId]           = useState("");
  const [expiryDays, setExpiryDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [channel, setChannel]       = useState("WHATSAPP");
  const [raw, setRaw]               = useState("");

  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [result, setResult]           = useState(null); // BulkCreateResponse

  useEffect(() => {
    if (!open) return;
    setPkgId(packages[0]?.id ?? "");
    setExpiryDays(DEFAULT_EXPIRY_DAYS);
    setChannel("WHATSAPP");
    setRaw("");
    setServerError(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Parse "First,Last,email,phone" one per line → { row, data, errors }
  const parsed = useMemo(() => {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const seen = new Set();
    return lines.map((line, i) => {
      const parts = line.split(",").map((p) => p.trim());
      const [first, last, email, phone] = parts;
      const errors = [];
      if (parts.length < 4) errors.push("Expected: First,Last,email,phone");
      if (first && !NAME_RE.test(first)) errors.push("Invalid first name");
      if (last && !NAME_RE.test(last)) errors.push("Invalid last name");
      if (email && !EMAIL_RE.test(email)) errors.push("Invalid email");
      const normPhone = phone ? normalizeUgPhone(phone) : null;
      if (phone && !normPhone) errors.push("Invalid Uganda phone");
      if (email) {
        const key = email.toLowerCase();
        if (seen.has(key)) errors.push("Duplicate email in list");
        seen.add(key);
      }
      return {
        line: i + 1, raw: line,
        first_name: first, last_name: last, email, phone_number: normPhone,
        valid: errors.length === 0 && parts.length >= 4,
        errors,
      };
    });
  }, [raw]);

  const validRows = parsed.filter((r) => r.valid);
  const invalidCount = parsed.length - validRows.length;
  const overLimit = parsed.length > MAX_BULK_SIZE;

  const handleSubmit = async () => {
    setServerError(null);
    if (!pkgId || validRows.length === 0 || overLimit) return;
    setSubmitting(true);
    try {
      const invitees = validRows.map((r) => ({
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone_number: r.phone_number,
        package_id: pkgId,
        expiry_days: Number(expiryDays),
        delivery_channel: channel,
        personal_note: null,
        idempotency_key: newIdempotencyKey(),
      }));
      const res = await api.admin.bulkInvite({ invitees });
      setResult(res);
    } catch (e) {
      setServerError(e.message ?? "Bulk invite failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDone = () => { onCreated?.(); onClose(); };
  const noPackages = !packagesLoading && packages.length === 0;

  return (
    <Modal open={open} onClose={!submitting ? onClose : undefined} title={result ? "Bulk Invite Results" : "Bulk Invite"}>
      {result ? (
        <div>
          <Alert type={result.total_failed > 0 ? "warning" : "success"} style={{ marginBottom: 14 }}>
            {result.total_created} of {result.total_requested} created · {result.total_sent} sent · {result.total_failed} failed
          </Alert>
          <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", marginBottom: 16 }}>
            <table className="admin-table" style={{ marginBottom: 0 }}>
              <thead><tr><th>Email</th><th>Result</th></tr></thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 12 }}>{r.email}</td>
                    <td>
                      {r.success
                        ? <Badge variant="green">Created</Badge>
                        : <span style={{ color: "var(--danger)", fontSize: 11 }}>{r.error ?? "Failed"}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary" style={{ width: "100%" }} onClick={handleDone}>Done</button>
        </div>
      ) : (
        <div>
          {serverError && <Alert type="error" message={serverError} onDismiss={() => setServerError(null)} />}
          {noPackages && (
            <Alert type="warning" style={{ marginBottom: 4 }}>
              No packages configured yet.{" "}
              <button className="link-btn" style={{ padding: 0 }} onClick={onGoToPackages}>Set one up →</button>
            </Alert>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="bulk-pkg">Package (applies to all)</label>
              <select id="bulk-pkg" className="rc-select" value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={noPackages}>
                <option value="">{packagesLoading ? "Loading…" : "Select a package"}</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="rc-field" style={{ flex: 1 }}>
              <label className="rc-label" htmlFor="bulk-expiry">Expires (days)</label>
              <input id="bulk-expiry" className="rc-input" type="number" min={1} max={MAX_EXPIRY_DAYS} value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} />
            </div>
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="bulk-channel">Delivery</label>
            <select id="bulk-channel" className="rc-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="rc-field">
            <label className="rc-label" htmlFor="bulk-rows">
              Invitees — one per line: First,Last,email,phone
            </label>
            <textarea
              id="bulk-rows"
              className="rc-input"
              rows={6}
              style={{ resize: "vertical", minHeight: 110, fontFamily: "var(--font-mono)", fontSize: 12.5 }}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"Jane,Doe,jane@example.com,0700000000\nJohn,Smith,john@example.com,0711111111"}
            />
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)", display: "flex", gap: 12 }}>
              <span>{validRows.length} valid</span>
              {invalidCount > 0 && <span style={{ color: "var(--danger)" }}>{invalidCount} invalid</span>}
              <span style={{ color: overLimit ? "var(--danger)" : undefined }}>{parsed.length}/{MAX_BULK_SIZE}</span>
            </div>
            {parsed.some((r) => !r.valid) && (
              <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto", fontSize: 11, color: "var(--danger)" }}>
                {parsed.filter((r) => !r.valid).map((r) => (
                  <div key={r.line}>Line {r.line}: {r.errors.join(", ")}</div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn-primary"
            style={{ width: "100%" }}
            disabled={submitting || noPackages || validRows.length === 0 || overLimit || !pkgId}
            onClick={handleSubmit}
          >
            {submitting ? <Spinner size="sm" /> : `Send ${validRows.length || ""} Invitation${validRows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// INVITATION DETAIL MODAL (resend / revoke)
// ═══════════════════════════════════════════════════════════════════════════
function InvitationDetailModal({ invitation, onClose, onMutated }) {
  const [confirmingResend, setConfirmingResend] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revokeReason, setRevokeReason]         = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [error, setError]                       = useState(null);
  const [copied, setCopied]                     = useState(false);

  useEffect(() => {
    setConfirmingResend(false);
    setConfirmingRevoke(false);
    setRevokeReason("");
    setSubmitting(false);
    setError(null);
    setCopied(false);
  }, [invitation]);

  if (!invitation) return null;
  const inv = invitation;

  const isTerminal      = inv.status === "REDEEMED" || inv.status === "EXPIRED" || inv.status === "REVOKED";
  const isRedeemable     = inv.status === "SENT" || inv.status === "DELIVERY_FAILED";
  const resendExhausted  = (inv.delivery_attempts ?? 0) >= MAX_RESEND_ATTEMPTS;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(inv.invitation_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable — silently ignore */ }
  };

  const handleResend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.admin.resendInvitation(inv.id, {});
      onMutated?.();
      onClose();
    } catch (e) {
      setError(e.message ?? "Resend failed.");
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (revokeReason.trim().length === 0) {
      setError("A reason is required to revoke.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.admin.revokeInvitation(inv.id, { reason: revokeReason.trim() });
      onMutated?.();
      onClose();
    } catch (e) {
      setError(e.message ?? "Revoke failed.");
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!invitation} onClose={!submitting ? onClose : undefined} title={fullName(inv)}>
      {error && <Alert type="error" message={error} onDismiss={() => setError(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Badge variant={badgeVariantForStatus(inv.status)}>{inv.status_label}</Badge>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{expiryLabel(inv)}</span>
      </div>

      <DetailRow label="Email" value={inv.email} />
      <DetailRow label="Phone" value={inv.phone_number} />
      <DetailRow label="Package" value={`${inv.package_name} (${inv.package_tier})`} />

      <div className="rc-field">
        <div className="rc-label">Invitation Code</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>{inv.invitation_code}</span>
          <button className="btn-icon" onClick={handleCopyCode} aria-label="Copy code" title="Copy code" style={{ width: 28, height: 28 }}>
            {copied ? <CheckIcon size={13} strokeWidth={2} style={{ color: "var(--accent)" }} /> : <CopyIcon size={13} strokeWidth={2} />}
          </button>
        </div>
      </div>

      <DetailRow label="Delivery" value={`${inv.delivery_status} · ${inv.delivery_attempts}/${MAX_RESEND_ATTEMPTS} attempts${inv.last_delivery_at ? ` · last ${timeAgo(inv.last_delivery_at * 1000)}` : ""}`} />
      {inv.delivery_error && <DetailRow label="Delivery Error" value={inv.delivery_error} danger />}
      {inv.personal_note && <DetailRow label="Note" value={inv.personal_note} />}
      <DetailRow label="Created" value={formatDateTime(inv.created_at * 1000)} />
      <DetailRow label="Expires" value={formatDateTime(inv.expires_at * 1000)} />

      {inv.status === "REDEEMED" && inv.redeemed_at && (
        <DetailRow label="Redeemed" value={formatDateTime(inv.redeemed_at * 1000)} accent />
      )}
      {inv.status === "REVOKED" && (
        <>
          {inv.revoked_at && <DetailRow label="Revoked" value={formatDateTime(inv.revoked_at * 1000)} danger />}
          {inv.revoke_reason && <DetailRow label="Revoke Reason" value={inv.revoke_reason} danger />}
        </>
      )}

      {!isTerminal && (
        <div className="drawer-divider" style={{ margin: "18px 0" }} />
      )}

      {/* ── Resend ── */}
      {isRedeemable && !confirmingRevoke && (
        confirmingResend ? (
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 10 }}>
              Resend the WhatsApp/SMS message with the same code? ({MAX_RESEND_ATTEMPTS - inv.delivery_attempts} attempt{MAX_RESEND_ATTEMPTS - inv.delivery_attempts === 1 ? "" : "s"} remaining)
            </p>
            <div className="rc-confirm-actions">
              <button className="btn-secondary" onClick={() => setConfirmingResend(false)} disabled={submitting}>Cancel</button>
              <button className="btn-primary" onClick={handleResend} disabled={submitting}>
                {submitting ? <Spinner size="sm" /> : "Resend"}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn-secondary"
            style={{ width: "100%", marginBottom: 10 }}
            disabled={resendExhausted}
            title={resendExhausted ? "Max resend attempts reached" : undefined}
            onClick={() => setConfirmingResend(true)}
          >
            <SendIcon size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {resendExhausted ? "Resend limit reached" : "Resend"}
          </button>
        )
      )}

      {/* ── Revoke ── */}
      {!isTerminal && !confirmingResend && (
        confirmingRevoke ? (
          <div>
            <div className="rc-field">
              <label className="rc-label" htmlFor="revoke-reason">Reason (required)</label>
              <textarea
                id="revoke-reason"
                className="rc-input"
                rows={2}
                style={{ resize: "vertical", minHeight: 44 }}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                maxLength={MAX_REASON_LEN}
                placeholder="e.g. Sent to wrong number, requested by user…"
              />
            </div>
            <div className="rc-confirm-actions">
              <button className="btn-secondary" onClick={() => { setConfirmingRevoke(false); setRevokeReason(""); }} disabled={submitting}>Cancel</button>
              <button className="btn-primary btn-danger" style={{ background: "var(--danger-dim)", border: "1px solid var(--danger-border)", color: "var(--danger)" }} onClick={handleRevoke} disabled={submitting || !revokeReason.trim()}>
                {submitting ? <Spinner size="sm" /> : "Revoke"}
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary" style={{ width: "100%", color: "var(--danger)", borderColor: "var(--danger-border)" }} onClick={() => setConfirmingRevoke(true)}>
            <BanIcon size={14} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Revoke Invitation
          </button>
        )
      )}
    </Modal>
  );
}

// ─── SMALL SHARED SUB-COMPONENTS ─────────────────────────────────────────────

function DetailRow({ label, value, danger, accent }) {
  return (
    <div className="rc-field" style={{ marginBottom: 10 }}>
      <div className="rc-label">{label}</div>
      <div style={{ fontSize: 13, color: danger ? "var(--danger)" : accent ? "var(--accent)" : "var(--text)", wordBreak: "break-word" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function FieldError({ text }) {
  return (
    <div style={{ marginTop: 5, fontSize: 11, color: "var(--danger)", display: "flex", alignItems: "center", gap: 4 }}>
      <AlertCircleIcon size={11} strokeWidth={2} aria-hidden="true" />
      {text}
    </div>
  );
}

function SkeletonBlock({ height = 76 }) {
  return <div className="rc-skeleton" style={{ height, borderRadius: "var(--radius-lg)" }} />;
}

function MiniStat({ label, value, sub, tone }) {
  const color =
    tone === "danger" ? "var(--danger)" :
    tone === "warning" ? "var(--warning)" :
    tone === "accent"  ? "var(--accent)"  :
    "var(--text)";
  return (
    <div className="dash-card">
      <h3>{label}</h3>
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
