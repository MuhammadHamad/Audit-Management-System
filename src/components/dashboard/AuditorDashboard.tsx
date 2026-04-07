import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollBar } from '@/components/ui/scroll-area';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAudits, useBranches, useBCKs, useSuppliers } from '@/hooks/useDashboardData';
import { supabase } from '@/integrations/supabase/client';
import type { User } from '@/types';

function getEntityNameFromLists(
  entityType: 'branch' | 'bck' | 'supplier',
  entityId: string,
  branches: { id: string; name: string }[],
  bcks: { id: string; name: string }[],
  suppliers: { id: string; name: string }[]
): string {
  if (entityType === 'branch') {
    const found = branches.find(b => b.id === entityId);
    if (found) return found.name;
    // Fallback: if we only have one branch, show it
    if (branches.length === 1) return branches[0].name;
    return 'Unknown Branch';
  }
  if (entityType === 'bck') {
    return bcks.find(b => b.id === entityId)?.name ?? 'Unknown BCK';
  }
  return suppliers.find(s => s.id === entityId)?.name ?? 'Unknown Supplier';
}

const statusBadgeVariant = (
  status: string
): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' => {
  if (status === 'scheduled') return 'warning';
  if (status === 'in_progress') return 'info';
  if (status === 'approved') return 'success';
  if (status === 'submitted' || status === 'pending_verification') return 'outline';
  if (status === 'rejected' || status === 'overdue') return 'destructive';
  if (status === 'cancelled') return 'secondary';
  return 'outline';
};

export function AuditorDashboard({ user }: { user: User }) {
  const { data: audits = [], isLoading: auditsLoading } = useAudits();
  const { data: branches = [] } = useBranches();
  const { data: bcks = [] } = useBCKs();
  const { data: suppliers = [] } = useSuppliers();
  const [entityNameOverrides, setEntityNameOverrides] = useState<Record<string, string>>({});

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
      .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)));
  }, [myAudits]);

  const recentAudits = useMemo(() => {
    const getSortDate = (a: any) => a.completed_at || a.updated_at || a.created_at || '';
    return [...myAudits]
      .filter(a => ['submitted', 'pending_verification', 'approved', 'rejected', 'cancelled'].includes(a.status))
      .sort((a, b) => getSortDate(b).localeCompare(getSortDate(a)))
  }, [myAudits]);

  useEffect(() => {
    const unknowns = new Map<string, { entity_type: string; entity_id: string }>();

    const scan = (auditList: any[]) => {
      for (const a of auditList) {
        const key = `${a.entity_type}:${a.entity_id}`;
        if (entityNameOverrides[key]) continue;
        const name = getEntityNameFromLists(a.entity_type, a.entity_id, branches, bcks, suppliers);
        if (name.startsWith('Unknown')) unknowns.set(key, { entity_type: a.entity_type, entity_id: a.entity_id });
      }
    };

    scan(assignedAudits);
    scan(recentAudits);

    if (unknowns.size === 0) return;

    let cancelled = false;

    const fetchMissing = async () => {
      const byType = {
        branch: new Map<string, string[]>(),
        bck: new Map<string, string[]>(),
        supplier: new Map<string, string[]>(),
      } as const;

      for (const [key, { entity_type, entity_id }] of unknowns.entries()) {
        if (entity_type === 'branch') byType.branch.set(entity_id, [...(byType.branch.get(entity_id) ?? []), key]);
        if (entity_type === 'bck') byType.bck.set(entity_id, [...(byType.bck.get(entity_id) ?? []), key]);
        if (entity_type === 'supplier') byType.supplier.set(entity_id, [...(byType.supplier.get(entity_id) ?? []), key]);
      }

      const applyRows = (rows: Array<{ id: string; name: string }>, keysById: Map<string, string[]>) => {
        if (rows.length === 0) return;
        setEntityNameOverrides(prev => {
          const next = { ...prev };
          for (const r of rows) {
            const keys = keysById.get(r.id) ?? [];
            for (const k of keys) next[k] = r.name;
          }
          return next;
        });
      };

      try {
        if (cancelled) return;
        const ids = Array.from(byType.branch.keys());
        if (ids.length > 0) {
          const { data, error } = await supabase.from('branches').select('id,name').in('id', ids);
          if (error) {
            console.error('Failed to resolve branch names (likely RLS)', { ids, error });
          } else {
            applyRows((data ?? []) as any, byType.branch);
            if ((data ?? []).length === 0) console.warn('No branch rows returned for auditor entity lookup (likely RLS)', { ids });
          }
        }
      } catch (e) {
        console.error('Failed to resolve branch names (unexpected)', { error: e });
      }

      try {
        if (cancelled) return;
        const ids = Array.from(byType.bck.keys());
        if (ids.length > 0) {
          const { data, error } = await supabase.from('bcks').select('id,name').in('id', ids);
          if (error) {
            console.error('Failed to resolve BCK names', { ids, error });
          } else {
            applyRows((data ?? []) as any, byType.bck);
          }
        }
      } catch (e) {
        console.error('Failed to resolve BCK names (unexpected)', { error: e });
      }

      try {
        if (cancelled) return;
        const ids = Array.from(byType.supplier.keys());
        if (ids.length > 0) {
          const { data, error } = await supabase.from('suppliers').select('id,name').in('id', ids);
          if (error) {
            console.error('Failed to resolve supplier names', { ids, error });
          } else {
            applyRows((data ?? []) as any, byType.supplier);
          }
        }
      } catch (e) {
        console.error('Failed to resolve supplier names (unexpected)', { error: e });
      }
    };

    void fetchMissing();

    return () => {
      cancelled = true;
    };
  }, [assignedAudits, recentAudits, branches, bcks, suppliers, entityNameOverrides]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Assigned</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.assignedTotal}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">In Progress</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.inProgress}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Submitted</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.submitted}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Approved</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.approved}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Rejected</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.rejected}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="text-xs font-medium text-muted-foreground">Avg Score / Pass Rate</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{kpis.avgScore.toFixed(1)}%</div>
            <div className="mt-1 text-xs text-muted-foreground">Pass rate: {kpis.passRate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Assigned Audits</CardTitle>
              <div className="text-xs text-muted-foreground tabular-nums">{assignedAudits.length}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {assignedAudits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No assigned audits.</div>
            ) : (
              <div className="rounded-md border border-muted/60 overflow-hidden">
                <ScrollAreaPrimitive.Root className="relative h-[420px] overflow-hidden">
                  <ScrollAreaPrimitive.Viewport className="h-full w-full">
                    <div className="min-w-[640px]">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                          <TableRow>
                            <TableHead className="text-xs">Code</TableHead>
                            <TableHead className="text-xs">Entity</TableHead>
                            <TableHead className="text-xs">Date</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assignedAudits.map(audit => {
                            const key = `${audit.entity_type}:${audit.entity_id}`;
                            const fallback = entityNameOverrides[key];
                            const entityName = fallback || getEntityNameFromLists(
                              audit.entity_type,
                              audit.entity_id,
                              branches,
                              bcks,
                              suppliers
                            );

                            return (
                              <TableRow key={audit.id} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="font-mono text-xs whitespace-nowrap">{audit.audit_code}</TableCell>
                                <TableCell className="text-sm max-w-[240px] truncate">{entityName}</TableCell>
                                <TableCell className="text-sm whitespace-nowrap">{format(new Date(audit.scheduled_date), 'MMM d, yyyy')}</TableCell>
                                <TableCell>
                                  <Badge variant={statusBadgeVariant(audit.status)} className="text-[10px] uppercase tracking-wide">
                                    {audit.status.replace('_', ' ')}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button asChild size="sm" variant="outline" className="h-8 px-3">
                                    <Link to={`/audits/${audit.id}`}>Open</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollAreaPrimitive.Viewport>
                  <ScrollBar />
                  <ScrollBar orientation="horizontal" />
                  <ScrollAreaPrimitive.Corner />
                </ScrollAreaPrimitive.Root>
              </div>
            )}

            <div className="mt-3 flex justify-end">
              <Button asChild variant="outline" size="sm">
                <Link to="/audits">View all audits</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50 border-muted/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Recent History</CardTitle>
              <div className="text-xs text-muted-foreground tabular-nums">{recentAudits.length}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {recentAudits.length === 0 ? (
              <div className="text-sm text-muted-foreground">No completed/submitted audits yet.</div>
            ) : (
              <div className="rounded-md border border-muted/60 overflow-hidden">
                <ScrollAreaPrimitive.Root className="relative h-[420px] overflow-hidden">
                  <ScrollAreaPrimitive.Viewport className="h-full w-full">
                    <div className="min-w-[560px]">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                          <TableRow>
                            <TableHead className="text-xs">Code</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Score</TableHead>
                            <TableHead className="text-right">Open</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentAudits.map(audit => (
                            <TableRow key={audit.id} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="font-mono text-xs whitespace-nowrap">{audit.audit_code}</TableCell>
                              <TableCell>
                                <Badge variant={statusBadgeVariant(audit.status)} className="text-[10px] uppercase tracking-wide">
                                  {audit.status.replace('_', ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap tabular-nums">
                                {typeof audit.score === 'number' ? `${audit.score.toFixed(1)}%` : '-'}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button asChild size="sm" variant="outline" className="h-8 px-3">
                                  <Link to={`/audits/${audit.id}`}>View</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </ScrollAreaPrimitive.Viewport>
                  <ScrollBar />
                  <ScrollBar orientation="horizontal" />
                  <ScrollAreaPrimitive.Corner />
                </ScrollAreaPrimitive.Root>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
