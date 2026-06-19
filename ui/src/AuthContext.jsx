/**
 * AuthContext.jsx — RENOCORP Auth Context  v2.0
 * ================================================
 * Single source of truth for auth state, session identity,
 * theme, drawer, unread count, and admin gate.
 *
 * Security model:
 *  · Zero persistence — all state is in-memory only
 *  · Tokens stored in module-scoped tokenStore (api.js)
 *  · Cross-tab logout sync via BroadcastChannel
 *  · isAdmin computed from user.roles — never trust a prop
 *  · Theme applied via data-theme attribute (no localStorage)
 *
 * Compatible with RENOCORP backend /api/auth/me response shape.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { tokenStore, api, subscribeAuthBroadcast } from "./api.js";

// ─── CONTEXT SHAPE ──────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// ─── THEME HELPERS ──────────────────────────────────────────────────────────
const VALID_THEMES = ["dark", "light"];

function applyTheme(theme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

// ─── PROVIDER ───────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  // ── Core auth state ─────────────────────────────────────────────────────
  const [loggedIn, setLoggedIn]   = useState(false);
  const [user,     setUser]       = useState(null);
  const [view,     setView]       = useState("auth"); // "auth" | "forgot"
  const [authLoading, setAuthLoading] = useState(false);

  // ── Shell UI state ───────────────────────────────────────────────────────
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [theme,        setThemeState]   = useState("dark");

  // ── Admin gate — computed from user, never from prop ────────────────────
  const isAdmin = useMemo(
    () =>
      Array.isArray(user?.roles)
        ? user.roles.includes("admin")
        : user?.is_admin === true,
    [user]
  );

  // ── Theme setter — in-memory only, applied to <html> data-theme ─────────
  const setTheme = useCallback((t) => {
    const validated = VALID_THEMES.includes(t) ? t : "dark";
    setThemeState(validated);
    applyTheme(validated);
  }, []);

  // Apply theme on mount
  useEffect(() => { applyTheme(theme); }, []); // eslint-disable-line

  // ── onLogin — called after successful login / register / OAuth ───────────
  const onLogin = useCallback((userData) => {
    setUser(userData);
    setLoggedIn(true);
    setView("auth");
  }, []);

  // ── logout — clears all state, token store, and notifies other tabs ──────
  const logout = useCallback(async (scope = "current") => {
    try {
      const sess = tokenStore.getSession();
      if (scope === "all") {
        await api.auth.logoutAll().catch(() => {});
      } else if (sess?.session_id) {
        await api.auth.logout(sess.session_id).catch(() => {});
      }
    } finally {
      _reset();
    }
  }, []);

  const _reset = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setLoggedIn(false);
    setView("auth");
    setUnreadCount(0);
    setDrawerOpen(false);
  }, []);

  // ── Cross-tab logout sync via BroadcastChannel ───────────────────────────
  useEffect(() => {
    const unsub = subscribeAuthBroadcast((event) => {
      if (event.data?.type === "LOGOUT") _reset();
    });
    return unsub;
  }, [_reset]);

  // ── User updater — lets child components patch user without full reload ───
  const updateUser = useCallback((patch) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  // ── Drawer close on escape key ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape" && drawerOpen) setDrawerOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  // ── Prevent body scroll when drawer open ─────────────────────────────────
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // ─── Context value ────────────────────────────────────────────────────────
  const ctx = useMemo(
    () => ({
      // Auth
      loggedIn,
      setLoggedIn,
      user,
      setUser,
      updateUser,
      view,
      setView,
      authLoading,
      setAuthLoading,
      isAdmin,
      onLogin,
      logout,

      // Shell UI
      drawerOpen,
      setDrawerOpen,
      unreadCount,
      setUnreadCount,
      theme,
      setTheme,
    }),
    [
      loggedIn, user, view, authLoading, isAdmin,
      drawerOpen, unreadCount, theme,
      onLogin, logout, updateUser, setTheme,
    ]
  );

  return (
    <AuthContext.Provider value={ctx}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
