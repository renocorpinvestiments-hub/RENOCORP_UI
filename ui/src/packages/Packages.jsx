/**
 * packages/Packages.jsx — RENOCORP Packages & Subscription Screen  v1.0
 * =======================================================================
 * Browse admin-configured tiers, subscribe (mobile money / card / bank
 * transfer via Flutterwave hosted checkout), track a live payment while
 * it's in flight, cancel an active subscription, and view subscription
 * history. The second highest-stakes screen in the app after Withdraw —
 * real money moves IN here.
 *
 * Architecture
 * ------------
 *  · There are two parallel catalog/purchase paths in this backend:
 *      Path A (packages module): GET /api/packages → POST /api/packages
 *        /subscribe {package_id, ...} → SubscribeResponse
 *      Path B (payments module):  GET /api/payments/plans → POST /api/
 *        payments/initiate {plan_id, ...} → PaymentIntent
 *    Path A is the one actually wired to the Package catalog (tier name,
 *    task_limit, withdraw_threshold, features, price_display — the stuff
 *    this screen needs to display and that /subscribe validates against)
 *    and is the one documented as the user-facing route in packages/
 *    routes.py ("POST /api/packages/subscribe — initiate subscription +
 *    get checkout URL"). Path B's plan_id-based flow isn't referenced
 *    anywhere in the packages module, so this screen deliberately uses
 *    Path A end-to-end. Both paths converge on the SAME status-poll
 *    endpoint (GET /api/payments/intent/{id}/status), which is used here
 *    exactly as documented regardless of which path created the intent.
 *  · api.js's packages.list() (bare GET /api/packages) and packages.
 *    history(params) (now accepts page/page_size) were added — pure
 *    additions, nothing existing changed shape. subscribe(body,
 *    idempotencyKey) got the same optional-2nd-arg treatment as
 *    withdrawals.request, for the same reason (see below). See api.js.
 *  · TRUE idempotency: one key is minted per logical subscribe attempt
 *    (utils/idempotency.js) and reused across retries of that SAME
 *    attempt (re-tapping "Confirm & Subscribe" while it's still in
 *    flight, or a transient network error). The key only rotates when
 *    the user changes package/payment method/phone/network — i.e. a
 *    genuinely different request — OR when the previous attempt reached
 *    a terminal non-success state (FAILED / CANCELLED / EXPIRED), since
 *    replaying a dead payment intent's key would hit 409 DUPLICATE_
 *    PAYMENT rather than create a fresh one. This mirrors withdraw/
 *    Withdraw.jsx's rule, with the one addition terminal-failure requires
 *    (payments, unlike withdrawals, can go terminal-without-success in
 *    a way the user needs to actually retry from).
 *  · Price is NEVER computed or sent by this screen. Every dollar amount
 *    rendered comes straight from the backend (Package.price_display,
 *    SubscribeResponse.amount_usd) — SubscribeRequest carries no amount
 *    field at all (models.py: "the client cannot pass an amount").
 *  · Free-tier packages (subscription_price_usd === 0) skip the mobile
 *    money fields entirely. SubscribeRequest.payment_method defaults to
 *    "mobile_money", and mobile_money is the only method with a
 *    validator requiring phone/network — so a free-tier request sends
 *    payment_method: "card" purely as a valid placeholder (no card is
 *    ever charged; price is $0). Backend activates it immediately
 *    (status "ACTIVE", no checkout_url, no polling needed).
 *  · Paid subscriptions redirect to the Flutterwave-hosted checkout_url
 *    via window.open (never a same-tab href — Capacitor/PWA rule), then
 *    poll GET /payments/intent/{id}/status every 6s (backend's own
 *    documented cadence: "Poll every 5–10 seconds"), capped at 16
 *    minutes (the intent's own 15-min expiry, +1min slack for the
 *    backend's EXPIRED sweep to land) via a self-rescheduling setTimeout
 *    that pauses while the tab is hidden — identical pattern to
 *    withdraw/Withdraw.jsx's status poller. Polling stops the instant
 *    `is_terminal` is true, or at the timeout, whichever comes first.
 *  · On COMPLETED, this screen also refreshes the shared user profile
 *    (AuthContext.updateUser) so the membership tier badge is correct
 *    everywhere else in the app (Dashboard, drawer, etc.) without a full
 *    reload — not just locally on this screen.
 *  · Cancel is a real Flutterwave-adjacent state change (reverts tier to
 *    Free immediately, per routes.py) — gated behind ConfirmDialog(danger).
 *  · Every card/row is memoized. Fetches go through useApi + effect +
 *    AbortController — no setState-after-unmount, no stale-response race.
 *
 * Backend contracts (verified against modules/{packages,payments}/{models,routes}.py):
 *  GET  /api/packages                    → PackageListResponse { packages[], total, has_free }
 *  GET  /api/packages/mine               → UserPackage | null
 *  GET  /api/packages/history?page&page_size → UserPackageHistory { records[], total, page, page_size, total_pages, has_more }
 *  POST /api/packages/subscribe          → SubscribeResponse { payment_intent_id, package_id, package_name, amount_usd, checkout_url, status, message }
 *       body: { package_id, payment_method, phone_number?, network?, return_url?, idempotency_key }
 *       header: idempotency-key (takes precedence over body field if different)
 *  POST /api/packages/cancel             → UserPackage (status CANCELLED)
 *       body: { reason? }
 *  GET  /api/payments/intent/{id}/status → PaymentIntentStatusResponse
 *       { id, status, status_label, status_color, is_terminal, checkout_url, completed_at, package_id }
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
import { newIdempotencyKey } from "../utils/idempotency.js";
import { useCurrencyConverter } from "../utils/currencyConverter.js";
import { timeAgo } from "../utils/timeAgo.js";
import { Alert } from "../components/Alert.jsx";
import { Badge } from "../components/Badge.jsx";
import { Card } from "../components/Card.jsx";
import { Modal } from "../components/Modal.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { TabBar } from "../components/TabBar.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ArrowLeftIcon,
  PackageIcon,
  ZapIcon,
  StarIcon,
  CheckIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  WalletIcon,
  SmartphoneIcon,
  CalendarIcon,
  ClockIcon,
  AlertCircleIcon,
  InfoIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  Trash2Icon,
  HistoryIcon,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═════════════════════════════════════════════════════════════════════════

const HISTORY_PAGE_SIZE = 20;
const POLL_INTERVAL_MS  = 6_000;   // backend doc: "Poll every 5–10 seconds"
const POLL_TIMEOUT_MS   = 16 * 60_000; // intent expires at 15min; +1min slack

// Uganda mobile number pattern — identical to withdraw/Withdraw.jsx's,
// itself mirrored from the backend's own validator pattern.
const UG_PHONE_RE = /^(?:\+?256|0)?([37][0-9]{8})$/;

const PAYMENT_METHODS = [
  { value: "mobile_money", label: "Mobile Money", Icon: SmartphoneIcon },
  { value: "card",         label: "Card",         Icon: WalletIcon },
  { value: "bank_transfer",label: "Bank Transfer", Icon: WalletIcon },
];

const TIER_META = {
  free:  { Icon: PackageIcon, color: "var(--text-muted)", dim: "var(--surface-3)", border: "var(--border)", badge: "grey" },
  pro:   { Icon: ZapIcon,     color: "var(--info)",        dim: "var(--info-dim)", border: "var(--info-border)", badge: "blue" },
  elite: { Icon: StarIcon,    color: "var(--purple)",      dim: "var(--purple-dim)", border: "var(--purple-border)", badge: "purple" },
};

const SUB_STATUS_FILTERS = [
  { value: "",          label: "All" },
  { value: "ACTIVE",    label: "Active" },
  { value: "PENDING",   label: "Pending" },
  { value: "EXPIRED",   label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "FAILED",    label: "Failed" },
];

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════

function formatUSD(amount) {
  if (amount == null || isNaN(Number(amount))) return "$—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function cleanPhone(v) {
  return String(v ?? "").trim().replace(/[\s-]/g, "");
}

function isValidUgPhone(v) {
  return UG_PHONE_RE.test(cleanPhone(v));
}

function tierMeta(tier) {
  return TIER_META[String(tier ?? "free").toLowerCase()] ?? TIER_META.free;
}

function statusToBadgeProp(status) {
  return String(status ?? "").toLowerCase();
}

const isTerminalIntent = (s) =>
  s === "COMPLETED" || s === "FAILED" || s === "CANCELLED" || s === "REFUNDED" || s === "EXPIRED";

// ═════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═════════════════════════════════════════════════════════════════════════

const SegmentedControl = memo(function SegmentedControl({ options, value, onChange, disabled }) {
  return (
    <div
      role="radiogroup"
      style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 8 }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.Icon;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 4,
              padding: "10px 12px",
              borderRadius: "var(--radius)",
              border: `1px solid ${active ? "var(--accent-border)" : "var(--border)"}`,
              background: active ? "var(--accent-dim)" : "var(--surface-3)",
              color: active ? "var(--accent)" : "var(--text)",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              transition: "border-color var(--transition), background var(--transition)",
              textAlign: "left",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12.5 }}>
              {Icon && <Icon size={14} strokeWidth={2} />}
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});

/** One tier card in the catalog. */
const PackageCard = memo(function PackageCard({ pkg, isCurrent, onSubscribe, disabled, fmtUGX }) {
  const meta = tierMeta(pkg.tier_level);
  const Icon = meta.Icon;

  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${isCurrent ? "var(--accent-border)" : meta.border}`,
        background: "var(--surface-2)",
        padding: 16,
        marginBottom: 12,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-hidden="true"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: meta.dim, color: meta.color,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <Icon size={17} strokeWidth={2} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{pkg.name}</div>
            <Badge variant={meta.badge}>{pkg.tier_level?.toUpperCase()}</Badge>
          </div>
        </div>
        {isCurrent && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--accent)" }}>
            <CheckCircleIcon size={13} strokeWidth={2} /> Current
          </span>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{pkg.price_display}</div>
        {!pkg.is_free && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
            ≈ {fmtUGX(pkg.subscription_price_usd, "USD")}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12, fontSize: 12.5, color: "var(--text-muted)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ClipboardListIcon size={13} strokeWidth={2} /> {pkg.task_limit_display}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <WalletIcon size={13} strokeWidth={2} /> {pkg.withdraw_display}
        </div>
      </div>

      {pkg.features?.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          {pkg.features.map((f, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5 }}>
              <CheckIcon size={13} strokeWidth={2.5} style={{ color: "var(--accent)", marginTop: 1, flexShrink: 0 }} />
              {f}
            </li>
          ))}
        </ul>
      )}

      <button
        className={isCurrent ? "btn-secondary" : "btn-primary"}
        onClick={() => onSubscribe(pkg)}
        disabled={disabled || isCurrent}
        style={{ marginTop: 16 }}
      >
        {isCurrent ? "Current Plan" : pkg.is_free ? "Switch to Free" : "Subscribe"}
      </button>
    </div>
  );
});

/** One row in subscription history. */
const HistoryRow = memo(function HistoryRow({ record }) {
  return (
    <div
      style={{
        padding: "13px 14px",
        borderRadius: "var(--radius)",
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{record.package_name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {formatUSD(record.price_paid_usd)} · {record.interval}
          </div>
        </div>
        <Badge status={statusToBadgeProp(record.status)}>{record.status_label}</Badge>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <span>Subscribed {timeAgo(record.subscribed_at * 1000)}</span>
        {record.is_active && record.days_remaining != null && (
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CalendarIcon size={12} strokeWidth={2} /> {record.days_remaining}d left
          </span>
        )}
      </div>
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════

export default function Packages() {
  const navigate = useNavigate();
  const { updateUser } = useAuth();
  const { formatUGX: fmtUGX } = useCurrencyConverter();

  // ── Catalog + current subscription ──────────────────────────────────────
  const {
    data: catalog,
    loading: catalogLoading,
    error: catalogError,
    reload: reloadCatalog,
  } = useApi(() => api.packages.list(), []);

  const {
    data: mine,
    loading: mineLoading,
    error: mineError,
    reload: reloadMine,
  } = useApi(() => api.packages.mine(), []);

  // ── History (paginated) ───────────────────────────────────────────────
  const [historyPage, setHistoryPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    reload: reloadHistory,
  } = useApi(
    () => api.packages.history({ page: historyPage, page_size: HISTORY_PAGE_SIZE, status: statusFilter || undefined }),
    [historyPage, statusFilter]
  );

  // ── Tabs ────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("plans");
  const tabs = useMemo(
    () => [
      { key: "plans", label: "Plans" },
      { key: "history", label: "History", count: history?.total },
    ],
    [history]
  );

  // ── Subscribe modal state ─────────────────────────────────────────────
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("mobile_money");
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState("MTN");
  const [phoneError, setPhoneError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const openSubscribeModal = useCallback((pkg) => {
    setSelectedPkg(pkg);
    setPaymentMethod("mobile_money");
    setPhone("");
    setNetwork("MTN");
    setPhoneError(null);
    setSubmitError(null);
  }, []);
  const closeSubscribeModal = useCallback(() => {
    if (submitting) return;
    setSelectedPkg(null);
  }, [submitting]);

  // ── Idempotency key — one per logical subscribe attempt ────────────────
  const attemptKeyRef = useRef(null);
  useEffect(() => {
    attemptKeyRef.current = null;
  }, [selectedPkg?.id, paymentMethod, phone, network]);
  const getAttemptKey = useCallback(() => {
    if (!attemptKeyRef.current) attemptKeyRef.current = newIdempotencyKey();
    return attemptKeyRef.current;
  }, []);

  // ── In-flight payment tracking + polling ────────────────────────────────
  const [pendingIntent, setPendingIntent] = useState(null); // PaymentIntentStatusResponse | null
  const [successBanner, setSuccessBanner] = useState(null); // { package_name } | null

  const refreshAfterTierChange = useCallback(async () => {
    reloadMine();
    reloadHistory();
    try {
      const profile = await api.users.me();
      updateUser(profile);
    } catch {
      // Non-fatal — tier badges elsewhere just won't refresh until next
      // natural profile fetch. mine/history above are already correct.
    }
  }, [reloadMine, reloadHistory, updateUser]);

  useEffect(() => {
    if (!pendingIntent || isTerminalIntent(pendingIntent.status)) return;

    let cancelled = false;
    let timer = null;
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) { schedule(); return; }
      if (Date.now() > deadline) {
        if (!cancelled) setPendingIntent((p) => (p ? { ...p, _timedOut: true } : p));
        return;
      }
      try {
        const result = await api.payments.status(pendingIntent.id);
        if (cancelled) return;
        setPendingIntent(result);
        if (result.status === "COMPLETED") {
          setSuccessBanner({ package_name: pendingIntent.package_id === selectedPkg?.id ? selectedPkg?.name : "your new plan" });
          refreshAfterTierChange();
        } else if (isTerminalIntent(result.status)) {
          attemptKeyRef.current = null; // next attempt needs a fresh key
        } else {
          schedule();
        }
      } catch {
        if (!cancelled) schedule(); // transient — coreFetch already retried internally
      }
    };

    function schedule() {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntent?.id, pendingIntent?.status]);

  const handleSubscribe = async () => {
    if (submitting || !selectedPkg) return;
    setSubmitError(null);

    const isFree = selectedPkg.is_free;
    if (!isFree && paymentMethod === "mobile_money") {
      if (!isValidUgPhone(phone)) {
        setPhoneError("Enter a valid Uganda mobile number (e.g. 0771234567).");
        return;
      }
    }
    setPhoneError(null);
    setSubmitting(true);

    const key = getAttemptKey();
    const body = {
      package_id: selectedPkg.id,
      // Free tier: any non-"mobile_money" value skips the phone/network
      // validator since price is $0 and nothing is actually charged.
      payment_method: isFree ? "card" : paymentMethod,
      ...(!isFree && paymentMethod === "mobile_money"
        ? { phone_number: cleanPhone(phone), network }
        : {}),
      return_url: typeof window !== "undefined" ? window.location.href : undefined,
      idempotency_key: key,
    };

    try {
      const result = await api.packages.subscribe(body, key);

      if (result.status === "ACTIVE") {
        // Free tier — activated immediately, no checkout, no polling.
        setSuccessBanner({ package_name: result.package_name });
        setSelectedPkg(null);
        attemptKeyRef.current = null;
        refreshAfterTierChange();
        return;
      }

      // Paid tier — open hosted checkout, then track it.
      if (result.checkout_url) {
        window.open(result.checkout_url, "_blank", "noopener");
      }
      setPendingIntent({
        id: result.payment_intent_id,
        status: result.status,
        status_label: result.status,
        is_terminal: false,
        checkout_url: result.checkout_url,
        package_id: result.package_id,
      });
      setSelectedPkg(null);
    } catch (e) {
      if (e.status === 409) {
        setSubmitError("This subscription request was already submitted — check History for its status.");
      } else if (e.code === "PACKAGE_INACTIVE") {
        setSubmitError("This plan is no longer available. Please pick another.");
        reloadCatalog();
      } else if (e.code === "ALREADY_SUBSCRIBED") {
        setSubmitError("You already have an active subscription to this plan.");
        reloadMine();
      } else if (e.code === "PACKAGE_NOT_FOUND") {
        setSubmitError("This plan no longer exists. Please pick another.");
        reloadCatalog();
      } else {
        setSubmitError(e.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Cancel subscription ────────────────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.packages.cancel();
      setCancelOpen(false);
      refreshAfterTierChange();
    } catch (e) {
      setCancelError(e.message ?? "Could not cancel right now. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  const packages = catalog?.packages ?? [];
  const hasMine = !mineLoading && !mineError && mine != null;

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
          <h2 style={{ fontSize: 19, fontWeight: 800 }}>Packages</h2>
        </div>
        <button
          className="btn-ghost btn-icon"
          onClick={() => { reloadCatalog(); reloadMine(); reloadHistory(); }}
          aria-label="Refresh"
        >
          <RefreshCwIcon size={16} strokeWidth={2} />
        </button>
      </div>

      {successBanner && (
        <Alert type="success" onDismiss={() => setSuccessBanner(null)} style={{ marginBottom: 16 }}>
          You're now on the <strong>{successBanner.package_name}</strong> plan!
        </Alert>
      )}

      {/* ── Pending payment banner ── */}
      {pendingIntent && !isTerminalIntent(pendingIntent.status) && (
        <Alert type="info" style={{ marginBottom: 16, alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Spinner size="sm" />
              <strong>Waiting for payment confirmation…</strong>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5 }}>
              {pendingIntent._timedOut
                ? "This is taking longer than expected — check History for updates, or try again."
                : "Complete the checkout in the tab that opened. This updates automatically."}
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {pendingIntent.checkout_url && !pendingIntent._timedOut && (
                <button
                  className="link-btn"
                  onClick={() => window.open(pendingIntent.checkout_url, "_blank", "noopener")}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <ExternalLinkIcon size={12} strokeWidth={2} /> Reopen checkout
                </button>
              )}
              <button className="link-btn" onClick={() => setPendingIntent(null)}>
                Stop waiting
              </button>
            </div>
          </div>
        </Alert>
      )}

      {pendingIntent?.status && ["FAILED", "CANCELLED", "EXPIRED"].includes(pendingIntent.status) && (
        <Alert type="error" onDismiss={() => setPendingIntent(null)} style={{ marginBottom: 16 }}>
          Payment {pendingIntent.status_label?.toLowerCase() ?? "did not complete"}. You can try subscribing again.
        </Alert>
      )}

      {/* ── Current plan ── */}
      <Card title="Your Current Plan" style={{ marginBottom: 18 }}>
        {mineLoading ? (
          <div className="rc-skeleton" style={{ height: 56, borderRadius: "var(--radius)" }} />
        ) : mineError ? (
          <Alert type="error">
            <span>{mineError}</span>
            <button className="link-btn" onClick={reloadMine} style={{ marginLeft: 8 }}>Retry</button>
          </Alert>
        ) : hasMine ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{mine.package_name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Badge status={statusToBadgeProp(mine.status)}>{mine.status_label}</Badge>
                  {mine.is_active && mine.days_remaining != null && (
                    <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                      {mine.days_remaining === 0 ? "Expires today" : `${mine.days_remaining} days left`}
                    </span>
                  )}
                </div>
              </div>
              {mine.is_active && mine.tier_level !== "free" && (
                <button
                  className="btn-ghost"
                  onClick={() => setCancelOpen(true)}
                  style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--danger)", flexShrink: 0 }}
                >
                  <Trash2Icon size={14} strokeWidth={2} /> Cancel
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PackageIcon size={18} strokeWidth={2} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
              You're on the Free plan — pick a plan below to upgrade.
            </span>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => !cancelling && setCancelOpen(false)}
        onConfirm={handleCancel}
        title="Cancel Subscription"
        confirmLabel="Cancel Subscription"
        danger
        loading={cancelling}
        description={`Your ${mine?.package_name ?? "current"} plan will be cancelled immediately and you'll return to the Free tier. This can't be undone — you can resubscribe any time.`}
      />
      {cancelError && (
        <Alert type="error" message={cancelError} onDismiss={() => setCancelError(null)} style={{ marginBottom: 16 }} />
      )}

      {/* ── Tabs ── */}
      <Card>
        <TabBar tabs={tabs} active={tab} onChange={setTab} />

        <div style={{ marginTop: 14 }}>
          {tab === "plans" ? (
            catalogLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rc-skeleton" style={{ height: 180, borderRadius: "var(--radius-lg)" }} />
                ))}
              </div>
            ) : catalogError ? (
              <Alert type="error">
                <span>{catalogError}</span>
                <button className="link-btn" onClick={reloadCatalog} style={{ marginLeft: 8 }}>Retry</button>
              </Alert>
            ) : packages.length === 0 ? (
              <EmptyState icon="📦" title="No plans available" message="Check back soon — plans are configured by the RENOCORP team." />
            ) : (
              packages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  isCurrent={hasMine && mine.package_id === pkg.id && mine.is_active}
                  onSubscribe={openSubscribeModal}
                  disabled={!!pendingIntent && !isTerminalIntent(pendingIntent.status)}
                  fmtUGX={fmtUGX}
                />
              ))
            )
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <select
                  className="rc-select"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setHistoryPage(1); }}
                  aria-label="Filter subscription history by status"
                >
                  {SUB_STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              {historyError ? (
                <Alert type="error">
                  <span>{historyError}</span>
                  <button className="link-btn" onClick={reloadHistory} style={{ marginLeft: 8 }}>Retry</button>
                </Alert>
              ) : historyLoading && !history ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                  <Spinner />
                </div>
              ) : !history?.records?.length ? (
                <EmptyState icon="🗂️" title="No subscription history" message="Your subscription activity will show up here." />
              ) : (
                <>
                  {history.records.map((r) => <HistoryRow key={r.id} record={r} />)}
                  <PaginationBar page={history.page} total={history.total} limit={history.page_size} onChange={setHistoryPage} />
                </>
              )}
            </>
          )}
        </div>
      </Card>

      {/* ── Subscribe modal ── */}
      <Modal open={!!selectedPkg} onClose={closeSubscribeModal} title={selectedPkg ? `Subscribe to ${selectedPkg.name}` : ""}>
        {selectedPkg && (
          <>
            {submitError && (
              <Alert type="error" message={submitError} onDismiss={() => setSubmitError(null)} style={{ marginBottom: 14 }} />
            )}

            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 14px", background: "var(--surface-3)", border: "1px solid var(--border)",
                borderRadius: "var(--radius)", marginBottom: 16,
              }}
            >
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Total due</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{selectedPkg.price_display}</span>
            </div>

            {!selectedPkg.is_free && (
              <>
                <div className="rc-field">
                  <label className="rc-label">Payment Method</label>
                  <SegmentedControl options={PAYMENT_METHODS} value={paymentMethod} onChange={setPaymentMethod} disabled={submitting} />
                </div>

                {paymentMethod === "mobile_money" && (
                  <>
                    <div className="rc-field">
                      <label className="rc-label" htmlFor="pkg-phone">Mobile Money Number</label>
                      <input
                        id="pkg-phone"
                        className="rc-input"
                        inputMode="tel"
                        placeholder="0771234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={submitting}
                        style={phoneError ? { borderColor: "var(--danger-border)" } : undefined}
                      />
                      {phoneError && (
                        <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                          <AlertCircleIcon size={12} strokeWidth={2} /> {phoneError}
                        </div>
                      )}
                    </div>
                    <div className="rc-field">
                      <label className="rc-label">Network</label>
                      <SegmentedControl
                        options={[
                          { value: "MTN", label: "MTN", Icon: SmartphoneIcon },
                          { value: "AIRTEL", label: "Airtel", Icon: SmartphoneIcon },
                        ]}
                        value={network}
                        onChange={setNetwork}
                        disabled={submitting}
                      />
                    </div>
                  </>
                )}

                {paymentMethod !== "mobile_money" && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 16, fontSize: 12, color: "var(--text-muted)" }}>
                    <InfoIcon size={13} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                    You'll complete this payment on Flutterwave's secure checkout page.
                  </div>
                )}
              </>
            )}

            <button className="btn-primary" onClick={handleSubscribe} disabled={submitting}>
              {submitting ? <Spinner size="sm" /> : selectedPkg.is_free ? "Activate Free Plan" : "Confirm & Subscribe"}
            </button>
          </>
        )}
      </Modal>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 4, padding: "0 4px" }}>
        <HistoryIcon size={12} strokeWidth={2} style={{ color: "var(--text-dim)", marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Subscriptions renew manually — RENOCORP does not auto-charge you.
          Cancelling reverts you to the Free tier immediately; any time already
          paid for is not automatically refunded.
        </p>
      </div>
    </div>
  );
}
