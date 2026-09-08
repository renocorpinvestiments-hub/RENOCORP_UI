/**
 * invite/Invite.jsx — RENOCORP Invite & Referrals Screen  v1.0
 * =======================================================================
 * Share the user's invite code, show what they've earned from referrals,
 * and let them see who they've brought in — one level (Recent) and up
 * to three levels deep (Network).
 *
 * Architecture
 * ------------
 *  · 100% read-only — every call here is a GET (my-code, stats, tree).
 *    There are no mutations on this screen, so there is nothing to make
 *    idempotent in the write sense: every request is trivially safe to
 *    retry, refresh, double-tap, or fire from 10,000 concurrent tabs —
 *    idempotency here means "cache-friendly and side-effect-free", which
 *    a pure GET already is by definition. api.js's own retry/backoff,
 *    429 Retry-After handling, and 100-slot concurrency limiter apply
 *    automatically to every call this screen makes; nothing extra is
 *    needed at this layer.
 *  · The Network tab (GET /referrals/tree) is fetched lazily and then
 *    LATCHED — once the user opens it the first time, `networkOpened`
 *    flips to true and never flips back, so useApi's effect fires
 *    exactly once no matter how many times the user flips tabs back and
 *    forth. This keeps the default page weight at 2 requests (my-code +
 *    stats), with the 3rd (tree) only paid for by users who actually
 *    look at their network — important at scale, since tree traversal
 *    is the most expensive of the three reads on the backend.
 *  · GET /referrals/stats is documented (routes.py) as cached 60s
 *    server-side; GET /referrals/my-code is cached once generated. This
 *    screen doesn't attempt to out-cache the backend — it just avoids
 *    re-fetching on every tab switch (see above) and offers a single
 *    manual "refresh everything" action for when the user actually wants
 *    fresh numbers (e.g. right after a friend signs up).
 *  · share_url comes directly from the backend (InviteCodeResponse.
 *    share_url) — this screen never re-derives the referral URL itself,
 *    it only falls back to a locally-built one if the field is ever
 *    missing, so link format changes on the backend (domain, query
 *    param name, etc.) propagate here with zero UI changes.
 *  · Respects `referrals_enabled` (InviteCodeResponse / paused
 *    programme): existing code/stats/history remain fully visible —
 *    "PAUSED" only means new referrals aren't being created right now,
 *    per the backend's own documented semantics — so this screen shows
 *    an informational banner, never a blocking error state.
 *  · Every list row (ReferralRow, TreeRow) is memoized so the (rare, but
 *    unbounded-ish for power referrers) tree render never re-renders a
 *    sibling subtree on an unrelated state change (tab switch, copy
 *    toast, etc).
 *  · AbortController + stale-response discarding is handled by useApi
 *    itself (see hooks/useApi.js) — every fetch here is automatically
 *    cancelled on unmount/refetch, so there's no setState-after-unmount
 *    risk and no race between a stale and a fresh response.
 *  · Currency: this is a stats/history screen, not a transactional form
 *    (contrast withdraw/Withdraw.jsx, which shows USD as primary because
 *    that's literally what's submitted to the backend). Matching
 *    rewards/Rewards.jsx's convention, amounts here are shown in UGX as
 *    the primary display via the live-rate hook, with a small USD
 *    caption on the single headline "Total Earned" figure for anyone
 *    who wants to reconcile against the ledger.
 *  · Zero image requests — avatars are CSS-generated initials colored
 *    deterministically from `avatar_seed` (or the user id as a
 *    fallback), matching the "no images" performance rule used
 *    throughout the app.
 *
 * Backend contracts (verified against modules/referrals/{models,routes}.py):
 *  GET /api/referrals/my-code → InviteCodeResponse
 *       { invite_code, share_url, referrals_enabled }
 *  GET /api/referrals/stats   → ReferralStatsResponse
 *       { stats: { user_id, total_referred, active_referred,
 *                  pending_bonuses, total_earned_usd, pending_usd,
 *                  this_month_usd, invite_code },
 *         records: ReferralRecord[] }  (most recent 10, cached 60s)
 *  GET /api/referrals/tree    → ReferralTreeResponse
 *       { root_user_id, tree: ReferralTreeNode[], total_nodes }
 *       (depth-limited to 3 server-side)
 *
 * ReferralRecord fields used: id, status (PENDING|QUALIFIED|PAID|VOIDED),
 *   bonus_usd, bonus_paid, trigger_type, voided_reason, created_at,
 *   referred_display_name, referred_avatar_seed.
 * ReferralTreeNode fields used: user_id, display_name, avatar_seed,
 *   joined_at, status, bonus_paid, bonus_usd, depth, children[].
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { useApi } from "../hooks/useApi.js";
import { api } from "../api.js";
import { useCurrencyConverter } from "../utils/currencyConverter.js";
import { timeAgo, formatDateTime } from "../utils/timeAgo.js";
import { Card } from "../components/Card.jsx";
import { Badge } from "../components/Badge.jsx";
import { Alert } from "../components/Alert.jsx";
import { Modal } from "../components/Modal.jsx";
import { TabBar } from "../components/TabBar.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { Spinner } from "../components/Spinner.jsx";
import {
  ArrowLeftIcon,
  UsersIcon,
  UserPlusIcon,
  CopyIcon,
  CheckIcon,
  ShareIcon,
  RefreshCwIcon,
  GiftIcon,
  TrendingUpIcon,
  ClockIcon,
  AlertCircleIcon,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// CONSTANTS & HELPERS
// ═════════════════════════════════════════════════════════════════════════

// Deterministic avatar palette — cycles by seed, never random, so the same
// user always renders the same color across renders/sessions/devices.
const AVATAR_PALETTE = [
  { bg: "var(--accent-dim)", fg: "var(--accent)", border: "var(--accent-border)" },
  { bg: "var(--info-dim)",   fg: "var(--info)",   border: "var(--info-border)" },
  { bg: "var(--purple-dim)", fg: "var(--purple)", border: "var(--purple-border)" },
  { bg: "var(--warning-dim)", fg: "var(--warning)", border: "var(--warning-border)" },
  { bg: "var(--danger-dim)", fg: "var(--danger)", border: "var(--danger-border)" },
];

function seededPalette(seed) {
  const n = Math.abs(Number(seed) || 0);
  return AVATAR_PALETTE[n % AVATAR_PALETTE.length];
}

function initialsOf(name) {
  const clean = String(name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

// Friendly labels — never invented values, just the enum's own meaning
// (BonusTrigger in modules/referrals/models.py).
const TRIGGER_LABELS = {
  FIRST_TASK_COMPLETION: "on first task completed",
  REGISTRATION: "on sign-up",
  FIRST_WITHDRAWAL: "on first withdrawal",
  MANUAL: "special bonus",
};

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function formatUSD(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

// ═════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═════════════════════════════════════════════════════════════════════════

const Avatar = memo(function Avatar({ seed, name, size = 38 }) {
  const palette = seededPalette(seed ?? name?.length ?? 0);
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 800,
        fontFamily: "var(--font-display)",
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
      }}
    >
      {initialsOf(name)}
    </div>
  );
});

const CodeSkeleton = () => (
  <div aria-hidden="true">
    <div className="rc-skeleton" style={{ height: 52, borderRadius: "var(--radius)" }} />
  </div>
);

const StatsSkeleton = () => (
  <div
    aria-hidden="true"
    style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
  >
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="rc-skeleton" style={{ height: 76, borderRadius: "var(--radius-lg)" }} />
    ))}
  </div>
);

const ListSkeleton = () => (
  <div aria-hidden="true">
    {Array.from({ length: 4 }).map((_, i) => (
      <div
        key={i}
        className="rc-skeleton"
        style={{ height: 62, borderRadius: "var(--radius)", marginBottom: 8 }}
      />
    ))}
  </div>
);

/** One row in the "Recent" tab — a flat ReferralRecord. */
const ReferralRow = memo(function ReferralRow({ record, fmtUGX }) {
  const name = record.referred_display_name || "RENOCORP user";
  const statusKey = String(record.status ?? "").toLowerCase();
  const triggerLabel = TRIGGER_LABELS[record.trigger_type];
  const showAmount = record.status === "PAID" || record.status === "QUALIFIED";

  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Avatar seed={record.referred_avatar_seed} name={name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
          <Badge status={statusKey}>{record.status}</Badge>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Joined{" "}
          <span title={formatDateTime(record.created_at * 1000)}>
            {timeAgo(record.created_at * 1000)}
          </span>
          {triggerLabel && record.status !== "VOIDED" && <> · {triggerLabel}</>}
        </div>
        {record.status === "VOIDED" && record.voided_reason && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 5, fontSize: 11.5, color: "var(--danger)" }}>
            <AlertCircleIcon size={12} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
            {record.voided_reason}
          </div>
        )}
        {showAmount && (
          <div style={{ fontSize: 13, fontWeight: 700, color: record.status === "PAID" ? "var(--accent)" : "var(--warning)", marginTop: 4 }}>
            {fmtUGX(record.bonus_usd, "USD")}
          </div>
        )}
      </div>
    </li>
  );
});

/** One node (+ its children) in the "Network" tree. Recursive, memoized. */
const TreeRow = memo(function TreeRow({ node, fmtUGX }) {
  const name = node.display_name || "RENOCORP user";
  const statusKey = String(node.status ?? "").toLowerCase();

  return (
    <li style={{ marginTop: node.depth === 0 ? 10 : 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: node.depth * 20,
          borderLeft: node.depth > 0 ? "2px solid var(--border)" : "none",
          marginLeft: node.depth > 0 ? 18 : 0,
          paddingTop: node.depth > 0 ? 2 : 0,
        }}
      >
        <Avatar seed={node.avatar_seed} name={name} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </span>
            <Badge status={statusKey}>{node.status}</Badge>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
            Joined {timeAgo(node.joined_at * 1000)}
            {node.bonus_paid && (
              <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                {" "}· {fmtUGX(node.bonus_usd, "USD")} paid
              </span>
            )}
          </div>
        </div>
      </div>
      {node.children?.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {node.children.map((child) => (
            <TreeRow key={child.user_id} node={child} fmtUGX={fmtUGX} />
          ))}
        </ul>
      )}
    </li>
  );
});

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════

export default function Invite() {
  const navigate = useNavigate();
  useAuth(); // ensures this only renders inside an authenticated shell

  const { formatUGX: fmtUGX } = useCurrencyConverter();

  // ── Invite code ────────────────────────────────────────────────────────
  const {
    data: codeData,
    loading: codeLoading,
    error: codeError,
    reload: reloadCode,
  } = useApi(() => api.referrals.myCode(), []);

  // ── Stats + recent referrals ───────────────────────────────────────────
  const {
    data: statsData,
    loading: statsLoading,
    isRefetching: statsRefetching,
    error: statsError,
    reload: reloadStats,
  } = useApi(() => api.referrals.stats(), []);

  // ── Network tree — lazy + latched (see header comment) ────────────────
  const [networkOpened, setNetworkOpened] = useState(false);
  const {
    data: treeData,
    loading: treeLoading,
    error: treeError,
    reload: reloadTree,
  } = useApi(() => api.referrals.tree(), [], { enabled: networkOpened });

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("recent");
  const handleTabChange = useCallback((key) => {
    setTab(key);
    if (key === "network") setNetworkOpened(true);
  }, []);

  const tabs = useMemo(
    () => [
      { key: "recent", label: "Recent", count: statsData?.records?.length || undefined },
      { key: "network", label: "Network", count: networkOpened ? (treeData?.total_nodes ?? undefined) : undefined },
    ],
    [statsData, treeData, networkOpened]
  );

  // ── Share / copy ────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const copyTimeoutRef = useRef(null);

  const code = codeData?.invite_code ?? "";
  const appUrl = import.meta.env.VITE_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
  // Prefer the backend's own share_url (see header comment) — only build
  // a fallback locally if it's ever missing.
  const shareUrl = codeData?.share_url || (code ? `${appUrl}/?ref=${code}` : appUrl);
  const shareText = code
    ? `Join RENOCORP and start earning! Use my invite code: ${code}\n${shareUrl}`
    : shareUrl;

  useEffect(() => () => clearTimeout(copyTimeoutRef.current), []);

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for browsers without Clipboard API permission
      const el = document.createElement("textarea");
      el.value = shareUrl;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      try { document.execCommand("copy"); } catch { /* no-op */ }
      document.body.removeChild(el);
    }
    setCopied(true);
    clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  const nativeShare = useCallback(async () => {
    if (!navigator.share) { setShareOpen(true); return; }
    try {
      await navigator.share({ title: "RENOCORP Invite", text: shareText, url: shareUrl });
    } catch {
      // User cancelled the native sheet, or it's unsupported for this
      // content — fall back to our own sheet rather than failing silently.
      setShareOpen(true);
    }
  }, [shareText, shareUrl]);

  const openWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
    setShareOpen(false);
  };

  const openSms = () => {
    window.open(`sms:?body=${encodeURIComponent(shareText)}`, "_blank", "noopener");
    setShareOpen(false);
  };

  // ── Refresh everything (manual pull) ────────────────────────────────────
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      await Promise.allSettled([
        reloadCode(),
        reloadStats(),
        ...(networkOpened ? [reloadTree()] : []),
      ]);
    } finally {
      setRefreshingAll(false);
    }
  }, [reloadCode, reloadStats, reloadTree, networkOpened]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = statsData?.stats;
  const records = statsData?.records ?? [];
  const tree = treeData?.tree ?? [];
  const programmePaused = codeData?.referrals_enabled === false;

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
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Invite &amp; Earn</h2>
        </div>
        <button
          className="btn-ghost btn-icon"
          onClick={refreshAll}
          disabled={refreshingAll}
          aria-label="Refresh"
        >
          <RefreshCwIcon size={16} strokeWidth={2} className={refreshingAll ? "spin" : undefined} />
        </button>
      </div>

      {programmePaused && (
        <Alert type="warning" style={{ marginBottom: 16 }}>
          Referrals are temporarily paused. Your existing invite history and
          earned bonuses aren't affected — new referral bonuses just aren't
          being created right now.
        </Alert>
      )}

      {/* ── Invite code card ── */}
      <Card title="Your Invite Code" style={{ marginBottom: 18 }}>
        {codeLoading ? (
          <CodeSkeleton />
        ) : codeError ? (
          <Alert type="error">
            <span>{codeError}</span>
            <button className="link-btn" onClick={reloadCode} style={{ marginLeft: 8 }}>Retry</button>
          </Alert>
        ) : code ? (
          <>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "12px 16px",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 20,
                  fontWeight: 800,
                  letterSpacing: 2,
                  color: "var(--accent)",
                }}
              >
                {code}
              </span>
              <button
                className="btn-ghost btn-icon"
                onClick={copyLink}
                aria-label={copied ? "Link copied!" : "Copy invite link"}
              >
                {copied ? (
                  <CheckIcon size={17} strokeWidth={2.5} style={{ color: "var(--accent)" }} />
                ) : (
                  <CopyIcon size={17} strokeWidth={2} />
                )}
              </button>
            </div>
            <button
              className="btn-primary"
              onClick={nativeShare}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <ShareIcon size={15} strokeWidth={2} aria-hidden="true" />
              Share Invite Link
            </button>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Invite code unavailable — try refreshing.
          </div>
        )}
      </Card>

      {/* ── Share sheet fallback ── */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share Your Invite">
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.6 }}>
          Invite friends to RENOCORP and earn a bonus when they get started.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button className="btn-secondary" onClick={openWhatsApp} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">💬</span>
            Share via WhatsApp
          </button>
          <button className="btn-secondary" onClick={openSms} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>
            <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">📱</span>
            Share via SMS
          </button>
          <button className="btn-secondary" onClick={() => { copyLink(); setShareOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-start" }}>
            <CopyIcon size={16} strokeWidth={2} aria-hidden="true" />
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
      </Modal>

      {/* ── Stats ── */}
      <Card title="Your Referral Stats" style={{ marginBottom: 18 }}>
        {statsLoading ? (
          <StatsSkeleton />
        ) : statsError ? (
          <Alert type="error">
            <span>{statsError}</span>
            <button className="link-btn" onClick={reloadStats} style={{ marginLeft: 8 }}>Retry</button>
          </Alert>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <MiniStat icon={<UsersIcon size={15} strokeWidth={2} />} label="Total Invited" value={stats?.total_referred ?? 0} />
              <MiniStat icon={<UserPlusIcon size={15} strokeWidth={2} />} label="Active" value={stats?.active_referred ?? 0} />
              <MiniStat
                icon={<GiftIcon size={15} strokeWidth={2} />}
                label="Total Earned"
                value={fmtUGX(stats?.total_earned_usd ?? 0, "USD")}
                sub={`≈ ${formatUSD(round2(stats?.total_earned_usd ?? 0))}`}
                accent
              />
              <MiniStat
                icon={<TrendingUpIcon size={15} strokeWidth={2} />}
                label="This Month"
                value={fmtUGX(stats?.this_month_usd ?? 0, "USD")}
              />
            </div>
            {(stats?.pending_bonuses ?? 0) > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 14, fontSize: 12.5, color: "var(--warning)" }}>
                <ClockIcon size={13} strokeWidth={2} />
                {stats.pending_bonuses} pending bonus{stats.pending_bonuses === 1 ? "" : "es"} worth{" "}
                {fmtUGX(stats?.pending_usd ?? 0, "USD")}
                {statsRefetching && <Spinner size="sm" />}
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Recent / Network tabs ── */}
      <Card>
        <TabBar tabs={tabs} active={tab} onChange={handleTabChange} />

        <div style={{ marginTop: 14 }}>
          {tab === "recent" ? (
            statsLoading ? (
              <ListSkeleton />
            ) : statsError ? (
              <Alert type="error" message={statsError} />
            ) : records.length === 0 ? (
              <EmptyState
                icon="🤝"
                title="No referrals yet"
                message="Share your invite code above — you'll see friends show up here as soon as they join."
                action={{ label: "Share Now", onClick: nativeShare }}
              />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {records.map((r) => (
                  <ReferralRow key={r.id} record={r} fmtUGX={fmtUGX} />
                ))}
              </ul>
            )
          ) : treeLoading ? (
            <ListSkeleton />
          ) : treeError ? (
            <Alert type="error">
              <span>{treeError}</span>
              <button className="link-btn" onClick={reloadTree} style={{ marginLeft: 8 }}>Retry</button>
            </Alert>
          ) : tree.length === 0 ? (
            <EmptyState
              icon="🌱"
              title="Your network is empty"
              message="Once your invitees start inviting others too, your wider network will show up here (up to 3 levels deep)."
            />
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginBottom: 4 }}>
                {treeData?.total_nodes ?? tree.length} people in your network
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {tree.map((node) => (
                  <TreeRow key={node.user_id} node={node} fmtUGX={fmtUGX} />
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 14, padding: "0 4px" }}>
        <GiftIcon size={12} strokeWidth={2} style={{ color: "var(--text-dim)", marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          You earn a bonus for friends you invite once they meet the current
          qualifying action. Statuses update automatically — no action needed
          on your part.
        </p>
      </div>
    </div>
  );
}

// ─── Small stat tile used in the stats grid above ──────────────────────────
const MiniStat = memo(function MiniStat({ icon, label, value, sub, accent }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${accent ? "var(--accent-border)" : "var(--border)"}`,
        background: "var(--surface-2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: 0.4 }}>
        <span style={{ opacity: 0.8, display: "inline-flex" }} aria-hidden="true">{icon}</span>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, color: accent ? "var(--accent)" : "var(--text)" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
});
