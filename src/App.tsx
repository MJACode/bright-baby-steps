import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import { DeepLinkHandler } from "./components/DeepLinkHandler";
import { WatchBridge } from "./integrations/watch/WatchBridge";
import ErrorBoundary from "./components/ErrorBoundary";
import SleepPage from "./pages/dashboard/SleepPage";
import SleepHistoryPage from "./pages/dashboard/SleepHistoryPage";
import DiapersPage from "./pages/dashboard/DiapersPage";
import FeedingPage from "./pages/dashboard/FeedingPage";

import MilestonesPage from "./pages/dashboard/MilestonesPage";
import ChildContextPage from "./pages/dashboard/ChildContextPage";
import LeapsPage from "./pages/dashboard/LeapsPage";
import GrowthPage from "./pages/dashboard/GrowthPage";
import ProfilePage from "./pages/dashboard/ProfilePage";
import McpConsentPage from "./pages/McpConsentPage";
import NotFound from "./pages/NotFound";
import WeeklyInsightsPage from "./pages/dashboard/WeeklyInsightsPage";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage";
import RecordsPage, { RecordsRedirect } from "./pages/dashboard/RecordsPage";
import CalendarPage from "./pages/dashboard/CalendarPage";
import CryAnalyzerPage from "./pages/dashboard/CryAnalyzerPage";
import MorePage from "./pages/dashboard/MorePage";
import Upgrade from "@/pages/Upgrade";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import FAQPage from "./pages/FAQPage";
import VpcConfirmPage from "./pages/VpcConfirmPage";
import SubprocessorsPage from "./pages/SubprocessorsPage";
import RightsRequestPage from "./pages/RightsRequestPage";

const CHUNK_RELOAD_KEY = "gf-chunk-reload";

// After a deploy, an open tab's old chunk names 404; reload once to pick up the new build, then let ErrorBoundary show.
async function importWithReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    const mod = await load();
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      // Storage unavailable (private mode, quota): nothing to clear.
    }
    return mod;
  } catch (err) {
    let alreadyReloaded = true;
    try {
      alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      if (alreadyReloaded) sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      else sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    } catch {
      // Without storage there's no loop guard, so skip the reload and surface the error.
    }
    if (alreadyReloaded) throw err;
    window.location.reload();
    return new Promise<T>(() => {});
  }
}

// Lazy so the bundled sign illustrations load with this route, not the app shell.
const SignsPage = lazy(() => importWithReload(() => import("./pages/dashboard/SignsPage")));

const SignsPageFallback = () => (
  <div className="space-y-5" aria-busy="true">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-28 w-full rounded-xl" />
    <Skeleton className="h-5 w-64" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <DeepLinkHandler />
          <WatchBridge />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/invite/:code" element={<AcceptInvite />} />
              <Route path="/upgrade" element={<Upgrade />} />
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="sleep" element={<SleepPage />} />
                <Route path="sleep/history" element={<SleepHistoryPage />} />
                <Route path="diapers" element={<DiapersPage />} />
                <Route path="feeding" element={<FeedingPage />} />
                <Route path="allergens" element={<Navigate to="/dashboard/feeding" replace />} />
                <Route path="milestones" element={<MilestonesPage />} />
                <Route
                  path="signs"
                  element={
                    <Suspense fallback={<SignsPageFallback />}>
                      <SignsPage />
                    </Suspense>
                  }
                />
                <Route path="child-context" element={<ChildContextPage />} />
                <Route path="leaps" element={<LeapsPage />} />
                <Route path="growth" element={<GrowthPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="weekly" element={<WeeklyInsightsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                {/* The four record surfaces are top-level routes listed in More,
                    not tabs inside a single Records page. */}
                <Route path="new-baby" element={<RecordsPage section="newbaby" />} />
                <Route path="medical" element={<RecordsPage section="medical" />} />
                <Route path="financial" element={<RecordsPage section="financial" />} />
                <Route path="early-intervention" element={<RecordsPage section="ei" />} />
                <Route path="records" element={<RecordsRedirect />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="cry-analyzer" element={<CryAnalyzerPage />} />
                <Route path="more" element={<MorePage />} />
              </Route>
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/faq" element={<FAQPage />} />
              <Route path="/settings/connect-claude/consent" element={<McpConsentPage />} />
              <Route path="/subprocessors" element={<SubprocessorsPage />} />
              <Route path="/rights-request" element={<RightsRequestPage />} />
              <Route path="/vpc-confirm" element={<VpcConfirmPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
      </ThemeProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;