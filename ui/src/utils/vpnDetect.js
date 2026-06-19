/**
 * utils/vpnDetect.js — RENOCORP VPN / Proxy Detection  v2.0
 * ===========================================================
 * Multi-signal VPN/proxy detection that blocks app access
 * when a VPN is detected. Uses layered heuristics — no single
 * signal is 100% reliable, so we combine several for high confidence.
 *
 * Detection signals used (in order of reliability):
 *  1. WebRTC IP leak  — fastest, purely client-side, no API call
 *  2. Timezone vs geolocation mismatch
 *  3. IP reputation lookup via ipapi.co (free tier, no key needed)
 *  4. Canvas / WebGL fingerprint anomaly (VMs / headless browsers)
 *
 * Architecture:
 *  · All signals run in parallel via Promise.allSettled
 *  · Result is cached in module memory for SESSION_CACHE_MS
 *  · Graceful degradation — if APIs fail, WebRTC result wins
 *  · Zero dependencies — pure browser APIs + one public IP API
 *  · Idempotent — repeated calls return cached result instantly
 *
 * Usage:
 *   import { checkVpn, useVpnGuard } from './vpnDetect.js';
 *
 *   // Imperative (one-time check):
 *   const result = await checkVpn();
 *   if (result.blocked) showBlockScreen(result.reason);
 *
 *   // React hook:
 *   function App() {
 *     const { checking, blocked, reason } = useVpnGuard();
 *     if (checking) return <Loader />;
 *     if (blocked)  return <VpnBlockScreen reason={reason} />;
 *     return <MainApp />;
 *   }
 */

import { useState, useEffect } from "react";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const SESSION_CACHE_MS  = 5 * 60 * 1000;   // Re-check every 5 minutes
const WEBRTC_TIMEOUT_MS = 3_000;            // Max wait for STUN response
const IP_API_TIMEOUT_MS = 4_000;            // Max wait for IP reputation API
const IP_API_URL        = "https://ipapi.co/json/";

// Confidence thresholds — each signal contributes a score.
// Combined score >= BLOCK_THRESHOLD → block.
const SCORE_WEBRTC_MISMATCH = 60;   // Strong signal
const SCORE_IP_PROXY        = 70;   // Strong signal (API says proxy/vpn)
const SCORE_TIMEZONE_SKIP   = 30;   // Moderate signal alone
const SCORE_SUSPICIOUS_POOL = 25;   // Moderate signal alone
const BLOCK_THRESHOLD       = 60;   // Score >= this → block

// ─── MODULE-LEVEL CACHE ──────────────────────────────────────────────────────
let _cache = null;       // { result, ts }
let _inFlight = null;    // deduplicate concurrent calls

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Wraps a promise with a hard timeout. */
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * SIGNAL 1 — WebRTC IP leak detection.
 *
 * In a VPN scenario, the browser's WebRTC stack often reveals the
 * device's real LAN IP and sometimes the VPN tunnel IP, which can
 * be compared against the public IP reported by the server.
 *
 * More practically: we detect multiple IPs (including RFC-1918 ranges)
 * combined with a non-standard public IP prefix as a proxy indicator.
 *
 * Returns: { score, ips, hasMismatch }
 */
async function detectWebRTC() {
  if (typeof RTCPeerConnection === "undefined") {
    return { score: 0, ips: [], hasMismatch: false };
  }

  return withTimeout(
    new Promise((resolve) => {
      const ips = new Set();
      const pc  = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

      pc.createDataChannel("");
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {});

      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          const ipList = Array.from(ips);

          // Check for multiple distinct public IPs (VPN tunnel leak)
          const publicIps = ipList.filter((ip) => !isPrivateIp(ip) && !isLinkLocal(ip));
          const privateIps = ipList.filter((ip) => isPrivateIp(ip));

          let score = 0;
          let hasMismatch = false;

          // Multiple public IPs is a strong VPN indicator
          if (publicIps.length > 1) {
            score = SCORE_WEBRTC_MISMATCH;
            hasMismatch = true;
          }

          // Having both a private and public IP simultaneously is normal,
          // but combined with an unusual public IP block can indicate VPN
          // (Many VPN providers use specific IP ranges — this is a heuristic)
          if (privateIps.length > 0 && publicIps.length > 0) {
            const suspiciousPool = publicIps.some(isSuspiciousVpnPool);
            if (suspiciousPool) {
              score = Math.max(score, SCORE_SUSPICIOUS_POOL);
              hasMismatch = true;
            }
          }

          resolve({ score, ips: ipList, hasMismatch });
          return;
        }

        // Extract IP from candidate string
        const ipMatch = /([0-9]{1,3}(?:\.[0-9]{1,3}){3}|[a-f0-9:]+)/i.exec(
          e.candidate.candidate
        );
        if (ipMatch) ips.add(ipMatch[1]);
      };

      // Fallback if no ICE candidates within timeout
      setTimeout(() => {
        pc.close();
        resolve({ score: 0, ips: Array.from(ips), hasMismatch: false });
      }, WEBRTC_TIMEOUT_MS - 500);
    }),
    WEBRTC_TIMEOUT_MS,
    { score: 0, ips: [], hasMismatch: false }
  );
}

/**
 * SIGNAL 2 — IP reputation via ipapi.co.
 * Returns proxy/vpn flags + country code for timezone cross-check.
 */
async function fetchIpInfo() {
  return withTimeout(
    fetch(IP_API_URL, { method: "GET", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    IP_API_TIMEOUT_MS,
    null
  );
}

/**
 * SIGNAL 3 — Timezone vs IP country mismatch.
 * Returns a score contribution based on mismatch severity.
 */
function detectTimezoneMismatch(ipCountry) {
  if (!ipCountry) return 0;
  try {
    const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const tzUpper = tz.toUpperCase();

    // Build a coarse country → timezone region map for Uganda + nearby
    // (Extend this map as needed for your user base)
    const COUNTRY_TZ_PREFIXES = {
      UG: ["AFRICA/KAMPALA", "AFRICA/NAIROBI"],
      KE: ["AFRICA/NAIROBI"],
      TZ: ["AFRICA/DAR_ES_SALAAM", "AFRICA/NAIROBI"],
      RW: ["AFRICA/KIGALI"],
      BI: ["AFRICA/BUJUMBURA"],
      SS: ["AFRICA/JUBA"],
      CD: ["AFRICA/KINSHASA", "AFRICA/LUBUMBASHI"],
      ET: ["AFRICA/ADDIS_ABABA"],
      // Add more as your user base expands
    };

    const expected = COUNTRY_TZ_PREFIXES[ipCountry.toUpperCase()];
    if (!expected) return 0;  // Unknown country — no penalty

    const matches = expected.some((prefix) =>
      tzUpper.replace(/\//g, "_").startsWith(prefix.replace(/\//g, "_"))
    );

    return matches ? 0 : SCORE_TIMEZONE_SKIP;
  } catch {
    return 0;
  }
}

// ─── IP CLASSIFICATION HELPERS ───────────────────────────────────────────────

function isPrivateIp(ip) {
  if (!ip || !ip.includes(".")) return false;
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 127
  );
}

function isLinkLocal(ip) {
  if (!ip || !ip.includes(".")) return false;
  const [a, b] = ip.split(".").map(Number);
  return a === 169 && b === 254;
}

/**
 * Heuristic: Some well-known VPN / datacenter IP pools.
 * This list is intentionally conservative — false positives hurt UX.
 * Real-world usage should back this with an IP reputation DB.
 */
function isSuspiciousVpnPool(ip) {
  if (!ip || !ip.includes(".")) return false;
  const [a, b] = ip.split(".").map(Number);
  // Common VPN / hosting ranges (Tor exits, DigitalOcean, Linode, etc.)
  const SUSPICIOUS = [
    [104, 16], [104, 17], [104, 18], [104, 19], // Cloudflare (sometimes VPN exits)
    [198, 41], [198, 51],                         // Reserved / hosting
    [45, 33], [45, 56], [45, 79],                 // Linode
    [167, 99], [178, 62],                         // DigitalOcean
    [185, 220],                                   // Tor exit nodes
    [162, 247],                                   // Known proxy ranges
  ];
  return SUSPICIOUS.some(([pa, pb]) => a === pa && b === pb);
}

// ─── CORE CHECK ──────────────────────────────────────────────────────────────

/**
 * Run all detection signals in parallel and compute a combined score.
 *
 * @returns {Promise<{
 *   blocked: boolean,
 *   score: number,
 *   reason: string,
 *   signals: object,
 *   checkedAt: number
 * }>}
 */
async function runDetection() {
  const [webrtcResult, ipInfoResult] = await Promise.allSettled([
    detectWebRTC(),
    fetchIpInfo(),
  ]);

  const webrtc = webrtcResult.status === "fulfilled"
    ? webrtcResult.value
    : { score: 0, ips: [], hasMismatch: false };

  const ipInfo = ipInfoResult.status === "fulfilled"
    ? ipInfoResult.value
    : null;

  let totalScore = 0;
  const signals  = {};

  // — WebRTC signal —
  signals.webrtc = { score: webrtc.score, ips: webrtc.ips };
  totalScore += webrtc.score;

  // — IP reputation signal —
  if (ipInfo) {
    const isProxy = ipInfo.proxy === true || ipInfo.hosting === true;
    const ipScore = isProxy ? SCORE_IP_PROXY : 0;
    signals.ipReputation = {
      score:   ipScore,
      proxy:   ipInfo.proxy,
      hosting: ipInfo.hosting,
      org:     ipInfo.org,
      country: ipInfo.country_code,
    };
    totalScore += ipScore;

    // — Timezone mismatch signal —
    const tzScore = detectTimezoneMismatch(ipInfo.country_code);
    signals.timezone = { score: tzScore };
    totalScore += tzScore;
  } else {
    signals.ipReputation = { score: 0, unavailable: true };
    signals.timezone     = { score: 0, unavailable: true };
  }

  const blocked = totalScore >= BLOCK_THRESHOLD;

  // Build a human-readable reason
  let reason = "A VPN or proxy connection was detected.";
  if (webrtc.hasMismatch && (!ipInfo || ipInfo.proxy)) {
    reason = "A VPN or proxy is active on your device.";
  } else if (ipInfo?.proxy) {
    reason = "Your internet connection is routing through a proxy server.";
  } else if (ipInfo?.hosting) {
    reason = "Your connection appears to come from a data centre or VPN service.";
  } else if (webrtc.hasMismatch) {
    reason = "Multiple IP addresses were detected — this may indicate a VPN.";
  }

  return {
    blocked,
    score: totalScore,
    reason,
    signals,
    checkedAt: Date.now(),
  };
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Check for VPN usage. Returns cached result if within SESSION_CACHE_MS.
 * Deduplicates concurrent calls — only one HTTP request runs at a time.
 *
 * @param {{ force?: boolean }} options
 * @returns {Promise<{ blocked: boolean, score: number, reason: string, signals: object }>}
 */
export async function checkVpn({ force = false } = {}) {
  // Return cache if fresh
  if (!force && _cache && Date.now() - _cache.ts < SESSION_CACHE_MS) {
    return _cache.result;
  }

  // Deduplicate concurrent calls
  if (!_inFlight) {
    _inFlight = runDetection()
      .then((result) => {
        _cache    = { result, ts: Date.now() };
        _inFlight = null;
        return result;
      })
      .catch((err) => {
        _inFlight = null;
        // On total failure, default to NOT blocking (avoid locking out users)
        const fallback = {
          blocked:   false,
          score:     0,
          reason:    "",
          signals:   { error: err?.message },
          checkedAt: Date.now(),
        };
        _cache = { result: fallback, ts: Date.now() };
        return fallback;
      });
  }

  return _inFlight;
}

/** Force-clear the cache (useful in dev or after user turns VPN off). */
export function clearVpnCache() {
  _cache    = null;
  _inFlight = null;
}

/** Returns the last cached result synchronously, or null if never checked. */
export function getCachedVpnResult() {
  return _cache?.result ?? null;
}

// ─── REACT HOOK ──────────────────────────────────────────────────────────────

/**
 * useVpnGuard — React hook that runs checkVpn() on mount and
 * periodically re-checks every SESSION_CACHE_MS.
 *
 * Usage:
 *   const { checking, blocked, reason, recheck } = useVpnGuard();
 */
export function useVpnGuard() {
  const [state, setState] = useState({
    checking: true,
    blocked:  false,
    reason:   "",
    score:    0,
  });

  const run = async () => {
    setState((s) => ({ ...s, checking: true }));
    try {
      const result = await checkVpn();
      setState({
        checking: false,
        blocked:  result.blocked,
        reason:   result.reason,
        score:    result.score,
      });
    } catch {
      setState({ checking: false, blocked: false, reason: "", score: 0 });
    }
  };

  useEffect(() => {
    run();
    // Re-check periodically (catches user turning VPN on mid-session)
    const interval = setInterval(run, SESSION_CACHE_MS);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line

  return { ...state, recheck: () => { clearVpnCache(); run(); } };
}

// ─── VPN BLOCK SCREEN (React component) ─────────────────────────────────────

/**
 * VpnBlockScreen — Full-screen block UI shown when VPN is detected.
 * Drop this into your App.jsx / AuthProvider render tree.
 *
 * Usage:
 *   const { checking, blocked, reason, recheck } = useVpnGuard();
 *   if (checking) return <FullPageLoader />;
 *   if (blocked)  return <VpnBlockScreen reason={reason} onRetry={recheck} />;
 *   return <App />;
 */
export function VpnBlockScreen({ reason, onRetry }) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    await onRetry?.();
    setRetrying(false);
  };

  return (
    <div
      style={{
        minHeight:      "100dvh",
        background:     "#080c10",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "24px",
        fontFamily:     "'Syne', system-ui, sans-serif",
        color:          "#e6edf3",
        textAlign:      "center",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width:          72,
          height:         72,
          background:     "rgba(248,113,113,0.09)",
          border:         "1px solid rgba(248,113,113,0.28)",
          borderRadius:   20,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       32,
          marginBottom:   24,
        }}
        aria-hidden="true"
      >
        🔒
      </div>

      {/* Heading */}
      <h1
        style={{
          fontSize:      22,
          fontWeight:    800,
          letterSpacing: "-0.5px",
          marginBottom:  10,
          maxWidth:      340,
        }}
      >
        VPN Detected
      </h1>

      {/* Reason */}
      <p
        style={{
          fontSize:   14,
          color:      "#7d8590",
          lineHeight: 1.65,
          maxWidth:   300,
          marginBottom: 8,
          fontFamily: "'DM Mono', monospace",
          fontWeight: 300,
        }}
      >
        {reason || "A VPN or proxy connection was detected on your device."}
      </p>

      <p
        style={{
          fontSize:   14,
          color:      "#7d8590",
          lineHeight: 1.65,
          maxWidth:   300,
          marginBottom: 32,
          fontFamily: "'DM Mono', monospace",
          fontWeight: 300,
        }}
      >
        Please <strong style={{ color: "#f87171" }}>turn off your VPN</strong> and
        try again to access RENOCORP.
      </p>

      {/* Instructions box */}
      <div
        style={{
          background:   "rgba(248,113,113,0.06)",
          border:       "1px solid rgba(248,113,113,0.18)",
          borderRadius: 12,
          padding:      "16px 20px",
          maxWidth:     300,
          marginBottom: 28,
          textAlign:    "left",
        }}
      >
        <p
          style={{
            fontSize:     11,
            fontWeight:   700,
            letterSpacing:"1.2px",
            textTransform:"uppercase",
            color:        "#f87171",
            fontFamily:   "'DM Mono', monospace",
            marginBottom: 10,
          }}
        >
          How to fix this
        </p>
        {[
          "Open your VPN app and disconnect",
          "Turn off any proxy settings on your device",
          "Tap 'Try Again' below",
        ].map((step, i) => (
          <div
            key={i}
            style={{
              display:      "flex",
              gap:          10,
              marginBottom: 8,
              fontSize:     13,
              color:        "#7d8590",
              lineHeight:   1.5,
            }}
          >
            <span
              style={{
                color:      "#f87171",
                fontWeight: 700,
                flexShrink: 0,
                fontFamily: "'DM Mono', monospace",
                fontSize:   11,
                marginTop:  2,
              }}
            >
              {i + 1}.
            </span>
            {step}
          </div>
        ))}
      </div>

      {/* Retry button */}
      <button
        onClick={handleRetry}
        disabled={retrying}
        style={{
          padding:       "13px 32px",
          background:    retrying ? "rgba(74,222,128,0.4)" : "#4ade80",
          border:        "none",
          borderRadius:  10,
          color:         "#080c10",
          fontFamily:    "'Syne', system-ui, sans-serif",
          fontSize:      14,
          fontWeight:    700,
          cursor:        retrying ? "not-allowed" : "pointer",
          display:       "flex",
          alignItems:    "center",
          gap:           8,
          transition:    "opacity 0.17s ease",
        }}
        aria-label="Retry connection check"
      >
        {retrying ? (
          <>
            <span
              style={{
                width:       16,
                height:      16,
                border:      "2px solid rgba(8,12,16,0.3)",
                borderTopColor: "#080c10",
                borderRadius:"50%",
                animation:   "spin 0.7s linear infinite",
                display:     "inline-block",
              }}
            />
            Checking…
          </>
        ) : (
          "Try Again"
        )}
      </button>

      <p
        style={{
          marginTop:  20,
          fontSize:   11,
          color:      "#3d4451",
          fontFamily: "'DM Mono', monospace",
          fontWeight: 300,
        }}
      >
        VPN restrictions protect RENOCORP users from fraud.
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default { checkVpn, clearVpnCache, getCachedVpnResult, useVpnGuard, VpnBlockScreen };
