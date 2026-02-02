import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleBadge } from '@/components/RoleBadge';
import {
  KPIGrid,
  CriticalAlertsStrip,
  HealthScoreHeatmap,
  ActiveAuditFeed,
  CAPAOverview,
  IncidentSummary,
  AuditorWorkloadTable,
} from '@/components/dashboard/AuditManagerDashboard';
import { RegionalManagerDashboard } from '@/components/dashboard/RegionalManagerDashboard';
import { BranchManagerDashboard } from '@/components/dashboard/BranchManagerDashboard';
import { BCKManagerDashboard } from '@/components/dashboard/BCKManagerDashboard';
import {
  getKPIData,
  getCriticalAlerts,
  getHeatmapData,
  getActiveAuditFeed,
  getCAPAOverview,
  getIncidentSummary,
  getAuditorWorkload,
} from '@/lib/dashboardStats';

export default function Dashboard() {
  const { user } = useAuth();
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);

  if (!user) return null;

  // Role-based dashboard routing
  switch (user.role) {
    case 'super_admin':
    case 'audit_manager':
      return (
        <AuditManagerDashboardView 
          filterNeedsAttention={filterNeedsAttention} 
          setFilterNeedsAttention={setFilterNeedsAttention} 
        />
      );
    
    case 'regional_manager':
      return <RegionalManagerDashboard user={user} />;
    
    case 'branch_manager':
      return <BranchManagerDashboard user={user} />;
    
    case 'bck_manager':
      return <BCKManagerDashboard user={user} />;
    
    case 'auditor':
      // Auditors are redirected to their audit list
      return <Navigate to="/audits" replace />;
    
    case 'staff':
      // Staff are redirected to their task list (CAPA)
      return <Navigate to="/capa" replace />;
    
    default:
      // Fallback placeholder for any other roles
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome, {user.full_name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <span className="text-muted-foreground">Your role:</span>
              <RoleBadge role={user.role} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg text-muted-foreground">
                Dashboard content coming soon.
              </p>
            </CardContent>
          </Card>
        </div>
      );
  }
}

interface AuditManagerDashboardViewProps {
  filterNeedsAttention: boolean;
  setFilterNeedsAttention: (value: boolean) => void;
}

function AuditManagerDashboardView({ filterNeedsAttention, setFilterNeedsAttention }: AuditManagerDashboardViewProps) {
  // Memoize data fetching to avoid unnecessary recalculations
  const kpiData = useMemo(() => getKPIData(), []);
  const criticalAlerts = useMemo(() => getCriticalAlerts(), []);
  const heatmapData = useMemo(() => getHeatmapData(), []);
  const activeAudits = useMemo(() => getActiveAuditFeed(filterNeedsAttention), [filterNeedsAttention]);
  const capaOverview = useMemo(() => getCAPAOverview(), []);
  const incidentSummary = useMemo(() => getIncidentSummary(), []);
  const auditorWorkload = useMemo(() => getAuditorWorkload(), []);

  return (
    <div className="space-y-6">
      {/* Band 1: KPI Cards */}
      <KPIGrid data={kpiData} />

      {/* Band 2: Critical Alerts Strip */}
      <CriticalAlertsStrip alerts={criticalAlerts} />

      {/* Band 3: Heatmap + Active Audits */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <HealthScoreHeatmap regions={heatmapData} />
        </div>
        <div className="lg:col-span-2">
          <ActiveAuditFeed 
            audits={activeAudits} 
            filterNeedsAttention={filterNeedsAttention}
            onFilterChange={setFilterNeedsAttention}
          />
        </div>
      </div>

      {/* Band 4: CAPA + Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <CAPAOverview data={capaOverview} />
        </div>
        <div className="lg:col-span-2">
          <IncidentSummary data={incidentSummary} />
        </div>
      </div>

      {/* Band 5: Auditor Workload */}
      <AuditorWorkloadTable auditors={auditorWorkload} />
    </div>
  );
}
