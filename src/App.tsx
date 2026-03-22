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
import FinancialPage from "./pages/dashboard/FinancialPage";
import ProfilePage from "./pages/dashboard/ProfilePage";
import NotFound from "./pages/NotFound";

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
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="sleep" element={<SleepPage />} />
              <Route path="diapers" element={<DiapersPage />} />
              <Route path="feeding" element={<FeedingPage />} />
              <Route path="allergens" element={<Navigate to="/dashboard/feeding" replace />} />
              <Route path="milestones" element={<MilestonesPage />} />
              <Route path="financial" element={<FinancialPage />} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;