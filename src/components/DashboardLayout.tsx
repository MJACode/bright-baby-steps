import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useChildren } from "@/hooks/useChildren";
import { usePreferences } from "@/hooks/usePreferences";
import { Footprints, UserCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { QuickLogFAB } from "@/components/QuickLogFAB";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  const { session, loading } = useAuth();
  const { children, isLoading: childrenLoading, isFetching: childrenFetching } = useChildren();
  const { prefs } = usePreferences();
  const location = useLocation();

  const isOnboarding = !childrenLoading && (!children || children.length === 0);

  if (loading || childrenLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Footprints className="w-10 h-10 text-primary animate-pulse" />
        <p className="text-muted-foreground font-medium">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (isOnboarding && location.pathname !== "/dashboard") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header — single row */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Footprints className="w-5 h-5 text-primary shrink-0" />
            {!isOnboarding && <ChildSwitcher />}
          </div>
          {!isOnboarding && (
            <div className="flex items-center gap-1">
              {prefs.showNotifications && <NotificationBell />}
              <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
                <Link to="/dashboard/analytics" aria-label="Analytics">
                  <BarChart3 className="w-5 h-5" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
                <Link to="/dashboard/profile">
                  <UserCircle className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className={cn("flex-1 px-4 py-5 max-w-lg mx-auto w-full", !isOnboarding && "pb-tab-bar")}>
        <Outlet />
      </main>

      {/* Bottom tabs */}
      {!isOnboarding && <BottomTabBar />}

      {/* Quick log FAB — available on all pages */}
      {!isOnboarding && <QuickLogFAB />}
    </div>
  );
}