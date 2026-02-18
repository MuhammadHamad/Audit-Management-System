import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useQuery } from '@tanstack/react-query';
import { fetchCAPAVerificationQueue, type CAPAVerificationQueueItem } from '@/lib/verificationSupabase';
import { formatDistanceToNow } from 'date-fns';

const ITEMS_PER_PAGE = 25;

export default function CAPAVerificationQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const canAccess = !!user && ['super_admin', 'head_of_quality', 'audit_manager'].includes(user.role);

  const queueQuery = useQuery({
    queryKey: ['capa-verification-queue', user?.id, user?.role],
    queryFn: async () => {
      if (!user) return [] as CAPAVerificationQueueItem[];
      return fetchCAPAVerificationQueue({ userId: user.id, userRole: user.role });
    },
    enabled: !!user && canAccess,
    staleTime: 30 * 1000,
  });

  const isLoading = queueQuery.isLoading;
  const items = queueQuery.data ?? [];

  const filteredItems = useMemo(() => items.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.auditCode || '').toLowerCase().includes(q) ||
      item.entityName.toLowerCase().includes(q) ||
      item.entityCode.toLowerCase().includes(q) ||
      (item.capa.capa_code || '').toLowerCase().includes(q)
    );
  }), [items, searchQuery]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">You do not have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Corrective Action Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">CAPAs with evidence uploaded by entity managers, awaiting quality verification.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by audit code, CAPA code, or entity..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending CAPA Evidence Verification</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CAPA</TableHead>
                <TableHead>Audit</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="w-[140px]">Action</TableHead>
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
              ) : paginatedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-12 w-12 text-green-500" />
                      <p className="text-muted-foreground">No CAPAs awaiting verification.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedItems.map(item => (
                  <TableRow key={item.capa.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{item.capa.capa_code}</span>
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">PENDING</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{item.auditCode || '—'}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{item.entityName}</p>
                        <p className="text-xs text-muted-foreground">{item.entityType}{item.entityCode ? ` • ${item.entityCode}` : ''}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{item.assignedToName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{item.evidenceCount} file(s)</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(item.submittedAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/audits/${item.capa.audit_id}/verify?from=capa#findings-section`)}
                      >
                        Verify
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
            <span className="text-sm">Page {currentPage} of {totalPages}</span>
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
