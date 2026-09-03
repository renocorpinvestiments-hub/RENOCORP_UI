/**
 * notifications/Notifications.jsx — RENOCORP Notifications Screen  v1.0
 * =======================================================================
 * Paginated notification feed (All / Unread), tap-to-navigate, mark-read
 * (single + bulk), and a per-type mute preferences panel.
 *
 * Architecture
 * ------------
 *  · Ownership split with settings/Settings.jsx: Settings already owns
 *    the two GLOBAL channel toggles (push_enabled, email_enabled) via
 *    the same GET/PATCH /notifications/preferences contract. This screen
 *    deliberately does NOT duplicate those — it owns the OTHER half of
 *    NotificationPreferences that nothing else builds yet: the granular
 *    per-type muted_types list. Two screens, two non-overlapping slices
 *    of the same preferences object, one PATCH endpoint. A link back to
 *    Settings covers the channel toggles instead of re-rendering them.
 *  · CRITICAL types can't actually be muted — the backend's
 *    UpdatePreferencesRequest validator only checks muted_types values
 *    are valid enum members; the actual "can't mute this" enforcement
 *    happens in the SERVICE layer, which silently drops PASSWORD_CHANGED
 *    / LOGIN_NEW_DEVICE / SESSION_REVOKED from muted_types before saving
 *    (see models.py::_SECURITY_TYPES). Rather than let a user flip a
 *    toggle that gets silently reverted server-side, those three rows
 *    are rendered locked/always-on with an explanatory caption — the
 *    same "don't ship a control the backend will no-op" principle
 *    applied in packages/Packages.jsx's history-filter fix.
 *  · The backend's `icon` field on Notification (e.g. "check_circle",
 *    "volunteer_activism") is a Material Symbols name — this codebase
 *    uses lucide-react exclusively, so that field is intentionally
 *    ignored in favor of a local NotificationType → lucide icon map
 *    (mirrored 1:1 from rewards/Rewards.jsx's own TYPE_ICONS pattern,
 *    keyed by the same backend enum). `color_var` (e.g. "--danger") IS
 *    reused directly, since it already matches this app's own CSS
 *    custom-property design tokens — no re-mapping needed there.
 *  · Pagination is real page/page_size (PaginationBar), NOT the
 *    response's `next_cursor` field — GET /api/notifications's actual
 *    route signature (routes.py::get_notifications) only accepts page/
 *    page_size/unread_only; there is no incoming cursor parameter wired
 *    up server-side yet despite the response shape being cursor-ready.
 *    Shipping infinite-scroll against a cursor the backend can't accept
 *    would silently always re-fetch page 1. TODO(backend): accept
 *    `cursor` on GET /api/notifications to enable true infinite scroll
 *    on this live-writing table (see Rewards.jsx for why cursor >
 *    offset matters on tables new rows keep landing in).
 *  · Every markRead call is genuinely idempotent per the backend's own
 *    docs ("safe to call multiple times") — no client-generated
 *    idempotency key is needed here, unlike Withdraw/Packages.
 *  · Optimistic UI: marking a row read (or navigating off it) flips it
 *    read locally via a statusOverrides map (identical pattern to
 *    Withdraw.jsx) instead of waiting on a refetch, AND immediately
 *    patches the shared AuthContext.unreadCount so the TopNavBar bell
 *    badge updates instantly rather than waiting up to 30s for
 *    useNotifications' own poll tick. Mark-all-read is a rarer,
 *    deliberate action — that one just reloads the page outright rather
 *    than reconciling overrides across pages it hasn't fetched.
 *  · Quiet background poll (25s, page-1-only, pauses on hidden tab —
 *    same Page Visibility pattern as useNotifications.js / Rewards.jsx)
 *    keeps the feed itself fresh while the screen is open, without ever
 *    disrupting a user who has paged forward.
 *  · Tapping a notification's body navigates via action_url when
 *    present; when absent, falls back to a per-type in-app route (e.g.
 *    any WITHDRAWAL_* type → /withdraw) so every notification stays
 *    actionable even for the ones the backend didn't attach a deep link
 *    to. A separate small "mark read" control exists for notifications
 *    with no sensible destination (SYSTEM_ANNOUNCEMENT, PROMO) so they
 *    can still be dismissed without a pointless navigation.
 *
 * Backend contracts (verified against modules/notifications/{models,routes}.py):
 *  GET  /api/notifications/summary          → NotificationSummary { unread_count, unread_raw, recent[], computed_at }
 *  GET  /api/notifications?page&page_size&unread_only → NotificationPage
 *       { notifications[], total, page, page_size, total_pages, has_more, next_cursor, unread_count }
 *  POST /api/notifications/{id}/read        → { ok, notification_id }  (idempotent)
 *  POST /api/notifications/read-all         → { ok, marked_read }
 *  GET  /api/notifications/preferences      → NotificationPreferences { user_id, muted_types[], push_enabled, email_enabled, updated_at }
 *  PATCH /api/notifications/preferences     → NotificationPreferences (partial update; CRITICAL types silently kept unmuted)
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { Card } from "../components/Card.jsx";
import { Modal } from "../components/Modal.jsx";
import { TabBar } from "../components/TabBar.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ArrowLeftIcon,
  SettingsIcon,
  RefreshCwIcon,
  CheckIcon,
  CheckCircleIcon,
  XIcon,
  TrendingUpIcon,
  StarIcon,
  UserPlusIcon,
  GiftIcon,
  SendIcon,
  AlertCircleIcon,
  WalletIcon,
  ShieldCheckIcon,
  KeyIcon,
  MonitorIcon,
  LogOutIcon,
  BellIcon,
  MessageCircleIcon,
  InboxIcon,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// CONSTANTS — mirrored from modules/notifications/models.py
// ═════════════════════════════════════════════════════════════════════════

const PAGE_SIZE = 20;
const LIST_POLL_MS = 25_000; // page-1-only quiet refresh while screen is open

// NotificationType → lucide icon. Keys must match the backend enum
// exactly (modules/notifications/models.py::NotificationType).
const TYPE_ICONS = {
  TASK_COMPLETED: CheckCircleIcon,
  TASK_APPROVED: ShieldCheckIcon,
  TASK_REJECTED: XIcon,
  EARNING_CREDITED: TrendingUpIcon,
  DAILY_BONUS: StarIcon,
  REFERRAL_JOINED: UserPlusIcon,
  REFERRAL_BONUS_PAID: GiftIcon,
  WITHDRAWAL_SENT: SendIcon,
  WITHDRAWAL_COMPLETED: CheckCircleIcon,
  WITHDRAWAL_FAILED: AlertCircleIcon,
  WITHDRAWAL_REJECTED: XIcon,
  INSUFFICIENT_BALANCE: WalletIcon,
  ACCOUNT_VERIFIED: ShieldCheckIcon,
  PASSWORD_CHANGED: KeyIcon,
  LOGIN_NEW_DEVICE: MonitorIcon,
  SESSION_REVOKED: LogOutIcon,
  SYSTEM_ANNOUNCEMENT: BellIcon,
  PROMO: GiftIcon,
  ADMIN_MESSAGE: MessageCircleIcon,
};

// Fallback in-app destination when a notification has no action_url —
// keyed by NotificationType, values are HashRouter-relative paths.
const TYPE_ROUTE_FALLBACK = {
  TASK_COMPLETED: "/rewards",
  TASK_APPROVED: "/rewards",
  TASK_REJECTED: "/rewards",
  EARNING_CREDITED: "/rewards",
  DAILY_BONUS: "/rewards",
  REFERRAL_JOINED: "/invite",
  REFERRAL_BONUS_PAID: "/invite",
  WITHDRAWAL_SENT: "/withdraw",
  WITHDRAWAL_COMPLETED: "/withdraw",
  WITHDRAWAL_FAILED: "/withdraw",
  WITHDRAWAL_REJECTED: "/withdraw",
  INSUFFICIENT_BALANCE: "/withdraw",
  ACCOUNT_VERIFIED: "/settings",
  PASSWORD_CHANGED: "/settings",
  LOGIN_NEW_DEVICE: "/settings",
  SESSION_REVOKED: "/settings",
};

// Security types the backend will never actually let a user mute
// (models.py::_SECURITY_TYPES) — rendered locked, not hidden.
const LOCKED_TYPES = new Set(["PASSWORD_CHANGED", "LOGIN_NEW_DEVICE", "SESSION_REVOKED"]);

// Preferences panel groupings — mirrors the backend model's own comment
// groupings (Task/Earning, Referral, Withdrawal/Payment, Account/Security, System/Admin).
const PREFERENCE_GROUPS = [
  {
    label: "Tasks & Earnings",
    types: [
      ["TASK_COMPLETED", "Task completed"],
      ["TASK_APPROVED", "Task approved"],
      ["TASK_REJECTED", "Task rejected"],
      ["EARNING_CREDITED", "Earning credited"],
      ["DAILY_BONUS", "Daily check-in bonus"],
    ],
  },
  {
    label: "Referrals",
    types: [
      ["REFERRAL_JOINED", "New referral joined"],
      ["REFERRAL_BONUS_PAID", "Referral bonus paid"],
    ],
  },
  {
    label: "Withdrawals & Payments",
    types: [
      ["WITHDRAWAL_SENT", "Withdrawal sent"],
      ["WITHDRAWAL_COMPLETED", "Withdrawal completed"],
      ["WITHDRAWAL_FAILED", "Withdrawal failed"],
      ["WITHDRAWAL_REJECTED", "Withdrawal rejected"],
      ["INSUFFICIENT_BALANCE", "Insufficient balance alerts"],
    ],
  },
  {
    label: "Account",
    types: [["ACCOUNT_VERIFIED", "Account verified"]],
  },
  {
    label: "Security Alerts",
    locked: true,
    types: [
      ["PASSWORD_CHANGED", "Password changed"],
      ["LOGIN_NEW_DEVICE", "New device login"],
      ["SESSION_REVOKED", "Session signed out remotely"],
    ],
  },
  {
    label: "System & Promotions",
    types: [
      ["SYSTEM_ANNOUNCEMENT", "System announcements"],
      ["PROMO", "Promotions & offers"],
      ["ADMIN_MESSAGE", "Direct messages from RENOCORP"],
    ],
  },
];

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════

function resolveDestination(notif) {
  if (notif.action_url) return notif.action_url;
  return TYPE_ROUTE_FALLBACK[notif.type] ?? null;
}

function isExternal(url) {
  return /^https?:\/\//i.test(url ?? "");
}

// ═════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═════════════════════════════════════════════════════════════════════════

function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`rc-switch ${checked ? "rc-switch-on" : ""}`}
    >
      <span className="rc-switch-thumb" />
    </button>
  );
}

const NotificationRow = memo(function NotificationRow({ notif, onOpen, onMarkRead, marking }) {
  const Icon = TYPE_ICONS[notif.type] ?? BellIcon;
  const destination = resolveDestination(notif);
  const unread = !notif.is_read;

  return (
    <div
      role={destination ? "button" : undefined}
      tabIndex={destination ? 0 : undefined}
      onClick={destination ? () => onOpen(notif, destination) : undefined}
      onKeyDown={
        destination
          ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(notif, destination); } }
          : undefined
      }
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "13px 14px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: unread ? "var(--surface-3)" : "var(--surface-2)",
        marginBottom: 8,
        cursor: destination ? "pointer" : "default",
        position: "relative",
      }}
    >
      {unread && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute", top: 14, left: 4,
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      )}
      <div
        aria-hidden="true"
        style={{
          width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--surface-4)",
          color: `var(${notif.color_var ?? "--text-muted"})`,
          marginLeft: unread ? 6 : 0,
        }}
      >
        <Icon size={16} strokeWidth={2} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: unread ? 800 : 600, fontSize: 13.5 }}>{notif.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.4 }}>
          {notif.body}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 6 }} title={formatDateTime(notif.created_at * 1000)}>
          {timeAgo(notif.created_at * 1000)}
        </div>
      </div>

      {unread && (
        <button
          className="btn-ghost btn-icon"
          onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id); }}
          disabled={marking}
          aria-label="Mark as read"
          style={{ flexShrink: 0 }}
        >
          {marking ? <Spinner size="sm" /> : <CheckIcon size={15} strokeWidth={2} />}
        </button>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════

export default function Notifications() {
  const navigate = useNavigate();
  const { setUnreadCount } = useAuth();

  const [tab, setTab] = useState("all"); // "all" | "unread"
  const [page, setPage] = useState(1);

  const {
    data: list,
    loading: listLoading,
    isRefetching: listRefetching,
    error: listError,
    reload: reloadList,
  } = useApi(
    () => api.notifications.list({ page, page_size: PAGE_SIZE, unread_only: tab === "unread" }),
    [page, tab]
  );

  // Sync the authoritative unread_count this response already carries
  // ("included for convenience — avoids extra call") into the shared
  // badge, so the bell in TopNavBar reflects exactly what's on screen.
  useEffect(() => {
    if (list?.unread_count != null) setUnreadCount(list.unread_count);
  }, [list?.unread_count, setUnreadCount]);

  const handleTabChange = useCallback((key) => {
    setTab(key);
    setPage(1);
  }, []);

  // ── Optimistic per-row read overrides (mirrors Withdraw.jsx's statusOverrides) ──
  const [readOverrides, setReadOverrides] = useState({}); // id -> true
  const [markingIds, setMarkingIds] = useState({}); // id -> bool
  const [rowError, setRowError] = useState(null);

  const markRead = useCallback(
    async (id) => {
      setReadOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      setMarkingIds((prev) => ({ ...prev, [id]: true }));
      setUnreadCount((c) => Math.max(0, (c ?? 1) - 1));
      try {
        await api.notifications.markRead(id);
      } catch (e) {
        // Roll back — the read state may not have actually persisted.
        setReadOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setRowError(e.message ?? "Could not mark that as read. Please try again.");
        reloadList(); // reconcile unread_count/badge with server truth
      } finally {
        setMarkingIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [setUnreadCount, reloadList]
  );

  const handleOpen = useCallback(
    (notif, destination) => {
      if (!notif.is_read) markRead(notif.id);
      if (isExternal(destination)) {
        window.open(destination, "_blank", "noopener");
      } else {
        navigate(destination);
      }
    },
    [markRead, navigate]
  );

  const [markingAll, setMarkingAll] = useState(false);
  const handleMarkAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    setRowError(null);
    try {
      await api.notifications.markAllRead();
      setUnreadCount(0);
      reloadList();
    } catch (e) {
      setRowError(e.message ?? "Could not mark all as read. Please try again.");
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, setUnreadCount, reloadList]);

  // ── Quiet background refresh — page 1 only, pauses when hidden ──────────
  useEffect(() => {
    if (page !== 1) return;
    let timer = null;
    let cancelled = false;

    const schedule = () => { timer = setTimeout(tick, LIST_POLL_MS); };
    const tick = () => {
      if (!cancelled && typeof document !== "undefined" && !document.hidden) {
        reloadList();
      }
      schedule();
    };
    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tab]);

  // ── Preferences (muted_types only — channel toggles live in Settings) ──
  const [prefsOpen, setPrefsOpen] = useState(false);
  const {
    data: prefs,
    loading: prefsLoading,
    error: prefsError,
    reload: reloadPrefs,
  } = useApi(() => api.notifications.preferences(), []);

  // Local optimistic copy of muted_types — the actual render source of
  // truth while the panel is open. Synced from the server whenever a
  // fresh `prefs` lands (initial load, or after a successful/failed save
  // reconciles). Using functional setState below (not the `prefs`
  // closure directly) means two rapid taps on different rows compose
  // correctly instead of racing: the second toggle always builds on top
  // of the first's already-applied change, not a stale snapshot from
  // before either fired.
  const [localMuted, setLocalMuted] = useState(null); // null until first load
  useEffect(() => {
    if (prefs) setLocalMuted(prefs.muted_types ?? []);
  }, [prefs]);

  const [typeSaving, setTypeSaving] = useState(null);
  const [prefsSaveError, setPrefsSaveError] = useState(null);
  const mutedSet = useMemo(() => new Set(localMuted ?? []), [localMuted]);

  const handleTypeToggle = useCallback((type, shouldNotify) => {
    setPrefsSaveError(null);
    setTypeSaving(type);
    setLocalMuted((prevMuted) => {
      const current = new Set(prevMuted ?? []);
      if (shouldNotify) current.delete(type); else current.add(type);
      const next = Array.from(current);

      api.notifications.updatePrefs({ muted_types: next })
        .then(() => reloadPrefs())
        .catch((e) => {
          setPrefsSaveError(e.message ?? "Could not save that preference. Please try again.");
          reloadPrefs(); // resync localMuted with actual server state via the effect above
        })
        .finally(() => setTypeSaving((cur) => (cur === type ? null : cur)));

      return next; // instant optimistic UI update
    });
  }, [reloadPrefs]);

  // ── Derived render data ──────────────────────────────────────────────
  const items = useMemo(
    () => (list?.notifications ?? []).map((n) => (readOverrides[n.id] ? { ...n, is_read: true } : n)),
    [list, readOverrides]
  );
  const hasUnread = (list?.unread_count ?? 0) > 0;

  const tabs = useMemo(
    () => [
      { key: "all", label: "All" },
      { key: "unread", label: "Unread", count: tab === "unread" ? undefined : (list?.unread_count > 0 ? list.unread_count : undefined) },
    ],
    [list, tab]
  );

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="btn-icon"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
          >
            <ArrowLeftIcon size={17} strokeWidth={2} />
          </button>
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Notifications</h2>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn-ghost btn-icon" onClick={() => reloadList()} aria-label="Refresh">
            <RefreshCwIcon size={16} strokeWidth={2} className={listRefetching ? "spin" : undefined} />
          </button>
          <button className="btn-ghost btn-icon" onClick={() => setPrefsOpen(true)} aria-label="Notification preferences">
            <SettingsIcon size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {rowError && (
        <Alert type="error" message={rowError} onDismiss={() => setRowError(null)} style={{ marginBottom: 16 }} />
      )}

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
          <TabBar tabs={tabs} active={tab} onChange={handleTabChange} />
          {hasUnread && (
            <button className="link-btn" onClick={handleMarkAllRead} disabled={markingAll} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
              {markingAll ? <Spinner size="sm" /> : "Mark all read"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          {listError ? (
            <Alert type="error">
              <span>{listError}</span>
              <button className="link-btn" onClick={reloadList} style={{ marginLeft: 8 }}>Retry</button>
            </Alert>
          ) : listLoading && !list ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={tab === "unread" ? "✅" : "🔔"}
              title={tab === "unread" ? "You're all caught up" : "No notifications yet"}
              message={tab === "unread" ? "New notifications will show up here." : "Activity on your account will show up here."}
            />
          ) : (
            <>
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notif={n}
                  onOpen={handleOpen}
                  onMarkRead={markRead}
                  marking={!!markingIds[n.id]}
                />
              ))}
              <PaginationBar page={list.page} total={list.total} limit={list.page_size} onChange={setPage} />
            </>
          )}
        </div>
      </Card>

      {/* ── Preferences modal ── */}
      <Modal open={prefsOpen} onClose={() => setPrefsOpen(false)} title="Notification Types">
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.5 }}>
          Choose which types of notifications you want to receive. Push and
          email delivery channels are managed separately in{" "}
          <button className="link-btn" onClick={() => { setPrefsOpen(false); navigate("/settings"); }} style={{ display: "inline" }}>
            Settings
          </button>.
        </p>

        {prefsError && <Alert type="error" message={prefsError} onDismiss={reloadPrefs} style={{ marginBottom: 14 }} />}
        {prefsSaveError && <Alert type="error" message={prefsSaveError} onDismiss={() => setPrefsSaveError(null)} style={{ marginBottom: 14 }} />}

        {localMuted === null ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
            <Spinner />
          </div>
        ) : (
          <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
            {PREFERENCE_GROUPS.map((group) => (
              <div key={group.label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                  {group.label}
                </div>
                {group.locked && (
                  <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8 }}>
                    Security alerts can't be muted — you'll always be notified.
                  </div>
                )}
                {group.types.map(([type, label]) => {
                  const locked = LOCKED_TYPES.has(type);
                  const notify = locked ? true : !mutedSet.has(type);
                  return (
                    <div
                      key={type}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 10, padding: "8px 0",
                      }}
                    >
                      <span style={{ fontSize: 13, color: locked ? "var(--text-muted)" : "var(--text)" }}>{label}</span>
                      <ToggleSwitch
                        label={label}
                        checked={notify}
                        disabled={locked || typeSaving === type || prefsLoading}
                        onChange={(v) => handleTypeToggle(type, v)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 4, padding: "0 4px" }}>
        <InboxIcon size={12} strokeWidth={2} style={{ color: "var(--text-dim)", marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Notifications are kept for your records even after you mark them read.
        </p>
      </div>
    </div>
  );
}
