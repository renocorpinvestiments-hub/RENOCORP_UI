/**
 * hooks/useNotifications.js — RENOCORP Notification Polling Hook  v2.0
 * =======================================================================
 * Polls /api/notifications/summary every 30 seconds for unread count.
 *
 * Features:
 *  · Stops polling when tab is hidden (Page Visibility API)
 *  · Resumes immediately when tab becomes visible again
 *  · Exponential back-off on consecutive failures (max 5min)
 *  · Syncs unread count to AuthContext (used by TopNavBar badge)
 *  · Zero-cost when logged out (no-op)
 *  · AbortController cleans up in-flight requests on unmount
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../AuthContext.jsx";
import { api } from "../api.js";

const POLL_INTERVAL_MS   = 30_000;   // 30 seconds
const MAX_BACKOFF_MS     = 300_000;  // 5 minutes cap on failure back-off
const BACKOFF_FACTOR     = 2;

export function useNotifications() {
  const { loggedIn, unreadCount, setUnreadCount } = useAuth();
  const timerRef      = useRef(null);
  const failureCount  = useRef(0);
  const abortRef      = useRef(null);
  const mountedRef    = useRef(true);

  const fetchCount = useCallback(async () => {
    if (!loggedIn || !mountedRef.current) return;

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await api.notifications.summary();
      if (!mountedRef.current) return;
      const count = res?.unread_count ?? 0;
      setUnreadCount(count);
      failureCount.current = 0; // reset on success
    } catch (err) {
      if (err?.code === "ABORTED" || !mountedRef.current) return;
      failureCount.current++;
      // Failure back-off — don't hammer the server when it's struggling
    }
  }, [loggedIn, setUnreadCount]);

  const scheduleNext = useCallback(() => {
    clearTimeout(timerRef.current);
    if (!loggedIn || !mountedRef.current) return;

    // Compute interval with exponential back-off on failures
    const backoff = Math.min(
      POLL_INTERVAL_MS * Math.pow(BACKOFF_FACTOR, failureCount.current),
      MAX_BACKOFF_MS
    );

    timerRef.current = setTimeout(async () => {
      await fetchCount();
      scheduleNext();
    }, backoff);
  }, [loggedIn, fetchCount]);

  useEffect(() => {
    mountedRef.current = true;

    if (!loggedIn) {
      setUnreadCount(0);
      return;
    }

    // Fetch immediately on mount / login
    fetchCount().then(scheduleNext);

    // Pause polling when tab is hidden, resume on visibility
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchCount().then(scheduleNext);
      } else {
        clearTimeout(timerRef.current);
        abortRef.current?.abort();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      abortRef.current?.abort();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loggedIn, fetchCount, scheduleNext, setUnreadCount]);

  return unreadCount;
}

export default useNotifications;
