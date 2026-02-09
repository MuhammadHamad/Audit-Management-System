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
import { EntityImportModal } from '@/components/entities/EntityImportModal';
import { BranchModal } from '@/components/branches/BranchModal';
import { Branch } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserById, getUserByEmail } from '@/lib/userStorage';
import {
  fetchBranches,
  fetchRegions,
  fetchBranchByCode,
  fetchRegionByCode,
  createBranch,
  updateBranch,
  deleteBranch,
} from '@/lib/entitySupabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const statusFilterOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'under_renovation', label: 'Under Renovation' },
  { value: 'temporarily_closed', label: 'Temporarily Closed' },
];

export default function BranchesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';

  const queryClient = useQueryClient();
  const { data: branches = [], isLoading: isBranchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });
  const { data: regions = [], isLoading: isRegionsLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
  });

  const isLoading = isBranchesLoading || isRegionsLoading;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);

  const loadData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['branches'] }),
      queryClient.invalidateQueries({ queryKey: ['regions'] }),
    ]);
  };

  // Filter branches
  const filteredBranches = useMemo(() => {
    return branches.filter((branch) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        branch.name.toLowerCase().includes(searchLower) ||
        branch.code.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || branch.status === statusFilter;
      const matchesRegion = regionFilter === 'all' || branch.region_id === regionFilter;

      return matchesSearch && matchesStatus && matchesRegion;
    });
  }, [branches, search, statusFilter, regionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredBranches.length / PAGE_SIZE);
  const paginatedBranches = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredBranches.slice(start, start + PAGE_SIZE);
  }, [filteredBranches, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, regionFilter]);

  const handleToggleStatus = async (branch: Branch) => {
    const newStatus = branch.status === 'active' ? 'inactive' : 'active';
    try {
      await updateBranch(branch.id, { status: newStatus });
      toast.success(`Branch ${branch.name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      await loadData();
    } catch {
      toast.error('Failed to update branch status');
    }
  };

  const handleDelete = async () => {
    if (!deletingBranch) return;

    if (deletingBranch.last_audit_date) {
      toast.error('Cannot delete. This branch has audit history. Deactivate it instead.');
      setDeletingBranch(null);
      return;
    }

    try {
      await deleteBranch(deletingBranch.id);
      toast.success(`Branch ${deletingBranch.name} deleted successfully`);
      await loadData();
    } catch {
      toast.error('Failed to delete branch');
    }
    setDeletingBranch(null);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setRegionFilter('all');
  };

  const formatLastAudit = (lastAuditDate?: string): string => {
    if (!lastAuditDate) return 'Never';
    try {
      return formatDistanceToNow(new Date(lastAuditDate), { addSuffix: true });
    } catch {
      return 'Never';
    }
  };

  const showingStart = (currentPage - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, filteredBranches.length);

  // Import configuration
  const importColumns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'region_code', label: 'Region' },
    { key: 'city', label: 'City' },
    { key: 'manager_email', label: 'Manager' },
    { key: 'status', label: 'Status' },
  ];

  const validateImportRow = (row: Record<string, string>, rowIndex: number, allRows?: Record<string, string>[]) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;

    // Required: code
    if (!row.code?.trim()) {
      errors.push({ row: rowNum, message: 'Code is required', field: 'code' });
    } else {
      const code = row.code.trim().toUpperCase();
      // Check existing branches
      if (branches.some((b) => b.code.toUpperCase() === code)) {
        errors.push({ row: rowNum, message: `Code '${code}' already exists in the system`, field: 'code' });
      }
      // Check duplicates within CSV
      if (allRows) {
        const duplicates = allRows.filter((r, i) => 
          i !== rowIndex && r.code?.trim().toUpperCase() === code
        );
        if (duplicates.length > 0) {
          const dupIndices = allRows
            .map((r, i) => r.code?.trim().toUpperCase() === code ? i + 2 : -1)
            .filter(i => i > 0 && i !== rowNum);
          errors.push({ row: rowNum, message: `Duplicate code '${code}' found in rows ${dupIndices.join(', ')}`, field: 'code' });
        }
      }
    }

    // Required: name
    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
    } else if (row.name.trim().length < 3) {
      errors.push({ row: rowNum, message: 'Name must be at least 3 characters', field: 'name' });
    }

    // Required: region_code
    if (!row.region_code?.trim()) {
      errors.push({ row: rowNum, message: 'Region code is required', field: 'region_code' });
    } else if (!regions.some((r) => r.code.toUpperCase() === row.region_code.trim().toUpperCase())) {
      errors.push({ row: rowNum, message: `Region '${row.region_code}' does not exist`, field: 'region_code' });
    }

    // Required: city
    if (!row.city?.trim()) {
      errors.push({ row: rowNum, message: 'City is required', field: 'city' });
    }

    // Optional: manager_email
    if (row.manager_email?.trim()) {
      const manager = getUserByEmail(row.manager_email.trim());
      if (!manager) {
        errors.push({ row: rowNum, message: `Manager '${row.manager_email}' not found`, field: 'manager_email' });
      } else if (manager.role !== 'branch_manager') {
        errors.push({ row: rowNum, message: `User '${row.manager_email}' is not a branch_manager`, field: 'manager_email' });
      }
    }

    // Optional: status
    const validStatuses = ['active', 'inactive', 'under_renovation', 'temporarily_closed'];
    if (row.status?.trim() && !validStatuses.includes(row.status.trim().toLowerCase())) {
      errors.push({ row: rowNum, message: `Status '${row.status}' is not valid. Use: ${validStatuses.join(', ')}`, field: 'status' });
    }

    // Optional: opening_date
    if (row.opening_date?.trim()) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(row.opening_date.trim())) {
        errors.push({ row: rowNum, message: 'Opening date must be in YYYY-MM-DD format', field: 'opening_date' });
      } else {
        const date = new Date(row.opening_date.trim());
        if (isNaN(date.getTime())) {
          errors.push({ row: rowNum, message: 'Opening date is not a valid date', field: 'opening_date' });
        }
      }
    }

    return errors;
  };

  const handleImport = async (data: Record<string, string>[]) => {
    let success = 0;
    let failed = 0;

    for (const row of data) {
      try {
        const code = (row.code || '').trim();
        const regionCode = (row.region_code || '').trim();
        const city = (row.city || '').trim();
        const name = (row.name || '').trim();

        if (!code || !regionCode || !city || !name) {
          failed++;
          continue;
        }

        const existing = await fetchBranchByCode(code);
        if (existing) {
          failed++;
          continue;
        }

        const region = await fetchRegionByCode(regionCode);
        if (!region) {
          failed++;
          continue;
        }

        let managerId: string | undefined;
        if (row.manager_email?.trim()) {
          const manager = getUserByEmail(row.manager_email.trim());
          if (manager?.role === 'branch_manager') {
            managerId = manager.id;
          }
        }

        await createBranch({
          code,
          name,
          region_id: region.id,
          city,
          address: row.address?.trim() || undefined,
          manager_id: managerId,
          phone: row.phone?.trim() || undefined,
          email: row.email?.trim() || undefined,
          status: (row.status?.trim().toLowerCase() as Branch['status']) || 'active',
          opening_date: row.opening_date?.trim() || undefined,
        });
        success++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast.success(`${success} branches imported successfully`);
    } else {
      toast.warning(`${success} of ${success + failed} branches imported. ${failed} failed.`);
    }

    await loadData();
    return { success, failed };
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
            Import Branches
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Branch
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
              <TableHead>Health Score</TableHead>
              <TableHead>Last Audit</TableHead>
              <TableHead>Status</TableHead>
              {canEdit && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  {canEdit && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                </TableRow>
              ))
            ) : paginatedBranches.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 8 : 7} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No branches found. Try adjusting your filters.</p>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedBranches.map((branch) => {
                const region = regions.find((r) => r.id === branch.region_id);
                const manager = branch.manager_id ? getUserById(branch.manager_id) : null;

                return (
                  <TableRow key={branch.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-sm">{branch.code}</p>
                        <p className="text-xs text-muted-foreground">{branch.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{branch.city || '—'}</TableCell>
                    <TableCell className="text-sm">{region?.name || '—'}</TableCell>
                    <TableCell className="text-sm">
                      {manager ? manager.full_name : <span className="text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <HealthScoreIndicator score={branch.health_score} entityType="branch" size="sm" hasAudits={!!branch.last_audit_date} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatLastAudit(branch.last_audit_date)}
                    </TableCell>
                    <TableCell>
                      <EntityStatusBadge status={branch.status} />
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
                            <DropdownMenuItem onClick={() => setEditingBranch(branch)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(branch)}>
                              <Power className="mr-2 h-4 w-4" />
                              {branch.status === 'active' ? 'Deactivate' : 'Activate'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingBranch(branch)}
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
      {!isLoading && filteredBranches.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {filteredBranches.length} branches
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
      <BranchModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={loadData}
      />

      <BranchModal
        open={!!editingBranch}
        onOpenChange={(open) => !open && setEditingBranch(null)}
        onSuccess={loadData}
        branch={editingBranch}
      />

      <EntityImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={loadData}
        entityName="Branches"
        templateFileName="branches_import_template.csv"
        templateContent="code,name,region_code,city,address,manager_email,phone,email,status,opening_date\nRYD-001,King Fahd Road Branch,RYD,Riyadh,123 King Fahd Road,branchmgr@burgerizzr.sa,+966501234567,branch001@burgerizzr.sa,active,2020-01-15"
        columns={importColumns}
        validateRow={(row, index) => validateImportRow(row, index)}
        importData={handleImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingBranch} onOpenChange={(open) => !open && setDeletingBranch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Branch</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingBranch?.name}? This removes the branch and all its audit history permanently.
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
