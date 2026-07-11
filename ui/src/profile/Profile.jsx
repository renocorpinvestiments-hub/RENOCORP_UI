/**
 * profile/Profile.jsx — RENOCORP User Profile Screen  v2.0
 * =============================================================
 * Read + edit surface for the authenticated user's identity,
 * balance snapshot, referral performance, and subscription state.
 *
 * Architecture:
 *  · Parallel data fetching (profile · earnings summary · referral
 *    stats · active package) via independent useApi() calls — one
 *    slow endpoint never blocks the others from rendering.
 *  · Every read is idempotent by construction (GET-only on mount).
 *  · The single mutation path (PATCH /api/users/me) reuses api.js's
 *    automatic Idempotency-Key header, so a double-tap or a retry
 *    after a flaky network can never double-apply an edit.
 *  · Optimistic-then-reconciled updates: on save, AuthContext's
 *    in-memory `user` is patched immediately (so the TopNavBar /
 *    SideDrawer avatar/name update instantly), then the profile
 *    query is reloaded to reconcile with the server's canonical
 *    record (updated_at, etc).
 *  · Defensive field access (`??` chains) on every cross-module
 *    read — earnings/referrals/packages are owned by different
 *    services and their shapes are allowed to evolve independently
 *    of this screen; a renamed/added field never blanks the UI.
 *  · Zero localStorage — all state lives in React + AuthContext.
 *  · AbortController cancellation is handled inside useApi() itself.
 *
 * Backend contracts (verified against modules/*\/models.py):
 *  GET   /api/users/me            → UserProfile
 *        { user_id, email, first_name, last_name, display_name,
 *          is_admin, is_verified, status, membership_tier,
 *          referral_code, referred_by, theme, avatar_seed,
 *          created_at, updated_at }
 *  PATCH /api/users/me            → UserProfile (partial update)
 *        body: UpdateProfileRequest — first_name?, last_name?,
 *        display_name?, theme?, avatar_seed? (at least one required)
 *  GET   /api/earnings/summary    → EarningsSummary
 *        { balance_usd, balance_points, today_net_usd,
 *          lifetime_credits_usd, pending_withdrawal_usd, ... }
 *  GET   /api/referrals/stats     → ReferralStatsResponse
 *        { stats: { total_referred, active_referred,
 *          total_earned_usd, pending_usd, this_month_usd,
 *          invite_code }, records: [...] }
 *  GET   /api/packages/mine       → UserPackage | null
 *        { package_name, tier_level, is_active, days_remaining,
 *          expires_at, task_limit, withdraw_threshold_usd }
 *
 * Money is stored server-side in USD (balance_usd, total_earned_usd,
 * etc). This screen renders it in UGX via useCurrencyConverter(),
 * exactly like rewards/Rewards.jsx — never a hardcoded rate.
 */

import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { useCurrencyConverter } from "../utils/currencyConverter.js";
import { timeAgo, formatDate } from "../utils/timeAgo.js";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { Modal } from "../components/Modal.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  PencilIcon,
  ShuffleIcon,
  CopyIcon,
  CheckIcon,
  ArrowLeftIcon,
  UsersIcon,
  WalletIcon,
  TrendingUpIcon,
  PackageIcon,
  SettingsIcon,
  ArrowDownCircleIcon,
  ShareIcon,
  ShieldCheckIcon,
  MailIcon,
  CalendarIcon,
} from "lucide-react";

const _MAX_AVATAR_SEED = 2_147_483_647; // matches backend Field(le=...)

// ─── AVATAR ──────────────────────────────────────────────────────────────
// Deterministic HSL hue from avatar_seed so re-shuffling visibly changes
// the avatar color without needing an image asset / upload pipeline
// (the backend model has no photo-url field — avatar_seed is the only
// personalization axis it exposes, so we honour that rather than
// fabricating an upload feature the API can't support).
function avatarHue(seed) {
  return Math.abs(Number(seed) || 0) % 360;
}

function ProfileAvatar({ user, onShuffle, shuffling }) {
  const initials =
    `${user?.first_name?.[0] ?? ""}${user?.last_name?.[0] ?? ""}`.toUpperCase() || "U";
  const hue = avatarHue(user?.avatar_seed);

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        className="dash-avatar-lg"
        style={{
          width: 68,
          height: 68,
          fontSize: 24,
          background: `hsl(${hue} 70% 55%)`,
        }}
        aria-hidden="true"
      >
        {initials}
      </div>
      <button
        className="btn-icon"
        onClick={onShuffle}
        disabled={shuffling}
        aria-label="Shuffle avatar color"
        title="Shuffle avatar"
        style={{
          position: "absolute",
          bottom: -4,
          right: -4,
          width: 26,
          height: 26,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "50%",
        }}
      >
        {shuffling ? <Spinner size="sm" /> : <ShuffleIcon size={13} strokeWidth={2} />}
      </button>
    </div>
  );
}

// ─── EDIT PROFILE MODAL ─────────────────────────────────────────────────
function EditProfileModal({ open, onClose, user, onSaved }) {
  const [firstName, setFirstName] = useState(user?.first_name ?? "");
  const [lastName, setLastName] = useState(user?.last_name ?? "");
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = useCallback(async () => {
    setError(null);

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedDisplay = displayName.trim();

    if (!trimmedFirst || !trimmedLast) {
      setError("First and last name are required.");
      return;
    }
    if (trimmedDisplay && trimmedDisplay.length < 2) {
      setError("Display name must be at least 2 characters.");
      return;
    }

    const patch = {
      first_name: trimmedFirst,
      last_name: trimmedLast,
      display_name: trimmedDisplay || null,
    };

    setSaving(true);
    try {
      const updated = await api.users.updateMe(patch);
      onSaved(updated ?? patch);
      onClose();
    } catch (e) {
      setError(e?.message ?? "Could not save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, displayName, onSaved, onClose]);

  const guardedClose = useCallback(() => {
    if (!saving) onClose();
  }, [saving, onClose]);

  return (
    <Modal open={open} onClose={guardedClose} title="Edit profile">
      {error && <Alert type="error" message={error} style={{ marginBottom: 14 }} />}

      <div className="rc-field">
        <label className="rc-label" htmlFor="pf-first">First name</label>
        <input
          id="pf-first"
          className="rc-input"
          value={firstName}
          maxLength={64}
          onChange={(e) => setFirstName(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="rc-field">
        <label className="rc-label" htmlFor="pf-last">Last name</label>
        <input
          id="pf-last"
          className="rc-input"
          value={lastName}
          maxLength={64}
          onChange={(e) => setLastName(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="rc-field">
        <label className="rc-label" htmlFor="pf-display">Display name (optional)</label>
        <input
          id="pf-display"
          className="rc-input"
          value={displayName}
          maxLength={40}
          placeholder="Shown on leaderboards & referrals"
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={saving}
        />
      </div>

      <div className="rc-confirm-actions">
        <button className="btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

// ─── STAT ROW ────────────────────────────────────────────────────────────
function StatRow({ icon: Icon, label, value, accent }) {
  return (
    <div className="profile-row">
      <span className="profile-key" style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon size={13} strokeWidth={2} aria-hidden="true" />
        {label}
      </span>
      <span className="profile-val" style={accent ? { color: "var(--accent)" } : undefined}>
        {value}
      </span>
    </div>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────
export default function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const { formatUGX: fmtUGX } = useCurrencyConverter();

  const [editOpen, setEditOpen] = useState(false);
  const [shuffling, setShuffling] = useState(false);
  const [shuffleError, setShuffleError] = useState(null);
  const [copied, setCopied] = useState(false);

  const {
    data: profile,
    loading: profileLoading,
    error: profileError,
    reload: reloadProfile,
  } = useApi(() => api.users.me(), []);

  const { data: earnings, loading: earningsLoading } = useApi(
    () => api.earnings.summary(),
    []
  );

  const { data: referralData, loading: referralsLoading } = useApi(
    () => api.referrals.stats(),
    []
  );

  const { data: pkg, loading: pkgLoading } = useApi(() => api.packages.mine(), []);

  // Merge server profile over context user so the screen is correct even
  // before the AuthContext copy is patched (e.g. right after a hard reload
  // where profile is still loading but `user` came from /auth/login).
  const person = profile ?? user;

  const referralStats = referralData?.stats ?? referralData ?? {};
  const inviteCount = referralStats?.total_referred ?? 0;
  const referralEarned = referralStats?.total_earned_usd ?? 0;

  const balance = earnings?.balance_usd ?? 0;
  const todayNet = earnings?.today_net_usd ?? earnings?.today_credits_usd ?? 0;

  const isSubscribed = pkg?.is_active === true;
  const tierName = pkg?.package_name ?? "Free";
  const daysLeft = pkg?.days_remaining;

  const memberSince = useMemo(() => {
    if (!person?.created_at) return "—";
    // created_at is unix epoch seconds per backend model
    return formatDate(person.created_at * 1000);
  }, [person?.created_at]);

  const handleShuffleAvatar = useCallback(async () => {
    setShuffleError(null);
    setShuffling(true);
    const nextSeed = Math.floor(Math.random() * _MAX_AVATAR_SEED);
    try {
      const updated = await api.users.updateMe({ avatar_seed: nextSeed });
      updateUser({ avatar_seed: updated?.avatar_seed ?? nextSeed });
      reloadProfile();
    } catch (e) {
      setShuffleError(e?.message ?? "Could not update avatar.");
    } finally {
      setShuffling(false);
    }
  }, [updateUser, reloadProfile]);

  const handleSaved = useCallback(
    (patch) => {
      updateUser(patch);
      reloadProfile();
    },
    [updateUser, reloadProfile]
  );

  const handleCopyCode = useCallback(async () => {
    const code = person?.referral_code ?? "";
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable — silently ignore, non-critical.
    }
  }, [person?.referral_code]);

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
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>Profile</h2>
      </div>

      {profileError && (
        <Alert
          type="error"
          message={profileError}
          onDismiss={reloadProfile}
          style={{ marginBottom: 16 }}
        />
      )}
      {shuffleError && (
        <Alert
          type="error"
          message={shuffleError}
          onDismiss={() => setShuffleError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── Identity card ── */}
      <div className="dash-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <ProfileAvatar user={person} onShuffle={handleShuffleAvatar} shuffling={shuffling} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 17, fontWeight: 800 }}>
                {person?.display_name ?? (`${person?.first_name ?? ""} ${person?.last_name ?? ""}`.trim() || "—")}
              </span>
              {person?.is_verified && (
                <Badge variant="green" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <ShieldCheckIcon size={10} strokeWidth={2.5} /> Verified
                </Badge>
              )}
              {person?.membership_tier && person.membership_tier !== "free" && (
                <Badge variant="purple">{String(person.membership_tier).toUpperCase()}</Badge>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 5,
                color: "var(--text-muted)",
                fontSize: 12.5,
                fontFamily: "var(--font-mono)",
              }}
            >
              <MailIcon size={12} strokeWidth={2} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {person?.email ?? "—"}
              </span>
            </div>
          </div>

          <button
            className="btn-icon"
            onClick={() => setEditOpen(true)}
            aria-label="Edit profile"
            title="Edit profile"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)", flexShrink: 0 }}
          >
            <PencilIcon size={15} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* ── Referral code ── */}
      <div className="dash-card" style={{ marginBottom: 16 }}>
        <h3>Your Invitation Code</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
          <span
            className="dash-card-value"
            style={{ fontSize: 20, color: "var(--accent)", letterSpacing: 1 }}
          >
            {person?.referral_code ?? "—"}
          </span>
          <button className="btn-secondary" onClick={handleCopyCode} style={{ width: "auto", padding: "8px 14px" }}>
            {copied ? (
              <><CheckIcon size={14} strokeWidth={2.5} /> Copied</>
            ) : (
              <><CopyIcon size={14} strokeWidth={2} /> Copy</>
            )}
          </button>
        </div>
      </div>

      {/* ── Balance & performance ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3><WalletIcon size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} />Balance & Earnings</h3>
          {(earningsLoading || referralsLoading) && <Spinner size="sm" />}
        </div>
        <StatRow icon={WalletIcon} label="Balance" value={fmtUGX(balance)} accent />
        <StatRow icon={TrendingUpIcon} label="Today's Earning" value={fmtUGX(todayNet)} />
        <StatRow icon={UsersIcon} label="Referral Commission" value={fmtUGX(referralEarned)} />
        <StatRow icon={UsersIcon} label="Invites" value={inviteCount} />
      </div>

      {/* ── Subscription ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3><PackageIcon size={14} strokeWidth={2} style={{ marginRight: 6, verticalAlign: "-2px" }} />Subscription</h3>
          {pkgLoading && <Spinner size="sm" />}
        </div>
        <div className="profile-row">
          <span className="profile-key">Plan</span>
          <span className="profile-val">
            <Badge variant={isSubscribed ? "green" : "grey"}>{tierName}</Badge>
          </span>
        </div>
        {isSubscribed && (
          <div className="profile-row">
            <span className="profile-key">Renews / Expires</span>
            <span className="profile-val">
              {daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : "Lifetime"}
            </span>
          </div>
        )}
        <div style={{ padding: "14px 20px 18px" }}>
          <button className="btn-secondary" onClick={() => navigate("/packages")} style={{ width: "100%" }}>
            {isSubscribed ? "Manage subscription" : "View packages"}
          </button>
        </div>
      </div>

      {/* ── Account info ── */}
      <div className="dash-section" style={{ marginBottom: 16 }}>
        <div className="dash-section-header">
          <h3>Account</h3>
        </div>
        <div className="profile-row">
          <span className="profile-key" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CalendarIcon size={12} strokeWidth={2} /> Member since
          </span>
          <span className="profile-val">{memberSince}</span>
        </div>
        <div className="profile-row">
          <span className="profile-key">Status</span>
          <span className="profile-val">
            <Badge status={person?.status ?? "active"} />
          </span>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button className="btn-secondary" onClick={() => navigate("/invite")}>
          <ShareIcon size={15} strokeWidth={2} /> Invite
        </button>
        <button className="btn-secondary" onClick={() => navigate("/withdraw")}>
          <ArrowDownCircleIcon size={15} strokeWidth={2} /> Withdraw
        </button>
      </div>
      <button
        className="btn-secondary"
        onClick={() => navigate("/settings")}
        style={{ width: "100%", marginTop: 10 }}
      >
        <SettingsIcon size={15} strokeWidth={2} /> Settings
      </button>

      {profileLoading && !profile && (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spinner />
        </div>
      )}

      <EditProfileModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        user={person}
        onSaved={handleSaved}
      />
    </div>
  );
}
