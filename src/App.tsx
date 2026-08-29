import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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
import DiapersPage from "./pages/dashboard/DiapersPage";
import FeedingPage from "./pages/dashboard/FeedingPage";

import MilestonesPage from "./pages/dashboard/MilestonesPage";
import SignsPage from "./pages/dashboard/SignsPage";
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
                <Route path="diapers" element={<DiapersPage />} />
                <Route path="feeding" element={<FeedingPage />} />
                <Route path="allergens" element={<Navigate to="/dashboard/feeding" replace />} />
                <Route path="milestones" element={<MilestonesPage />} />
                <Route path="signs" element={<SignsPage />} />
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