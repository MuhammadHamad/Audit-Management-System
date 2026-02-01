import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Search, MoreVertical, List, CalendarDays, Pencil, X, Play } from 'lucide-react';
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
import { QuickScheduleModal } from '@/components/audits/QuickScheduleModal';
import { AssignAuditorModal } from '@/components/audits/AssignAuditorModal';
import { AuditCalendar } from '@/components/audits/AuditCalendar';
import { 
  Audit, 
  getAuditsForUser, 
  updateOverdueAudits,
  cancelAudit,
  getEntityName,
  getTemplateName,
} from '@/lib/auditStorage';
import { getUserById, getUsersByRole } from '@/lib/entityStorage';

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
  const isAuditor = user?.role === 'auditor';
  const isRegionalManager = user?.role === 'regional_manager';

  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);
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

  const auditors = getUsersByRole('auditor');

  const loadAudits = () => {
    if (!user) return;
    
    setLoading(true);
    setTimeout(() => {
      // Update overdue audits first
      updateOverdueAudits();
      // Load audits based on user role
      const userAudits = getAuditsForUser(user.id, user.role);
      setAudits(userAudits);
      setLoading(false);
    }, 300);
  };

  useEffect(() => {
    loadAudits();
  }, [user]);

  // Get auditor name
  const getAuditorName = (auditorId?: string): string => {
    if (!auditorId) return 'Unassigned';
    const auditor = getUserById(auditorId);
    return auditor?.full_name || 'Unknown';
  };

  // Filter audits
  const filteredAudits = audits.filter(audit => {
    const entityName = getEntityName(audit.entity_type, audit.entity_id);
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

  const confirmCancel = () => {
    if (!auditToCancel) return;
    
    cancelAudit(auditToCancel.id);
    
    toast({
      title: 'Audit Cancelled',
      description: `Audit ${auditToCancel.audit_code} has been cancelled.`,
    });
    
    setCancelDialogOpen(false);
    setAuditToCancel(null);
    loadAudits();
  };

  const pageTitle = isAuditor ? 'My Audits' : 'Audits';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground">
            {isAuditor ? 'View and execute your assigned audits' : 'Manage and track all audits'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isAuditor && (
            <Button variant="outline" onClick={() => setQuickScheduleOpen(true)}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Schedule One-time Audit
            </Button>
          )}
          
          {/* View Toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'list' ? 'bg-primary rounded-none' : 'rounded-none'}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              className={viewMode === 'calendar' ? 'bg-primary rounded-none' : 'rounded-none'}
              onClick={() => setViewMode('calendar')}
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              Calendar
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
          <div className="border rounded-lg">
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
                {loading ? (
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
                        {audits.length === 0 
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
                            <p>{getEntityName(audit.entity_type, audit.entity_id)}</p>
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
        onSuccess={loadAudits}
      />

      <AssignAuditorModal
        open={assignAuditorOpen}
        onOpenChange={setAssignAuditorOpen}
        audit={selectedAudit}
        onSuccess={loadAudits}
      />

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
