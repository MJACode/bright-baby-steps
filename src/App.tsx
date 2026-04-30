import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AcceptInvite from "./pages/AcceptInvite";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import SleepPage from "./pages/dashboard/SleepPage";
import DiapersPage from "./pages/dashboard/DiapersPage";
import FeedingPage from "./pages/dashboard/FeedingPage";

import MilestonesPage from "./pages/dashboard/MilestonesPage";
import ProfilePage from "./pages/dashboard/ProfilePage";
import NotFound from "./pages/NotFound";
import WeeklyInsightsPage from "./pages/dashboard/WeeklyInsightsPage";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage";
import RecordsPage from "./pages/dashboard/RecordsPage";
import CryAnalyzerPage from "./pages/dashboard/CryAnalyzerPage";
import MorePage from "./pages/dashboard/MorePage";
import Upgrade from "@/pages/Upgrade";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import FAQPage from "./pages/FAQPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
              <Route path="financial" element={<Navigate to="/dashboard/milestones?tab=financial" replace />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="weekly" element={<WeeklyInsightsPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="records" element={<RecordsPage />} />
              <Route path="cry-analyzer" element={<CryAnalyzerPage />} />
              <Route path="more" element={<MorePage />} />
            </Route>
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/faq" element={<FAQPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;