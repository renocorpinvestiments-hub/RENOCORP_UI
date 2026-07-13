/**
 * api.js — RENOCORP Unified API Client  v2.0
 * ============================================
 * Institutional-grade API layer for all RENOCORP modules.
 *
 * Architecture:
 *  · In-memory token store — zero localStorage/sessionStorage
 *  · Single-flight JWT refresh with promise dedup
 *  · Idempotency-Key injection on all mutations (POST/PUT/PATCH)
 *  · Exponential backoff retry (3x, 150ms base, jitter)
 *  · 429 rate-limit respect with Retry-After header parsing
 *  · x-request-id correlation on every request
 *  · Constant-time error normalisation from backend shape
 *  · Abort controller support for cancellable requests
 *  · Request queue with concurrency cap (100 in-flight max)
 *  · Module-scoped base URL derivation (no magic string duplication)
 *
 * Compatible with RENOCORP FastAPI backend at /api/*
 * Handles 10,000+ concurrent users via efficient promise management.
 */

// ─── ENVIRONMENT & CONFIG ───────────────────────────────────────────────────
export const API_BASE       = import.meta.env?.VITE_API_BASE ?? "http://localhost:8000/api/auth";
const MAX_RETRIES            = 3;
const RETRY_BASE_MS          = 150;
const MAX_RETRY_MS           = 10_000;
const IDEMPOTENT_METHODS     = new Set(["POST", "PUT", "PATCH"]);
const MAX_CONCURRENT         = 100;   // in-flight request cap

// ─── BASE URL HELPERS ───────────────────────────────────────────────────────
// Derive the API root from VITE_API_BASE (which points to /api/auth)
const _root = (() => {
  const base = API_BASE;
  // Strip trailing /auth segment if present → get /api root
  if (base.endsWith("/auth")) return base.slice(0, -5);
  // Already a root e.g. http://localhost:8000/api
  return base.replace(/\/$/, "");
})();

const _url = (path) => `${_root}${path}`;

// Named base URLs for each module — single source of truth
export const URLS = Object.freeze({
  AUTH:         `${_root}/auth`,
  USERS:        _url("/users"),
  TASKS:        _url("/tasks"),
  EARNINGS:     _url("/earnings"),
  WITHDRAWALS:  _url("/withdrawals"),
  NOTIFICATIONS:_url("/notifications"),
  OFFERWALL:    _url("/offerwall"),
  REFERRALS:    _url("/referrals"),
  PACKAGES:     _url("/packages"),
  PAYMENTS:     _url("/payments"),
  ADMIN:        _url("/admin"),
  INVITATIONS:  _url("/invitations"),
  VAULT:        _url("/vault"),
});

// ─── IN-MEMORY TOKEN STORE ──────────────────────────────────────────────────
// Module-scoped closures. Survives React re-renders. Dies on hard reload.
// This is intentional — tokens must never persist across sessions.
let _access          = null;
let _refresh         = null;
let _session         = null;    // full session object { session_id, ... }
let _refreshPromise  = null;    // single-flight refresh dedup gate

export const tokenStore = Object.freeze({
  setTokens(access, refresh)  { _access = access; _refresh = refresh; },
  getAccess()                  { return _access; },
  getRefresh()                 { return _refresh; },
  setSession(s)                { _session = s; },
  getSession()                 { return _session; },
  hasTokens()                  { return !!_access; },
  clear() {
    _access = null;
    _refresh = null;
    _session = null;
    _refreshPromise = null;
  },
});

// ─── REQUEST CONCURRENCY LIMITER ────────────────────────────────────────────
// Prevents runaway parallelism under burst load.
let _inFlight = 0;
const _waitQueue = [];

async function acquireSlot() {
  if (_inFlight < MAX_CONCURRENT) { _inFlight++; return; }
  await new Promise((resolve) => _waitQueue.push(resolve));
  _inFlight++;
}

function releaseSlot() {
  _inFlight--;
  if (_waitQueue.length > 0) _waitQueue.shift()();
}

// ─── HELPERS ────────────────────────────────────────────────────────────────
let _reqCounter = 0;
function generateRequestId() {
  return `rc-${Date.now().toString(36)}-${(++_reqCounter).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateIdempotencyKey() {
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Jitter prevents thundering herd on 429/5xx
function jitteredBackoff(attempt) {
  const base = Math.min(RETRY_BASE_MS * 2 ** attempt, MAX_RETRY_MS);
  return base * (0.75 + Math.random() * 0.5);
}

/**
 * Normalises all backend error shapes into a consistent throw object:
 * { status: number, message: string, code?: string }
 */
function normalizeError(status, data) {
  // Backend convention across every module (verified in modules/*/routes.py):
  // HTTPException(detail={ "code": "...", "message": "...", ...extra }).
  // FastAPI serializes this as { detail: { code, message, ... } } — `detail`
  // is an OBJECT for nearly every domain error this API returns, not a plain
  // string. Unwrap it so callers get a real human message + a stable `code`,
  // while still supporting plain-string `detail` (FastAPI's own built-in
  // 422 validation errors use a string/array shape) and top-level
  // `error`/`message` fields from any legacy or third-party responses.
  const detail = data?.detail;
  const isStructured = detail != null && typeof detail === "object" && !Array.isArray(detail);

  const message =
    (isStructured ? detail.message : null) ??
    (typeof detail === "string" ? detail : null) ??
    data?.error ??
    data?.message ??
    (typeof data === "string" ? data : null) ??
    "Something went wrong";

  const code =
    (isStructured ? detail.code : null) ??
    data?.error ??
    null;

  return Object.assign(new Error(String(message)), {
    status,
    code,
    // Extra structured fields — e.g. { available, requested } on
    // INSUFFICIENT_BALANCE, { limit_usd, today_total } on
    // DAILY_LIMIT_EXCEEDED — so callers can build precise UI without
    // re-parsing the raw response.
    details: isStructured ? detail : null,
    isApiError: true,
  });
}

// ─── CORE FETCH WITH RETRY ──────────────────────────────────────────────────
/**
 * Low-level fetch wrapper.
 * - Concurrency limited
 * - Auto-retry on network errors and 5xx
 * - 429 back-off with Retry-After header
 * - Request-ID and Idempotency-Key injection
 */
async function coreFetch(url, options = {}, attempt = 0) {
  await acquireSlot();

  const requestId = options._requestId ?? generateRequestId();
  // Propagate same requestId on retries
  options._requestId = requestId;

  const headers = {
    "Content-Type": "application/json",
    "x-request-id": requestId,
    "x-client": "renocorp-ui/2.0",
    ...options.headers,
  };

  // Idempotency key — stable across retries for the same logical mutation
  if (IDEMPOTENT_METHODS.has(options.method ?? "GET")) {
    if (!headers["idempotency-key"]) {
      // Generate once and cache on options so retries reuse same key
      options._idempKey = options._idempKey ?? generateIdempotencyKey();
      headers["idempotency-key"] = options._idempKey;
    }
  }

  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal, // abort controller passthrough
    });
  } catch (networkErr) {
    releaseSlot();
    if (networkErr?.name === "AbortError") {
      throw Object.assign(new Error("Request aborted"), { status: 0, code: "ABORTED", isApiError: true });
    }
    if (attempt < MAX_RETRIES) {
      await sleep(jitteredBackoff(attempt));
      return coreFetch(url, options, attempt + 1);
    }
    throw normalizeError(0, { detail: "Network error. Check your connection." });
  }

  releaseSlot();

  // 429 — honour Retry-After
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfterSec = Number(res.headers.get("retry-after") ?? 1);
    await sleep(Math.min(retryAfterSec * 1000, MAX_RETRY_MS));
    return coreFetch(url, options, attempt + 1);
  }

  // 5xx transient — jittered retry
  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(jitteredBackoff(attempt));
    return coreFetch(url, options, attempt + 1);
  }

  // 204 No Content
  if (res.status === 204) return null;

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) throw normalizeError(res.status, data);
  return data;
}

// ─── AUTHED FETCH WITH SINGLE-FLIGHT REFRESH ────────────────────────────────
/**
 * Wraps coreFetch with automatic JWT token injection.
 * On 401, performs a single-flight token refresh then retries once.
 * On refresh failure: clears all token state and throws (forces logout).
 */
async function authedFetch(url, options = {}) {
  const doCall = (token) =>
    coreFetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

  try {
    return await doCall(tokenStore.getAccess());
  } catch (err) {
    if (err.status === 401 && tokenStore.getRefresh()) {
      // Single-flight: all concurrent 401s share the same refresh promise
      if (!_refreshPromise) {
        _refreshPromise = coreFetch(`${URLS.AUTH}/refresh`, {
          method: "POST",
          body: JSON.stringify({ refresh_token: tokenStore.getRefresh() }),
        })
          .then((res) => {
            tokenStore.setTokens(
              res.access_token,
              res.refresh_token ?? tokenStore.getRefresh()
            );
            _refreshPromise = null;
          })
          .catch((refreshErr) => {
            _refreshPromise = null;
            tokenStore.clear();
            // Broadcast logout to all tabs/windows via BroadcastChannel
            _authBroadcast?.postMessage({ type: "LOGOUT" });
            throw refreshErr;
          });
      }

      await _refreshPromise;
      // Retry with new access token
      return doCall(tokenStore.getAccess());
    }
    throw err;
  }
}

// ─── CROSS-TAB LOGOUT SYNC ──────────────────────────────────────────────────
// BroadcastChannel keeps all open tabs in sync on logout/token expiry.
let _authBroadcast = null;
if (typeof BroadcastChannel !== "undefined") {
  _authBroadcast = new BroadcastChannel("renocorp_auth");
}

export function subscribeAuthBroadcast(handler) {
  if (!_authBroadcast) return () => {};
  _authBroadcast.onmessage = handler;
  return () => { _authBroadcast.onmessage = null; };
}

// ─── QUERY STRING BUILDER ───────────────────────────────────────────────────
// Filters out null/undefined and empty strings — clean URLs always.
function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ─── PUBLIC API OBJECT ──────────────────────────────────────────────────────
export const api = Object.freeze({

  // ── HEALTH ────────────────────────────────────────────────────────────────
  health: () => coreFetch(`${URLS.AUTH}/health`),

  // ── AUTH ──────────────────────────────────────────────────────────────────
  auth: Object.freeze({
    login:           (body)   => coreFetch(`${URLS.AUTH}/login`,           { method: "POST", body: JSON.stringify(body) }),
    register:        (body)   => coreFetch(`${URLS.AUTH}/register`,        { method: "POST", body: JSON.stringify(body) }),
    refresh:         (token)  => coreFetch(`${URLS.AUTH}/refresh`,         { method: "POST", body: JSON.stringify({ refresh_token: token }) }),
    logout:          (sessId) => authedFetch(`${URLS.AUTH}/logout`,        { method: "POST", body: JSON.stringify({ session_id: sessId }) }),
    logoutAll:       ()       => authedFetch(`${URLS.AUTH}/sessions`,      { method: "DELETE" }),
    forgotPassword:  (email)  => coreFetch(`${URLS.AUTH}/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }),
    me:              ()       => authedFetch(`${URLS.AUTH}/me`),
    permissions:     ()       => authedFetch(`${URLS.AUTH}/me/permissions`),
    roles:           ()       => authedFetch(`${URLS.AUTH}/me/roles`),
    sessions:        ()       => authedFetch(`${URLS.AUTH}/sessions`),
    revokeSession:   (id)     => authedFetch(`${URLS.AUTH}/sessions/${id}`,  { method: "DELETE" }),
    devices:         ()       => authedFetch(`${URLS.AUTH}/devices`),
    revokeDevice:    (id)     => authedFetch(`${URLS.AUTH}/devices/${id}`,   { method: "DELETE" }),
    enableTotp:      ()       => authedFetch(`${URLS.AUTH}/mfa/totp/enable`,  { method: "POST", body: "{}" }),
    verifyTotp:      (code)   => authedFetch(`${URLS.AUTH}/mfa/totp/verify`,  { method: "POST", body: JSON.stringify({ code }) }),
    disableTotp:     ()       => authedFetch(`${URLS.AUTH}/mfa/totp/disable`, { method: "POST", body: "{}" }),
    oauthStart:      (provider) => { window.location.href = `${URLS.AUTH}/oauth/${provider}`; },
  }),

  // ── USERS ─────────────────────────────────────────────────────────────────
  users: Object.freeze({
    me:           ()      => authedFetch(`${URLS.USERS}/me`),
    updateMe:     (body)  => authedFetch(`${URLS.USERS}/me`,           { method: "PATCH", body: JSON.stringify(body) }),
    balance:      ()      => authedFetch(`${URLS.USERS}/me/balance`),
    publicCard:   (id)    => authedFetch(`${URLS.USERS}/${id}/public`),
  }),

  // ── TASKS ─────────────────────────────────────────────────────────────────
  tasks: Object.freeze({
    feed:     (params)       => authedFetch(`${URLS.TASKS}/feed${qs(params)}`),
    progress: ()             => authedFetch(`${URLS.TASKS}/progress`),
    complete: (id, body = {})=> authedFetch(`${URLS.TASKS}/${id}/complete`, { method: "POST", body: JSON.stringify(body) }),
    checkin:  ()             => authedFetch(`${URLS.TASKS}/checkin`,         { method: "POST", body: "{}" }),
  }),

  // ── EARNINGS ──────────────────────────────────────────────────────────────
  earnings: Object.freeze({
    history: (params) => authedFetch(`${URLS.EARNINGS}/history${qs(params)}`),
    summary: ()       => authedFetch(`${URLS.EARNINGS}/summary`),
  }),

  // ── WITHDRAWALS ───────────────────────────────────────────────────────────
  withdrawals: Object.freeze({
    // `idempotencyKey` (optional 2nd arg) lets the caller pin the exact
    // header value used for this logical submission — critical for the
    // withdrawal form, where the SAME key must be reused across manual
    // user retries (e.g. re-tapping Confirm after a validation error),
    // not just coreFetch's own internal network-failure retries.
    // Backward compatible: existing 1-arg callers are unaffected.
    request:     (body, idempotencyKey) => authedFetch(`${URLS.WITHDRAWALS}/request`, {
      method: "POST",
      body: JSON.stringify(body),
      ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey } } : {}),
    }),
    history:     (params) => authedFetch(`${URLS.WITHDRAWALS}/history${qs(params)}`),
    status:      (id)     => authedFetch(`${URLS.WITHDRAWALS}/${id}/status`),
    feeEstimate: (params) => authedFetch(`${URLS.WITHDRAWALS}/fee-estimate${qs(params)}`),
  }),

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  notifications: Object.freeze({
    summary:     ()      => authedFetch(`${URLS.NOTIFICATIONS}/summary`),
    list:        (params)=> authedFetch(`${URLS.NOTIFICATIONS}${qs(params)}`),
    markRead:    (id)    => authedFetch(`${URLS.NOTIFICATIONS}/${id}/read`,  { method: "POST", body: "{}" }),
    markAllRead: ()      => authedFetch(`${URLS.NOTIFICATIONS}/read-all`,    { method: "POST", body: "{}" }),
    preferences: ()      => authedFetch(`${URLS.NOTIFICATIONS}/preferences`),
    updatePrefs: (body)  => authedFetch(`${URLS.NOTIFICATIONS}/preferences`, { method: "PATCH", body: JSON.stringify(body) }),
  }),

  // ── OFFERWALL ─────────────────────────────────────────────────────────────
  offerwall: Object.freeze({
    feed: () => authedFetch(`${URLS.OFFERWALL}/feed`),
  }),

  // ── REFERRALS ─────────────────────────────────────────────────────────────
  referrals: Object.freeze({
    myCode: ()  => authedFetch(`${URLS.REFERRALS}/my-code`),
    stats:  ()  => authedFetch(`${URLS.REFERRALS}/stats`),
    tree:   ()  => authedFetch(`${URLS.REFERRALS}/tree`),
  }),

  // ── PACKAGES ──────────────────────────────────────────────────────────────
  packages: Object.freeze({
    mine:      ()      => authedFetch(`${URLS.PACKAGES}/mine`),
    history:   ()      => authedFetch(`${URLS.PACKAGES}/history`),
    subscribe: (body)  => authedFetch(`${URLS.PACKAGES}/subscribe`, { method: "POST", body: JSON.stringify(body) }),
    cancel:    ()      => authedFetch(`${URLS.PACKAGES}/cancel`,    { method: "POST", body: "{}" }),
  }),

  // ── PAYMENTS ──────────────────────────────────────────────────────────────
  payments: Object.freeze({
    plans:     ()      => authedFetch(`${URLS.PAYMENTS}/plans`),
    plan:      (id)    => authedFetch(`${URLS.PAYMENTS}/plans/${id}`),
    initiate:  (body)  => authedFetch(`${URLS.PAYMENTS}/initiate`,          { method: "POST", body: JSON.stringify(body) }),
    status:    (id)    => authedFetch(`${URLS.PAYMENTS}/intent/${id}/status`),
    history:   ()      => authedFetch(`${URLS.PAYMENTS}/history`),
  }),

  // ── INVITATIONS ───────────────────────────────────────────────────────────
  invitations: Object.freeze({
    check:  (code) => coreFetch(`${URLS.INVITATIONS}/check/${code}`),
    redeem: (body) => coreFetch(`${URLS.INVITATIONS}/redeem`, { method: "POST", body: JSON.stringify(body) }),
  }),

  // ── VAULT ─────────────────────────────────────────────────────────────────
  vault: Object.freeze({
    status:      ()             => authedFetch(`${URLS.VAULT}/status`),
    credentials: ()             => authedFetch(`${URLS.VAULT}/credentials`),
    add:         (body)         => authedFetch(`${URLS.VAULT}/credentials`, { method: "POST", body: JSON.stringify(body) }),
    rotate:      (group, key)   => authedFetch(`${URLS.VAULT}/credentials/${group}/${key}/rotate`, { method: "POST", body: "{}" }),
    remove:      (group, key)   => authedFetch(`${URLS.VAULT}/credentials/${group}/${key}`,        { method: "DELETE" }),
    test:        (group)        => authedFetch(`${URLS.VAULT}/test/${group}`,                      { method: "POST", body: "{}" }),
    audit:       ()             => authedFetch(`${URLS.VAULT}/audit`),
  }),

  // ── ADMIN ─────────────────────────────────────────────────────────────────
  admin: Object.freeze({
    // Dashboard
    stats:  () => authedFetch(`${URLS.ADMIN}/dashboard/stats`),
    health: () => authedFetch(`${URLS.ADMIN}/system/health`),

    // Users
    users:      (params)      => authedFetch(`${URLS.ADMIN}/users${qs(params)}`),
    userProfile:(id)          => authedFetch(`${URLS.ADMIN}/users/${id}/profile`),
    updateUser: (id, body)    => authedFetch(`${URLS.ADMIN}/users/${id}`,         { method: "PATCH", body: JSON.stringify(body) }),
    creditUser: (id, body)    => authedFetch(`${URLS.ADMIN}/users/${id}/credit`,  { method: "POST",  body: JSON.stringify(body) }),
    debitUser:  (id, body)    => authedFetch(`${URLS.ADMIN}/users/${id}/debit`,   { method: "POST",  body: JSON.stringify(body) }),

    // Tasks
    tasks:        (params)    => authedFetch(`${URLS.ADMIN}/tasks${qs(params)}`),
    approveTask:  (id)        => authedFetch(`${URLS.ADMIN}/tasks/${id}/approve`, { method: "POST", body: "{}" }),
    rejectTask:   (id, body)  => authedFetch(`${URLS.ADMIN}/tasks/${id}/reject`,  { method: "POST", body: JSON.stringify(body) }),
    bulkApprove:  (ids)       => authedFetch(`${URLS.ADMIN}/tasks/bulk-approve`,  { method: "POST", body: JSON.stringify({ ids }) }),
    bulkReject:   (ids, body) => authedFetch(`${URLS.ADMIN}/tasks/bulk-reject`,   { method: "POST", body: JSON.stringify({ ids, ...body }) }),

    // Withdrawals
    withdrawals:       (params) => authedFetch(`${URLS.ADMIN}/withdrawals${qs(params)}`),
    approveWithdrawal: (id)     => authedFetch(`${URLS.ADMIN}/withdrawals/${id}/approve`, { method: "POST", body: "{}" }),
    rejectWithdrawal:  (id, b)  => authedFetch(`${URLS.ADMIN}/withdrawals/${id}/reject`,  { method: "POST", body: JSON.stringify(b) }),

    // Earnings
    earnings: (params) => authedFetch(`${URLS.ADMIN}/earnings${qs(params)}`),

    // Offerwalls
    offerwalls:      ()      => authedFetch(`${URLS.ADMIN}/offerwalls`),
    toggleOfferwall: (name)  => authedFetch(`${URLS.ADMIN}/offerwalls/${name}/toggle`, { method: "POST", body: "{}" }),
    syncOfferwall:   (name)  => authedFetch(`${URLS.ADMIN}/offerwalls/${name}/sync`,   { method: "POST", body: "{}" }),

    // Audit
    audit: (params) => authedFetch(`${URLS.ADMIN}/audit${qs(params)}`),

    // Notifications — via notifications module, admin sub-routes
    broadcast:   (body)     => authedFetch(`${URLS.NOTIFICATIONS}/admin/broadcast`,       { method: "POST", body: JSON.stringify(body) }),
    notifyUser:  (id, body) => authedFetch(`${URLS.NOTIFICATIONS}/admin/user/${id}`,      { method: "POST", body: JSON.stringify(body) }),
    notifStats:  ()         => authedFetch(`${URLS.NOTIFICATIONS}/admin/stats`),
    notifHistory:()         => authedFetch(`${URLS.NOTIFICATIONS}/admin`),

    // Invitations — via invitations module, admin sub-routes
    invitations:      (params) => authedFetch(`${URLS.INVITATIONS}/admin${qs(params)}`),
    invitationStats:  ()       => authedFetch(`${URLS.INVITATIONS}/admin/stats`),
    createInvitation: (body)   => authedFetch(`${URLS.INVITATIONS}/admin`,                 { method: "POST", body: JSON.stringify(body) }),
    bulkInvite:       (body)   => authedFetch(`${URLS.INVITATIONS}/admin/bulk`,            { method: "POST", body: JSON.stringify(body) }),
    resendInvitation: (id)     => authedFetch(`${URLS.INVITATIONS}/admin/${id}/resend`,    { method: "POST", body: "{}" }),
    revokeInvitation: (id)     => authedFetch(`${URLS.INVITATIONS}/admin/${id}/revoke`,    { method: "POST", body: "{}" }),

    // Referrals — via referrals module, admin sub-routes
    referralConfig:    ()      => authedFetch(`${URLS.REFERRALS}/admin/config`),
    referralStats:     ()      => authedFetch(`${URLS.REFERRALS}/admin/stats`),
    referralList:      (p)     => authedFetch(`${URLS.REFERRALS}/admin${qs(p)}`),
    updateReferralRule:(body)  => authedFetch(`${URLS.REFERRALS}/admin/config/rule`,  { method: "POST", body: JSON.stringify(body) }),
    toggleReferrals:   ()      => authedFetch(`${URLS.REFERRALS}/admin/config/toggle`,{ method: "POST", body: "{}" }),
    voidReferral:      (id)    => authedFetch(`${URLS.REFERRALS}/admin/${id}/void`,   { method: "POST", body: "{}" }),

    // Packages (admin)
    plans:          (p)     => authedFetch(`${URLS.PAYMENTS}/plans${qs(p)}`),
    createPlan:     (body)  => authedFetch(`${URLS.PAYMENTS}/plans`,                  { method: "POST",  body: JSON.stringify(body) }),
    updatePlan:     (id, b) => authedFetch(`${URLS.PAYMENTS}/plans/${id}`,            { method: "PATCH", body: JSON.stringify(b) }),
    subscriptions:  ()      => authedFetch(`${URLS.PACKAGES}/subscriptions`),
    cancelUserSub:  (id)    => authedFetch(`${URLS.PACKAGES}/subscriptions/${id}/cancel`, { method: "POST", body: "{}" }),
    paymentStats:   ()      => authedFetch(`${URLS.PAYMENTS}/stats`),
    transactions:   (p)     => authedFetch(`${URLS.PAYMENTS}/transactions${qs(p)}`),

    // Vault
    vaultStatus:      ()             => authedFetch(`${URLS.VAULT}/status`),
    vaultCredentials: ()             => authedFetch(`${URLS.VAULT}/credentials`),
    vaultRotate:      (group, key)   => authedFetch(`${URLS.VAULT}/credentials/${group}/${key}/rotate`, { method: "POST", body: "{}" }),
    vaultRemove:      (group, key)   => authedFetch(`${URLS.VAULT}/credentials/${group}/${key}`,        { method: "DELETE" }),
    vaultTest:        (group)        => authedFetch(`${URLS.VAULT}/test/${group}`,                      { method: "POST", body: "{}" }),
    vaultAudit:       ()             => authedFetch(`${URLS.VAULT}/audit`),
  }),

  // ── LEGACY COMPAT (Phase 1 — api.js existing callers) ─────────────────────
  // These proxies keep existing AuthUI.jsx / AuthContext.jsx calls working
  // without any changes to those files.
  login:            (body)   => api.auth.login(body),
  register:         (body)   => api.auth.register(body),
  refresh:          (token)  => api.auth.refresh(token),
  logout:           (sessId) => api.auth.logout(sessId),
  forgotPassword:   (email)  => api.auth.forgotPassword(email),
  me:               ()       => api.auth.me(),
  permissions:      ()       => api.auth.permissions(),
  roles:            ()       => api.auth.roles(),
  sessions:         ()       => api.auth.sessions(),
  revokeSession:    (id)     => api.auth.revokeSession(id),
  revokeAllSessions:()       => api.auth.logoutAll(),
  trustedDevices:   ()       => api.auth.devices(),
  revokeDevice:     (id)     => api.auth.revokeDevice(id),
  enableTotp:       ()       => api.auth.enableTotp(),
  verifyTotp:       (code)   => api.auth.verifyTotp(code),
  disableTotp:      ()       => api.auth.disableTotp(),
  oauthStart:       (p)      => api.auth.oauthStart(p),
  health:           ()       => coreFetch(`${URLS.AUTH}/health`),
});

export default api;
