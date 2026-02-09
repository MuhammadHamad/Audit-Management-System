import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAudits, useBranches, useBCKs, useSuppliers } from '@/hooks/useDashboardData';
import type { User } from '@/types';

function getEntityNameFromLists(
  entityType: 'branch' | 'bck' | 'supplier',
  entityId: string,
  branches: { id: string; name: string }[],
  bcks: { id: string; name: string }[],
  suppliers: { id: string; name: string }[]
): string {
  if (entityType === 'branch') {
    return branches.find(b => b.id === entityId)?.name ?? 'Unknown Branch';
  }
  if (entityType === 'bck') {
    return bcks.find(b => b.id === entityId)?.name ?? 'Unknown BCK';
  }
  return suppliers.find(s => s.id === entityId)?.name ?? 'Unknown Supplier';
}

const statusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'in_progress') return 'default';
  if (status === 'scheduled') return 'secondary';
  if (status === 'submitted' || status === 'pending_verification') return 'outline';
  if (status === 'rejected' || status === 'overdue') return 'destructive';
  return 'outline';
};

export function AuditorDashboard({ user }: { user: User }) {
  const { data: audits = [], isLoading: auditsLoading } = useAudits();
  const { data: branches = [] } = useBranches();
  const { data: bcks = [] } = useBCKs();
  const { data: suppliers = [] } = useSuppliers();

  const myAudits = useMemo(() => {
    return audits.filter(a => a.auditor_id === user.id);
  }, [audits, user.id]);

  const kpis = useMemo(() => {
    const assignedTotal = myAudits.length;
    const inProgress = myAudits.filter(a => a.status === 'in_progress').length;
    const submitted = myAudits.filter(a => a.status === 'submitted' || a.status === 'pending_verification').length;
    const approved = myAudits.filter(a => a.status === 'approved').length;
    const rejected = myAudits.filter(a => a.status === 'rejected').length;

    const scored = myAudits.filter(a => typeof a.score === 'number');
    const avgScore = scored.length > 0
      ? scored.reduce((sum, a) => sum + (a.score ?? 0), 0) / scored.length
      : 0;

    const decided = myAudits.filter(a => a.pass_fail === 'pass' || a.pass_fail === 'fail');
    const passRate = decided.length > 0
      ? Math.round((decided.filter(a => a.pass_fail === 'pass').length / decided.length) * 100)
      : 0;

    return { assignedTotal, inProgress, submitted, approved, rejected, avgScore, passRate };
  }, [myAudits]);

  const assignedAudits = useMemo(() => {
    const getSortDate = (a: any) => a.scheduled_date || a.created_at || '';
    return [...myAudits]
      .filter(a => a.status !== 'cancelled')
      .sort((a, b) => getSortDate(a).localeCompare(getSortDate(b)))
      .slice(0, 8);
  }, [myAudits]);

  const recentAudits = useMemo(() => {
    const getSortDate = (a: any) => a.completed_at || a.updated_at || a.created_at || '';
    return [...myAudits]
      .filter(a => ['submitted', 'pending_verification', 'approved', 'rejected', 'cancelled'].includes(a.status))
      .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
      .slice(0, 8);
  }, [myAudits]);

  if (auditsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auditor Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Loading your audits...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.assignedTotal}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Submitted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.submitted}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.approved}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Rejected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.rejected}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Score / Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.avgScore.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">Pass rate: {kpis.passRate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Assigned Audits</CardTitle>
          </CardHeader>
          <CardContent>
            {assignedAudits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No assigned audits.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedAudits.map(audit => {
                    const entityName = getEntityNameFromLists(
                      audit.entity_type,
                      audit.entity_id,
                      branches,
                      bcks,
                      suppliers
                    );

                    return (
                      <TableRow key={audit.id}>
                        <TableCell className="font-mono text-xs">{audit.audit_code}</TableCell>
                        <TableCell className="text-sm">{entityName}</TableCell>
                        <TableCell className="text-sm">{format(new Date(audit.scheduled_date), 'MMM d, yyyy')}</TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(audit.status)} className="text-[10px] uppercase">
                            {audit.status.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" className="bg-[#8B0000] hover:bg-[#8B0000]/90">
                            <Link to={`/audits/${audit.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <div className="mt-3 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to="/audits">View all audits</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent History</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No completed/submitted audits yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAudits.map(audit => (
                    <TableRow key={audit.id}>
                      <TableCell className="font-mono text-xs">{audit.audit_code}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(audit.status)} className="text-[10px] uppercase">
                          {audit.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {typeof audit.score === 'number' ? `${audit.score.toFixed(1)}%` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/audits/${audit.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
