/**
 * shell/BottomNav.jsx — RENOCORP Mobile Bottom Navigation  v2.0
 * ===============================================================
 * Fixed mobile tab bar — hidden on desktop (≥ 900px).
 *
 * Features:
 *  · 4 primary tabs: Home, Tasks, Rewards, Profile
 *  · Active route detection (exact path match)
 *  · Active indicator line at top of item
 *  · Safe-area-inset-bottom padding (iOS home bar)
 *  · Glassmorphism background (matches TopNavBar)
 *  · No tap flash (tap-highlight disabled)
 *  · Accessible: role="tablist", aria-selected, aria-label
 */

import { Link, useLocation } from "react-router-dom";
import {
  HomeIcon,
  ClipboardListIcon,
  TrophyIcon,
  UserIcon,
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Home",    Icon: HomeIcon },
  { path: "/tasks",     label: "Tasks",   Icon: ClipboardListIcon },
  { path: "/rewards",   label: "Rewards", Icon: TrophyIcon },
  { path: "/profile",   label: "Profile", Icon: UserIcon },
];

export default function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="bottom-nav"
      role="tablist"
      aria-label="Main navigation"
    >
      {NAV_ITEMS.map(({ path, label, Icon }) => {
        const active = pathname === path || (path !== "/dashboard" && pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
            role="tab"
            aria-selected={active}
            aria-label={label}
            className={`bottom-nav-item${active ? " active" : ""}`}
          >
            <span className="bottom-nav-icon" aria-hidden="true">
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 1.8}
              />
            </span>
            <span className="bottom-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
