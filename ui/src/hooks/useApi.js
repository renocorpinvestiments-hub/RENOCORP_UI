/**
 * hooks/useApi.js — RENOCORP Generic Data Fetcher Hook  v2.0
 * ============================================================
 * Declarative data fetching with loading, error, and reload states.
 *
 * Features:
 *  · AbortController — cancels in-flight requests on deps change / unmount
 *  · Stale-while-revalidate: keeps previous data visible during refetch
 *  · Stable reload() identity (won't cause re-render loops)
 *  · Dependency array like useEffect
 *  · isRefetching flag (separate from initial loading)
 *  · onSuccess / onError callbacks
 *
 * Usage:
 *   const { data, loading, error, reload } = useApi(() => api.users.balance(), []);
 */

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * @param {() => Promise<any>} fetcher  — function that returns a Promise
 * @param {any[]} deps                  — dependency array (like useEffect)
 * @param {{ onSuccess?, onError?, enabled? }} options
 */
export function useApi(fetcher, deps = [], options = {}) {
  const { onSuccess, onError, enabled = true } = options;

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(!!enabled);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error,        setError]        = useState(null);

  const abortRef    = useRef(null);
  const mountedRef  = useRef(true);
  const fetcherRef  = useRef(fetcher);
  const callCount   = useRef(0);

  // Keep fetcher reference fresh without adding it to deps
  fetcherRef.current = fetcher;

  const load = useCallback(
    async (isManualReload = false) => {
      if (!mountedRef.current) return;
      if (!enabled) return;

      // Cancel previous request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const callId = ++callCount.current;

      if (isManualReload && data !== null) {
        setIsRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetcherRef.current();

        // Discard if a newer call has been made
        if (!mountedRef.current || callId !== callCount.current) return;

        setData(result);
        setError(null);
        onSuccess?.(result);
      } catch (err) {
        if (!mountedRef.current || callId !== callCount.current) return;
        if (err?.code === "ABORTED") return;

        const msg = err?.message ?? "Something went wrong";
        setError(msg);
        onError?.(err);
      } finally {
        if (mountedRef.current && callId === callCount.current) {
          setLoading(false);
          setIsRefetching(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...deps, enabled]
  );

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  return { data, loading, isRefetching, error, reload };
}

export default useApi;
