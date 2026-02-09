import { useState, useEffect, useMemo } from 'react';
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
import { BCK } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getUserById, getUserByEmail } from '@/lib/userStorage';
import {
  fetchBCKs,
  fetchRegions,
  fetchBranches,
  fetchBCKByCode,
  fetchRegionByCode,
  createBCK,
  updateBCK,
  deleteBCK,
} from '@/lib/entitySupabase';
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

  const queryClient = useQueryClient();
  const { data: bcks = [], isLoading: isBCKsLoading } = useQuery({
    queryKey: ['bcks'],
    queryFn: fetchBCKs,
  });
  const { data: regions = [], isLoading: isRegionsLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
  });
  const { data: branches = [], isLoading: isBranchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });

  const isLoading = isBCKsLoading || isRegionsLoading || isBranchesLoading;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBCK, setEditingBCK] = useState<BCK | null>(null);
  const [deletingBCK, setDeletingBCK] = useState<BCK | null>(null);

  const loadData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bcks'] }),
      queryClient.invalidateQueries({ queryKey: ['regions'] }),
      queryClient.invalidateQueries({ queryKey: ['branches'] }),
    ]);
  };

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

  const handleToggleStatus = async (bck: BCK) => {
    const newStatus = bck.status === 'active' ? 'inactive' : 'active';
    try {
      await updateBCK(bck.id, { status: newStatus });
      toast.success(`BCK ${bck.name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      await loadData();
    } catch {
      toast.error('Failed to update BCK status');
    }
  };

  const handleDelete = async () => {
    if (!deletingBCK) return;

    if (deletingBCK.last_audit_date) {
      toast.error('Cannot delete. This BCK has audit history. Deactivate it instead.');
      setDeletingBCK(null);
      return;
    }

    try {
      await deleteBCK(deletingBCK.id);
      toast.success(`BCK ${deletingBCK.name} deleted successfully`);
      await loadData();
    } catch {
      toast.error('Failed to delete BCK');
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
    { key: 'region_code', label: 'Region' },
    { key: 'city', label: 'City' },
    { key: 'production_capacity', label: 'Capacity' },
    { key: 'status', label: 'Status' },
  ];

  // Helper to parse certifications string "HACCP:2026-12-31,ISO22000:2027-06-15"
  const parseCertifications = (certStr: string): { name: string; expiry_date: string }[] | null => {
    if (!certStr?.trim()) return [];
    const certs: { name: string; expiry_date: string }[] = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    for (const cert of certStr.split(',')) {
      const parts = cert.trim().split(':');
      if (parts.length !== 2) return null;
      const [name, date] = parts;
      if (!name.trim() || !dateRegex.test(date.trim())) return null;
      certs.push({ name: name.trim(), expiry_date: date.trim() });
    }
    return certs;
  };

  // Helper to validate branch codes
  const validateBranchCodes = (codesStr: string): { valid: boolean; invalidCodes: string[] } => {
    if (!codesStr?.trim()) return { valid: true, invalidCodes: [] };
    const invalidCodes: string[] = [];
    for (const code of codesStr.split(',')) {
      const trimmedCode = code.trim();
      if (trimmedCode && !branches.some((b) => b.code.toUpperCase() === trimmedCode.toUpperCase())) {
        invalidCodes.push(trimmedCode);
      }
    }
    return { valid: invalidCodes.length === 0, invalidCodes };
  };

  const validateImportRow = (row: Record<string, string>, rowIndex: number, allRows?: Record<string, string>[]) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;

    // Required: code
    if (!row.code?.trim()) {
      errors.push({ row: rowNum, message: 'Code is required', field: 'code' });
    } else {
      const code = row.code.trim().toUpperCase();
      if (bcks.some((b) => b.code.toUpperCase() === code)) {
        errors.push({ row: rowNum, message: `Code '${code}' already exists in the system`, field: 'code' });
      }
      // Check duplicates within CSV
      if (allRows) {
        const duplicates = allRows.filter((r, i) => 
          i !== rowIndex && r.code?.trim().toUpperCase() === code
        );
        if (duplicates.length > 0) {
          errors.push({ row: rowNum, message: `Duplicate code '${code}' within this file`, field: 'code' });
        }
      }
    }

    // Required: name
    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
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
      } else if (manager.role !== 'bck_manager') {
        errors.push({ row: rowNum, message: `User '${row.manager_email}' is not a bck_manager`, field: 'manager_email' });
      }
    }

    // Optional: production_capacity - must be positive number if provided
    if (row.production_capacity?.trim()) {
      const capacity = parseInt(row.production_capacity.trim(), 10);
      if (isNaN(capacity) || capacity <= 0) {
        errors.push({ row: rowNum, message: 'Production capacity must be a positive number (kg/day)', field: 'production_capacity' });
      }
    }

    // Optional: supplies_branch_codes
    if (row.supplies_branch_codes?.trim()) {
      const { valid, invalidCodes } = validateBranchCodes(row.supplies_branch_codes);
      if (!valid) {
        errors.push({ row: rowNum, message: `Branch codes not found: ${invalidCodes.join(', ')}`, field: 'supplies_branch_codes' });
      }
    }

    // Optional: certifications
    if (row.certifications?.trim()) {
      const certs = parseCertifications(row.certifications);
      if (certs === null) {
        errors.push({ row: rowNum, message: "Certification format invalid. Use 'Name:YYYY-MM-DD'", field: 'certifications' });
      }
    }

    // Optional: status
    const validStatuses = ['active', 'inactive', 'under_maintenance'];
    if (row.status?.trim() && !validStatuses.includes(row.status.trim().toLowerCase())) {
      errors.push({ row: rowNum, message: `Status '${row.status}' is not valid. Use: ${validStatuses.join(', ')}`, field: 'status' });
    }

    return errors;
  };

  const handleImport = async (data: Record<string, string>[]) => {
    let success = 0;
    let failed = 0;

    const branchCodeToId = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));

    for (const row of data) {
      try {
        const code = (row.code || '').trim();
        const name = (row.name || '').trim();
        const regionCode = (row.region_code || '').trim();
        const city = (row.city || '').trim();

        if (!code || !name || !regionCode || !city) {
          failed++;
          continue;
        }

        const existing = await fetchBCKByCode(code);
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
          if (manager?.role === 'bck_manager') managerId = manager.id;
        }

        const suppliesBranchIds: string[] = [];
        if (row.supplies_branch_codes?.trim()) {
          for (const c of row.supplies_branch_codes.split(',')) {
            const trimmed = c.trim();
            if (!trimmed) continue;
            const id = branchCodeToId.get(trimmed.toUpperCase());
            if (id) suppliesBranchIds.push(id);
          }
        }

        const certifications = row.certifications?.trim() ? (parseCertifications(row.certifications.trim()) ?? []) : [];
        if (row.certifications?.trim() && certifications === null) {
          failed++;
          continue;
        }

        await createBCK({
          code,
          name,
          region_id: region.id,
          city,
          address: row.address?.trim() || undefined,
          manager_id: managerId,
          phone: row.phone?.trim() || undefined,
          email: row.email?.trim() || undefined,
          production_capacity: row.production_capacity?.trim() || undefined,
          supplies_branches: suppliesBranchIds,
          certifications: certifications as any,
          status: (row.status?.trim().toLowerCase() as BCK['status']) || 'active',
        });

        success++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast.success(`${success} BCKs imported successfully`);
    } else {
      toast.warning(`${success} of ${success + failed} BCKs imported. ${failed} failed.`);
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
                const region = regions.find((r) => r.id === bck.region_id);
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
        templateContent={`code,name,region_code,city,address,manager_email,phone,email,production_capacity,supplies_branch_codes,certifications,status\nBCK-RYD-01,Riyadh Central Kitchen,RYD,Riyadh,456 Industrial St,bckmanager@burgerizzr.sa,+966502222222,bck01@burgerizzr.sa,5000,"RYD-001,RYD-002","HACCP:2026-12-31,ISO22000:2027-06-15",active`}
        columns={importColumns}
        validateRow={(row, index) => validateImportRow(row, index)}
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
