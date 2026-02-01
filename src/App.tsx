import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { checkAndRunBatchIfNeeded } from "@/lib/healthScoreEngine";
import { ThemeProvider } from "@/components/ThemeProvider";

// Pages
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import BranchesPage from "@/pages/Branches";
import BCKsPage from "@/pages/BCKs";
import SuppliersPage from "@/pages/Suppliers";
import RegionsPage from "@/pages/Regions";
import TemplatesPage from "@/pages/Templates";
import TemplateBuilderPage from "@/pages/TemplateBuilder";
import AuditPlansPage from "@/pages/AuditPlans";
import AuditsPage from "@/pages/Audits";
import AuditExecutionPage from "@/pages/AuditExecution";
import VerificationQueuePage from "@/pages/VerificationQueue";
import VerificationDetailPage from "@/pages/VerificationDetail";
import CAPAPage from "@/pages/CAPA";
import CAPADetailPage from "@/pages/CAPADetail";
import IncidentsPage from "@/pages/Incidents";
import IncidentCreatePage from "@/pages/IncidentCreate";
import IncidentDetailPage from "@/pages/IncidentDetail";
import ReportsPage from "@/pages/Reports";
import SettingsPage from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

// Component to run batch health score check on app load
function HealthScoreBatchCheck() {
  useEffect(() => {
    // Run silently in background on app load
    checkAndRunBatchIfNeeded();
  }, []);
  return null;
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <HealthScoreBatchCheck />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Root redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Protected routes with layout */}
              <Route
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/branches" element={<BranchesPage />} />
                <Route path="/bcks" element={<BCKsPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/regions" element={<RegionsPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/templates/create" element={<TemplateBuilderPage />} />
                <Route path="/templates/:id/edit" element={<TemplateBuilderPage />} />
                <Route path="/audit-plans" element={<AuditPlansPage />} />
                <Route path="/audits" element={<AuditsPage />} />
                <Route path="/audits/pending-verification" element={<VerificationQueuePage />} />
                <Route path="/audits/:id" element={<AuditExecutionPage />} />
                <Route path="/audits/:id/verify" element={<VerificationDetailPage />} />
                <Route path="/capa" element={<CAPAPage />} />
                <Route path="/capa/:id" element={<CAPADetailPage />} />
                <Route path="/incidents" element={<IncidentsPage />} />
                <Route path="/incidents/create" element={<IncidentCreatePage />} />
                <Route path="/incidents/:id" element={<IncidentDetailPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
