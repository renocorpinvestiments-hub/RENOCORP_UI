/**
 * shell/BottomNav.jsx — RENOCORP Mobile Bottom Navigation  v2.1
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
 *  · Accessible: nav landmark, aria-current="page" on the active link
 *
 * P2 FIX (RENOCORP_PRODUCTION_READINESS.md §5, "Accessibility"):
 * this previously used role="tablist"/role="tab"/aria-selected on
 * a set of <Link> elements that navigate to different routes (full
 * page changes in the app's information architecture, each with
 * its own URL/history entry). Per the WAI-ARIA Authoring Practices
 * (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), the tab pattern
 * is specifically for switching between panels of content WITHIN
 * one view, and screen readers announce it as such ("tab, 1 of 4")
 * — which sets an expectation of ArrowLeft/ArrowRight keyboard
 * behavior that page-navigation links don't (and shouldn't) have.
 * Labeling site navigation as a tablist is a known anti-pattern:
 * it tells assistive tech users this is a content switcher when
 * it's actually the primary navigation. Replaced with the correct
 * pattern for this use case — a `<nav>` landmark containing plain
 * links, with `aria-current="page"` marking the active one (the
 * same pattern already used correctly elsewhere in this codebase,
 * e.g. SideDrawer.jsx's nav buttons and PaginationBar.jsx).
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
    <nav className="bottom-nav" aria-label="Main navigation">
      {NAV_ITEMS.map(({ path, label, Icon }) => {
        const active = pathname === path || (path !== "/dashboard" && pathname.startsWith(path));
        return (
          <Link
            key={path}
            to={path}
            aria-current={active ? "page" : undefined}
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

