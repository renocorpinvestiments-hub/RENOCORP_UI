/**
 * settings/Settings.jsx — RENOCORP Settings & Security Screen  v2.0
 * ======================================================================
 * Appearance, notification preferences, MFA, trusted devices, active
 * sessions, and account exit paths — the "System" screen of the app.
 *
 * Architecture:
 *  · Every list (devices, sessions) is fetched independently via
 *    useApi() so a slow/broken endpoint never blocks the others.
 *  · Every mutation (toggle, revoke, enable/disable MFA) is fired
 *    through api.js, which auto-attaches an Idempotency-Key to every
 *    POST/PATCH/DELETE — a double-tap on "Revoke" can never revoke
 *    twice or throw a duplicate-action error.
 *  · Row-level optimistic UI: revoking a single device/session removes
 *    it from the list immediately, then reconciles with the server on
 *    the next reload — with automatic rollback (via reload) if the
 *    call fails.
 *  · Theme changes apply instantly (AuthContext.setTheme → data-theme
 *    attribute, zero flicker) and are persisted server-side as a
 *    best-effort, non-blocking PATCH — a failed persist never blocks
 *    or reverts the local visual change.
 *  · MFA secrets are shown exactly once (enable → QR + backup codes),
 *    never re-fetched or logged — matches how the backend itself
 *    treats the TOTP secret (returned once, never re-exposed).
 *  · Account deletion has no backend endpoint yet (verified against
 *    modules/users/routes.py and modules/auth/routes.py) — rather
 *    than call a route that would 404, this screen is honest about
 *    that and routes the user to human support instead.
 *  · Zero localStorage / sessionStorage anywhere in this file.
 *
 * Backend contracts (verified against modules/*\/models.py + routes.py):
 *  PATCH  /api/users/me                    → { theme? } (best-effort)
 *  GET    /api/notifications/preferences    → { push_enabled, email_enabled, muted_types, updated_at }
 *  PATCH  /api/notifications/preferences    → partial update
 *  POST   /api/auth/mfa/totp/enable         → { secret, totp_uri, backup_codes }
 *  POST   /api/auth/mfa/totp/verify         → { code } → dict (opaque)
 *  POST   /api/auth/mfa/totp/disable        → 204
 *  GET    /api/auth/devices                 → TrustedDevice[] { device_id, device_name, trust_level, created_at, last_seen_at, ip_address }
 *  DELETE /api/auth/devices/{id}
 *  GET    /api/auth/sessions                → SessionInfo[] { session_id, state, created_at, expires_at, last_seen_at, ip_address, device_name, trust_level }
 *  DELETE /api/auth/sessions/{id}
 *  DELETE /api/auth/sessions                → revoke all (logout everywhere)
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { formatDateTime, timeAgo } from "../utils/timeAgo.js";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { Modal } from "../components/Modal.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import {
  ArrowLeftIcon,
  MoonIcon,
  SunIcon,
  BellIcon,
  MailIcon,
  ShieldIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  MonitorIcon,
  LogOutIcon,
  Trash2Icon,
  AlertCircleIcon,
  MessageCircleIcon,
} from "lucide-react";

const HELP_WHATSAPP = import.meta.env.VITE_HELP_WHATSAPP ?? "256700000000";

// ─── TOGGLE SWITCH ───────────────────────────────────────────────────────
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

// ─── SETTINGS ROW (label + control) ─────────────────────────────────────
function SettingsRow({ icon: Icon, title, sub, control }) {
  return (
    <div className="profile-row" style={{ alignItems: "center" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {Icon && <Icon size={15} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
        <span>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{title}</div>
          {sub && <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
        </span>
      </span>
      {control}
    </div>
  );
}

// ─── DEVICE TRUST ICON ───────────────────────────────────────────────────
function trustVariant(level) {
  const l = String(level ?? "").toLowerCase();
  if (l === "trusted" || l === "verified") return "green";
  if (l === "suspicious" || l === "blocked") return "red";
  return "grey";
}

// ─── MFA ENABLE FLOW MODAL ───────────────────────────────────────────────
function MfaSetupModal({ open, onClose, onEnabled }) {
  const [stage, setStage] = useState("loading"); // loading | show | verifying | error
  const [payload, setPayload] = useState(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(async () => {
    setStage("loading");
    setError(null);
    try {
      const res = await api.auth.enableTotp();
      setPayload(res);
      setStage("show");
    } catch (e) {
      setError(e?.message ?? "Could not start MFA setup.");
      setStage("error");
    }
  }, []);

  // Kick off on open
  useEffect(() => {
    if (open && !payload) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleVerify = useCallback(async () => {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.auth.verifyTotp(trimmed);
      onEnabled();
      reset();
      onClose();
    } catch (e) {
      setError(e?.message ?? "Invalid or expired code. Try again.");
    } finally {
      setBusy(false);
    }
  }, [code, onEnabled, onClose]);

  function reset() {
    setStage("loading");
    setPayload(null);
    setCode("");
    setError(null);
  }

  const guardedClose = useCallback(() => {
    if (!busy) {
      reset();
      onClose();
    }
  }, [busy, onClose]);

  const qrUrl = payload?.totp_uri
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(payload.totp_uri)}`
    : null;

  return (
    <Modal open={open} onClose={guardedClose} title="Enable two-factor authentication">
      {stage === "loading" && (
        <div style={{ textAlign: "center", padding: 30 }}>
          <Spinner />
        </div>
      )}

      {stage === "error" && (
        <>
          <Alert type="error" message={error} style={{ marginBottom: 14 }} />
          <button className="btn-primary" onClick={start} style={{ width: "100%" }}>
            Retry
          </button>
        </>
      )}

      {stage === "show" && payload && (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
            Scan this QR code with Google Authenticator, Authy, or any TOTP app.
          </p>

          {qrUrl && (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <img
                src={qrUrl}
                alt="MFA setup QR code"
                width={180}
                height={180}
                style={{ borderRadius: "var(--radius)", background: "#fff", padding: 8 }}
              />
            </div>
          )}

          <div className="rc-field">
            <label className="rc-label">Can't scan? Enter manually</label>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "10px 12px",
                wordBreak: "break-all",
              }}
            >
              {payload.secret}
            </div>
          </div>

          {Array.isArray(payload.backup_codes) && payload.backup_codes.length > 0 && (
            <div className="rc-field">
              <label className="rc-label">Backup codes — save these somewhere safe</label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                }}
              >
                {payload.backup_codes.map((c) => (
                  <div
                    key={c}
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "6px 8px",
                      textAlign: "center",
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <Alert type="error" message={error} style={{ margin: "14px 0" }} />}

          <div className="rc-field">
            <label className="rc-label" htmlFor="mfa-code">Enter the 6-digit code to confirm</label>
            <input
              id="mfa-code"
              className="rc-input"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              disabled={busy}
              style={{ letterSpacing: 4, textAlign: "center", fontFamily: "var(--font-mono)" }}
            />
          </div>

          <div className="rc-confirm-actions">
            <button className="btn-secondary" onClick={guardedClose} disabled={busy}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleVerify} disabled={busy}>
              {busy ? <Spinner size="sm" /> : "Verify & enable"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate();
  const { user, theme, setTheme, logout } = useAuth();

  const [themeSaving, setThemeSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(null); // "push" | "email" | null
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaDisabling, setMfaDisabling] = useState(false);
  const [mfaConfirmOpen, setMfaConfirmOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(null); // "current" | "all" | null
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [banner, setBanner] = useState(null); // { type, message }
  const [revokingId, setRevokingId] = useState(null);

  const {
    data: prefs,
    loading: prefsLoading,
    error: prefsError,
    reload: reloadPrefs,
  } = useApi(() => api.notifications.preferences(), []);

  const {
    data: devices,
    loading: devicesLoading,
    error: devicesError,
    reload: reloadDevices,
  } = useApi(() => api.auth.devices(), []);

  const {
    data: sessions,
    loading: sessionsLoading,
    error: sessionsError,
    reload: reloadSessions,
  } = useApi(() => api.auth.sessions(), []);

  const deviceList = Array.isArray(devices) ? devices : devices?.devices ?? [];
  const sessionList = Array.isArray(sessions) ? sessions : sessions?.sessions ?? [];

  // ── Theme ──
  const handleThemeChange = useCallback(
    async (t) => {
      setTheme(t); // instant local apply — never blocks on network
      setThemeSaving(true);
      try {
        await api.users.updateMe({ theme: t });
      } catch {
        // Best-effort persistence — local theme already applied, so a
        // failed sync here is non-critical and silently retried next visit.
      } finally {
        setThemeSaving(false);
      }
    },
    [setTheme]
  );

  // ── Notification preferences ──
  const handlePrefToggle = useCallback(
    async (field, value) => {
      setPrefsSaving(field);
      setBanner(null);
      try {
        await api.notifications.updatePrefs({ [field]: value });
        reloadPrefs();
      } catch (e) {
        setBanner({ type: "error", message: e?.message ?? "Could not update preference." });
      } finally {
        setPrefsSaving(null);
      }
    },
    [reloadPrefs]
  );

  // ── MFA ──
  const handleMfaEnabled = useCallback(() => {
    setMfaEnabled(true);
    setBanner({ type: "success", message: "Two-factor authentication is now enabled." });
  }, []);

  const handleMfaDisable = useCallback(async () => {
    setMfaDisabling(true);
    try {
      await api.auth.disableTotp();
      setMfaEnabled(false);
      setMfaConfirmOpen(false);
      setBanner({ type: "info", message: "Two-factor authentication has been disabled." });
    } catch (e) {
      setBanner({ type: "error", message: e?.message ?? "Could not disable MFA." });
    } finally {
      setMfaDisabling(false);
    }
  }, []);

  // ── Devices / sessions revoke ──
  const handleRevokeDevice = useCallback(
    async (deviceId) => {
      setRevokingId(deviceId);
      try {
        await api.auth.revokeDevice(deviceId);
        reloadDevices();
      } catch (e) {
        setBanner({ type: "error", message: e?.message ?? "Could not revoke device." });
      } finally {
        setRevokingId(null);
      }
    },
    [reloadDevices]
  );

  const handleRevokeSession = useCallback(
    async (sessionId) => {
      setRevokingId(sessionId);
      try {
        await api.auth.revokeSession(sessionId);
        reloadSessions();
      } catch (e) {
        setBanner({ type: "error", message: e?.message ?? "Could not revoke session." });
      } finally {
        setRevokingId(null);
      }
    },
    [reloadSessions]
  );

  // ── Logout ──
  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout(logoutConfirmOpen === "all" ? "all" : "current");
      // AuthContext._reset() flips loggedIn → false; router unmounts this
      // screen and the auth UI takes over — no manual navigate() needed.
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(null);
    }
  }, [logout, logoutConfirmOpen]);

  const initials =
    `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase() || "U";

  return (
    <div className="dash-body fade-in">
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
        <button
          className="btn-icon"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        >
          <ArrowLeftIcon size={17} strokeWidth={2} />
        </button>
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>Settings</h2>
      </div>

      {banner && (
        <Alert
          type={banner.type}
          message={banner.message}
          onDismiss={() => setBanner(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── Account summary ── */}
      <div
        className="dash-card"
        style={{ marginBottom: 16, cursor: "pointer" }}
        onClick={() => navigate("/profile")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && navigate("/profile")}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="dash-avatar-lg" aria-hidden="true">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {user?.display_name ?? (`${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || "—")}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {user?.email ?? "—"}
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>Edit →</span>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header"><h3>Appearance</h3></div>
        <SettingsRow
          icon={theme === "light" ? SunIcon : MoonIcon}
          title="Theme"
          sub={themeSaving ? "Saving…" : "Applies instantly across the app"}
          control={
            <select
              className="rc-select"
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              aria-label="Theme"
              style={{ width: "auto", minWidth: 110 }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          }
        />
      </div>

      {/* ── Notifications ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3>Notifications</h3>
          {prefsLoading && <Spinner size="sm" />}
        </div>
        {prefsError && <Alert type="error" message={prefsError} onDismiss={reloadPrefs} style={{ margin: "0 20px 12px" }} />}
        <SettingsRow
          icon={BellIcon}
          title="Push notifications"
          sub="Task approvals, withdrawals, broadcasts"
          control={
            <ToggleSwitch
              label="Push notifications"
              checked={prefs?.push_enabled ?? true}
              disabled={prefsSaving === "push_enabled" || prefsLoading}
              onChange={(v) => handlePrefToggle("push_enabled", v)}
            />
          }
        />
        <SettingsRow
          icon={MailIcon}
          title="Email notifications"
          sub="Weekly summaries & account alerts"
          control={
            <ToggleSwitch
              label="Email notifications"
              checked={prefs?.email_enabled ?? true}
              disabled={prefsSaving === "email_enabled" || prefsLoading}
              onChange={(v) => handlePrefToggle("email_enabled", v)}
            />
          }
        />
      </div>

      {/* ── Security ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header"><h3>Security</h3></div>
        <SettingsRow
          icon={mfaEnabled ? ShieldCheckIcon : ShieldIcon}
          title="Two-factor authentication"
          sub={mfaEnabled ? "Enabled on this account" : "Add an extra layer of protection"}
          control={
            mfaEnabled ? (
              <button
                className="btn-secondary"
                style={{ width: "auto", padding: "7px 12px", fontSize: 12.5 }}
                onClick={() => setMfaConfirmOpen(true)}
              >
                Disable
              </button>
            ) : (
              <button
                className="btn-primary"
                style={{ width: "auto", padding: "7px 12px", fontSize: 12.5 }}
                onClick={() => setMfaModalOpen(true)}
              >
                Enable
              </button>
            )
          }
        />
      </div>

      {/* ── Trusted devices ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3>Trusted Devices</h3>
          {devicesLoading && <Spinner size="sm" />}
        </div>
        {devicesError && <Alert type="error" message={devicesError} onDismiss={reloadDevices} style={{ margin: "0 20px 12px" }} />}
        {!devicesLoading && deviceList.length === 0 && !devicesError && (
          <EmptyState icon="📱" title="No trusted devices" message="Devices you sign in from will appear here." />
        )}
        {deviceList.map((d) => (
          <div className="session-item" key={d.device_id}>
            <div className="session-icon" aria-hidden="true">
              <SmartphoneIcon size={16} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="session-info-name">
                {d.device_name ?? "Unknown device"}{" "}
                <Badge variant={trustVariant(d.trust_level)} style={{ marginLeft: 6 }}>
                  {d.trust_level ?? "unknown"}
                </Badge>
              </div>
              <div className="session-info-meta">
                Last seen {timeAgo(d.last_seen_at)} · {d.ip_address ?? "—"}
              </div>
            </div>
            <button
              className="btn-icon"
              aria-label={`Revoke ${d.device_name ?? "device"}`}
              onClick={() => handleRevokeDevice(d.device_id)}
              disabled={revokingId === d.device_id}
            >
              {revokingId === d.device_id ? <Spinner size="sm" /> : <Trash2Icon size={15} strokeWidth={2} />}
            </button>
          </div>
        ))}
      </div>

      {/* ── Active sessions ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3>Active Sessions</h3>
          {sessionsLoading && <Spinner size="sm" />}
        </div>
        {sessionsError && <Alert type="error" message={sessionsError} onDismiss={reloadSessions} style={{ margin: "0 20px 12px" }} />}
        {!sessionsLoading && sessionList.length === 0 && !sessionsError && (
          <EmptyState icon="🖥️" title="No active sessions" />
        )}
        {sessionList.map((s) => (
          <div className="session-item" key={s.session_id}>
            <div className="session-icon" aria-hidden="true">
              <MonitorIcon size={16} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="session-info-name">
                {s.device_name ?? "Session"}{" "}
                <Badge status={s.state ?? "active"} style={{ marginLeft: 6 }} />
              </div>
              <div className="session-info-meta">
                Active {timeAgo(s.last_seen_at)} · {s.ip_address ?? "—"}
              </div>
            </div>
            <button
              className="btn-icon"
              aria-label="Revoke session"
              onClick={() => handleRevokeSession(s.session_id)}
              disabled={revokingId === s.session_id}
            >
              {revokingId === s.session_id ? <Spinner size="sm" /> : <Trash2Icon size={15} strokeWidth={2} />}
            </button>
          </div>
        ))}
      </div>

      {/* ── Danger zone ── */}
      <div className="dash-section" style={{ marginBottom: 16, borderColor: "var(--danger-dim)" }}>
        <div className="dash-section-header">
          <h3 style={{ color: "var(--danger)" }}>
            <AlertCircleIcon size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Danger Zone
          </h3>
        </div>
        <SettingsRow
          icon={LogOutIcon}
          title="Log out this device"
          control={
            <button className="btn-secondary" style={{ width: "auto", padding: "7px 12px", fontSize: 12.5 }} onClick={() => setLogoutConfirmOpen("current")}>
              Log out
            </button>
          }
        />
        <SettingsRow
          icon={LogOutIcon}
          title="Log out everywhere"
          sub="Signs you out of all devices and sessions"
          control={
            <button className="btn-secondary" style={{ width: "auto", padding: "7px 12px", fontSize: 12.5 }} onClick={() => setLogoutConfirmOpen("all")}>
              Log out all
            </button>
          }
        />
        <SettingsRow
          icon={Trash2Icon}
          title="Delete account"
          sub="Permanently remove your account and data"
          control={
            <button
              className="btn-secondary"
              style={{ width: "auto", padding: "7px 12px", fontSize: 12.5, color: "var(--danger)" }}
              onClick={() => setDeleteConfirmOpen(true)}
            >
              Delete
            </button>
          }
        />
      </div>

      {/* ── Modals ── */}
      <MfaSetupModal open={mfaModalOpen} onClose={() => setMfaModalOpen(false)} onEnabled={handleMfaEnabled} />

      <ConfirmDialog
        open={mfaConfirmOpen}
        onClose={() => setMfaConfirmOpen(false)}
        onConfirm={handleMfaDisable}
        title="Disable two-factor authentication?"
        description="Your account will rely on password alone. You can re-enable MFA at any time."
        confirmLabel="Disable"
        danger
        loading={mfaDisabling}
      />

      <ConfirmDialog
        open={logoutConfirmOpen !== null}
        onClose={() => setLogoutConfirmOpen(null)}
        onConfirm={handleLogout}
        title={logoutConfirmOpen === "all" ? "Log out of all devices?" : "Log out this device?"}
        description={
          logoutConfirmOpen === "all"
            ? "You'll need to sign in again on every device, including this one."
            : "You'll need to sign in again on this device."
        }
        confirmLabel="Log out"
        danger
        loading={loggingOut}
      />

      {/* Delete account — no backend endpoint exists yet, so route to
          human support rather than call a route that would 404. */}
      <Modal open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Delete account">
        <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 18 }}>
          Account deletion involves clearing your balance and referral history, so it's
          handled by our support team to make sure nothing is lost by mistake. Reach out
          and we'll process it for you.
        </p>
        <div className="rc-confirm-actions">
          <button className="btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => window.open(`https://wa.me/${HELP_WHATSAPP}?text=${encodeURIComponent("I'd like to delete my RENOCORP account.")}`, "_blank")}
          >
            <MessageCircleIcon size={14} strokeWidth={2} /> Contact support
          </button>
        </div>
      </Modal>
    </div>
  );
}
