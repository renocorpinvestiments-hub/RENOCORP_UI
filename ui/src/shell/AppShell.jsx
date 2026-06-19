/**
 * shell/AppShell.jsx — RENOCORP Authenticated Shell  v2.0
 * =========================================================
 * Post-login wrapper. Owns:
 *  · HashRouter (required for Capacitor Android)
 *  · All user + admin routes with lazy loading
 *  · Suspense boundary with branded loader
 *  · Capacitor back-button handling
 *  · Admin route guard (client-side, enforced by backend too)
 *
 * Performance:
 *  · Every screen is code-split via lazy()
 *  · Admin chunk is completely separate from user chunk
 *  · Shell components are eager (they're tiny)
 */

import { lazy, Suspense, useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import TopNavBar from "./TopNavBar.jsx";
import SideDrawer from "./SideDrawer.jsx";
import BottomNav from "./BottomNav.jsx";
import { Spinner } from "../components/Spinner.jsx";

// ─── USER SCREENS (lazy) ───────────────────────────────────────────────────
const Dashboard     = lazy(() => import("../dashboard/Dashboard.jsx"));
const Tasks         = lazy(() => import("../tasks/Tasks.jsx"));
const Rewards       = lazy(() => import("../rewards/Rewards.jsx"));
const Profile       = lazy(() => import("../profile/Profile.jsx"));
const Withdraw      = lazy(() => import("../withdraw/Withdraw.jsx"));
const Invite        = lazy(() => import("../invite/Invite.jsx"));
const Packages      = lazy(() => import("../packages/Packages.jsx"));
const Settings      = lazy(() => import("../settings/Settings.jsx"));
const Notifications = lazy(() => import("../notifications/Notifications.jsx"));

// ─── ADMIN SCREENS (separate chunk — only fetched for admins) ──────────────
const AdminDashboard    = lazy(() => import("../admin/AdminDashboard.jsx"));
const AdminUsers        = lazy(() => import("../admin/AdminUsers.jsx"));
const AdminTasks        = lazy(() => import("../admin/AdminTasks.jsx"));
const AdminWithdrawals  = lazy(() => import("../admin/AdminWithdrawals.jsx"));
const AdminEarnings     = lazy(() => import("../admin/AdminEarnings.jsx"));
const AdminOfferwall    = lazy(() => import("../admin/AdminOfferwall.jsx"));
const AdminPackages     = lazy(() => import("../admin/AdminPackages.jsx"));
const AdminInvitations  = lazy(() => import("../admin/AdminInvitations.jsx"));
const AdminReferrals    = lazy(() => import("../admin/AdminReferrals.jsx"));
const AdminBroadcast    = lazy(() => import("../admin/AdminBroadcast.jsx"));
const AdminVault        = lazy(() => import("../admin/AdminVault.jsx"));

// ─── ROUTE LOADING FALLBACK ────────────────────────────────────────────────
function ScreenLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "40dvh",
        padding: 40,
      }}
    >
      <Spinner />
    </div>
  );
}

// ─── SCROLL TO TOP ON ROUTE CHANGE ─────────────────────────────────────────
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);
  return null;
}

// ─── ADMIN GUARD ───────────────────────────────────────────────────────────
// Extra client-side safety layer. Backend always enforces role checks too.
function AdminRoute({ element }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return element;
}

// ─── CAPACITOR BACK BUTTON ─────────────────────────────────────────────────
function CapacitorBackHandler() {
  const { setDrawerOpen, drawerOpen } = useAuth();

  useEffect(() => {
    if (typeof window.Capacitor === "undefined") return;

    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("backButton", ({ canGoBack }) => {
          if (drawerOpen) {
            setDrawerOpen(false);
            return;
          }
          if (canGoBack) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });
      })
      .catch(() => {
        // Not in Capacitor environment — safe to ignore
      });
  }, [drawerOpen, setDrawerOpen]);

  return null;
}

// ─── INNER ROUTER ──────────────────────────────────────────────────────────
function ShellInner() {
  const { isAdmin } = useAuth();

  return (
    <>
      <ScrollReset />
      <CapacitorBackHandler />
      <TopNavBar />
      <SideDrawer />

      <main className="main-content">
        <Suspense fallback={<ScreenLoader />}>
          <Routes>
            {/* ── Default redirect ── */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* ── User routes ── */}
            <Route path="/dashboard"     element={<Dashboard />} />
            <Route path="/tasks"         element={<Tasks />} />
            <Route path="/rewards"       element={<Rewards />} />
            <Route path="/profile"       element={<Profile />} />
            <Route path="/withdraw"      element={<Withdraw />} />
            <Route path="/invite"        element={<Invite />} />
            <Route path="/packages"      element={<Packages />} />
            <Route path="/settings"      element={<Settings />} />
            <Route path="/notifications" element={<Notifications />} />

            {/* ── Admin routes ── */}
            <Route path="/admin"                element={<AdminRoute element={<AdminDashboard />} />} />
            <Route path="/admin/users"          element={<AdminRoute element={<AdminUsers />} />} />
            <Route path="/admin/tasks"          element={<AdminRoute element={<AdminTasks />} />} />
            <Route path="/admin/withdrawals"    element={<AdminRoute element={<AdminWithdrawals />} />} />
            <Route path="/admin/earnings"       element={<AdminRoute element={<AdminEarnings />} />} />
            <Route path="/admin/offerwall"      element={<AdminRoute element={<AdminOfferwall />} />} />
            <Route path="/admin/packages"       element={<AdminRoute element={<AdminPackages />} />} />
            <Route path="/admin/invitations"    element={<AdminRoute element={<AdminInvitations />} />} />
            <Route path="/admin/referrals"      element={<AdminRoute element={<AdminReferrals />} />} />
            <Route path="/admin/broadcast"      element={<AdminRoute element={<AdminBroadcast />} />} />
            <Route path="/admin/vault"          element={<AdminRoute element={<AdminVault />} />} />

            {/* ── 404 fallback ── */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </main>

      <BottomNav />
    </>
  );
}

// ─── APP SHELL ─────────────────────────────────────────────────────────────
export default function AppShell() {
  return (
    <HashRouter>
      <div className="rc-app">
        <ShellInner />
      </div>
    </HashRouter>
  );
}
