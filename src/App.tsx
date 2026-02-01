import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

// Pages
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import UsersPage from "@/pages/Users";
import BranchesPage from "@/pages/Branches";
import BCKsPage from "@/pages/BCKs";
import SuppliersPage from "@/pages/Suppliers";
import RegionsPage from "@/pages/Regions";
import TemplatesPage from "@/pages/Templates";
import AuditPlansPage from "@/pages/AuditPlans";
import AuditsPage from "@/pages/Audits";
import CAPAPage from "@/pages/CAPA";
import IncidentsPage from "@/pages/Incidents";
import ReportsPage from "@/pages/Reports";
import SettingsPage from "@/pages/Settings";
import ProfilePage from "@/pages/Profile";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
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
              <Route path="/audit-plans" element={<AuditPlansPage />} />
              <Route path="/audits" element={<AuditsPage />} />
              <Route path="/capa" element={<CAPAPage />} />
              <Route path="/incidents" element={<IncidentsPage />} />
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
);

export default App;
