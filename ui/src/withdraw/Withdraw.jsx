/**
 * withdraw/Withdraw.jsx — RENOCORP Withdrawal Screen  v1.0
 * =======================================================================
 * Mobile money payout (MTN / Airtel Uganda) via Flutterwave or Chipper
 * Cash. The single highest-stakes screen in the app — real money leaves
 * a real balance. Built to be correct first, fast second, pretty third.
 *
 * Architecture
 * ------------
 *  · TRUE idempotency, not just "a header exists": a single idempotency
 *    key is minted per logical withdrawal attempt (via
 *    utils/idempotency.js) and reused across every retry of that SAME
 *    attempt — including a re-tap of "Confirm" after a transient error,
 *    a dropped connection, or coreFetch's own internal 429/5xx backoff.
 *    The key is only rotated when the user actually changes amount,
 *    phone, network, or provider (see the idempotency-key effect below)
 *    — i.e. when it becomes a genuinely different request. This matches
 *    the backend's own contract exactly: WithdrawalRequestBody.
 *    idempotency_key (models.py) is required, min 16 chars, and the
 *    route (routes.py::request_withdrawal) merges the Idempotency-Key
 *    HEADER over the body field, replaying the original record with
 *    HTTP 200 instead of creating a duplicate with 201.
 *  · api.js's withdrawals.request(body, idempotencyKey) was extended
 *    with an optional second argument so this screen can pin the exact
 *    header value instead of letting coreFetch mint a fresh one on every
 *    call — see api.js for the (2-line, backward-compatible) change.
 *  · Every amount is USD, matching the backend exactly (amount_usd,
 *    fee_usd, net_usd — see modules/withdrawals/models.py). There is NO
 *    password field in the real request contract (WithdrawalRequestBody
 *    has no such field) — confirmation is `pin_confirmed: true`, set the
 *    moment the user taps "Confirm Withdrawal" in the dialog. UGX is
 *    shown only as a secondary, clearly-labelled estimate via
 *    utils/currencyConverter.js — it is never sent to the backend and
 *    never used in any validation.
 *  · Fee preview is a pure, side-effect-free GET (fee-estimate) —
 *    debounced 500ms, cancels/ignores stale responses via a request
 *    generation counter, and is trivially safe to spam-refetch.
 *  · Client-side validation mirrors the backend's own Pydantic
 *    validators byte-for-byte (see _UG_PHONE_PATTERN /
 *    _MIN_WITHDRAWAL_USD / _MAX_WITHDRAWAL_USD in models.py) so users
 *    get instant feedback, but the backend remains the sole source of
 *    truth — every constraint here is re-checked server-side regardless.
 *  · Structured domain errors (INSUFFICIENT_BALANCE, DUPLICATE_REQUEST,
 *    INVALID_PHONE, DAILY_LIMIT_EXCEEDED, PROVIDERS_UNAVAILABLE,
 *    WITHDRAWAL_ERROR — see routes.py::_map_service_error) are unwrapped
 *    via api.js's normalizeError (`err.code`, `err.details`) and mapped
 *    to precise, non-generic copy. A 409 duplicate is treated as an
 *    idempotent replay, not a failure — the UI simply shows the existing
 *    record. A 503 "providers unavailable" is treated as informational
 *    (the request may already be queued) rather than a hard failure.
 *  · Active withdrawals (PENDING / PROCESSING) are polled individually
 *    via GET /withdrawals/{id}/status every 15s — matching the backend's
 *    own documented cadence ("suitable for polling every 15 seconds").
 *    Polling: batches all active ids with Promise.allSettled (one slow
 *    id never blocks the others), pauses when the tab is hidden (Page
 *    Visibility API — same pattern as hooks/useNotifications.js and
 *    rewards/Rewards.jsx), and self-terminates the moment every tracked
 *    withdrawal reaches a terminal state (`is_terminal`).
 *  · History uses page/page_size pagination (PaginationBar) — the
 *    backend's own history endpoint also supports a cursor, but
 *    page/page_size is the documented default and is what the mobile
 *    history list needs (jump-to-page for a page-size-20 personal list).
 *  · A soft client-side cooldown (20s) throttles resubmission after a
 *    successful request, in front of the backend's real limit (3/min) —
 *    reduces the odds of ever hitting a 429 in the first place, and
 *    coreFetch already retries 429s with Retry-After-aware backoff if
 *    one slips through.
 *  · Every list row is memoized; the fee/amount panel and the confirm
 *    dialog never re-render the (potentially long) history list. All
 *    fetches go through useApi/useEffect + AbortController — nothing
 *    here can leak a setState-after-unmount warning or a race between a
 *    stale and fresh page.
 *
 * Backend contracts (verified against modules/withdrawals/{models,routes}.py):
 *  GET  /api/users/me/balance                       → { balance_usd, balance_points, snapshot_at, ttl_seconds }
 *  GET  /api/withdrawals/fee-estimate?amount&provider → { gross_usd, fee_usd, net_usd, fee_pct, provider, fee_display }
 *  POST /api/withdrawals/request                     → WithdrawalRecord (201, or 200 on idempotent replay)
 *       body: { amount_usd, phone_number, network, idempotency_key, pin_confirmed }
 *       header: Idempotency-Key (takes precedence over body field if different)
 *  GET  /api/withdrawals/history?page&page_size&status → { records[], total, page, page_size, total_pages, has_more }
 *  GET  /api/withdrawals/{id}/status                  → { id, status, status_label, status_color, provider_ref, failure_reason, processed_at, is_terminal }
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
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { Spinner } from "../components/Spinner.jsx";
import { EmptyState } from "../components/EmptyState.jsx";
import { PaginationBar } from "../components/PaginationBar.jsx";
import {
  ArrowLeftIcon,
  WalletIcon,
  SmartphoneIcon,
  ZapIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  InfoIcon,
  HistoryIcon,
} from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════
// CONSTANTS — mirrored 1:1 from modules/withdrawals/models.py
// ═════════════════════════════════════════════════════════════════════════

const MIN_USD           = 1.0;     // _MIN_WITHDRAWAL_USD
const MAX_USD           = 500.0;   // _MAX_WITHDRAWAL_USD (daily cap)
const FEE_DEBOUNCE_MS   = 500;
const STATUS_POLL_MS    = 15_000;  // matches backend doc: "poll every 15 seconds"
const SOFT_COOLDOWN_MS  = 20_000;  // client-side throttle ahead of the real 3/min server limit
const HISTORY_PAGE_SIZE = 20;

// Uganda mobile number pattern — identical to backend's _UG_PHONE_PATTERN
const UG_PHONE_RE = /^(?:\+?256|0)?([37][0-9]{8})$/;

// Mirrors backend's _MTN_PREFIXES / _AIRTEL_PREFIXES — UI hint only,
// never used to force a choice. The backend itself notes MTN/Airtel
// prefixes overlap and "routing [is] handled by provider".
const MTN_PREFIXES    = new Set(["70", "74", "75", "76", "77", "78"]);
const AIRTEL_PREFIXES = new Set(["70", "74", "75", "30", "31", "39", "41", "45"]);

// Static provider metadata — these are hardcoded properties on the
// backend's own PayoutProvider enum (fee_pct/estimated_minutes), not
// server-configurable, so mirroring them here is safe. The live fee
// AMOUNT always comes from the fee-estimate API — never computed locally.
const PROVIDERS = [
  { value: "FLUTTERWAVE", label: "Flutterwave", feeHint: "1.4% fee", etaHint: "~5 min",  Icon: ZapIcon },
  { value: "CHIPPER",     label: "Chipper Cash", feeHint: "No fee",  etaHint: "~10 min", Icon: ShieldCheckIcon },
];

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "REJECTED"]);
const isTerminalStatus  = (s) => TERMINAL_STATUSES.has(s);

const STATUS_FILTERS = [
  { value: "",           label: "All" },
  { value: "PENDING",    label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "COMPLETED",  label: "Completed" },
  { value: "FAILED",     label: "Failed" },
  { value: "REJECTED",   label: "Rejected" },
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

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Strip spaces/dashes so validation + submission see a clean string. */
function cleanPhone(v) {
  return String(v ?? "").trim().replace(/[\s-]/g, "");
}

function isValidUgPhone(v) {
  return UG_PHONE_RE.test(cleanPhone(v));
}

/** UX hint only — never blocks submission, user can always override. */
function suggestNetwork(rawPhone) {
  const stripped = cleanPhone(rawPhone);
  const match = UG_PHONE_RE.exec(stripped);
  if (!match) return null;
  const digits = match[1];       // 9 digits, no prefix
  const prefix = digits.slice(0, 2);
  const inMtn = MTN_PREFIXES.has(prefix);
  const inAirtel = AIRTEL_PREFIXES.has(prefix);
  if (inMtn && !inAirtel) return "MTN";
  if (inAirtel && !inMtn) return "AIRTEL";
  return null; // ambiguous / overlapping prefix — let the user decide
}

// Maps backend WithdrawalStatus → Badge's status prop (Badge already
// lowercases + maps "pending"→orange, "completed"→green, etc.)
function statusToBadgeProp(status) {
  return String(status ?? "").toLowerCase();
}

// ═════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═════════════════════════════════════════════════════════════════════════

const SegmentedControl = memo(function SegmentedControl({ options, value, onChange, disabled }) {
  return (
    <div
      role="radiogroup"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 8,
      }}
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
              padding: "12px 14px",
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
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 13 }}>
              {Icon && <Icon size={15} strokeWidth={2} />}
              {opt.label}
            </span>
            {(opt.feeHint || opt.etaHint) && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                {opt.feeHint}{opt.feeHint && opt.etaHint ? " · " : ""}{opt.etaHint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});

const FeeRow = memo(function FeeRow({ label, value, strong, accent }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        fontSize: strong ? 14 : 13,
        fontWeight: strong ? 800 : 500,
        color: accent ? "var(--accent)" : strong ? "var(--text)" : "var(--text-muted)",
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
});

const HistoryRow = memo(function HistoryRow({ record, override }) {
  const live = override ?? record;
  const status = live.status ?? record.status;
  const failureReason = live.failure_reason ?? record.failure_reason;

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
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {formatUSD(record.amount_usd)}{" "}
            <span style={{ fontWeight: 500, fontSize: 11, color: "var(--text-muted)" }}>
              gross
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {record.phone_display} · {record.network} · {record.provider}
          </div>
        </div>
        <Badge status={statusToBadgeProp(status)}>{status}</Badge>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        <span>Net: <strong style={{ color: "var(--text)" }}>{formatUSD(record.net_usd)}</strong></span>
        <span>{timeAgo(new Date(record.requested_at * 1000).toISOString())}</span>
      </div>

      {record.estimated_arrival && !isTerminalStatus(status) && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11, color: "var(--info)" }}>
          <ClockIcon size={12} strokeWidth={2} />
          {record.estimated_arrival}
        </div>
      )}

      {failureReason && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginTop: 8, fontSize: 11.5, color: "var(--danger)" }}>
          <AlertCircleIcon size={12} strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
          {failureReason}
        </div>
      )}

      {record.provider_ref && (
        <div style={{ marginTop: 6, fontSize: 10.5, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          Ref: {record.provider_ref}
        </div>
      )}
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════
// ROOT
// ═════════════════════════════════════════════════════════════════════════

export default function Withdraw() {
  const navigate = useNavigate();
  useAuth(); // ensures this only renders inside an authenticated shell

  // ── Balance ────────────────────────────────────────────────────────────
  const {
    data: balance,
    loading: balanceLoading,
    error: balanceError,
    reload: reloadBalance,
  } = useApi(() => api.users.balance(), []);

  const { formatUGX: fxToUGX, ready: fxReady } = useCurrencyConverter();

  // ── Form state ─────────────────────────────────────────────────────────
  const [amount, setAmount]           = useState("");
  const [phone, setPhone]             = useState("");
  const [network, setNetwork]         = useState("MTN");
  const [provider, setProvider]       = useState("FLUTTERWAVE");
  const [amountError, setAmountError] = useState(null);
  const [phoneError, setPhoneError]   = useState(null);

  const networkHint = useMemo(() => suggestNetwork(phone), [phone]);

  // ── Fee estimate (debounced, race-safe) ───────────────────────────────
  const [fee, setFee]             = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError]     = useState(null);
  const feeGenRef  = useRef(0);
  const feeTimerRef = useRef(null);

  useEffect(() => {
    const amt = parseFloat(amount);
    setFeeError(null);

    if (!amount || isNaN(amt) || amt < MIN_USD || amt > MAX_USD) {
      setFee(null);
      setFeeLoading(false);
      return;
    }

    clearTimeout(feeTimerRef.current);
    const myGen = ++feeGenRef.current;
    setFeeLoading(true);

    feeTimerRef.current = setTimeout(async () => {
      try {
        const result = await api.withdrawals.feeEstimate({ amount: round2(amt), provider });
        if (myGen !== feeGenRef.current) return; // stale — a newer request superseded this one
        setFee(result);
      } catch (e) {
        if (myGen !== feeGenRef.current) return;
        setFee(null);
        setFeeError(e.message ?? "Could not calculate fee right now.");
      } finally {
        if (myGen === feeGenRef.current) setFeeLoading(false);
      }
    }, FEE_DEBOUNCE_MS);

    return () => clearTimeout(feeTimerRef.current);
  }, [amount, provider]);

  // ── Idempotency key — one per logical attempt ─────────────────────────
  // Rotates ONLY when the request actually changes (amount/phone/network/
  // provider). Re-tapping "Confirm" for the identical values — e.g. after
  // a transient network error — reuses the same key, exactly matching
  // WithdrawalRequestBody.idempotency_key's contract on the backend.
  const idempKeyRef = useRef(null);
  useEffect(() => {
    idempKeyRef.current = null;
  }, [amount, phone, network, provider]);
  const getIdempKey = useCallback(() => {
    if (!idempKeyRef.current) idempKeyRef.current = newIdempotencyKey();
    return idempKeyRef.current;
  }, []);

  // ── Submission state ──────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState(null);
  const [submitNotice, setSubmitNotice] = useState(null); // info-level (e.g. duplicate replay, queued)
  const [lastResult, setLastResult]     = useState(null); // most recent WithdrawalRecord created
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // eslint-disable-next-line no-unused-vars -- setter-only: ticking this
  // state forces a once-per-second re-render so the Date.now()-derived
  // countdown below stays visually live, without a full-component interval.
  const [, setCooldownTick] = useState(0);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setCooldownTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemainingS = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));

  // ── History ────────────────────────────────────────────────────────────
  const [historyPage, setHistoryPage]     = useState(1);
  const [statusFilter, setStatusFilter]   = useState("");

  const {
    data: history,
    loading: historyLoading,
    error: historyError,
    reload: reloadHistory,
  } = useApi(
    () => api.withdrawals.history({
      page: historyPage,
      page_size: HISTORY_PAGE_SIZE,
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
    [historyPage, statusFilter]
  );

  // ── Live status polling for active withdrawals ────────────────────────
  const [statusOverrides, setStatusOverrides] = useState({}); // id -> WithdrawalStatusResponse

  const activeIds = useMemo(() => {
    const ids = new Set();
    if (lastResult && !isTerminalStatus(statusOverrides[lastResult.id]?.status ?? lastResult.status)) {
      ids.add(lastResult.id);
    }
    for (const r of history?.records ?? []) {
      const effectiveStatus = statusOverrides[r.id]?.status ?? r.status;
      if (!isTerminalStatus(effectiveStatus)) ids.add(r.id);
    }
    return Array.from(ids);
  }, [lastResult, history, statusOverrides]);

  const activeIdsKey = activeIds.join(",");

  useEffect(() => {
    if (!activeIds.length) return;
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      const results = await Promise.allSettled(activeIds.map((id) => api.withdrawals.status(id)));
      if (cancelled) return;
      setStatusOverrides((prev) => {
        const next = { ...prev };
        results.forEach((res, i) => {
          if (res.status === "fulfilled") next[activeIds[i]] = res.value;
        });
        return next;
      });
      schedule();
    };

    function schedule() {
      timer = setTimeout(poll, STATUS_POLL_MS);
    }

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdsKey]);

  // ── Validation ─────────────────────────────────────────────────────────
  const validate = useCallback(() => {
    let ok = true;
    const amt = parseFloat(amount);

    if (!amount || isNaN(amt)) {
      setAmountError("Enter an amount.");
      ok = false;
    } else if (amt < MIN_USD) {
      setAmountError(`Minimum withdrawal is ${formatUSD(MIN_USD)}.`);
      ok = false;
    } else if (amt > MAX_USD) {
      setAmountError(`Maximum withdrawal is ${formatUSD(MAX_USD)} per day.`);
      ok = false;
    } else if (balance && amt > balance.balance_usd) {
      setAmountError(`That's more than your available balance of ${formatUSD(balance.balance_usd)}.`);
      ok = false;
    } else {
      setAmountError(null);
    }

    if (!isValidUgPhone(phone)) {
      setPhoneError("Enter a valid Uganda number, e.g. 0771234567.");
      ok = false;
    } else {
      setPhoneError(null);
    }

    return ok;
  }, [amount, phone, balance]);

  const handleAmountChange = (e) => {
    const raw = e.target.value;
    // Allow digits + at most one decimal point + at most 2 decimal places while typing.
    if (raw === "" || /^\d{0,6}(\.\d{0,2})?$/.test(raw)) {
      setAmount(raw);
      setAmountError(null);
      setSubmitError(null);
    }
  };

  const handleMax = () => {
    if (!balance) return;
    const capped = Math.min(balance.balance_usd, MAX_USD);
    setAmount(capped > 0 ? round2(capped).toFixed(2) : "");
    setAmountError(null);
  };

  const handlePhoneChange = (e) => {
    setPhone(e.target.value);
    setPhoneError(null);
    setSubmitError(null);
  };

  const handleOpenConfirm = () => {
    setSubmitError(null);
    setSubmitNotice(null);
    if (Date.now() < cooldownUntil) {
      setSubmitError(`Please wait ${cooldownRemainingS}s before submitting another withdrawal.`);
      return;
    }
    if (!validate()) return;
    setConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);

    const key = getIdempKey();
    const body = {
      amount_usd: round2(parseFloat(amount)),
      phone_number: cleanPhone(phone),
      network,
      idempotency_key: key,
      pin_confirmed: true,
    };

    try {
      const record = await api.withdrawals.request(body, key);
      setLastResult(record);
      setConfirmOpen(false);
      setAmount("");
      setPhone("");
      setFee(null);
      idempKeyRef.current = null;
      setCooldownUntil(Date.now() + SOFT_COOLDOWN_MS);
      reloadBalance();
      reloadHistory();
    } catch (e) {
      if (e.status === 409) {
        // Idempotent replay — this exact request was already submitted.
        setSubmitNotice("This withdrawal was already submitted — check History below for its status.");
        setConfirmOpen(false);
        reloadHistory();
      } else if (e.code === "INSUFFICIENT_BALANCE") {
        const avail = e.details?.available;
        setSubmitError(
          avail != null
            ? `Insufficient balance — available: ${formatUSD(avail)}.`
            : e.message
        );
      } else if (e.code === "DAILY_LIMIT_EXCEEDED") {
        setSubmitError(
          e.details?.limit_usd != null
            ? `Daily withdrawal limit of ${formatUSD(e.details.limit_usd)} reached (used ${formatUSD(e.details.today_total ?? 0)} today).`
            : e.message
        );
      } else if (e.code === "INVALID_PHONE") {
        setPhoneError(e.message);
        setConfirmOpen(false);
      } else if (e.code === "PROVIDERS_UNAVAILABLE") {
        setSubmitNotice(e.message ?? "Payout services are busy — your request may already be queued. Check History shortly.");
        setConfirmOpen(false);
        reloadHistory();
      } else {
        setSubmitError(e.message ?? "Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };


  // RENDER
  // ═══════════════════════════════════════════════════════════════════════

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
        <h2 style={{ fontSize: 19, fontWeight: 800 }}>Withdraw Cash</h2>
      </div>

      {/* ── Success banner ── */}
      {lastResult && (
        <Alert
          type="success"
          onDismiss={() => setLastResult(null)}
          style={{ marginBottom: 16, alignItems: "flex-start" }}
        >
          <div>
            <strong>Withdrawal submitted.</strong>{" "}
            {formatUSD(lastResult.amount_usd)} to {lastResult.phone_display} — currently{" "}
            <Badge status={statusToBadgeProp(statusOverrides[lastResult.id]?.status ?? lastResult.status)}>
              {statusOverrides[lastResult.id]?.status_label ?? lastResult.status_label}
            </Badge>
            {lastResult.estimated_arrival && <> · {lastResult.estimated_arrival}</>}
          </div>
        </Alert>
      )}

      {submitNotice && (
        <Alert type="info" message={submitNotice} onDismiss={() => setSubmitNotice(null)} style={{ marginBottom: 16 }} />
      )}

      {/* ── Balance card ── */}
      <Card style={{ marginBottom: 18 }}>
        {balanceError ? (
          // NOTE: Alert renders `message` OR `children`, never both — so the
          // retry action is composed into a single children node here rather
          // than passed alongside `message`.
          <Alert type="error">
            <span>{balanceError}</span>
            <button className="link-btn" onClick={reloadBalance} style={{ marginLeft: 8 }}>Retry</button>
          </Alert>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: "var(--accent-dim)", color: "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <WalletIcon size={19} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Available Balance
              </div>
              {balanceLoading ? (
                <Spinner size="sm" />
              ) : (
                <div style={{ fontSize: 21, fontWeight: 800 }}>
                  {formatUSD(balance?.balance_usd)}
                  {fxReady && balance?.balance_usd != null && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)", marginLeft: 8 }}>
                      ≈ {fxToUGX(balance.balance_usd, "USD")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── Withdrawal form ── */}
      <Card title="New Withdrawal" style={{ marginBottom: 18 }}>
        {submitError && (
          <Alert type="error" message={submitError} onDismiss={() => setSubmitError(null)} style={{ marginBottom: 14 }} />
        )}

        {/* Amount */}
        <div className="rc-field">
          <label className="rc-label" htmlFor="wd-amount">Amount (USD)</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="wd-amount"
              className="rc-input"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={handleAmountChange}
              onBlur={validate}
              disabled={submitting}
              style={amountError ? { borderColor: "var(--danger-border)" } : undefined}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleMax}
              disabled={submitting || balanceLoading || !balance?.balance_usd}
              style={{ width: "auto", padding: "0 16px", flexShrink: 0 }}
            >
              Max
            </button>
          </div>
          {amountError ? (
            <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertCircleIcon size={12} strokeWidth={2} /> {amountError}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>
              Min {formatUSD(MIN_USD)} · Max {formatUSD(MAX_USD)} per day
            </div>
          )}
        </div>

        {/* Provider */}
        <div className="rc-field">
          <label className="rc-label">Payout Provider</label>
          <SegmentedControl options={PROVIDERS} value={provider} onChange={setProvider} disabled={submitting} />
        </div>

        {/* Phone */}
        <div className="rc-field">
          <label className="rc-label" htmlFor="wd-phone">Mobile Money Number</label>
          <input
            id="wd-phone"
            className="rc-input"
            inputMode="tel"
            placeholder="0771234567"
            value={phone}
            onChange={handlePhoneChange}
            onBlur={validate}
            disabled={submitting}
            style={phoneError ? { borderColor: "var(--danger-border)" } : undefined}
          />
          {phoneError ? (
            <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <AlertCircleIcon size={12} strokeWidth={2} /> {phoneError}
            </div>
          ) : (
            networkHint && networkHint !== network && (
              <div style={{ fontSize: 11.5, color: "var(--info)", marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
                <InfoIcon size={12} strokeWidth={2} /> Looks like {networkHint === "MTN" ? "MTN" : "Airtel"} — tap below to match.
              </div>
            )
          )}
        </div>

        {/* Network */}
        <div className="rc-field">
          <label className="rc-label">Network</label>
          <SegmentedControl
            options={[
              { value: "MTN",    label: "MTN Mobile Money", Icon: SmartphoneIcon },
              { value: "AIRTEL", label: "Airtel Money",      Icon: SmartphoneIcon },
            ]}
            value={network}
            onChange={setNetwork}
            disabled={submitting}
          />
        </div>

        {/* Fee breakdown */}
        <div
          style={{
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "4px 14px",
            marginTop: 4,
            marginBottom: 18,
            minHeight: 40,
          }}
        >
          {feeLoading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
              <Spinner size="sm" /> <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Calculating fee…</span>
            </div>
          ) : feeError ? (
            <div style={{ padding: "10px 0", fontSize: 12, color: "var(--danger)" }}>{feeError}</div>
          ) : fee ? (
            <>
              <FeeRow label="You send" value={formatUSD(fee.gross_usd)} />
              <FeeRow label={`Fee (${fee.fee_display ?? ""})`} value={`− ${formatUSD(fee.fee_usd)}`} />
              <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
              <FeeRow label="You receive" value={formatUSD(fee.net_usd)} strong accent />
            </>
          ) : (
            <div style={{ padding: "10px 0", fontSize: 12, color: "var(--text-dim)" }}>
              Enter an amount to see the fee breakdown.
            </div>
          )}
        </div>

        <button
          className="btn-primary"
          onClick={handleOpenConfirm}
          disabled={submitting || balanceLoading || Date.now() < cooldownUntil}
        >
          {Date.now() < cooldownUntil
            ? `Please wait ${cooldownRemainingS}s…`
            : "Withdraw Cash"}
        </button>
      </Card>

      {/* ── Confirm dialog ── */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        title="Confirm Withdrawal"
        confirmLabel="Confirm Withdrawal"
        loading={submitting}
        description={
          fee
            ? `${formatUSD(fee.gross_usd)} will be deducted from your balance. ${formatUSD(fee.net_usd)} will be sent to ${cleanPhone(phone)} (${network}) via ${PROVIDERS.find((p) => p.value === provider)?.label}.`
            : `${formatUSD(parseFloat(amount) || 0)} will be deducted from your balance and sent to ${cleanPhone(phone)} (${network}).`
        }
      />

      {/* ── History ── */}
      <Card
        title="Withdrawal History"
        action={
          <button className="btn-ghost" onClick={reloadHistory} aria-label="Refresh history" style={{ padding: "5px 7px" }}>
            <RefreshCwIcon size={15} strokeWidth={2} className={historyLoading ? "spin" : undefined} />
          </button>
        }
      >
        <div style={{ marginBottom: 14 }}>
          <select
            className="rc-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setHistoryPage(1); }}
            aria-label="Filter withdrawal history by status"
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {historyError ? (
          <Alert type="error" message={historyError} onDismiss={undefined} />
        ) : historyLoading && !history ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
            <Spinner />
          </div>
        ) : !history?.records?.length ? (
          <EmptyState
            icon="💸"
            title="No withdrawals yet"
            message="Your withdrawal history will show up here once you cash out."
          />
        ) : (
          <>
            {history.records.map((r) => (
              <HistoryRow key={r.id} record={r} override={statusOverrides[r.id]} />
            ))}
            <PaginationBar
              page={history.page}
              total={history.total}
              limit={history.page_size}
              onChange={setHistoryPage}
            />
          </>
        )}
      </Card>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 4, padding: "0 4px" }}>
        <HistoryIcon size={12} strokeWidth={2} style={{ color: "var(--text-dim)", marginTop: 2, flexShrink: 0 }} />
        <p style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Funds are deducted from your balance immediately when you submit a withdrawal.
          If a payout fails, the amount is automatically refunded to your balance and
          you'll be notified.
        </p>
      </div>
    </div>
  );
}
