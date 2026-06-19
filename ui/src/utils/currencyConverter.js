/**
 * utils/currencyConverter.js — RENOCORP Currency → UGX Converter  v2.0
 * =======================================================================
 * Converts USD and all major world currencies to Ugandan Shillings (UGX)
 * for display in the RENOCORP UI.
 *
 * Architecture:
 *  · Seeded with conservative hardcoded fallback rates (updated 2025)
 *  · Fetches live rates from exchangerate-api.com (free, no key for basic)
 *    or frankfurter.app (ECB data, free, no key needed) as fallback
 *  · In-memory cache with TTL (1 hour) — single fetch per session
 *  · All conversions idempotent and side-effect free
 *  · Zero external dependencies
 *  · Handles: USD, EUR, GBP, KES, TZS, RWF, BIF, ETB, CNY, INR,
 *             AED, SAR, ZAR, NGN, GHS, EGP, JPY, CAD, AUD, CHF + more
 *
 * Usage:
 *   import { toUGX, formatAsUGX, useCurrencyConverter } from './currencyConverter.js';
 *
 *   // Simple sync conversion (uses cached/fallback rates):
 *   const ugx = toUGX(50, 'USD');       // → 183750
 *   const str = formatAsUGX(50, 'USD'); // → "UGX 183,750"
 *
 *   // React hook with live rates:
 *   const { convert, formatUGX, ready } = useCurrencyConverter();
 *   const amount = convert(99.99, 'USD');
 */

import { useState, useEffect, useRef } from "react";

// ─── FALLBACK RATES (UGX per 1 unit of currency) ────────────────────────────
// Updated June 2025. Used when live fetch fails or hasn't completed yet.
// Keys are ISO 4217 currency codes (uppercase).
const FALLBACK_RATES_TO_UGX = Object.freeze({
  // ── East African ──
  UGX: 1,
  KES: 29.5,        // Kenyan Shilling
  TZS: 0.154,       // Tanzanian Shilling
  RWF: 2.71,        // Rwandan Franc
  BIF: 1.39,        // Burundian Franc
  ETB: 66.8,        // Ethiopian Birr
  SSP: 29.7,        // South Sudanese Pound
  CDF: 1.38,        // Congolese Franc

  // ── Major world currencies ──
  USD: 3_675,       // US Dollar
  EUR: 3_980,       // Euro
  GBP: 4_620,       // British Pound
  CHF: 4_100,       // Swiss Franc
  JPY: 24.5,        // Japanese Yen
  CAD: 2_685,       // Canadian Dollar
  AUD: 2_370,       // Australian Dollar
  NZD: 2_180,       // New Zealand Dollar
  SEK: 355,         // Swedish Krona
  NOK: 340,         // Norwegian Krone
  DKK: 535,         // Danish Krone

  // ── Asian ──
  CNY: 505,         // Chinese Yuan
  HKD: 470,         // Hong Kong Dollar
  SGD: 2_720,       // Singapore Dollar
  INR: 43.8,        // Indian Rupee
  PKR: 13.1,        // Pakistani Rupee
  BDT: 33.4,        // Bangladeshi Taka
  THB: 101,         // Thai Baht
  IDR: 0.225,       // Indonesian Rupiah
  MYR: 785,         // Malaysian Ringgit
  PHP: 63.5,        // Philippine Peso
  VND: 0.148,       // Vietnamese Dong
  KRW: 2.65,        // South Korean Won

  // ── Middle Eastern ──
  AED: 1_000,       // UAE Dirham
  SAR: 979,         // Saudi Riyal
  QAR: 1_009,       // Qatari Riyal
  KWD: 11_940,      // Kuwaiti Dinar
  BHD: 9_740,       // Bahraini Dinar
  OMR: 9_546,       // Omani Rial
  ILS: 985,         // Israeli Shekel
  TRY: 110,         // Turkish Lira

  // ── African ──
  ZAR: 198,         // South African Rand
  NGN: 2.45,        // Nigerian Naira
  GHS: 241,         // Ghanaian Cedi
  EGP: 73.5,        // Egyptian Pound
  MAD: 365,         // Moroccan Dirham
  DZD: 27.2,        // Algerian Dinar
  XOF: 6.07,        // West African CFA Franc
  XAF: 6.07,        // Central African CFA Franc
  ZMW: 140,         // Zambian Kwacha
  MWK: 2.13,        // Malawian Kwacha
  MZN: 57.4,        // Mozambican Metical
  AOA: 4.07,        // Angolan Kwanza

  // ── Americas ──
  BRL: 710,         // Brazilian Real
  MXN: 187,         // Mexican Peso
  ARS: 4.12,        // Argentine Peso
  CLP: 3.92,        // Chilean Peso
  COP: 0.895,       // Colombian Peso
  PEN: 975,         // Peruvian Sol

  // ── Crypto (approximate, highly volatile — use live rates) ──
  BTC: 240_000_000, // Bitcoin (approx $65k × 3675)
  ETH: 11_400_000,  // Ethereum (approx $3100 × 3675)
  USDT: 3_675,      // Tether (≈ USD)
  USDC: 3_675,      // USD Coin (≈ USD)
});

// ─── LIVE RATE SOURCES ───────────────────────────────────────────────────────
// We try each in order until one succeeds.
const RATE_SOURCES = [
  // Primary: frankfurter.app (ECB data, free, no auth)
  {
    name: "frankfurter",
    fetch: async () => {
      const res = await fetch(
        "https://api.frankfurter.app/latest?base=UGX",
        { signal: AbortSignal.timeout(5000), cache: "no-store" }
      );
      if (!res.ok) throw new Error("frankfurter failed");
      const data = await res.json();
      // data.rates = { USD: 0.000272, EUR: 0.000251, ... } (UGX as base)
      // Invert to get UGX per 1 unit of each currency
      const rates = { UGX: 1 };
      for (const [code, rate] of Object.entries(data.rates ?? {})) {
        if (rate && rate > 0) rates[code] = 1 / rate;
      }
      return rates;
    },
  },
  // Fallback: open.er-api.com (free tier, USD base)
  {
    name: "er-api",
    fetch: async () => {
      const res = await fetch(
        "https://open.er-api.com/v6/latest/UGX",
        { signal: AbortSignal.timeout(5000), cache: "no-store" }
      );
      if (!res.ok) throw new Error("er-api failed");
      const data = await res.json();
      if (data.result !== "success") throw new Error("er-api bad result");
      const rates = { UGX: 1 };
      for (const [code, rate] of Object.entries(data.rates ?? {})) {
        if (rate && rate > 0) rates[code] = 1 / rate;
      }
      return rates;
    },
  },
];

// ─── IN-MEMORY RATE CACHE ────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000;  // 1 hour

let _rateCache = null;    // { rates: {}, ts: number, source: string }
let _fetchPromise = null; // single-flight dedup

// ─── LIVE RATE FETCH ─────────────────────────────────────────────────────────

/**
 * Fetch live rates from external sources.
 * Returns merged rates (live data merged over fallback so all codes exist).
 * Deduplicates concurrent calls. Caches for 1 hour.
 *
 * @param {{ force?: boolean }} opts
 * @returns {Promise<Record<string, number>>}  UGX per 1 unit of currency
 */
export async function fetchLiveRates({ force = false } = {}) {
  // Return cache if fresh
  if (!force && _rateCache && Date.now() - _rateCache.ts < CACHE_TTL_MS) {
    return _rateCache.rates;
  }

  // Deduplicate concurrent calls
  if (!_fetchPromise) {
    _fetchPromise = (async () => {
      let liveRates = null;
      let sourceUsed = "fallback";

      for (const source of RATE_SOURCES) {
        try {
          liveRates = await source.fetch();
          sourceUsed = source.name;
          break;
        } catch {
          // Try next source
        }
      }

      // Merge: start with fallback (all codes present), overlay live rates
      const merged = {
        ...FALLBACK_RATES_TO_UGX,
        ...(liveRates ?? {}),
        UGX: 1, // Always 1
      };

      _rateCache    = { rates: merged, ts: Date.now(), source: sourceUsed };
      _fetchPromise = null;
      return merged;
    })().catch((err) => {
      _fetchPromise = null;
      // On total failure return fallback rates — never throw
      _rateCache = {
        rates:  { ...FALLBACK_RATES_TO_UGX },
        ts:     Date.now(),
        source: "fallback",
      };
      return _rateCache.rates;
    });
  }

  return _fetchPromise;
}

/** Force-clear the rate cache (useful in tests or dev). */
export function clearRateCache() {
  _rateCache    = null;
  _fetchPromise = null;
}

/** Get current cached rates synchronously (or fallback rates if no cache). */
export function getCurrentRates() {
  return _rateCache?.rates ?? { ...FALLBACK_RATES_TO_UGX };
}

/** Returns the data source used for the current cache ("frankfurter" | "er-api" | "fallback") */
export function getRateSource() {
  return _rateCache?.source ?? "fallback";
}

// ─── CONVERSION FUNCTIONS ────────────────────────────────────────────────────

/**
 * Convert an amount from any currency to UGX.
 * Uses cached rates synchronously — call fetchLiveRates() first for accuracy.
 *
 * @param {number} amount       - Amount in the source currency
 * @param {string} fromCurrency - ISO 4217 code (e.g. "USD", "EUR", "KES")
 * @param {object} rates        - Optional: pass live rates explicitly
 * @returns {number} UGX amount (integer, rounded)
 */
export function toUGX(amount, fromCurrency = "UGX", rates = null) {
  if (amount == null || isNaN(Number(amount))) return 0;
  const num = Number(amount);
  if (!isFinite(num)) return 0;

  const code = String(fromCurrency).toUpperCase().trim();
  if (code === "UGX") return Math.round(num);

  const rateMap = rates ?? getCurrentRates();
  const rate = rateMap[code];

  if (!rate || !isFinite(rate)) {
    // Unknown currency — log and return 0
    if (typeof console !== "undefined") {
      console.warn(`[currencyConverter] Unknown currency code: ${code}`);
    }
    return 0;
  }

  return Math.round(num * rate);
}

/**
 * Convert UGX to another currency.
 *
 * @param {number} ugxAmount    - Amount in UGX
 * @param {string} toCurrency   - Target ISO 4217 code
 * @param {object} rates        - Optional: pass live rates explicitly
 * @returns {number} Amount in target currency
 */
export function fromUGX(ugxAmount, toCurrency = "USD", rates = null) {
  if (ugxAmount == null || isNaN(Number(ugxAmount))) return 0;
  const num  = Number(ugxAmount);
  const code = String(toCurrency).toUpperCase().trim();
  if (code === "UGX") return Math.round(num);

  const rateMap = rates ?? getCurrentRates();
  const rate = rateMap[code];
  if (!rate || !isFinite(rate)) return 0;

  return num / rate;
}

/**
 * Format an amount from any currency as a UGX display string.
 * Uses cached rates synchronously.
 *
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {object} rates        - Optional: pass live rates explicitly
 * @returns {string} e.g. "UGX 183,750"
 */
export function formatAsUGX(amount, fromCurrency = "UGX", rates = null) {
  const ugx = toUGX(amount, fromCurrency, rates);
  if (!ugx && ugx !== 0) return "UGX —";
  return `UGX ${ugx.toLocaleString("en-UG")}`;
}

/**
 * Format a UGX amount as a readable string in another currency.
 *
 * @param {number} ugxAmount
 * @param {string} toCurrency
 * @param {number} decimals    - decimal places (default 2)
 * @returns {string} e.g. "$49.86" or "KES 6,417"
 */
export function formatFromUGX(ugxAmount, toCurrency = "USD", decimals = 2, rates = null) {
  const amount = fromUGX(ugxAmount, toCurrency, rates);
  const code   = String(toCurrency).toUpperCase();
  try {
    return new Intl.NumberFormat("en-UG", {
      style:    "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(decimals)}`;
  }
}

/**
 * Get a human-readable exchange rate label.
 * formatRateLabel("USD") → "1 USD = UGX 3,675"
 *
 * @param {string} currency
 * @param {object} rates
 * @returns {string}
 */
export function formatRateLabel(currency, rates = null) {
  const code    = String(currency).toUpperCase();
  const rateMap = rates ?? getCurrentRates();
  const rate    = rateMap[code];
  if (!rate) return `${code} rate unavailable`;
  return `1 ${code} = UGX ${Math.round(rate).toLocaleString("en-UG")}`;
}

/**
 * List all supported currency codes.
 * @returns {string[]}
 */
export function getSupportedCurrencies() {
  return Object.keys(FALLBACK_RATES_TO_UGX).sort();
}

/**
 * Check if a currency code is supported.
 * @param {string} code
 * @returns {boolean}
 */
export function isSupportedCurrency(code) {
  return String(code).toUpperCase() in FALLBACK_RATES_TO_UGX;
}

// ─── REACT HOOK ──────────────────────────────────────────────────────────────

/**
 * useCurrencyConverter — React hook that provides live-rate currency conversion.
 *
 * Fetches live rates on mount. Provides stable convert() and formatUGX()
 * functions that use live rates once available, fallback rates until then.
 *
 * Usage:
 *   const { convert, formatUGX, formatFrom, rates, ready, source } = useCurrencyConverter();
 *
 *   // Show $ amount as UGX:
 *   <span>{formatUGX(task.reward_usd, 'USD')}</span>
 *
 *   // Show UGX balance as USD:
 *   <span>{formatFrom(balance, 'USD')}</span>
 */
export function useCurrencyConverter() {
  const [rates,  setRates]  = useState(getCurrentRates);
  const [ready,  setReady]  = useState(!!_rateCache);
  const [source, setSource] = useState(_rateCache?.source ?? "fallback");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    fetchLiveRates().then((liveRates) => {
      if (!mountedRef.current) return;
      setRates(liveRates);
      setReady(true);
      setSource(getRateSource());
    });

    return () => { mountedRef.current = false; };
  }, []);

  return {
    rates,
    ready,
    source,

    /** Convert amount from any currency to UGX (integer) */
    convert: (amount, fromCurrency = "USD") => toUGX(amount, fromCurrency, rates),

    /** Format amount in foreign currency as "UGX X,XXX" display string */
    formatUGX: (amount, fromCurrency = "USD") => formatAsUGX(amount, fromCurrency, rates),

    /** Format UGX amount in another currency with symbol */
    formatFrom: (ugxAmount, toCurrency = "USD", decimals = 2) =>
      formatFromUGX(ugxAmount, toCurrency, decimals, rates),

    /** Get rate label e.g. "1 USD = UGX 3,675" */
    rateLabel: (currency) => formatRateLabel(currency, rates),

    /** Force re-fetch rates */
    refresh: () => {
      clearRateCache();
      fetchLiveRates().then((liveRates) => {
        if (!mountedRef.current) return;
        setRates(liveRates);
        setSource(getRateSource());
      });
    },
  };
}

export default {
  toUGX,
  fromUGX,
  formatAsUGX,
  formatFromUGX,
  formatRateLabel,
  fetchLiveRates,
  clearRateCache,
  getCurrentRates,
  getRateSource,
  getSupportedCurrencies,
  isSupportedCurrency,
  useCurrencyConverter,
};
