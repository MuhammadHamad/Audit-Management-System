import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { checkAndRunBatchIfNeeded } from "@/lib/healthScoreEngine";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PageSkeleton } from "@/components/ui/table-skeleton";

// Eager-loaded pages (priority routes)
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AuditsPage from "@/pages/Audits";
import CAPAPage from "@/pages/CAPA";

// Lazy-loaded pages (lower priority)
const UsersPage = lazy(() => import("@/pages/Users"));
const BranchesPage = lazy(() => import("@/pages/Branches"));
const BCKsPage = lazy(() => import("@/pages/BCKs"));
const SuppliersPage = lazy(() => import("@/pages/Suppliers"));
const RegionsPage = lazy(() => import("@/pages/Regions"));
const TemplatesPage = lazy(() => import("@/pages/Templates"));
const TemplateBuilderPage = lazy(() => import("@/pages/TemplateBuilder"));
const AuditPlansPage = lazy(() => import("@/pages/AuditPlans"));
const AuditExecutionPage = lazy(() => import("@/pages/AuditExecution"));
const VerificationQueuePage = lazy(() => import("@/pages/VerificationQueue"));
const VerificationDetailPage = lazy(() => import("@/pages/VerificationDetail"));
const CAPADetailPage = lazy(() => import("@/pages/CAPADetail"));
const IncidentsPage = lazy(() => import("@/pages/Incidents"));
const IncidentCreatePage = lazy(() => import("@/pages/IncidentCreate"));
const IncidentDetailPage = lazy(() => import("@/pages/IncidentDetail"));
const AnalyticsPage = lazy(() => import("@/pages/Analytics"));
const ReportsPage = lazy(() => import("@/pages/Reports"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const ProfilePage = lazy(() => import("@/pages/Profile"));
const NotificationsPage = lazy(() => import("@/pages/Notifications"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 3 * 60 * 1000,          // Data stays fresh for 3 minutes (more aggressive)
      gcTime: 10 * 60 * 1000,            // Cache kept for 10 minutes
      refetchOnWindowFocus: true,        // Refetch when tab regains focus (with throttle)
      refetchOnReconnect: 'always',      // Refetch when network reconnects
      refetchOnMount: true,              // Refetch stale data on component mount
      retry: 1,                          // Retry failed requests once
      refetchInterval: false,            // No automatic polling (use manual invalidation)
    },
  },
});

// Component to run batch health score check on app load
function HealthScoreBatchCheck() {
  useEffect(() => {
    // Run silently in background on app load
    checkAndRunBatchIfNeeded();
  }, []);
  return null;
}

// Suspense fallback for lazy-loaded routes
function PageLoader() {
  return (
    <div className="animate-in fade-in duration-300">
      <PageSkeleton />
    </div>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
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
                  <Route path="/users" element={<Suspense fallback={<PageLoader />}><UsersPage /></Suspense>} />
                  <Route path="/branches" element={<Suspense fallback={<PageLoader />}><BranchesPage /></Suspense>} />
                  <Route path="/bcks" element={<Suspense fallback={<PageLoader />}><BCKsPage /></Suspense>} />
                  <Route path="/suppliers" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
                  <Route path="/regions" element={<Suspense fallback={<PageLoader />}><RegionsPage /></Suspense>} />
                  <Route path="/templates" element={<Suspense fallback={<PageLoader />}><TemplatesPage /></Suspense>} />
                  <Route path="/templates/create" element={<Suspense fallback={<PageLoader />}><TemplateBuilderPage /></Suspense>} />
                  <Route path="/templates/:id/edit" element={<Suspense fallback={<PageLoader />}><TemplateBuilderPage /></Suspense>} />
                  <Route path="/audit-plans" element={<Suspense fallback={<PageLoader />}><AuditPlansPage /></Suspense>} />
                  <Route path="/audits" element={<AuditsPage />} />
                  <Route path="/audits/pending-verification" element={<Suspense fallback={<PageLoader />}><VerificationQueuePage /></Suspense>} />
                  <Route path="/audits/:id" element={<Suspense fallback={<PageLoader />}><AuditExecutionPage /></Suspense>} />
                  <Route path="/audits/:id/verify" element={<Suspense fallback={<PageLoader />}><VerificationDetailPage /></Suspense>} />
                  <Route path="/capa" element={<CAPAPage />} />
                  <Route path="/capa/:id" element={<Suspense fallback={<PageLoader />}><CAPADetailPage /></Suspense>} />
                  <Route path="/incidents" element={<Suspense fallback={<PageLoader />}><IncidentsPage /></Suspense>} />
                  <Route path="/incidents/create" element={<Suspense fallback={<PageLoader />}><IncidentCreatePage /></Suspense>} />
                  <Route path="/incidents/:id" element={<Suspense fallback={<PageLoader />}><IncidentDetailPage /></Suspense>} />
                  <Route path="/analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense>} />
                  <Route path="/reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
                  <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                  <Route path="/profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
                  <Route path="/notifications" element={<Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense>} />
                </Route>

                {/* Catch-all */}
                <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
