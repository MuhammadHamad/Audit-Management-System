import { useState, useEffect, useMemo } from 'react';
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

  // Check if user should see Audit Manager dashboard
  const isAuditManagerDashboard = user.role === 'super_admin' || user.role === 'audit_manager';

  if (isAuditManagerDashboard) {
    return <AuditManagerDashboardView filterNeedsAttention={filterNeedsAttention} setFilterNeedsAttention={setFilterNeedsAttention} />;
  }

  // Default placeholder for other roles (to be replaced in Prompt 12)
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
