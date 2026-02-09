import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Search, MoreVertical, List, CalendarDays, Pencil, X, Play, Trash2 } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QuickScheduleModal } from '@/components/audits/QuickScheduleModal';
import { AssignAuditorModal } from '@/components/audits/AssignAuditorModal';
import { AuditCalendar } from '@/components/audits/AuditCalendar';
import type { Audit } from '@/lib/auditStorage';
import { getUserById, getUsersByRole } from '@/lib/entityStorage';
import { fetchTemplates } from '@/lib/templateSupabase';
import { fetchAudits, updateAudit, deleteAudit } from '@/lib/auditSupabase';
import { QUERY_KEYS, invalidateAudits } from '@/lib/queryConfig';

const ITEMS_PER_PAGE = 25;

const ENTITY_TYPE_COLORS: Record<string, string> = {
  branch: 'bg-muted text-muted-foreground',
  bck: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  supplier: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  submitted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  pending_verification: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  rejected: 'bg-destructive/10 text-destructive',
  overdue: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-muted text-muted-foreground line-through',
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  pending_verification: 'Pending Verification',
  approved: 'Approved',
  rejected: 'Rejected',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

export default function AuditsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAuditor = user?.role === 'auditor';
  const canManageAudits = !!user && ['super_admin', 'audit_manager'].includes(user.role);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const templatesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of templates) map.set(t.id, t.name);
    return map;
  }, [templates]);

  const getTemplateName = (templateId: string): string => {
    return templatesById.get(templateId) || 'Unknown Template';
  };

  const { data: allAudits = [], isLoading } = useQuery({
    queryKey: QUERY_KEYS.audits,
    queryFn: fetchAudits,
    staleTime: 1 * 60 * 1000,
  });

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [auditorFilter, setAuditorFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [quickScheduleOpen, setQuickScheduleOpen] = useState(false);
  const [assignAuditorOpen, setAssignAuditorOpen] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [auditToCancel, setAuditToCancel] = useState<Audit | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [auditToDelete, setAuditToDelete] = useState<Audit | null>(null);

  const auditors = getUsersByRole('auditor');

  const cancelMutation = useMutation({
    mutationFn: async (audit: Audit) => {
      await updateAudit(audit.id, { status: 'cancelled' });
    },
    onSuccess: async () => {
      await invalidateAudits(queryClient);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (audit: Audit) => {
      // Safety: allow delete only for scheduled/cancelled
      if (!['scheduled', 'cancelled'].includes(audit.status)) {
        throw new Error('Only scheduled or cancelled audits can be deleted.');
      }
      await deleteAudit(audit.id);
    },
    onSuccess: async () => {
      await invalidateAudits(queryClient);
    },
  });

  // Get auditor name
  const getAuditorName = (auditorId?: string): string => {
    if (!auditorId) return 'Unassigned';
    const auditor = getUserById(auditorId);
    return auditor?.full_name || 'Unknown';
  };

  const visibleAudits = useMemo(() => {
    if (!user) return [] as Audit[];
    if (user.role === 'auditor') return allAudits.filter(a => a.auditor_id === user.id);

    if (user.role === 'regional_manager') {
      // For now, keep same as before: show all audits. (Region scoping can be added once entity-region mapping is in query layer.)
      return allAudits;
    }

    return allAudits;
  }, [allAudits, user]);

  const getEntityNameSafe = (entityType: string, entityId: string): string => {
    // Fallback until the audits list is joined to entities.
    return `${entityType.toUpperCase()} ${entityId.slice(0, 8)}`;
  };

  // Filter audits
  const filteredAudits = visibleAudits.filter(audit => {
    const entityName = getEntityNameSafe(audit.entity_type, audit.entity_id);
    const matchesSearch = 
      audit.audit_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entityName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesEntityType = entityTypeFilter === 'all' || audit.entity_type === entityTypeFilter;
    const matchesStatus = statusFilter === 'all' || audit.status === statusFilter;
    const matchesAuditor = auditorFilter === 'all' || audit.auditor_id === auditorFilter;
    return matchesSearch && matchesEntityType && matchesStatus && matchesAuditor;
  });

  // Pagination (for list view)
  const totalPages = Math.ceil(filteredAudits.length / ITEMS_PER_PAGE);
  const paginatedAudits = filteredAudits.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const handleAssignAuditor = (audit: Audit) => {
    setSelectedAudit(audit);
    setAssignAuditorOpen(true);
  };

  const handleCancel = (audit: Audit) => {
    setAuditToCancel(audit);
    setCancelDialogOpen(true);
  };

  const handleDelete = (audit: Audit) => {
    if (!canManageAudits) return;
    setAuditToDelete(audit);
    setDeleteDialogOpen(true);
  };

  const confirmCancel = () => {
    if (!auditToCancel) return;

    cancelMutation.mutate(auditToCancel, {
      onSuccess: () => {
        toast({
          title: 'Audit Cancelled',
          description: `Audit ${auditToCancel.audit_code} has been cancelled.`,
        });
      },
      onError: (e: any) => {
        toast({
          title: 'Error',
          description: e?.message || 'Failed to cancel audit.',
          variant: 'destructive',
        });
      },
    });
    
    setCancelDialogOpen(false);
    setAuditToCancel(null);
  };

  const confirmDelete = () => {
    if (!auditToDelete) return;

    deleteMutation.mutate(auditToDelete, {
      onSuccess: () => {
        toast({
          title: 'Deleted',
          description: `Audit ${auditToDelete.audit_code} deleted successfully.`,
        });
      },
      onError: (e: any) => {
        toast({
          title: 'Cannot Delete',
          description: e?.message || 'Failed to delete audit.',
          variant: 'destructive',
        });
      },
    });

    setDeleteDialogOpen(false);
    setAuditToDelete(null);
  };

  const pageTitle = isAuditor ? 'My Audits' : 'Audits';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {isAuditor ? 'View and execute your assigned audits' : 'Manage and track all audits'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAuditor && (
            <Button variant="outline" onClick={() => setQuickScheduleOpen(true)} className="flex-1 sm:flex-none">
              <CalendarPlus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Schedule One-time Audit</span>
              <span className="sm:hidden">Schedule</span>
            </Button>
          )}
          
          {/* View Toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'list' ? 'bg-primary rounded-none' : 'rounded-none'}
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <List className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">List</span>
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'calendar' ? 'bg-primary rounded-none' : 'rounded-none'}
              onClick={() => setViewMode('calendar')}
              aria-label="Calendar view"
            >
              <CalendarDays className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Calendar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search audits..."
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
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="pending_verification">Pending Verification</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        {!isAuditor && (
          <Select value={auditorFilter} onValueChange={(v) => { setAuditorFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Auditors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Auditors</SelectItem>
              {auditors.map(auditor => (
                <SelectItem key={auditor.id} value={auditor.id}>
                  {auditor.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {viewMode === 'list' ? (
        <>
          {/* Table */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="border rounded-lg min-w-[800px] md:min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Audit Code</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Auditor</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : paginatedAudits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      <p className="text-muted-foreground">
                        {allAudits.length === 0 
                          ? 'No audits yet. Create an audit plan or schedule a one-time audit.'
                          : 'No audits match your filters.'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedAudits.map((audit) => {
                    const isOverdue = audit.status === 'overdue' || 
                      (audit.status === 'scheduled' && new Date(audit.scheduled_date) < new Date());
                    
                      return (
                      <TableRow 
                        key={audit.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/audits/${audit.id}`)}
                      >
                        <TableCell>
                          <span className="font-semibold">{audit.audit_code}</span>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p>{getEntityNameSafe(audit.entity_type, audit.entity_id)}</p>
                            <Badge variant="secondary" className={ENTITY_TYPE_COLORS[audit.entity_type]}>
                              {audit.entity_type.charAt(0).toUpperCase() + audit.entity_type.slice(1)}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>{getTemplateName(audit.template_id)}</TableCell>
                        <TableCell>
                          <span className={!audit.auditor_id ? 'text-muted-foreground' : ''}>
                            {getAuditorName(audit.auditor_id)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={isOverdue ? 'text-destructive' : ''}>
                            {format(new Date(audit.scheduled_date), 'MMM d, yyyy')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLORS[audit.status]}>
                            {STATUS_LABELS[audit.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {audit.score !== undefined ? `${audit.score.toFixed(1)}%` : '—'}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/audits/${audit.id}`);
                              }}>
                                <Play className="mr-2 h-4 w-4" />
                                {['scheduled', 'in_progress', 'overdue'].includes(audit.status) ? 'Execute Audit' : 'View Audit'}
                              </DropdownMenuItem>
                              {!isAuditor && (
                                <DropdownMenuItem onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignAuditor(audit);
                                }}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  {audit.auditor_id ? 'Reassign Auditor' : 'Assign Auditor'}
                                </DropdownMenuItem>
                              )}
                              {audit.status === 'scheduled' && (
                                <DropdownMenuItem 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCancel(audit);
                                  }}
                                  className="text-destructive"
                                >
                                  <X className="mr-2 h-4 w-4" />
                                  Cancel Audit
                                </DropdownMenuItem>
                              )}

                              {canManageAudits && (
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(audit);
                                  }}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete Audit
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredAudits.length)} of{' '}
                {filteredAudits.length} audits
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
        </>
      ) : (
        <AuditCalendar 
          audits={filteredAudits}
          currentDate={calendarDate}
          onDateChange={setCalendarDate}
        />
      )}

      {/* Modals */}
      <QuickScheduleModal
        open={quickScheduleOpen}
        onOpenChange={setQuickScheduleOpen}
        onSuccess={() => {
          void invalidateAudits(queryClient);
        }}
      />

      <AssignAuditorModal
        open={assignAuditorOpen}
        onOpenChange={setAssignAuditorOpen}
        audit={selectedAudit}
        onSuccess={() => {
          void invalidateAudits(queryClient);
        }}
      />

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this audit?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Only scheduled or cancelled audits can be deleted.
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

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this audit?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be marked as cancelled and cannot be executed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Audit</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel} className="bg-destructive text-destructive-foreground">
              Cancel Audit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
