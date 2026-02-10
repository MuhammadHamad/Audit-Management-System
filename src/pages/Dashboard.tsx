import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleBadge } from '@/components/RoleBadge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  calculateKPIData,
  calculateCriticalAlerts,
  calculateHeatmapData,
  calculateActiveAuditFeed,
  calculateCAPAOverview,
  calculateIncidentSummary,
  calculateAuditorWorkload,
} from '@/lib/dashboardStatsSupabase';
import { useAudits, useCAPAs, useFindings, useIncidents, useBranches, useBCKs, useSuppliers, useRegions } from '@/hooks/useDashboardData';
import { getUsersByRole } from '@/lib/entityStorage';
import { getEntityName } from '@/lib/auditStorage';
import { AuditorDashboard } from '@/components/dashboard/AuditorDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  const [filterNeedsAttention, setFilterNeedsAttention] = useState(false);
  const [auditWindow, setAuditWindow] = useState<'30d' | '6m' | '1y'>('30d');

  if (!user) return null;

  // Role-based dashboard routing
  switch (user.role) {
    case 'super_admin':
    case 'audit_manager':
      return (
        <AuditManagerDashboardView 
          filterNeedsAttention={filterNeedsAttention} 
          setFilterNeedsAttention={setFilterNeedsAttention} 
          auditWindow={auditWindow}
          setAuditWindow={setAuditWindow}
        />
      );
    
    case 'regional_manager':
      return <RegionalManagerDashboard user={user} />;
    
    case 'branch_manager':
      return <BranchManagerDashboard user={user} />;
    
    case 'bck_manager':
      return <BCKManagerDashboard user={user} />;
    
    case 'auditor':
      return <AuditorDashboard user={user} />;
    
    case 'staff':
      return <StaffDashboardView />;
    
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
  auditWindow: '30d' | '6m' | '1y';
  setAuditWindow: (value: '30d' | '6m' | '1y') => void;
}

function AuditManagerDashboardView({
  filterNeedsAttention,
  setFilterNeedsAttention,
  auditWindow,
  setAuditWindow,
}: AuditManagerDashboardViewProps) {
  // Fetch data using React Query hooks
  const { data: audits = [] } = useAudits();
  const { data: capas = [] } = useCAPAs();
  const { data: findings = [] } = useFindings();
  const { data: incidents = [] } = useIncidents();
  const { data: branches = [] } = useBranches();
  const { data: bcks = [] } = useBCKs();
  const { data: suppliers = [] } = useSuppliers();
  const { data: regions = [] } = useRegions();

  const windowDays = useMemo(() => {
    switch (auditWindow) {
      case '6m':
        return 180;
      case '1y':
        return 365;
      case '30d':
      default:
        return 30;
    }
  }, [auditWindow]);

  const windowLabel = useMemo(() => {
    switch (auditWindow) {
      case '6m':
        return '6m';
      case '1y':
        return '1y';
      case '30d':
      default:
        return '30d';
    }
  }, [auditWindow]);

  // Calculate dashboard data from fetched entities
  const kpiData = useMemo(() => 
    calculateKPIData(audits, capas, findings, branches, bcks, suppliers, { passRateDays: windowDays }),
    [audits, capas, findings, branches, bcks, suppliers, windowDays]
  );

  const criticalAlerts = useMemo(() => 
    calculateCriticalAlerts(audits, findings, capas, incidents, suppliers, getEntityName),
    [audits, findings, capas, incidents, suppliers]
  );

  const heatmapData = useMemo(() => 
    calculateHeatmapData(regions, branches, bcks),
    [regions, branches, bcks]
  );

  const activeAudits = useMemo(() => 
    calculateActiveAuditFeed(audits, filterNeedsAttention, getEntityName),
    [audits, filterNeedsAttention]
  );

  const capaOverview = useMemo(() => 
    calculateCAPAOverview(capas, getEntityName),
    [capas]
  );

  const incidentSummary = useMemo(() => 
    calculateIncidentSummary(incidents, getEntityName),
    [incidents]
  );

  const auditorWorkload = useMemo(() => {
    const auditors = getUsersByRole('auditor');
    return calculateAuditorWorkload(audits, auditors, { completedWindowDays: windowDays });
  }, [audits, windowDays]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Select value={auditWindow} onValueChange={(v) => setAuditWindow(v as any)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Audit window" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="6m">Last 6 months</SelectItem>
            <SelectItem value="1y">Last 1 year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Band 1: KPI Cards */}
      <KPIGrid data={kpiData} passRateLabel={`Pass Rate (${windowLabel})`} />

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
      <AuditorWorkloadTable auditors={auditorWorkload} completedLabel={`Completed (${windowLabel})`} />
    </div>
  );
}

function StaffDashboardView() {
  const { user } = useAuth();

  if (!user) return null;

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
        <CardHeader>
          <CardTitle>Next actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="text-muted-foreground">
            Use the left menu to open your tasks and assigned CAPAs.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
