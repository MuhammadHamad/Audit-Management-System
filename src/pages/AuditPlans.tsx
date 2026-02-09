import { useMemo, useState } from 'react';
import { CalendarPlus, Search, MoreVertical, Pause, Play, Trash2, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { AuditPlanModal } from '@/components/auditplans/AuditPlanModal';
import type { AuditPlan } from '@/lib/auditStorage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTemplates } from '@/lib/templateSupabase';
import { getUserById } from '@/lib/entityStorage';
import { fetchAuditPlans, updateAuditPlan, deleteAuditPlan } from '@/lib/auditSupabase';
import { useAudits } from '@/hooks/useDashboardData';
import { QUERY_KEYS, invalidateAudits } from '@/lib/queryConfig';

const ITEMS_PER_PAGE = 25;

const ENTITY_TYPE_COLORS: Record<string, string> = {
  branch: 'bg-muted text-muted-foreground',
  bck: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  supplier: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-muted text-muted-foreground',
};

export default function AuditPlansPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const { data: audits = [] } = useAudits();

  const {
    data: plans = [],
    isLoading,
  } = useQuery({
    queryKey: QUERY_KEYS.auditPlans,
    queryFn: fetchAuditPlans,
    staleTime: 1 * 60 * 1000,
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<AuditPlan | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<AuditPlan | null>(null);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [planToPause, setPlanToPause] = useState<AuditPlan | null>(null);

  const pauseMutation = useMutation({
    mutationFn: async (values: { id: string; status: AuditPlan['status'] }) => {
      await updateAuditPlan(values.id, { status: values.status });
    },
    onSuccess: async () => {
      await invalidateAudits(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteAuditPlan(id);
    },
    onSuccess: async () => {
      await invalidateAudits(queryClient);
    },
  });

  // Get template name
  const templatesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.name);
    return map;
  }, [templates]);

  const getTemplateName = (templateId: string): string => {
    return templatesById.get(templateId) || 'Unknown';
  };

  // Get user name
  const getUserName = (userId?: string): string => {
    if (!userId) return '—';
    const user = getUserById(userId);
    return user?.full_name || 'Unknown';
  };

  // Format frequency display
  const formatFrequency = (plan: AuditPlan): string => {
    const pattern = plan.recurrence_pattern;
    if (pattern.type === 'one_time') {
      return pattern.scheduled_date 
        ? format(new Date(pattern.scheduled_date), 'MMM d, yyyy')
        : '—';
    }

    if (pattern.frequency === 'daily') {
      return 'Daily';
    }

    if (pattern.frequency === 'weekly' && pattern.days_of_week) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = pattern.days_of_week.map(d => dayNames[d]).join(', ');
      return `Weekly (${days})`;
    }

    if (pattern.frequency === 'monthly' && pattern.day_of_month) {
      return `Monthly (${pattern.day_of_month}${getOrdinalSuffix(pattern.day_of_month)})`;
    }

    return '—';
  };

  const getOrdinalSuffix = (n: number): string => {
    if (n >= 11 && n <= 13) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  // Format scope display
  const formatScope = (plan: AuditPlan): string => {
    if (plan.scope.type === 'all') {
      return `All ${plan.entity_type}s`;
    }
    const count = plan.scope.entity_ids?.length || 0;
    return `${count} ${plan.entity_type}${count !== 1 ? 's' : ''}`;
  };

  // Format auditor display
  const formatAuditor = (plan: AuditPlan): string => {
    if (plan.assignment_strategy === 'auto_round_robin') {
      return 'Auto (round robin)';
    }
    if (plan.assignment_strategy === 'manual') {
      return 'Manual';
    }
    return getUserName(plan.assigned_auditor_id);
  };

  // Filter plans
  const filteredPlans = plans.filter(plan => {
    const matchesSearch = plan.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEntityType = entityTypeFilter === 'all' || plan.entity_type === entityTypeFilter;
    const matchesStatus = statusFilter === 'all' || plan.status === statusFilter;
    return matchesSearch && matchesEntityType && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredPlans.length / ITEMS_PER_PAGE);
  const paginatedPlans = filteredPlans.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleEdit = (plan: AuditPlan) => {
    setSelectedPlan(plan);
    setModalOpen(true);
  };

  const handlePause = (plan: AuditPlan) => {
    setPlanToPause(plan);
    setPauseDialogOpen(true);
  };

  const confirmPause = () => {
    if (!planToPause) return;
    
    const newStatus = planToPause.status === 'paused' ? 'active' : 'paused';
    pauseMutation.mutate({ id: planToPause.id, status: newStatus });
    
    toast({
      title: 'Success',
      description: `Plan ${newStatus === 'paused' ? 'paused' : 'resumed'} successfully.`,
    });
    
    setPauseDialogOpen(false);
    setPlanToPause(null);
  };

  const handleDelete = (plan: AuditPlan) => {
    if (plan.status === 'active') {
      toast({
        title: 'Cannot Delete',
        description: 'Cannot delete an active plan. Pause it first.',
        variant: 'destructive',
      });
      return;
    }
    setPlanToDelete(plan);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (!planToDelete) return;

    deleteMutation.mutate(planToDelete.id, {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Audit plan deleted successfully.',
        });
      },
      onError: (e: any) => {
        toast({
          title: 'Error',
          description: e?.message || 'Failed to delete audit plan.',
          variant: 'destructive',
        });
      },
    });
    
    setDeleteDialogOpen(false);
    setPlanToDelete(null);
  };

  const getNextAuditDateForPlan = (planId: string): string | null => {
    const today = new Date().toISOString().split('T')[0];
    const next = audits
      .filter(a => a.plan_id === planId && a.scheduled_date >= today && a.status === 'scheduled')
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))[0];
    return next ? next.scheduled_date : null;
  };

  const handleCreateNew = () => {
    setSelectedPlan(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Plans</h1>
          <p className="text-muted-foreground">Create and manage audit schedules</p>
        </div>
        <Button onClick={handleCreateNew} className="bg-primary">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Create Audit Plan
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search plans..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Select value={entityTypeFilter} onValueChange={(v) => { setEntityTypeFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Entity Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entity Types</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="bck">BCK</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Auditor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Next Audit</TableHead>
              <TableHead className="w-[60px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginatedPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center">
                  <p className="text-muted-foreground">
                    {plans.length === 0 
                      ? 'No audit plans yet. Create a plan to start scheduling audits.'
                      : 'No plans match your filters.'}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <Badge variant="secondary" className={ENTITY_TYPE_COLORS[plan.entity_type]}>
                        {plan.entity_type.charAt(0).toUpperCase() + plan.entity_type.slice(1)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{getTemplateName(plan.template_id)}</TableCell>
                  <TableCell>
                    {plan.recurrence_pattern.type === 'one_time' ? 'One-time' : 'Recurring'}
                  </TableCell>
                  <TableCell>{formatFrequency(plan)}</TableCell>
                  <TableCell>{formatScope(plan)}</TableCell>
                  <TableCell>{formatAuditor(plan)}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[plan.status]}>
                      {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const nextDate = getNextAuditDateForPlan(plan.id);
                      return nextDate ? format(new Date(nextDate), 'MMM d, yyyy') : '—';
                    })()}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(plan)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {plan.status === 'paused' ? (
                          <DropdownMenuItem onClick={() => handlePause(plan)}>
                            <Play className="mr-2 h-4 w-4" />
                            Resume
                          </DropdownMenuItem>
                        ) : plan.status === 'active' ? (
                          <DropdownMenuItem onClick={() => handlePause(plan)}>
                            <Pause className="mr-2 h-4 w-4" />
                            Pause
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem 
                          onClick={() => handleDelete(plan)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredPlans.length)} of{' '}
            {filteredPlans.length} plans
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AuditPlanModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        plan={selectedPlan}
        onSuccess={() => {
          void invalidateAudits(queryClient);
        }}
      />

      {/* Pause/Resume Dialog */}
      <AlertDialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {planToPause?.status === 'paused' ? 'Resume' : 'Pause'} {planToPause?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {planToPause?.status === 'paused' 
                ? 'This will resume generating new audits according to the schedule.'
                : 'No new audits will be generated until resumed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPause}>
              {planToPause?.status === 'paused' ? 'Resume' : 'Pause'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {planToDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the plan but NOT any audits already generated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
