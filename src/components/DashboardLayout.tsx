import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useChildren } from "@/hooks/useChildren";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { usePreferences } from "@/hooks/usePreferences";
import { UserCircle, Stethoscope, CalendarDays, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import CaregiverHome from "@/pages/CaregiverHome";
import { ActiveSessionBanner } from "@/components/ActiveSessionBanner";
import { VisitPrepCard } from "@/components/VisitPrepCard";
import { openVisitPrep } from "@/lib/visitPrepOpener";

// Secondary pages (no bottom-tab presence) get a back affordance to their
// parent surface. Navigates to the parent route — not history back — so deep
// links land somewhere sensible. Tab routes are intentionally absent.
const backTargets: Record<string, { to: string; label: string }> = {
  "/dashboard/new-baby": { to: "/dashboard/more", label: "More" },
  "/dashboard/medical": { to: "/dashboard/more", label: "More" },
  "/dashboard/financial": { to: "/dashboard/more", label: "More" },
  "/dashboard/early-intervention": { to: "/dashboard/more", label: "More" },
  "/dashboard/growth": { to: "/dashboard/more", label: "More" },
  "/dashboard/leaps": { to: "/dashboard/more", label: "More" },
  "/dashboard/find-slp": { to: "/dashboard/more", label: "More" },
  "/dashboard/cry-analyzer": { to: "/dashboard/more", label: "More" },
  "/dashboard/weekly": { to: "/dashboard/more", label: "More" },
  "/dashboard/analytics": { to: "/dashboard/more", label: "More" },
  "/dashboard/profile": { to: "/dashboard", label: "Home" },
  "/dashboard/calendar": { to: "/dashboard", label: "Home" },
};

export default function DashboardLayout() {
  const { session, loading } = useAuth();
  const { children, activeChild, isLoading: childrenLoading } = useChildren();
  const { prefs } = usePreferences();
  const location = useLocation();
  const role = useCurrentRole(activeChild?.id);

  const isOnboarding = !childrenLoading && (!children || children.length === 0);

  if (loading || childrenLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <img
          src="/app-icon.png"
          alt="Grace Flare"
          className="w-12 h-12 rounded-xl animate-pulse"
        />
        <p className="text-muted-foreground font-medium">Loading...</p>
      </div>
    );
  }

  if (!session) {
    // Stash the deep link (e.g. the OAuth consent screen) so Auth can return
    // the user here after login with all query params intact. localStorage (not
    // sessionStorage) so it survives a Capacitor WebView cold-start from a deep
    // link, matching the pending_invite pattern.
    try {
      localStorage.setItem("post_login_redirect", location.pathname + location.search);
    } catch {}
    return <Navigate to="/auth" replace />;
  }

  if (isOnboarding && location.pathname !== "/dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  // Caregiver-role partners get a purpose-built UI (no tabs, briefing, or analytics)
  if (!isOnboarding && role === "caregiver") {
    return <CaregiverHome />;
  }

  return (
    // Pin the app shell to the viewport and let <main> be the only scroll
    // container. The chrome (header + bottom tabs) are plain flex children, not
    // position:fixed/sticky — fixed/sticky descendants of an inner momentum-
    // scroll container jitter and mis-hit-test on iOS WKWebView, which made the
    // screen drift and the tab bar untappable. `fixed inset-0` sizes the shell
    // to the viewport without depending on a height chain up to #root.
    <div className="fixed inset-0 flex flex-col bg-background">
      {/* Top header — single row */}
      <header className="shrink-0 z-40 bg-card/90 backdrop-blur-lg border-b border-border safe-area-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Link to="/dashboard" aria-label="Home" className="shrink-0">
              <img src="/app-icon.png" alt="Grace Flare" className="w-7 h-7 rounded-md" />
            </Link>
            {!isOnboarding && <ChildSwitcher />}
          </div>
          {!isOnboarding && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="touch-target text-muted-foreground"
                aria-label="Visit prep"
                onClick={() => openVisitPrep()}
              >
                <Stethoscope className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
                <Link to="/dashboard/calendar" aria-label="Day view">
                  <CalendarDays className="w-5 h-5" />
                </Link>
              </Button>
              {prefs.showNotifications && <NotificationBell />}
              <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
                <Link to="/dashboard/profile">
                  <UserCircle className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      {!isOnboarding && <ActiveSessionBanner />}

      {/* Main content — the single scroll container. min-h-0 lets it shrink
          inside the flex column so it scrolls instead of pushing the tab bar
          off-screen; overscroll-contain keeps any bounce inside it. */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5 max-w-lg mx-auto w-full">
        {!isOnboarding && backTargets[location.pathname] && (
          <Link
            to={backTargets[location.pathname].to}
            aria-label={`Back to ${backTargets[location.pathname].label}`}
            className="inline-flex items-center gap-0.5 min-h-[48px] min-w-[48px] -mt-3 -ml-2 pl-1 pr-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            {backTargets[location.pathname].label}
          </Link>
        )}
        <Outlet />
      </main>

      {/* Visit Prep sheet — mounted at the layout level so the visitPrepOpener
          subscription is live on every dashboard sub-route. Opened by the
          header stethoscope button and NextStepFeed's checkup row. */}
      {!isOnboarding && <VisitPrepCard activeChild={activeChild} hideTrigger />}

      {/* Bottom tabs */}
      {!isOnboarding && <BottomTabBar />}
    </div>
  );
}