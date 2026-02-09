import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { HealthScoreIndicator } from '@/components/entities/HealthScoreIndicator';
import { 
  AlertTriangle, 
  ChevronRight,
  FileText,
  AlertCircle,
  ClipboardList,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, Branch } from '@/types';
import { 
  getBranchById, 
  getBranches,
  getUserById,
} from '@/lib/entityStorage';
import { getAssignmentsForUser } from '@/lib/userStorage';
import { useAudits, useCAPAs, useIncidents } from '@/hooks/useDashboardData';
import { getHealthScores } from '@/lib/healthScoreEngine';
import { formatDistanceToNow, format } from 'date-fns';

interface BranchManagerDashboardProps {
  user: User;
}

export function BranchManagerDashboard({ user }: BranchManagerDashboardProps) {
  const navigate = useNavigate();

  // Get user's assigned branch
  const branchData = useMemo(() => {
    // Check assignments
    const assignments = getAssignmentsForUser(user.id);
    const branchAssignment = assignments.find(a => a.assigned_type === 'branch');
    if (branchAssignment) {
      return getBranchById(branchAssignment.assigned_id);
    }
    
    // Also check if user is the manager of any branch
    const branches = getBranches();
    const managedBranch = branches.find(b => b.manager_id === user.id);
    return managedBranch;
  }, [user.id]);

  // Get health score components
  const healthScoreData = useMemo(() => {
    if (!branchData) return null;
    
    const healthScores = getHealthScores();
    const branchHealth = healthScores.find(
      h => h.entity_type === 'branch' && h.entity_id === branchData.id
    );
    
    return branchHealth?.components || null;
  }, [branchData]);

  const { data: audits = [] } = useAudits();
  const { data: capas = [] } = useCAPAs();
  const { data: incidents = [] } = useIncidents();

  // KPI calculations
  const kpiData = useMemo(() => {
    if (!branchData) return null;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Audits this month
    const auditsThisMonth = audits.filter(a => {
      const date = new Date(a.scheduled_date);
      return date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear &&
             a.entity_id === branchData.id;
    }).length;

    // Open CAPA
    const openCAPA = capas.filter(c =>
      ['open', 'in_progress'].includes(c.status) &&
      c.entity_id === branchData.id
    ).length;

    // Open Incidents
    const openIncidents = incidents.filter(i =>
      ['open', 'under_investigation'].includes(i.status) &&
      i.entity_id === branchData.id
    ).length;

    // Last audit score
    const approvedAudits = audits
      .filter(a => a.entity_id === branchData.id && a.status === 'approved')
      .sort((a, b) => new Date(b.completed_at || b.scheduled_date).getTime() - new Date(a.completed_at || a.scheduled_date).getTime());
    const lastAuditScore = approvedAudits[0]?.score ?? null;

    return {
      auditsThisMonth,
      openCAPA,
      openIncidents,
      lastAuditScore,
    };
  }, [branchData, audits, capas, incidents]);

  // Recent audits for chart/list
  const auditHistory = useMemo(() => {
    if (!branchData) return [];
    
    const branchAudits = audits
      .filter(a => a.entity_id === branchData.id && a.status === 'approved' && a.score != null)
      .sort((a, b) => new Date(a.completed_at || a.scheduled_date).getTime() - new Date(b.completed_at || b.scheduled_date).getTime())
      .slice(-6);

    return branchAudits.map(audit => ({
      id: audit.id,
      date: format(new Date(audit.completed_at || audit.scheduled_date), 'MMM d'),
      score: audit.score!,
      passFail: audit.pass_fail,
    }));
  }, [branchData, audits]);

  // Recent audits table
  const recentAudits = useMemo(() => {
    if (!branchData) return [];
    
    const branchAudits = audits
      .filter(a => a.entity_id === branchData.id)
      .sort((a, b) => {
        const dateA = a.completed_at || a.scheduled_date;
        const dateB = b.completed_at || b.scheduled_date;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 10);

    return branchAudits.map(audit => {
      const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;
      return {
        ...audit,
        auditorName: auditor?.full_name || 'Unassigned',
        relativeDate: formatDistanceToNow(new Date(audit.completed_at || audit.scheduled_date), { addSuffix: true }),
      };
    });
  }, [branchData, audits]);

  // Open CAPA list
  const openCAPAList = useMemo(() => {
    if (!branchData) return [];
    
    const branchCapas = capas
      .filter(c => 
        c.entity_id === branchData.id &&
        ['open', 'in_progress', 'escalated', 'pending_verification'].includes(c.status)
      )
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 10);

    const today = new Date().toISOString().split('T')[0];

    return branchCapas.map(c => ({
      ...c,
      daysUntilDue: Math.ceil((new Date(c.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      isOverdue: c.due_date < today && !['closed', 'approved'].includes(c.status),
    }));
  }, [branchData, capas]);

  // Error state: No branch assigned
  if (!branchData) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Branch Assigned</h2>
          <p className="text-muted-foreground">
            No branch is assigned to your account. Contact your administrator to get access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Branch Header Card */}
      <Card className="bg-muted/30">
        <CardContent className="py-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold">{branchData.name}</h1>
              <p className="text-sm text-muted-foreground">{branchData.code}</p>
              {(branchData.city || branchData.address) && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{[branchData.address, branchData.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center">
              <HealthScoreIndicator
                score={branchData.health_score}
                entityType="branch"
                size="lg"
                showLabel
                showComponents
                components={healthScoreData}
                hasAudits={branchData.health_score > 0}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: KPI Cards */}
      {kpiData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold text-primary">
                {kpiData.auditsThisMonth}
              </p>
              <p className="text-xs text-muted-foreground">Audits This Month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.openCAPA > 0 ? "text-destructive" : "text-muted-foreground"
              )}>
                {kpiData.openCAPA}
              </p>
              <p className="text-xs text-muted-foreground">Open CAPA</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.openIncidents > 0 ? "text-warning" : "text-muted-foreground"
              )}>
                {kpiData.openIncidents}
              </p>
              <p className="text-xs text-muted-foreground">Open Incidents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              {kpiData.lastAuditScore != null ? (
                <HealthScoreIndicator 
                  score={kpiData.lastAuditScore} 
                  entityType="branch" 
                  size="sm"
                />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">—</span>
              )}
              <p className="text-xs text-muted-foreground mt-1">Last Audit Score</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 3: Audit History Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Audit History Chart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Audit History</CardTitle>
          </CardHeader>
          <CardContent>
            {auditHistory.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No audit history yet. Your first audit will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                {/* Simple bar chart */}
                <div className="flex items-end justify-between gap-2 h-40">
                  {auditHistory.map((audit, index) => {
                    const height = Math.max((audit.score / 100) * 140, 20);
                    const isPass = audit.score >= 70;
                    
                    return (
                      <div key={audit.id} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-xs font-medium">{audit.score}</span>
                        <div 
                          className={cn(
                            "w-full rounded-t-md transition-all",
                            isPass ? "bg-success" : "bg-destructive"
                          )}
                          style={{ height: `${height}px` }}
                        />
                        <span className="text-xs text-muted-foreground">{audit.date}</span>
                      </div>
                    );
                  })}
                </div>
                {/* Pass threshold line indicator */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex-1 h-px bg-destructive/50" />
                  <span>Pass threshold: 70</span>
                  <div className="flex-1 h-px bg-destructive/50" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div 
              className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate('/capa')}
            >
              <div className="flex items-center gap-3">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">View CAPA</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div 
              className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate('/incidents/create')}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Report Incident</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <div 
              className="flex items-center justify-between p-4 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => navigate('/audits')}
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">View Audit Results</span>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 4: Recent Audits + Open CAPA */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Audits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Audits</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudits.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No audits yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit</TableHead>
                    <TableHead>Auditor</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAudits.map(audit => (
                    <TableRow 
                      key={audit.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/audits/${audit.id}`)}
                    >
                      <TableCell className="font-medium">{audit.audit_code}</TableCell>
                      <TableCell>{audit.auditorName}</TableCell>
                      <TableCell>
                        {audit.status === 'approved' && audit.score != null ? (
                          <HealthScoreIndicator score={audit.score} entityType="branch" size="sm" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          audit.status === 'approved' ? 'default' :
                          audit.status === 'pending_verification' ? 'secondary' :
                          audit.status === 'overdue' ? 'destructive' : 'outline'
                        }>
                          {audit.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {audit.relativeDate}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Right: Open CAPA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Open CAPA</CardTitle>
          </CardHeader>
          <CardContent>
            {openCAPAList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-success font-medium">No open CAPA. Great work!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {openCAPAList.map(capa => (
                  <div
                    key={capa.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/capa/${capa.id}`)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{capa.capa_code}</span>
                        <Badge variant={
                          capa.priority === 'critical' ? 'destructive' :
                          capa.priority === 'high' ? 'default' :
                          capa.priority === 'medium' ? 'secondary' : 'outline'
                        }>
                          {capa.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {capa.description?.slice(0, 50) || 'No description'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-xs",
                          capa.isOverdue ? "text-destructive font-medium" : "text-muted-foreground"
                        )}>
                          Due: {format(new Date(capa.due_date), 'MMM d, yyyy')}
                        </span>
                        <Badge variant={
                          capa.status === 'open' ? 'outline' :
                          capa.status === 'in_progress' ? 'secondary' :
                          capa.status === 'escalated' ? 'destructive' : 'default'
                        } className="text-xs">
                          {capa.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 ml-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
