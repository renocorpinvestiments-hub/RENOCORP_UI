/**
 * App.jsx — RENOCORP UI Root
 * ===========================
 * Wires together:
 *   · AuthProvider  (shared context)
 *   · AuthUI        (auth surface — single file)
 *   · Dashboard     (placeholder slot — wire in when ready)
 *
 * Routing is handled purely by AuthContext state:
 *   loggedIn === false → <AuthUI />
 *   loggedIn === true  → <Dashboard /> (future)
 *
 * This file should NOT contain business logic.
 */

import { AuthProvider, useAuth } from "./AuthContext.jsx";
import AuthUI from "./AuthUI.jsx";

// ── Future: import Dashboard from "./dashboard/Dashboard.jsx";

function AppInner() {
  const auth = useAuth();

  if (!auth.loggedIn) {
    return <AuthUI />;
  }

  // Dashboard placeholder — swap for your Dashboard component when ready
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#080c10",
      color: "#e6edf3",
      fontFamily: "'Syne', sans-serif",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{
        width: 40, height: 40,
        background: "#4ade80",
        borderRadius: 10,
        display: "flex", alignItems: "center",
        justifyContent: "center",
        fontWeight: 800, fontSize: 18,
        color: "#080c10",
        boxShadow: "0 0 24px rgba(74,222,128,0.3)",
      }}>RC</div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          Logged in as {auth.user?.first_name || auth.user?.email || "user"}
        </div>
        <div style={{ fontSize: 13, color: "#7d8590", fontFamily: "'DM Mono', monospace" }}>
          Dashboard coming soon — auth complete ✓
        </div>
      </div>
      <button
        onClick={auth.logout}
        style={{
          marginTop: 8,
          padding: "9px 20px",
          background: "transparent",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 9,
          color: "#7d8590",
          fontFamily: "'Syne', sans-serif",
          fontSize: 13, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Sign out
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

