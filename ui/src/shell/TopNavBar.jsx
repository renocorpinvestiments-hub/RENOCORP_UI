/**
 * shell/TopNavBar.jsx — RENOCORP Top Navigation Bar  v2.0
 * =========================================================
 * Fixed header visible on every authenticated screen.
 *
 * Features:
 *  · Hamburger → opens SideDrawer
 *  · Logo mark + wordmark
 *  · Notification bell with live unread badge
 *  · User avatar chip (navigates to /profile)
 *  · Safe-area-inset-top padding (Capacitor / notched phones)
 *  · Glassmorphism background (blur + saturation)
 *  · Bell shake animation on new unread count
 */

import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import {
  MenuIcon,
  ShieldIcon,
} from "lucide-react";

export default function TopNavBar() {
  const { user, setDrawerOpen, isAdmin } = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const isAdminRoute = location.pathname.startsWith("/admin");
  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "U"
    : "U";
  const displayName = user?.first_name ?? "User";

  return (
    <header className="dash-nav" role="banner">
      {/* ── Left: hamburger + logo ── */}
      <div className="dash-nav-logo">
        <button
          className="dash-nav-hamburger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={false}
        >
          <MenuIcon size={20} strokeWidth={2} />
        </button>

        <button
          className="dash-nav-logo"
          onClick={() => navigate("/dashboard")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: 0 }}
          aria-label="Go to dashboard"
        >
          <div className="dash-nav-mark" aria-hidden="true">RC</div>
          <span className="dash-nav-wordmark">RENOCORP</span>
          {isAdmin && isAdminRoute && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "rgba(251,146,60,0.12)",
                border: "1px solid rgba(251,146,60,0.28)",
                borderRadius: 20,
                padding: "2px 8px",
                fontSize: 10,
                fontWeight: 700,
                color: "var(--warning)",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.5px",
              }}
            >
              <ShieldIcon size={10} strokeWidth={2.5} />
              ADMIN
            </span>
          )}
        </button>
      </div>

      {/* ── Right: bell + avatar ── */}
      <div className="dash-nav-right">
        {/* Notification bell — standalone, self-polling component */}
        <NotificationBell />

        {/* User chip */}
        <button
          className="dash-user-chip"
          onClick={() => navigate("/profile")}
          aria-label={`Profile — ${displayName}`}
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          <div className="dash-avatar" aria-hidden="true">
            {initials}
          </div>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 90,
            }}
          >
            {displayName}
          </span>
        </button>
      </div>
    </header>
  );
}
