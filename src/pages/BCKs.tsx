import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Upload, Plus, MoreHorizontal, Pencil, Trash2, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';
import { EntityStatusBadge } from '@/components/entities/EntityStatusBadge';
import { HealthScoreIndicator } from '@/components/entities/HealthScoreIndicator';
import { CertificationBadge } from '@/components/entities/CertificationBadge';
import { EntityImportModal } from '@/components/entities/EntityImportModal';
import { BCKModal } from '@/components/bcks/BCKModal';
import { BCK, Region } from '@/types';
import {
  getBCKs,
  getRegions,
  deleteBCK,
  updateBCK,
  getBCKByCode,
  getRegionById,
  getRegionByCode,
  getUserById,
  getUserByEmail,
  importBCKs,
} from '@/lib/entityStorage';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const statusFilterOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'under_maintenance', label: 'Under Maintenance' },
];

export default function BCKsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';

  const [bcks, setBCKs] = useState<BCK[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBCK, setEditingBCK] = useState<BCK | null>(null);
  const [deletingBCK, setDeletingBCK] = useState<BCK | null>(null);

  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      setBCKs(getBCKs());
      setRegions(getRegions());
      setIsLoading(false);
    }, 300);
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter BCKs
  const filteredBCKs = useMemo(() => {
    return bcks.filter((bck) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        bck.name.toLowerCase().includes(searchLower) ||
        bck.code.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || bck.status === statusFilter;
      const matchesRegion = regionFilter === 'all' || bck.region_id === regionFilter;

      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [bcks, search, statusFilter, regionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredBCKs.length / PAGE_SIZE);
  const paginatedBCKs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBCKs.slice(start, start + PAGE_SIZE);
  }, [filteredBCKs, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, regionFilter]);

  const handleToggleStatus = (bck: BCK) => {
    const newStatus = bck.status === 'active' ? 'inactive' : 'active';
    updateBCK(bck.id, { status: newStatus });
    toast.success(`BCK ${bck.name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    loadData();
  };

  const handleDelete = () => {
    if (!deletingBCK) return;

    const result = deleteBCK(deletingBCK.id);
    if (result.success) {
      toast.success(`BCK ${deletingBCK.name} deleted successfully`);
      loadData();
    } else {
      toast.error(result.error);
    }
    setDeletingBCK(null);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setRegionFilter('all');
  };

  const showingStart = (currentPage - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, filteredBCKs.length);

  // Import configuration
  const importColumns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'region_code', label: 'Region Code' },
    { key: 'city', label: 'City' },
    { key: 'status', label: 'Status' },
  ];

  const validateImportRow = (row: Record<string, string>, rowIndex: number) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;

    if (!row.code?.trim()) {
      errors.push({ row: rowNum, message: 'Code is required', field: 'code' });
    } else if (getBCKByCode(row.code)) {
      errors.push({ row: rowNum, message: `Code '${row.code}' already exists`, field: 'code' });
    }

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
    }

    if (!row.region_code?.trim()) {
      errors.push({ row: rowNum, message: 'Region code is required', field: 'region_code' });
    } else if (!getRegionByCode(row.region_code)) {
      errors.push({ row: rowNum, message: `Region '${row.region_code}' does not exist`, field: 'region_code' });
    }

    if (row.manager_email?.trim()) {
      const manager = getUserByEmail(row.manager_email);
      if (!manager) {
        errors.push({ row: rowNum, message: `Manager email '${row.manager_email}' not found`, field: 'manager_email' });
      } else if (manager.role !== 'bck_manager') {
        errors.push({ row: rowNum, message: `User '${row.manager_email}' is not a BCK manager`, field: 'manager_email' });
      }
    }

    return errors;
  };

  const handleImport = (data: Record<string, string>[]) => {
    const result = importBCKs(
      data.map((row) => ({
        code: row.code,
        name: row.name,
        region_code: row.region_code,
        city: row.city,
        address: row.address,
        manager_email: row.manager_email,
        production_capacity: row.production_capacity,
        status: row.status,
      }))
    );

    if (result.failed === 0) {
      toast.success(`${result.success} BCKs imported successfully`);
    } else {
      toast.warning(`${result.success} of ${result.success + result.failed} BCKs imported. ${result.failed} failed.`);
    }

    return result;
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            className="border-primary text-primary hover:bg-primary/5"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import BCKs
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add BCK
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[280px]"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Regions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map((region) => (
              <SelectItem key={region.id} value={region.id}>
                {region.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Region</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Supplies</TableHead>
              <TableHead>Health Score</TableHead>
              <TableHead>Certifications</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  {canEdit && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                </TableRow>
              ))
            ) : paginatedBCKs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 9 : 8} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No BCKs found. Try adjusting your filters.</p>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedBCKs.map((bck) => {
                const region = getRegionById(bck.region_id);
                const manager = bck.manager_id ? getUserById(bck.manager_id) : null;

                return (
                  <TableRow key={bck.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-sm">{bck.code}</p>
                        <p className="text-xs text-muted-foreground">{bck.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{bck.city || '—'}</TableCell>
                    <TableCell className="text-sm">{region?.name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {manager ? manager.full_name : <span className="text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {bck.supplies_branches.length} branches
                    </TableCell>
                    <TableCell>
                      <HealthScoreIndicator score={bck.health_score} entityType="bck" size="sm" hasAudits={!!bck.last_audit_date} />
                    </TableCell>
                    <TableCell>
                      <CertificationBadge certifications={bck.certifications} />
                    </TableCell>
                    <TableCell>
                      <EntityStatusBadge status={bck.status} />
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingBCK(bck)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(bck)}>
                              <Power className="mr-2 h-4 w-4" />
                              {bck.status === 'active' ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingBCK(bck)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && filteredBCKs.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {filteredBCKs.length} BCKs
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => p + 1)}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modals */}
      <BCKModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={loadData}
      />

      <BCKModal
        open={!!editingBCK}
        onOpenChange={(open) => !open && setEditingBCK(null)}
        onSuccess={loadData}
        bck={editingBCK}
      />

      <EntityImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={loadData}
        entityName="BCKs"
        templateFileName="bcks_import_template.csv"
        templateContent="code,name,region_code,city,address,manager_email,production_capacity,status\nBCK-RYD-01,Riyadh Central Kitchen,RYD,Riyadh,456 Industrial Road,bckmanager@burgerizzr.sa,500 meals/day,active"
        columns={importColumns}
        validateRow={validateImportRow}
        importData={handleImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBCK} onOpenChange={(open) => !open && setDeletingBCK(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete BCK</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingBCK?.name}? This removes the BCK and all its audit history permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
