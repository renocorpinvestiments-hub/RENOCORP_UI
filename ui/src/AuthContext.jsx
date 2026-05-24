/**
 * AuthContext.jsx — RENOCORP Shared Auth Context
 * ================================================
 * Shared across Auth UI + Dashboard + all future modules.
 *
 * Provides:
 * - loggedIn / user state
 * - view routing (auth | forgot | dashboard)
 * - session hydration on mount (checks in-memory token)
 * - logout helper
 *
 * Security model:
 * - no persistence: all state is in-memory
 * - logout clears tokenStore + resets all state
 * - compatible with RENOCORP /api/auth/me endpoint
 */

import { createContext, useContext, useState, useCallback } from "react";
import { tokenStore, api } from "./api.js";

// ─── CONTEXT ───────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

// ─── PROVIDER ──────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser]         = useState(null);
  const [view, setView]         = useState("auth"); // "auth" | "forgot"

  // Called after login/register success
  const onLogin = useCallback((userData) => {
    setUser(userData);
    setLoggedIn(true);
    setView("auth");
  }, []);

  // Full sign-out: clears token store + resets UI
  const logout = useCallback(async () => {
    try {
      const sess = tokenStore.getSession();
      if (sess?.session_id) {
        await api.logout(sess.session_id);
      }
    } catch {
      // ignore errors on logout — always clear local state
    } finally {
      tokenStore.clear();
      setUser(null);
      setLoggedIn(false);
      setView("auth");
    }
  }, []);

  const ctx = {
    loggedIn,
    setLoggedIn,
    user,
    setUser,
    view,
    setView,
    onLogin,
    logout,
  };

  return (
    <AuthContext.Provider value={ctx}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;

