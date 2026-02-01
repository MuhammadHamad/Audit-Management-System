import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  ClipboardCheck, 
  AlertTriangle, 
  Clock,
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
  getVerificationQueue, 
  VerificationQueueItem 
} from '@/lib/verificationStorage';
import { formatDistanceToNow } from 'date-fns';

const ITEMS_PER_PAGE = 25;

export default function VerificationQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [queueItems, setQueueItems] = useState<VerificationQueueItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (user) {
      loadQueue();
    }
  }, [user]);

  const loadQueue = () => {
    setIsLoading(true);
    try {
      const items = getVerificationQueue(user!.id, user!.role);
      setQueueItems(items);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter items
  const filteredItems = queueItems.filter(item => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !item.audit.audit_code.toLowerCase().includes(query) &&
        !item.entityName.toLowerCase().includes(query) &&
        !item.entityCode.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Entity type filter
    if (entityTypeFilter !== 'all' && item.audit.entity_type !== entityTypeFilter) {
      return false;
    }

    // Priority filter
    if (priorityFilter === 'critical' && item.criticalFindingsCount === 0) {
      return false;
    }
    if (priorityFilter === 'overdue' && !item.hasOverdueCapa) {
      return false;
    }
    if (priorityFilter === 'evidence_complete') {
      // All CAPA have evidence uploaded
      // This is a simplification - in full implementation we'd check each CAPA
      if (item.capaPending > 0) return false;
    }

    return true;
  });

  // Stats
  const stats = {
    pending: queueItems.length,
    critical: queueItems.filter(i => i.criticalFindingsCount > 0).length,
    overdue: queueItems.filter(i => i.hasOverdueCapa).length,
  };

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Entity type options based on role
  const entityTypeOptions = user?.role === 'regional_manager'
    ? [
        { value: 'all', label: 'All Entity Types' },
        { value: 'branch', label: 'Branch' },
        { value: 'bck', label: 'BCK' },
      ]
    : [
        { value: 'all', label: 'All Entity Types' },
        { value: 'branch', label: 'Branch' },
        { value: 'bck', label: 'BCK' },
        { value: 'supplier', label: 'Supplier' },
      ];

  const getScoreColor = (score: number | undefined) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getEntityTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      branch: 'bg-gray-100 text-gray-800',
      bck: 'bg-purple-100 text-purple-800',
      supplier: 'bg-blue-100 text-blue-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (!user || !['super_admin', 'audit_manager', 'regional_manager'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Audits awaiting verification</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Findings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">Audits with critical issues</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Audits with overdue CAPA</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by audit code or entity..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Entity Types" />
          </SelectTrigger>
          <SelectContent>
            {entityTypeOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="critical">Has Critical Findings</SelectItem>
            <SelectItem value="overdue">Has Overdue CAPA</SelectItem>
            <SelectItem value="evidence_complete">All CAPA Evidence Uploaded</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Audit Code</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Audit Score</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>CAPA Status</TableHead>
                <TableHead>Submitted</TableHead>
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
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <ClipboardCheck className="h-12 w-12 text-green-500" />
                      <p className="text-muted-foreground">Nothing to review. All audits are up to date.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map((item) => (
                  <TableRow 
                    key={item.audit.id}
                    className={
                      item.hasOverdueCapa 
                        ? 'border-l-4 border-l-red-500' 
                        : item.criticalFindingsCount > 0 
                          ? 'border-l-4 border-l-orange-500' 
                          : ''
                    }
                  >
                    <TableCell className="font-semibold">
                      {item.audit.audit_code}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{item.entityName}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={getEntityTypeBadge(item.audit.entity_type)}>
                            {item.audit.entity_type.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{item.auditorName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${getScoreColor(item.audit.score)}`}>
                          {item.audit.score?.toFixed(1) || '—'}
                        </span>
                        {item.audit.pass_fail && (
                          <Badge variant={item.audit.pass_fail === 'pass' ? 'default' : 'destructive'}>
                            {item.audit.pass_fail.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{item.findingsCount}</span>
                        {item.criticalFindingsCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {item.criticalFindingsCount} critical
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="text-green-600">{item.capaClosed} closed</span>
                        <span className="text-muted-foreground">, </span>
                        <span className="text-yellow-600">{item.capaPending} pending</span>
                        {item.hasOverdueCapa && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/audits/${item.audit.id}/verify`)}
                      >
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {filteredItems.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} of{' '}
            {filteredItems.length} results
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

      {filteredItems.length > 50 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing 50 of {filteredItems.length}. Complete some reviews to see more.
        </p>
      )}
    </div>
  );
}
