/**
 * App.jsx — RENOCORP UI Root  v2.0
 * ==================================
 * Minimal root — mounts AuthProvider and delegates all
 * routing/rendering to AuthContext state.
 *
 * Separation of concerns:
 *  · AuthProvider  — manages auth + shell state
 *  · AuthUI        — handles unauthenticated surface
 *  · AppShell      — handles authenticated surface (routes, nav, drawer)
 *
 * This file contains zero business logic.
 */

import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import AuthUI from "./AuthUI.jsx";
import globalStyles from "./styles.js";

// AppShell is lazy-loaded — only parsed by the browser after login.
// This keeps the initial auth bundle lean.
const AppShell = lazy(() => import("./shell/AppShell.jsx"));

// ─── STYLE INJECTION ────────────────────────────────────────────────────────
// Inject once at the module level. Idempotent — checks before inserting.
if (typeof document !== "undefined") {
  const STYLE_ID = "rc-global-styles";
  if (!document.getElementById(STYLE_ID)) {
    const tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.textContent = globalStyles;
    document.head.insertBefore(tag, document.head.firstChild);
  }
}

// ─── SHELL LOADING FALLBACK ─────────────────────────────────────────────────
function ShellLoader() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#080c10",
      }}
    >
      {/* Minimal spinner — matches design system, no component import needed */}
      <div
        style={{
          width: 32,
          height: 32,
          border: "2.5px solid rgba(255,255,255,0.07)",
          borderTopColor: "#4ade80",
          borderRadius: "50%",
          animation: "rc-spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes rc-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── INNER (reads auth context) ─────────────────────────────────────────────
function AppInner() {
  const { loggedIn } = useAuth();

  if (!loggedIn) {
    return <AuthUI />;
  }

  return (
    <Suspense fallback={<ShellLoader />}>
      <AppShell />
    </Suspense>
  );
}

// ─── ROOT ───────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
