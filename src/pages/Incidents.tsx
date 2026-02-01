import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { 
  AlertTriangle, 
  Search, 
  Eye, 
  Clock,
  CheckCircle,
  AlertCircle,
  FileSearch,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  getIncidentsForUser,
  getIncidentStats,
  IncidentListItem,
  IncidentStats,
  incidentTypes,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
  IncidentEntityType,
} from '@/lib/incidentStorage';

const severityColors: Record<IncidentSeverity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-blue-500 text-white',
};

const statusColors: Record<IncidentStatus, string> = {
  open: 'bg-secondary text-secondary-foreground',
  under_investigation: 'bg-blue-500 text-white',
  resolved: 'bg-green-500 text-white',
  closed: 'bg-green-700 text-white',
};

const statusLabels: Record<IncidentStatus, string> = {
  open: 'Open',
  under_investigation: 'Under Investigation',
  resolved: 'Resolved',
  closed: 'Closed',
};

const entityTypeColors: Record<IncidentEntityType, string> = {
  branch: 'bg-blue-100 text-blue-800',
  bck: 'bg-purple-100 text-purple-800',
  supplier: 'bg-amber-100 text-amber-800',
};

export default function IncidentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [stats, setStats] = useState<IncidentStats | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = () => {
    if (!user) return;
    setIsLoading(true);
    
    const incidentList = getIncidentsForUser(user.id, user.role);
    const incidentStats = getIncidentStats(user.id, user.role);
    
    setIncidents(incidentList);
    setStats(incidentStats);
    setIsLoading(false);
  };

  const canCreateIncident = user?.role && 
    ['branch_manager', 'bck_manager', 'regional_manager'].includes(user.role);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(item => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesCode = item.incident.incident_code.toLowerCase().includes(query);
        const matchesTitle = item.incident.title.toLowerCase().includes(query);
        const matchesEntity = item.entityName.toLowerCase().includes(query);
        if (!matchesCode && !matchesTitle && !matchesEntity) return false;
      }

      // Entity type filter
      if (entityTypeFilter !== 'all' && item.incident.entity_type !== entityTypeFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && item.incident.type !== typeFilter) {
        return false;
      }

      // Severity filter
      if (severityFilter !== 'all' && item.incident.severity !== severityFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && item.incident.status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [incidents, searchQuery, entityTypeFilter, typeFilter, severityFilter, statusFilter]);

  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredIncidents.slice(start, start + itemsPerPage);
  }, [filteredIncidents, currentPage]);

  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);

  const getRowClassName = (item: IncidentListItem) => {
    const classes: string[] = [];
    
    if (item.incident.severity === 'critical' && 
        ['open', 'under_investigation'].includes(item.incident.status)) {
      classes.push('bg-red-50');
    }
    
    if (item.isStale) {
      classes.push('border-l-4 border-l-orange-400');
    }
    
    return classes.join(' ');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Incidents</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incidents</h1>
        {canCreateIncident && (
          <Button onClick={() => navigate('/incidents/create')}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Report Incident
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-secondary">
                  <AlertCircle className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{stats.open}</p>
                  <p className="text-sm text-muted-foreground">Open</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100">
                  <FileSearch className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-blue-600">{stats.underInvestigation}</p>
                  <p className="text-sm text-muted-foreground">Under Investigation</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-destructive">{stats.critical}</p>
                  <p className="text-sm text-muted-foreground">Critical</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-semibold text-green-600">{stats.resolvedLast30Days}</p>
                  <p className="text-sm text-muted-foreground">Resolved (30 days)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search incidents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Entity Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="branch">Branch</SelectItem>
            <SelectItem value="bck">BCK</SelectItem>
            <SelectItem value="supplier">Supplier</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {incidentTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="under_investigation">Under Investigation</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Incidents Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedIncidents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No incidents recorded. Report one if an issue arises.
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              paginatedIncidents.map((item) => (
                <TableRow key={item.incident.id} className={getRowClassName(item)}>
                  <TableCell className="font-semibold">
                    {item.incident.incident_code}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{item.incident.title}</p>
                      <Badge variant="outline" className="mt-1 text-xs">
                        {item.incident.type}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{item.entityName}</p>
                      <Badge 
                        className={`mt-1 text-xs ${entityTypeColors[item.incident.entity_type]}`}
                      >
                        {item.incident.entity_type.toUpperCase()}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={severityColors[item.incident.severity]}>
                      {item.incident.severity.charAt(0).toUpperCase() + item.incident.severity.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.incident.category}</TableCell>
                  <TableCell>
                    {item.assignedToName || (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>
                        {formatDistanceToNow(new Date(item.incident.created_at), { addSuffix: true })}
                      </span>
                      {item.isCriticalOverdue && (
                        <Clock className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[item.incident.status]}>
                      {statusLabels[item.incident.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/incidents/${item.incident.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * itemsPerPage) + 1} to{' '}
            {Math.min(currentPage * itemsPerPage, filteredIncidents.length)} of{' '}
            {filteredIncidents.length} incidents
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
    </div>
  );
}
