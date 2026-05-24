/**
 * api.js — RENOCORP Shared API Client
 * =====================================
 * Shared across auth + dashboard + all future modules.
 *
 * Features:
 * - In-memory token store (never localStorage)
 * - Automatic JWT refresh with single-flight dedup
 * - Idempotency-key injection on mutating requests
 * - Per-route rate-limit awareness (429 back-off)
 * - Exponential retry for transient 5xx
 * - Request-ID correlation header
 * - Constant-time error normalization
 * - Compatible with RENOCORP backend: /api/auth/*
 */

// ─── CONFIG ────────────────────────────────────────────────
export const API_BASE = import.meta.env?.VITE_API_BASE ?? "http://localhost:8000/api/auth";
const MAX_RETRIES     = 3;
const RETRY_BASE_MS   = 150;
const IDEMPOTENT_METHODS = new Set(["POST", "PUT", "PATCH"]);

// ─── IN-MEMORY TOKEN STORE ──────────────────────────────────
// Never touches localStorage / sessionStorage.
// All state lives in module-scoped closures → survives React
// re-renders, dies on hard reload (correct security posture).
let _access  = null;
let _refresh = null;
let _session = null;           // full session object from login/me
let _refreshPromise = null;    // single-flight refresh dedup

export const tokenStore = {
  setTokens(access, refresh)  { _access = access; _refresh = refresh; },
  getAccess()                  { return _access; },
  getRefresh()                 { return _refresh; },
  setSession(s)                { _session = s; },
  getSession()                 { return _session; },
  clear()                      { _access = null; _refresh = null; _session = null; _refreshPromise = null; },
  hasTokens()                  { return !!_access; },
};

// ─── HELPERS ───────────────────────────────────────────────
function generateRequestId() {
  return `rc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateIdempotencyKey() {
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeError(status, data) {
  const msg = data?.detail || data?.error || data?.message || "Something went wrong";
  return { status, message: String(msg) };
}

// ─── CORE FETCH WITH RETRY ─────────────────────────────────
async function coreFetch(url, options = {}, attempt = 0) {
  const requestId = options.headers?.["x-request-id"] ?? generateRequestId();

  const headers = {
    "Content-Type": "application/json",
    "x-request-id": requestId,
    ...options.headers,
  };

  // Inject idempotency key on mutating requests (backend models accept it)
  if (IDEMPOTENT_METHODS.has(options.method ?? "GET") && !headers["idempotency-key"]) {
    headers["idempotency-key"] = generateIdempotencyKey();
  }

  let res;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (networkErr) {
    // Network failure — retry with backoff
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * 2 ** attempt);
      return coreFetch(url, options, attempt + 1);
    }
    throw { status: 0, message: "Network error. Check your connection." };
  }

  // 429 rate limit — back off and retry
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 1);
    await sleep(retryAfter * 1000);
    return coreFetch(url, options, attempt + 1);
  }

  // 5xx transient — retry
  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(RETRY_BASE_MS * 2 ** attempt);
    return coreFetch(url, options, attempt + 1);
  }

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── TOKEN-AWARE CALL WITH AUTO-REFRESH ────────────────────
async function authedFetch(url, options = {}) {
  const doCall = (token) =>
    coreFetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });

  try {
    return await doCall(tokenStore.getAccess());
  } catch (err) {
    // Access token expired → attempt refresh (single-flight)
    if (err.status === 401 && tokenStore.getRefresh()) {
      if (!_refreshPromise) {
        _refreshPromise = api.refresh(tokenStore.getRefresh())
          .then((res) => {
            tokenStore.setTokens(res.access_token, res.refresh_token ?? tokenStore.getRefresh());
            _refreshPromise = null;
          })
          .catch((e) => {
            _refreshPromise = null;
            tokenStore.clear();
            throw e;
          });
      }

      await _refreshPromise;
      return doCall(tokenStore.getAccess());
    }
    throw err;
  }
}

// ─── PUBLIC API ─────────────────────────────────────────────
export const api = {
  // — Auth flows —
  login:     (body)          => coreFetch(`${API_BASE}/login`,    { method: "POST", body: JSON.stringify(body) }),
  register:  (body)          => coreFetch(`${API_BASE}/register`, { method: "POST", body: JSON.stringify(body) }),
  refresh:   (refresh_token) => coreFetch(`${API_BASE}/refresh`,  { method: "POST", body: JSON.stringify({ refresh_token }) }),
  logout:    (session_id)    => authedFetch(`${API_BASE}/logout`, { method: "POST", body: JSON.stringify({ session_id }) }),
  forgotPassword: (email)    => coreFetch(`${API_BASE}/forgot-password`, { method: "POST", body: JSON.stringify({ email }) }),

  // — User —
  me:          ()            => authedFetch(`${API_BASE}/me`),
  permissions: ()            => authedFetch(`${API_BASE}/me/permissions`),
  roles:       ()            => authedFetch(`${API_BASE}/me/roles`),

  // — Sessions —
  sessions:       ()         => authedFetch(`${API_BASE}/sessions`),
  revokeSession:  (id)       => authedFetch(`${API_BASE}/sessions/${id}`, { method: "DELETE" }),
  revokeAllSessions: ()      => authedFetch(`${API_BASE}/sessions`, { method: "DELETE" }),

  // — MFA —
  enableTotp:  ()            => authedFetch(`${API_BASE}/mfa/totp/enable`,  { method: "POST" }),
  verifyTotp:  (code)        => authedFetch(`${API_BASE}/mfa/totp/verify`,  { method: "POST", body: JSON.stringify({ code }) }),
  disableTotp: ()            => authedFetch(`${API_BASE}/mfa/totp/disable`, { method: "POST" }),

  // — Trusted devices —
  trustedDevices: ()         => authedFetch(`${API_BASE}/devices`),
  revokeDevice:   (id)       => authedFetch(`${API_BASE}/devices/${id}`, { method: "DELETE" }),

  // — OAuth (redirect-based) —
  oauthStart: (provider)     => { window.location.href = `${API_BASE}/oauth/${provider}`; },

  // — Health —
  health: ()                 => coreFetch(`${API_BASE}/health`),
};

export default api;

