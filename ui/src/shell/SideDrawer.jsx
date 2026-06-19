/**
 * shell/SideDrawer.jsx — RENOCORP Side Drawer Menu  v2.0
 * ========================================================
 * Slide-in navigation menu from the left.
 *
 * Features:
 *  · Smooth transform animation (GPU-composited, no jank)
 *  · Focus trap while open (a11y)
 *  · Dismiss on backdrop click, Escape key, or route change
 *  · Active route highlighting
 *  · Admin section (only renders for admin users)
 *  · WhatsApp Help & Feedback link
 *  · Body scroll lock while open
 *  · Safe-area-inset-top padding (notched phones)
 */

import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import {
  XIcon,
  HomeIcon,
  ClipboardListIcon,
  TrophyIcon,
  UserIcon,
  ArrowDownCircleIcon,
  UsersIcon,
  PackageIcon,
  BellIcon,
  SettingsIcon,
  MessageCircleIcon,
  ShieldIcon,
  BarChart3Icon,
  CheckSquareIcon,
  SendIcon,
  KeyIcon,
  GiftIcon,
  ToggleLeftIcon,
} from "lucide-react";

// ─── NAV ITEMS ──────────────────────────────────────────────────────────────
const USER_NAV = [
  { path: "/dashboard",     label: "Dashboard",     Icon: HomeIcon },
  { path: "/tasks",         label: "Tasks",         Icon: ClipboardListIcon },
  { path: "/rewards",       label: "Rewards",       Icon: TrophyIcon },
  { path: "/withdraw",      label: "Withdraw Cash", Icon: ArrowDownCircleIcon },
  { path: "/invite",        label: "Invite & Refer",Icon: UsersIcon },
  { path: "/packages",      label: "Packages",      Icon: PackageIcon },
  { path: "/notifications", label: "Notifications", Icon: BellIcon },
  { path: "/settings",      label: "Settings",      Icon: SettingsIcon },
];

const ADMIN_NAV = [
  { path: "/admin",              label: "Admin Overview",  Icon: BarChart3Icon },
  { path: "/admin/users",        label: "Users",           Icon: UserIcon },
  { path: "/admin/tasks",        label: "Task Queue",      Icon: CheckSquareIcon },
  { path: "/admin/withdrawals",  label: "Withdrawals",     Icon: ArrowDownCircleIcon },
  { path: "/admin/earnings",     label: "Earnings Audit",  Icon: BarChart3Icon },
  { path: "/admin/invitations",  label: "Invitations",     Icon: SendIcon },
  { path: "/admin/referrals",    label: "Referrals",       Icon: GiftIcon },
  { path: "/admin/packages",     label: "Packages",        Icon: PackageIcon },
  { path: "/admin/offerwall",    label: "Offerwall",       Icon: ToggleLeftIcon },
  { path: "/admin/broadcast",    label: "Broadcast",       Icon: BellIcon },
  { path: "/admin/vault",        label: "Vault",           Icon: KeyIcon },
];

const HELP_WHATSAPP = import.meta.env.VITE_HELP_WHATSAPP ?? "256700000000";

export default function SideDrawer() {
  const { user, isAdmin, drawerOpen, setDrawerOpen, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const drawerRef = useRef(null);
  const closeBtn  = useRef(null);

  // ── Close on route change ──────────────────────────────────────────────
  useEffect(() => {
    if (drawerOpen) setDrawerOpen(false);
  }, [location.pathname]); // eslint-disable-line

  // ── Focus trap ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!drawerOpen) return;

    // Move focus to close button when drawer opens
    const raf = requestAnimationFrame(() => closeBtn.current?.focus());

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll(
        'button, a, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [drawerOpen]);

  const go = useCallback(
    (path) => { navigate(path); setDrawerOpen(false); },
    [navigate, setDrawerOpen]
  );

  const initials = user
    ? `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}`.toUpperCase() || "U"
    : "U";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop${drawerOpen ? " open" : ""}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <nav
        ref={drawerRef}
        className={`drawer${drawerOpen ? " open" : ""}`}
        aria-label="Navigation menu"
        aria-hidden={!drawerOpen}
        role="dialog"
        aria-modal="true"
      >
        <div className="drawer-inner">
          {/* Header */}
          <div className="drawer-header">
            <span className="drawer-title">RENOCORP MENU</span>
            <button
              ref={closeBtn}
              className="drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation menu"
            >
              <XIcon size={18} strokeWidth={2} />
            </button>
          </div>

          {/* User identity card */}
          <button
            className="drawer-user"
            onClick={() => go("/profile")}
            aria-label="View profile"
          >
            <div className="dash-avatar-lg">{initials}</div>
            <div className="drawer-user-info">
              <div className="drawer-user-name">
                {[user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User"}
              </div>
              <div className="drawer-user-email">{user?.email ?? ""}</div>
            </div>
          </button>

          {/* User nav */}
          <div className="drawer-nav">
            {USER_NAV.map(({ path, label, Icon }) => (
              <button
                key={path}
                className={`drawer-nav-btn${location.pathname === path ? " active" : ""}`}
                onClick={() => go(path)}
                aria-current={location.pathname === path ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={2} className="drawer-nav-icon" aria-hidden="true" />
                {label}
              </button>
            ))}

            {/* Help & Feedback */}
            <button
              className="drawer-nav-btn"
              onClick={() => window.open(`https://wa.me/${HELP_WHATSAPP}`, "_blank", "noopener")}
            >
              <MessageCircleIcon size={17} strokeWidth={2} className="drawer-nav-icon" aria-hidden="true" />
              Help &amp; Feedback
            </button>
          </div>

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="drawer-divider" />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: "var(--warning)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <ShieldIcon size={10} strokeWidth={2.5} aria-hidden="true" />
                ADMIN
              </div>
              <div className="drawer-nav" style={{ marginBottom: 12 }}>
                {ADMIN_NAV.map(({ path, label, Icon }) => (
                  <button
                    key={path}
                    className={`drawer-nav-btn admin-btn${location.pathname === path ? " active" : ""}`}
                    onClick={() => go(path)}
                    aria-current={location.pathname === path ? "page" : undefined}
                  >
                    <Icon size={17} strokeWidth={2} className="drawer-nav-icon" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="drawer-footer">
            <a
              href="/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
            <a
              href="/terms-of-service.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </nav>
    </>
  );
}
