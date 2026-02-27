import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  AlertCircle, 
  Clock, 
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CAPA, Finding, SubTask } from '@/lib/auditExecutionStorage';
import { fetchCAPAs, fetchFindings, forceEscalateCAPA, runCAPAEscalationLadder, updateCAPA } from '@/lib/executionSupabase';
import { fetchBCKs, fetchBranches, fetchSuppliers } from '@/lib/entitySupabase';
import { getDepartmentId, isDepartmentMember } from '@/lib/departmentSupabase';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 25;

interface CAPAListItem {
  capa: CAPA;
  finding: {
    id: string;
    finding_code: string;
    description: string;
    severity: string;
  } | null;
  entityName: string;
  entityCode: string;
  entityType: string;
  isOverdue: boolean;
  recentRank?: 1 | 2 | 3;
}

interface StaffTaskItem {
  capaId: string;
  capaCode: string;
  capaPriority: string;
  capaDueDate: string;
  subTask: SubTask;
  isOverdue: boolean;
}

export default function CAPAPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const fromUrl = searchParams.get('status');
    if (fromUrl) return fromUrl;

    const role = user?.role;
    const isEscalationRole =
      role === 'area_manager' ||
      role === 'regional_operational_manager' ||
      role === 'national_operational_manager';

    return isEscalationRole ? 'active' : 'all';
  });
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRunningEscalation, setIsRunningEscalation] = useState(false);
  const [recentTick, setRecentTick] = useState(() => Date.now());

  const isStaff = user?.role === 'staff';
  const isManager = ['branch_manager', 'bck_manager', 'head_of_quality', 'audit_manager', 'area_manager', 'regional_operational_manager', 'national_operational_manager'].includes(user?.role || '');
  const isReadOnly = ['regional_manager', 'super_admin'].includes(user?.role || '');
  const canFilterEntityType = user?.role === 'head_of_quality' || user?.role === 'audit_manager';
  const canVerify = ['super_admin', 'head_of_quality', 'audit_manager'].includes(user?.role || '');

  useEffect(() => {
    setCurrentPage(1);
  }, [entityTypeFilter]);

  useEffect(() => {
    const t = setInterval(() => setRecentTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const maintenanceAccessQuery = useQuery({
    queryKey: ['dept_member', 'maintenance', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return { isMember: false, deptId: null as string | null };
      const [isMember, deptId] = await Promise.all([
        isDepartmentMember(user.id, 'maintenance'),
        getDepartmentId('maintenance'),
      ]);
      return { isMember, deptId };
    },
    staleTime: 60 * 1000,
  });

  const isMaintenanceMember = maintenanceAccessQuery.data?.isMember ?? false;
  const maintenanceDeptId = maintenanceAccessQuery.data?.deptId ?? null;
  const treatAsDeptUser = user?.role === 'staff' && isMaintenanceMember;

  const showStaffTasksTable = isStaff && !treatAsDeptUser;

  const needBranches =
    !!user &&
    (treatAsDeptUser ||
      [
        'super_admin',
        'head_of_quality',
        'audit_manager',
        'regional_manager',
        'branch_manager',
        'area_manager',
        'regional_operational_manager',
        'national_operational_manager',
      ].includes(user.role));
  const needBCKs =
    !!user &&
    (treatAsDeptUser ||
      [
        'super_admin',
        'head_of_quality',
        'audit_manager',
        'regional_manager',
        'bck_manager',
        'area_manager',
        'regional_operational_manager',
        'national_operational_manager',
      ].includes(user.role));
  const needSuppliers =
    !!user &&
    (treatAsDeptUser ||
      [
        'super_admin',
        'head_of_quality',
        'audit_manager',
        'area_manager',
        'regional_operational_manager',
        'national_operational_manager',
      ].includes(user.role));

  const capasQuery = useQuery({
    queryKey: ['capas', user?.id, user?.role],
    queryFn: async () => {
      const capas = await fetchCAPAs();
      return capas;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  const findingsQuery = useQuery({
    queryKey: ['findings', user?.id, user?.role],
    queryFn: async () => {
      const findings = await fetchFindings();
      return findings;
    },
    enabled: !!user && ['super_admin', 'head_of_quality', 'audit_manager'].includes(user.role),
    staleTime: 30 * 1000,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
    enabled: needBranches,
    staleTime: 60 * 1000,
  });

  const bcksQuery = useQuery({
    queryKey: ['bcks'],
    queryFn: fetchBCKs,
    enabled: needBCKs,
    staleTime: 60 * 1000,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
    enabled: needSuppliers,
    staleTime: 60 * 1000,
  });

  const isLoading =
    capasQuery.isLoading ||
    (findingsQuery.isLoading && ['super_admin', 'head_of_quality', 'audit_manager'].includes(user?.role || '')) ||
    branchesQuery.isLoading ||
    bcksQuery.isLoading ||
    suppliersQuery.isLoading;

  const capas = capasQuery.data ?? [];
  const findings = (findingsQuery.data ?? []) as Finding[];
  const branches = branchesQuery.data ?? [];
  const bcks = bcksQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const { capaItems, staffTasks, stats } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const isDateOverdue = (dateStr: string | null | undefined): boolean => {
      if (!dateStr) return false;
      const ms = new Date(dateStr).getTime();
      if (!Number.isFinite(ms)) return false;
      return ms < todayStart.getTime();
    };

    const findingMap = new Map(findings.map(f => [f.id, f] as const));
    const branchMap = new Map(branches.map(b => [b.id, b] as const));
    const bckMap = new Map(bcks.map(b => [b.id, b] as const));
    const supplierMap = new Map(suppliers.map(s => [s.id, s] as const));

    const staffTasks: StaffTaskItem[] = [];
    if (user?.role === 'staff' && !treatAsDeptUser) {
      for (const capa of capas) {
        for (const st of capa.sub_tasks || []) {
          if (st.assigned_to_user_id === user.id) {
            staffTasks.push({
              capaId: capa.id,
              capaCode: capa.capa_code,
              capaPriority: capa.priority,
              capaDueDate: capa.due_date,
              subTask: st,
              isOverdue: isDateOverdue(capa.due_date) && st.status !== 'completed',
            });
          }
        }
      }
      return {
        capaItems: [] as CAPAListItem[],
        staffTasks,
        stats: { open: 0, overdue: 0, pendingVerification: 0, escalated: 0 },
      };
    }

    const getUpdatedAtMs = (c: CAPA): number => {
      const raw = (c.updated_at || c.created_at) as string;
      const ms = new Date(raw).getTime();
      return Number.isFinite(ms) ? ms : 0;
    };

    const sortedCapas = [...capas].sort((a, b) => getUpdatedAtMs(b) - getUpdatedAtMs(a));

    let filteredCapas: CAPA[] = sortedCapas;
    if (user?.role === 'branch_manager') {
      filteredCapas = sortedCapas.filter(c => c.entity_type === 'branch');
    } else if (user?.role === 'bck_manager') {
      filteredCapas = sortedCapas.filter(c => c.entity_type === 'bck');
    } else if (user?.role === 'head_of_quality' || user?.role === 'audit_manager') {
      filteredCapas = sortedCapas;
    } else if (user?.role === 'area_manager' || user?.role === 'regional_operational_manager' || user?.role === 'national_operational_manager') {
      filteredCapas = sortedCapas.filter(c => c.assigned_to === user.id);
    } else if (user?.role === 'regional_manager') {
      filteredCapas = sortedCapas.filter(c => c.entity_type === 'branch' || c.entity_type === 'bck');
    } else if (treatAsDeptUser && maintenanceDeptId) {
      filteredCapas = sortedCapas.filter(c => c.department_id === maintenanceDeptId);
    }

    const recentWindowMs = 10 * 60 * 1000;
    const nowMs = recentTick;
    const recentEligible = filteredCapas
      .filter(c => ['closed', 'expired', 'escalated'].includes(c.status))
      .filter(c => nowMs - getUpdatedAtMs(c) <= recentWindowMs)
      .slice(0, 3);
    const recentRankById = new Map(recentEligible.map((c, idx) => [c.id, (idx + 1) as 1 | 2 | 3] as const));

    const capaItems: CAPAListItem[] = filteredCapas.map(capa => {
      const finding = findingMap.get(capa.finding_id);

      let entityName = '';
      let entityCode = '';
      if (capa.entity_type === 'branch') {
        const b = branchMap.get(capa.entity_id);
        entityName = b?.name || 'Unknown';
        entityCode = b?.code || '';
      } else if (capa.entity_type === 'bck') {
        const b = bckMap.get(capa.entity_id);
        entityName = b?.name || 'Unknown';
        entityCode = b?.code || '';
      } else if (capa.entity_type === 'supplier') {
        const s = supplierMap.get(capa.entity_id);
        entityName = s?.name || 'Unknown';
        entityCode = s?.supplier_code || '';
      }

      const effectiveDueDate =
        (capa.escalation_level ?? 0) > 0 && capa.escalation_due_date
          ? capa.escalation_due_date
          : capa.due_date;

      return {
        capa,
        finding: finding
          ? {
              id: finding.id,
              finding_code: finding.finding_code,
              description: finding.description,
              severity: finding.severity,
            }
          : null,
        entityName,
        entityCode,
        entityType: capa.entity_type,
        isOverdue: isDateOverdue(effectiveDueDate) && !['closed', 'approved', 'expired'].includes(capa.status),
        recentRank: recentRankById.get(capa.id),
      };
    });

    const stats = {
      open: capaItems.filter(i => ['open', 'in_progress'].includes(i.capa.status)).length,
      overdue: capaItems.filter(i => {
        const effectiveDue = (i.capa.escalation_level ?? 0) > 0 && i.capa.escalation_due_date
          ? i.capa.escalation_due_date
          : i.capa.due_date;
        return isDateOverdue(effectiveDue) && !['closed', 'approved', 'expired'].includes(i.capa.status);
      }).length,
      pendingVerification: capaItems.filter(i => i.capa.status === 'pending_verification').length,
      escalated: capaItems.filter(i => i.capa.status === 'escalated').length,
    };

    return {
      capaItems,
      staffTasks: [] as StaffTaskItem[],
      stats,
    };
  }, [bcks, branches, capas, findings, maintenanceDeptId, recentTick, suppliers, treatAsDeptUser, user?.id, user?.role]);

  // Filter items for managers
  const filteredCAPAItems = capaItems.filter(item => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !item.capa.capa_code.toLowerCase().includes(query) &&
        !(item.finding?.description || item.capa.description).toLowerCase().includes(query) &&
        !item.entityName.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    if (canFilterEntityType && entityTypeFilter !== 'all' && item.capa.entity_type !== entityTypeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active') {
        if (['closed', 'approved', 'expired'].includes(item.capa.status)) return false;
      } else if (item.capa.status !== statusFilter) {
        return false;
      }
    }

    // Priority filter
    if (priorityFilter !== 'all' && item.capa.priority !== priorityFilter) {
      return false;
    }

    return true;
  });

  // Filter items for staff
  const filteredStaffTasks = staffTasks.filter(task => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !task.capaCode.toLowerCase().includes(query) &&
        !task.subTask.description.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    if (statusFilter !== 'all' && task.subTask.status !== statusFilter) {
      return false;
    }

    return true;
  });

  // Pagination
  const totalItems = showStaffTasksTable ? filteredStaffTasks.length : filteredCAPAItems.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedCAPAItems = filteredCAPAItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const paginatedStaffTasks = filteredStaffTasks.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-600 text-white font-bold',
      high: 'bg-orange-600 text-white font-bold',
      medium: 'bg-yellow-600 text-white font-bold',
      low: 'bg-blue-600 text-white font-bold',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending_verification: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-orange-100 text-orange-800',
      escalated: 'bg-red-600 text-white font-bold',
      closed: 'bg-green-600 text-white font-bold',
      expired: 'bg-gray-700 text-white font-bold',
      pending: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getRecentBadge = (rank?: 1 | 2 | 3) => {
    if (!rank) return null;
    const cls: Record<1 | 2 | 3, string> = {
      1: 'bg-emerald-100 text-emerald-900 border border-emerald-200',
      2: 'bg-sky-100 text-sky-900 border border-sky-200',
      3: 'bg-violet-100 text-violet-900 border border-violet-200',
    };
    return (
      <Badge className={cls[rank]}>
        Recent {rank}
      </Badge>
    );
  };

  const getEntityTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      branch: 'bg-gray-100 text-gray-800',
      bck: 'bg-purple-100 text-purple-800',
      supplier: 'bg-blue-100 text-blue-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getRowClass = (item: CAPAListItem) => {
    if (item.capa.status === 'escalated') {
      return 'border-l-4 border-l-red-500 bg-orange-50 text-slate-900 dark:bg-orange-950/25 dark:text-slate-50';
    }
    if (item.capa.status === 'expired') {
      return 'border-l-4 border-l-gray-500 bg-gray-50 text-slate-900 dark:bg-gray-950/25 dark:text-slate-50';
    }
    if (item.capa.status === 'rejected') {
      return 'bg-orange-50 text-slate-900 dark:bg-orange-950/25 dark:text-slate-50';
    }
    if (item.isOverdue) {
      return 'bg-red-50 text-slate-900 dark:bg-red-950/25 dark:text-slate-50';
    }
    return '';
  };

  const getStaffRowClass = (task: StaffTaskItem) => {
    if (task.isOverdue) {
      return 'bg-red-50 text-slate-900 dark:bg-red-950/25 dark:text-slate-50';
    }
    return '';
  };

  const managerStatusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'pending_verification', label: 'Pending Verification' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'expired', label: 'Expired' },
    { value: 'closed', label: 'Closed' },
  ];

  const staffStatusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  useEffect(() => {
    const paramStatus = searchParams.get('status');
    const role = user?.role;
    const isEscalationRole =
      role === 'area_manager' ||
      role === 'regional_operational_manager' ||
      role === 'national_operational_manager';

    const nextStatus = paramStatus ?? (isEscalationRole ? 'active' : 'all');
    if (nextStatus !== statusFilter) {
      setStatusFilter(nextStatus);
    }
  }, [searchParams, statusFilter, user?.role]);

  useEffect(() => {
    const allowedStatuses = new Set(
      (showStaffTasksTable ? staffStatusOptions : managerStatusOptions).map(o => o.value)
    );

    if (!allowedStatuses.has(statusFilter)) {
      setStatusFilter('all');
      const next = new URLSearchParams(searchParams);
      next.delete('status');
      setSearchParams(next, { replace: true });
    }
  }, [showStaffTasksTable, statusFilter, searchParams, setSearchParams]);

  const canRunEscalation =
    user?.role === 'super_admin' ||
    user?.role === 'head_of_quality' ||
    user?.role === 'audit_manager' ||
    user?.role === 'area_manager' ||
    user?.role === 'regional_operational_manager';

  const canForceEscalate =
    user?.role === 'super_admin' ||
    user?.role === 'head_of_quality' ||
    user?.role === 'audit_manager' ||
    user?.role === 'area_manager' ||
    user?.role === 'regional_operational_manager';

  const canExpire = user?.role === 'national_operational_manager';

  const handleRunEscalation = async () => {
    if (!canRunEscalation) return;
    setIsRunningEscalation(true);
    try {
      const res = await runCAPAEscalationLadder(true);
      await queryClient.invalidateQueries({ queryKey: ['capas'] });
      toast({
        title: 'Escalation run complete',
        description: `Escalated: ${res.escalatedCount}, Expired: ${res.expiredCount}`,
      });
    } catch (e: any) {
      toast({
        title: 'Escalation run failed',
        description: e?.message || 'Failed to run escalation ladder',
        variant: 'destructive',
      });
    } finally {
      setIsRunningEscalation(false);
    }
  };

  const handleForceEscalate = async (capaId: string) => {
    if (!canForceEscalate) return;
    try {
      await forceEscalateCAPA(capaId);
      await queryClient.invalidateQueries({ queryKey: ['capas'] });
      toast({ title: 'Force escalation complete' });
    } catch (e: any) {
      console.error('Force escalation failed', e);
      toast({
        title: 'Force escalation failed',
        description: e?.message || (typeof e === 'string' ? e : JSON.stringify(e)),
        variant: 'destructive',
      });
    }
  };

  const handleExpire = async (capaId: string) => {
    if (!canExpire) return;
    try {
      await updateCAPA(capaId, {
        status: 'expired',
        expired_at: new Date().toISOString(),
        expired_reason: 'Expired by NOM (manual)',
      });
      await queryClient.invalidateQueries({ queryKey: ['capas'] });
      toast({ title: 'CAPA expired' });
    } catch (e: any) {
      console.error('Expire CAPA failed', e);
      toast({
        title: 'Expire failed',
        description: e?.message || 'Failed to expire CAPA.',
        variant: 'destructive',
      });
    }
  };

  const listQueryString = searchParams.toString();
  const detailQuerySuffix = listQueryString ? `?${listQueryString}` : '';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CAPA Management</h1>
          <p className="text-muted-foreground">Track and manage corrective and preventive actions</p>
        </div>
        <div className="flex gap-2">
          {canRunEscalation && (
            <Button
              variant="outline"
              onClick={handleRunEscalation}
              disabled={isRunningEscalation}
            >
              {isRunningEscalation ? 'Running...' : 'Run Escalation'}
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards (Managers Only) */}
      {(isManager || treatAsDeptUser) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.open}</div>
              <p className="text-xs text-muted-foreground">Requiring action</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <p className="text-xs text-muted-foreground">Past due date</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pendingVerification}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          {(user?.role === 'head_of_quality' || user?.role === 'audit_manager') && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Escalated</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.escalated}</div>
                <p className="text-xs text-muted-foreground">Requires attention</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={showStaffTasksTable ? "Search tasks..." : "Search CAPA..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {!showStaffTasksTable && canFilterEntityType && (
          <Select
            value={entityTypeFilter}
            onValueChange={(value) => {
              setEntityTypeFilter(value);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="branch">Branch</SelectItem>
              <SelectItem value="bck">BCK</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select
          value={statusFilter}
          onValueChange={(value) => {
            setStatusFilter(value);
            const next = new URLSearchParams(searchParams);
            if (value === 'all') next.delete('status');
            else next.set('status', value);
            setSearchParams(next, { replace: true });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {(showStaffTasksTable ? staffStatusOptions : managerStatusOptions).map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!showStaffTasksTable && (
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {showStaffTasksTable ? (
            // Staff Task Table
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>CAPA Code</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedStaffTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                        <p className="text-muted-foreground">No tasks assigned to you right now.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedStaffTasks.map((task) => (
                    <TableRow key={task.subTask.id} className={getStaffRowClass(task)}>
                      <TableCell className="font-medium max-w-[300px] truncate">
                        {task.subTask.description}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">{task.capaCode}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityBadge(task.capaPriority)}>
                          {task.capaPriority.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={task.isOverdue ? 'text-red-600' : ''}>
                          {format(new Date(task.capaDueDate), 'MMM d, yyyy')}
                          {task.isOverdue && (
                            <div className="text-xs text-red-600">Overdue</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(task.subTask.status)}>
                          {task.subTask.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/capa/${task.capaId}${detailQuerySuffix}`)}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            // Manager/Admin CAPA Table
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CAPA Code</TableHead>
                  <TableHead>Finding</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedCAPAItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle2 className="h-12 w-12 text-green-500" />
                        <p className="text-muted-foreground">No open CAPA. Your entities are in good standing.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedCAPAItems.map((item) => (
                    <TableRow key={item.capa.id} className={getRowClass(item)}>
                      <TableCell className="font-semibold font-mono">
                        {item.capa.capa_code}
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {item.finding?.finding_code}
                          </span>
                          <p className="text-sm max-w-[200px] truncate">
                            {item.finding?.description || item.capa.description || 'No description'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.entityName}</span>
                          <div className="mt-1">
                            <Badge variant="outline" className={getEntityTypeBadge(item.entityType)}>
                              {item.entityType.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getPriorityBadge(item.capa.priority)}>
                          {item.capa.priority.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const effectiveDueDate =
                            (item.capa.escalation_level ?? 0) > 0 && item.capa.escalation_due_date
                              ? item.capa.escalation_due_date
                              : item.capa.due_date;
                          const showOriginal =
                            (item.capa.escalation_level ?? 0) > 0 &&
                            !!item.capa.escalation_due_date &&
                            item.capa.due_date &&
                            item.capa.due_date !== item.capa.escalation_due_date;
                          return (
                            <div className={item.isOverdue ? 'text-red-600' : ''}>
                              {format(new Date(effectiveDueDate), 'MMM d, yyyy')}
                              {showOriginal ? (
                                <div className="text-xs text-muted-foreground">Original: {format(new Date(item.capa.due_date), 'MMM d, yyyy')}</div>
                              ) : null}
                              {item.isOverdue && <div className="text-xs text-red-600">Overdue</div>}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusBadge(item.capa.status)}>
                            {item.capa.status.replace('_', ' ')}
                          </Badge>
                          {getRecentBadge(item.recentRank)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {canVerify && item.capa.status === 'pending_verification' ? (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/audits/${item.capa.audit_id}/verify?from=capa#findings-section`)}
                          >
                            Verify
                          </Button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/capa/${item.capa.id}${detailQuerySuffix}`)}
                            >
                              View
                            </Button>
                            {canForceEscalate && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleForceEscalate(item.capa.id)}
                              >
                                Force
                              </Button>
                            )}
                            {canExpire &&
                              item.capa.status === 'escalated' &&
                              !['closed', 'approved', 'expired'].includes(item.capa.status) && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExpire(item.capa.id)}
                              >
                                Expire
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalItems > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, totalItems)} of {totalItems} results
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => p + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
