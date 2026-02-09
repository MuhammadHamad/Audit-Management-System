import { useMemo, useState } from 'react';
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
import { UserAvatar } from '@/components/users/UserAvatar';
import { 
  AlertCircle, 
  AlertTriangle, 
  CheckCircle2, 
  CheckSquare,
  ChevronRight,
  TrendingDown,
  Clock,
  Users,
  Building2,
  Factory
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, Region, Branch, BCK } from '@/types';
import { 
  getRegionById, 
  getBranches, 
  getBCKs, 
  getUserById,
  getUsers,
} from '@/lib/entityStorage';
import { getAssignmentsForUser } from '@/lib/userStorage';
import { useAudits, useCAPAs, useIncidents } from '@/hooks/useDashboardData';
import { formatDistanceToNow } from 'date-fns';

interface RegionalManagerDashboardProps {
  user: User;
}

export function RegionalManagerDashboard({ user }: RegionalManagerDashboardProps) {
  const navigate = useNavigate();
  const [entityFilter, setEntityFilter] = useState<'all' | 'branches' | 'bcks'>('all');

  // Get user's assigned region
  const regionData = useMemo(() => {
    const assignments = getAssignmentsForUser(user.id);
    const regionAssignment = assignments.find(a => a.assigned_type === 'region');
    if (!regionAssignment) return null;
    
    const region = getRegionById(regionAssignment.assigned_id);
    return region;
  }, [user.id]);

  // Get entities in this region
  const { branches, bcks, allEntities } = useMemo(() => {
    if (!regionData) return { branches: [], bcks: [], allEntities: [] };
    
    const regionBranches = getBranches()
      .filter(b => b.region_id === regionData.id && b.status !== 'inactive');
    const regionBcks = getBCKs()
      .filter(b => b.region_id === regionData.id && b.status !== 'inactive');
    
    const all = [
      ...regionBranches.map(b => ({ ...b, entityType: 'branch' as const })),
      ...regionBcks.map(b => ({ ...b, entityType: 'bck' as const })),
    ].sort((a, b) => a.health_score - b.health_score);
    
    return { branches: regionBranches, bcks: regionBcks, allEntities: all };
  }, [regionData]);

  // Filter entities based on toggle
  const filteredEntities = useMemo(() => {
    if (entityFilter === 'branches') return allEntities.filter(e => e.entityType === 'branch');
    if (entityFilter === 'bcks') return allEntities.filter(e => e.entityType === 'bck');
    return allEntities;
  }, [allEntities, entityFilter]);

  // Calculate average health score
  const averageHealthScore = useMemo(() => {
    if (allEntities.length === 0) return 0;
    const sum = allEntities.reduce((acc, e) => acc + e.health_score, 0);
    return Math.round(sum / allEntities.length);
  }, [allEntities]);

  // Fetch data using React Query
  const { data: audits = [] } = useAudits();
  const { data: capas = [] } = useCAPAs();
  const { data: incidents = [] } = useIncidents();

  // KPI calculations
  const kpiData = useMemo(() => {
    if (!regionData) return null;
    
    const entityIds = allEntities.map(e => e.id);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Entities needing attention (health_score < 70)
    const entitiesNeedingAttention = allEntities.filter(e => e.health_score < 70 && e.health_score > 0).length;

    // Pending verification for this region
    const pendingVerification = audits.filter(a => 
      a.status === 'pending_verification' &&
      entityIds.includes(a.entity_id)
    ).length;

    // Open CAPA for this region
    const openCAPA = capas.filter(c =>
      ['open', 'in_progress', 'escalated'].includes(c.status) &&
      entityIds.includes(c.entity_id)
    ).length;

    // Audits this month
    const auditsThisMonth = audits.filter(a => {
      const date = new Date(a.scheduled_date);
      return date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear &&
             entityIds.includes(a.entity_id);
    }).length;

    return {
      entitiesNeedingAttention,
      pendingVerification,
      openCAPA,
      auditsThisMonth,
    };
  }, [regionData, allEntities, audits, capas]);

  // Action items
  const actionItems = useMemo(() => {
    if (!regionData) return [];
    
    const entityIds = allEntities.map(e => e.id);
    const today = new Date().toISOString().split('T')[0];
    const items: Array<{
      id: string;
      type: 'audit' | 'capa' | 'incident' | 'health';
      priority: 'critical' | 'high' | 'medium';
      title: string;
      entityName: string;
      linkTo: string;
      actionLabel: string;
    }> = [];

    // Pending verification audits
    const pendingAudits = audits.filter(a => 
      a.status === 'pending_verification' &&
      entityIds.includes(a.entity_id)
    );
    for (const audit of pendingAudits) {
      const entity = allEntities.find(e => e.id === audit.entity_id);
      items.push({
        id: audit.id,
        type: 'audit',
        priority: 'high',
        title: `Audit pending verification — ${audit.audit_code}`,
        entityName: entity?.name || 'Unknown',
        linkTo: `/audits/${audit.id}/verify`,
        actionLabel: 'Review',
      });
    }

    // Overdue CAPA (3+ days)
    const overdueCapas = capas.filter(c => {
      if (!entityIds.includes(c.entity_id)) return false;
      if (['closed', 'approved'].includes(c.status)) return false;
      const dueDate = new Date(c.due_date);
      const daysPastDue = Math.floor((new Date().getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return daysPastDue >= 3;
    });
    for (const capa of overdueCapas) {
      const entity = allEntities.find(e => e.id === capa.entity_id);
      items.push({
        id: capa.id,
        type: 'capa',
        priority: 'high',
        title: `Overdue CAPA — ${capa.capa_code}`,
        entityName: entity?.name || 'Unknown',
        linkTo: `/capa/${capa.id}`,
        actionLabel: 'View CAPA',
      });
    }

    // Critical incidents
    const criticalIncidents = incidents.filter(i =>
      i.severity === 'critical' &&
      i.status === 'open' &&
      entityIds.includes(i.entity_id)
    );
    for (const incident of criticalIncidents) {
      const entity = allEntities.find(e => e.id === incident.entity_id);
      items.push({
        id: incident.id,
        type: 'incident',
        priority: 'critical',
        title: `Critical Incident — ${incident.incident_code}`,
        entityName: entity?.name || 'Unknown',
        linkTo: `/incidents/${incident.id}`,
        actionLabel: 'View Incident',
      });
    }

    // Low health scores
    const lowHealthEntities = allEntities.filter(e => e.health_score > 0 && e.health_score < 50);
    for (const entity of lowHealthEntities) {
      items.push({
        id: entity.id,
        type: 'health',
        priority: 'medium',
        title: `Critical health score — ${entity.code}`,
        entityName: entity.name,
        linkTo: '#',
        actionLabel: 'View Entity',
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2 };
    return items.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, 10);
  }, [regionData, allEntities, audits, capas, incidents]);

  // Recent audits
  const recentAudits = useMemo(() => {
    if (!regionData) return [];
    
    const entityIds = allEntities.map(e => e.id);
    const regionAudits = audits
      .filter(a => entityIds.includes(a.entity_id))
      .sort((a, b) => {
        const dateA = a.completed_at || a.scheduled_date;
        const dateB = b.completed_at || b.scheduled_date;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      })
      .slice(0, 10);

    return regionAudits.map(audit => {
      const entity = allEntities.find(e => e.id === audit.entity_id);
      const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;
      return {
        ...audit,
        entityName: entity?.name || 'Unknown',
        entityType: entity?.entityType || 'branch',
        auditorName: auditor?.full_name || 'Unassigned',
        relativeDate: formatDistanceToNow(new Date(audit.completed_at || audit.scheduled_date), { addSuffix: true }),
      };
    });
  }, [regionData, allEntities, audits]);

  // Open incidents
  const openIncidents = useMemo(() => {
    if (!regionData) return [];
    
    const entityIds = allEntities.map(e => e.id);
    const regionIncidents = incidents
      .filter(i =>
        entityIds.includes(i.entity_id) &&
        ['open', 'under_investigation'].includes(i.status)
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    return regionIncidents.map(incident => {
      const entity = allEntities.find(e => e.id === incident.entity_id);
      return {
        ...incident,
        entityName: entity?.name || 'Unknown',
        relativeDate: formatDistanceToNow(new Date(incident.created_at), { addSuffix: true }),
      };
    });
  }, [regionData, allEntities, incidents]);

  // Branch managers in this region
  const branchManagerTeam = useMemo(() => {
    if (!regionData) return [];
    
    const users = getUsers();
    const branchManagers = users.filter(u => u.role === 'branch_manager' && u.status === 'active');

    return branchManagers.map(manager => {
      // Find branches managed by this user in this region
      const managerBranches = branches.filter(b => b.manager_id === manager.id);
      if (managerBranches.length === 0) return null;
      
      const branch = managerBranches[0]; // Typically one branch per manager
      
      // Open CAPA for this branch
      const openCAPA = capas.filter(c =>
        ['open', 'in_progress', 'escalated'].includes(c.status) &&
        c.entity_id === branch.id
      ).length;

      // Last audit
      const lastAudit = audits
        .filter(a => a.entity_id === branch.id && a.status === 'approved')
        .sort((a, b) => new Date(b.completed_at || b.scheduled_date).getTime() - new Date(a.completed_at || a.scheduled_date).getTime())[0];

      return {
        manager,
        branch,
        openCAPA,
        lastAuditDate: lastAudit ? formatDistanceToNow(new Date(lastAudit.completed_at || lastAudit.scheduled_date), { addSuffix: true }) : 'None',
      };
    }).filter(Boolean).sort((a, b) => a!.branch.health_score - b!.branch.health_score) as Array<{
      manager: User;
      branch: Branch;
      openCAPA: number;
      lastAuditDate: string;
    }>;
  }, [regionData, branches, audits, capas]);

  // Error state: No region assigned
  if (!regionData) {
    return (
      <Card className="max-w-lg mx-auto mt-12">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">No Region Assigned</h2>
          <p className="text-muted-foreground">
            No region is assigned to your account. Contact your administrator to get access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Region Header Card */}
      <Card className="bg-muted/30">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{regionData.name}</h1>
              <p className="text-sm text-muted-foreground">{regionData.code}</p>
            </div>
            <div className="flex items-center gap-3">
              <UserAvatar name={user.full_name} role={user.role} avatarUrl={user.avatar_url} size="md" />
              <div>
                <p className="text-sm text-muted-foreground">Regional Manager</p>
                <p className="font-medium">{user.full_name}</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{branches.length}</span>
              <span className="text-sm text-muted-foreground">Branches</span>
            </div>
            <div className="flex items-center gap-2">
              <Factory className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{bcks.length}</span>
              <span className="text-sm text-muted-foreground">BCKs</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Avg Health Score:</span>
              <HealthScoreIndicator 
                score={averageHealthScore} 
                entityType="branch" 
                size="md" 
                showLabel 
                hasAudits={allEntities.some(e => e.health_score > 0)}
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
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.entitiesNeedingAttention > 0 ? "text-destructive" : "text-muted-foreground"
              )}>
                {kpiData.entitiesNeedingAttention}
              </p>
              <p className="text-xs text-muted-foreground">Entities Needing Attention</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className={cn(
                "text-2xl font-semibold",
                kpiData.pendingVerification > 0 ? "text-warning" : "text-muted-foreground"
              )}>
                {kpiData.pendingVerification}
              </p>
              <p className="text-xs text-muted-foreground">Pending Verification</p>
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
              <p className="text-2xl font-semibold text-primary">
                {kpiData.auditsThisMonth}
              </p>
              <p className="text-xs text-muted-foreground">Audits This Month</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section 3: Entity Health Grid + Action Center */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Entity Health Grid (60%) */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">My Entities</CardTitle>
                <div className="flex gap-1">
                  {(['all', 'branches', 'bcks'] as const).map(filter => (
                    <Button
                      key={filter}
                      variant={entityFilter === filter ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setEntityFilter(filter)}
                    >
                      {filter === 'all' ? 'All' : filter === 'branches' ? 'Branches' : 'BCKs'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredEntities.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No branches or BCKs in this region yet.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredEntities.map(entity => {
                    const entityAudits = audits.filter(a => a.entity_id === entity.id && a.status === 'approved');
                    const entityCapas = capas.filter(c => c.entity_id === entity.id && ['open', 'in_progress', 'escalated'].includes(c.status));
                    const entityIncidents = incidents.filter(i => i.entity_id === entity.id && ['open', 'under_investigation'].includes(i.status));
                    const last90DaysAudits = entityAudits.filter(a => {
                      const date = new Date(a.completed_at || a.scheduled_date);
                      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                      return date >= ninetyDaysAgo;
                    });

                    return (
                      <Card key={entity.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{entity.code}</span>
                          <Badge variant="outline" className="text-xs">
                            {entity.entityType === 'branch' ? 'Branch' : 'BCK'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3 line-clamp-1">{entity.name}</p>
                        <div className="flex justify-center mb-3">
                          <HealthScoreIndicator
                            score={entity.health_score}
                            entityType={entity.entityType}
                            size="md"
                            showLabel
                            hasAudits={entity.health_score > 0}
                          />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Audits: {last90DaysAudits.length}</span>
                          <span className={entityCapas.length > 0 ? 'text-destructive' : ''}>
                            CAPA: {entityCapas.length}
                          </span>
                          <span className={entityIncidents.length > 0 ? 'text-destructive' : ''}>
                            Incidents: {entityIncidents.length}
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Action Center (40%) */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Action Required</CardTitle>
            </CardHeader>
            <CardContent>
              {actionItems.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
                  <p className="text-muted-foreground">All clear. No immediate action required.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {actionItems.map(item => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border-l-4",
                        item.priority === 'critical' && "border-l-destructive bg-destructive/5",
                        item.priority === 'high' && "border-l-warning bg-warning/5",
                        item.priority === 'medium' && "border-l-muted-foreground bg-muted/50"
                      )}
                    >
                      {item.type === 'audit' && <CheckSquare className="h-5 w-5 text-muted-foreground shrink-0" />}
                      {item.type === 'capa' && <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0" />}
                      {item.type === 'incident' && <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0" />}
                      {item.type === 'health' && <TrendingDown className="h-5 w-5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.entityName}</p>
                      </div>
                      {item.linkTo !== '#' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(item.linkTo)}
                        >
                          {item.actionLabel}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section 4: Recent Audits + Open Incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Recent Audits */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Audits</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudits.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No audits for this region yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audit</TableHead>
                    <TableHead>Entity</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {audit.entityName}
                          <Badge variant="outline" className="text-xs">
                            {audit.entityType === 'branch' ? 'Branch' : 'BCK'}
                          </Badge>
                        </div>
                      </TableCell>
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
            {recentAudits.length === 10 && (
              <div className="mt-4 text-center">
                <Button variant="link" onClick={() => navigate('/audits')}>
                  View all audits →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Open Incidents */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Open Incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {openIncidents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No open incidents in this region.</p>
            ) : (
              <div className="space-y-3">
                {openIncidents.map(incident => (
                  <div
                    key={incident.id}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/incidents/${incident.id}`)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{incident.incident_code}</span>
                        <Badge variant={
                          incident.severity === 'critical' ? 'destructive' :
                          incident.severity === 'high' ? 'default' :
                          incident.severity === 'medium' ? 'secondary' : 'outline'
                        }>
                          {incident.severity}
                        </Badge>
                      </div>
                      <p className="text-sm truncate">{incident.title.slice(0, 40)}</p>
                      <p className="text-xs text-muted-foreground">{incident.entityName}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {incident.relativeDate}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {openIncidents.length === 8 && (
              <div className="mt-4 text-center">
                <Button variant="link" onClick={() => navigate('/incidents')}>
                  View all incidents →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 5: Branch Manager Team Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Branch Manager Team</CardTitle>
        </CardHeader>
        <CardContent>
          {branchManagerTeam.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No Branch Managers assigned in this region.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manager</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Health Score</TableHead>
                  <TableHead>Open CAPA</TableHead>
                  <TableHead>Last Audit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branchManagerTeam.map(({ manager, branch, openCAPA, lastAuditDate }) => (
                  <TableRow key={manager.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={manager.full_name} role={manager.role} avatarUrl={manager.avatar_url} size="sm" />
                        <span>{manager.full_name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{branch.name}</span>
                      <span className="text-muted-foreground ml-2 text-sm">{branch.code}</span>
                    </TableCell>
                    <TableCell>
                      <HealthScoreIndicator 
                        score={branch.health_score} 
                        entityType="branch" 
                        size="sm" 
                        hasAudits={branch.health_score > 0}
                      />
                    </TableCell>
                    <TableCell>
                      <span className={openCAPA > 0 ? 'text-destructive font-medium' : ''}>
                        {openCAPA}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {lastAuditDate}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
