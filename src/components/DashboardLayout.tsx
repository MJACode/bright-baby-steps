import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BottomTabBar } from "@/components/BottomTabBar";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { Footprints, Home, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === "/dashboard";

  if (loading) {
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
          <Link to="/dashboard" className="flex items-center gap-2">
            <Footprints className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-lg">Baby Steps</span>
          </Link>
          <Button variant="ghost" size="icon" asChild className="touch-target text-muted-foreground">
            <Link to="/dashboard/profile">
              <UserCircle className="w-5 h-5" />
            </Link>
          </Button>
        </div>
        <div className="flex items-center h-10 px-4 max-w-lg mx-auto">
          <ChildSwitcher />
        </div>
      </header>

      {/* Main content */}
      <main className={cn("flex-1 px-4 py-5 max-w-lg mx-auto w-full pb-tab-bar")}>
        <Outlet />
      </main>

      {/* Bottom tabs */}
      <BottomTabBar />
    </div>
  );
}