import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '@/contexts/AuthContext';
import { 
  getCAPAsForUser, 
  getStaffTasksForUser,
  getCAPAStats,
  runEscalationCheck,
  CAPAListItem,
  StaffTaskItem
} from '@/lib/capaStorage';
import { format } from 'date-fns';

const ITEMS_PER_PAGE = 25;

export default function CAPAPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [capaItems, setCAPAItems] = useState<CAPAListItem[]>([]);
  const [staffTasks, setStaffTasks] = useState<StaffTaskItem[]>([]);
  const [stats, setStats] = useState({ open: 0, overdue: 0, pendingVerification: 0, escalated: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const isStaff = user?.role === 'staff';
  const isManager = ['branch_manager', 'bck_manager', 'audit_manager'].includes(user?.role || '');
  const isReadOnly = ['regional_manager', 'super_admin'].includes(user?.role || '');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = () => {
    setIsLoading(true);
    try {
      // Run escalation check
      runEscalationCheck(user!.id, user!.role);

      if (isStaff) {
        const tasks = getStaffTasksForUser(user!.id);
        setStaffTasks(tasks);
      } else {
        const items = getCAPAsForUser(user!.id, user!.role);
        setCAPAItems(items);
        
        if (isManager) {
          const capaStats = getCAPAStats(user!.id, user!.role);
          setStats(capaStats);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Filter items for managers
  const filteredCAPAItems = capaItems.filter(item => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !item.capa.capa_code.toLowerCase().includes(query) &&
        !item.finding?.description.toLowerCase().includes(query) &&
        !item.entityName.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'all' && item.capa.status !== statusFilter) {
      return false;
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
  const totalItems = isStaff ? filteredStaffTasks.length : filteredCAPAItems.length;
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
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200',
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
      escalated: 'bg-red-100 text-red-800',
      closed: 'bg-green-100 text-green-800',
      pending: 'bg-gray-100 text-gray-800',
      completed: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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
      return 'border-l-4 border-l-red-500 bg-orange-50';
    }
    if (item.capa.status === 'rejected') {
      return 'bg-orange-50';
    }
    if (item.isOverdue) {
      return 'bg-red-50';
    }
    return '';
  };

  const getStaffRowClass = (task: StaffTaskItem) => {
    if (task.isOverdue) {
      return 'bg-red-50';
    }
    return '';
  };

  const managerStatusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'pending_verification', label: 'Pending Verification' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'escalated', label: 'Escalated' },
    { value: 'closed', label: 'Closed' },
  ];

  const staffStatusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'completed', label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards (Managers Only) */}
      {isManager && (
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

          {user?.role === 'audit_manager' && (
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
            placeholder={isStaff ? "Search tasks..." : "Search CAPA..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {(isStaff ? staffStatusOptions : managerStatusOptions).map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isStaff && (
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
          {isStaff ? (
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
                          onClick={() => navigate(`/capa/${task.capaId}`)}
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
                  <TableHead>Sub-tasks</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
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
                ) : paginatedCAPAItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
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
                            {item.finding?.description || 'No description'}
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
                        <div className={item.isOverdue ? 'text-red-600' : ''}>
                          {format(new Date(item.capa.due_date), 'MMM d, yyyy')}
                          {item.isOverdue && (
                            <div className="text-xs text-red-600">Overdue</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(item.capa.status)}>
                          {item.capa.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {item.subTaskProgress.total > 0 ? (
                          <span className="text-sm">
                            {item.subTaskProgress.completed} of {item.subTaskProgress.total} complete
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/capa/${item.capa.id}`)}
                        >
                          View
                        </Button>
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
