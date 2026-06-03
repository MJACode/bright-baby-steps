import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useChildren } from "@/hooks/useChildren";
import { useCurrentRole } from "@/hooks/useCurrentRole";
import { usePreferences } from "@/hooks/usePreferences";
import { UserCircle, Home, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import CaregiverHome from "@/pages/CaregiverHome";
import { cn } from "@/lib/utils";
import { ActiveSessionBanner } from "@/components/ActiveSessionBanner";
import { AIChatWidget } from "@/components/AIChatWidget";

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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header — single row */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-lg border-b border-border safe-area-top">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Link to="/dashboard" aria-label="Home" className="shrink-0">
              <img src="/app-icon.png" alt="Grace Flare" className="w-7 h-7 rounded-md" />
            </Link>
            {!isOnboarding && <ChildSwitcher />}
          </div>
          {!isOnboarding && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
                <Link to="/dashboard" aria-label="Home">
                  <Home className="w-5 h-5" />
                </Link>
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

      {/* Main content */}
      <main className={cn("flex-1 px-4 py-5 max-w-lg mx-auto w-full", !isOnboarding && "pb-tab-bar")}>
        <Outlet />
      </main>

      {/* AI chat dialog — mounted headless at the layout level so the
          chatOpener subscription is live on every dashboard sub-route. The
          visible entry lives on the home Dashboard; in-page surfaces like
          SleepTriageCard hand off via the chatOpener bus. */}
      {!isOnboarding && (
        <AIChatWidget activeChildId={activeChild?.id} quickLogMode headless />
      )}

      {/* Bottom tabs */}
      {!isOnboarding && <BottomTabBar />}
    </div>
  );
}