import { useState, useMemo, useEffect } from 'react';
import { Upload, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
import { EntityImportModal } from '@/components/entities/EntityImportModal';
import { RegionModal } from '@/components/regions/RegionModal';
import { Region } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBranchCountByRegion, getBCKCountByRegion, getUserById, getUserByEmail } from '@/lib/userStorage';
import {
  fetchRegions,
  fetchRegionByCode,
  deleteRegion,
  createRegion,
} from '@/lib/entitySupabase';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const statusFilterOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function RegionsPage() {
  const queryClient = useQueryClient();
  const { data: regions = [], isLoading } = useQuery({
    queryKey: ['regions'],
    queryFn: fetchRegions,
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [deletingRegion, setDeletingRegion] = useState<Region | null>(null);

  const loadData = async () => {
    await queryClient.invalidateQueries({ queryKey: ['regions'] });
  };

  // Filter regions
  const filteredRegions = useMemo(() => {
    return regions.filter((region) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        region.name.toLowerCase().includes(searchLower) ||
        region.code.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || region.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [regions, search, statusFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredRegions.length / PAGE_SIZE);
  const paginatedRegions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRegions.slice(start, start + PAGE_SIZE);
  }, [filteredRegions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const handleDelete = async () => {
    if (!deletingRegion) return;

    try {
      await deleteRegion(deletingRegion.id);
      toast.success(`Region ${deletingRegion.name} deleted successfully`);
      await loadData();
    } catch {
      toast.error('Failed to delete region');
    }
    setDeletingRegion(null);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  const showingStart = (currentPage - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, filteredRegions.length);

  // Import validation and columns
  const importColumns = [
    { key: 'name', label: 'Name' },
    { key: 'code', label: 'Code' },
    { key: 'description', label: 'Description' },
    { key: 'manager_email', label: 'Manager Email' },
  ];

  const validateImportRow = (row: Record<string, string>, rowIndex: number) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
    }

    if (!row.code?.trim()) {
      errors.push({ row: rowNum, message: 'Code is required', field: 'code' });
    } else if (row.code.length > 5) {
      errors.push({ row: rowNum, message: 'Code must be 5 characters or less', field: 'code' });
    }

    if (row.manager_email?.trim()) {
      const manager = getUserByEmail(row.manager_email);
      if (!manager) {
        errors.push({ row: rowNum, message: `Manager email '${row.manager_email}' not found`, field: 'manager_email' });
      } else if (manager.role !== 'regional_manager') {
        errors.push({ row: rowNum, message: `User '${row.manager_email}' is not a regional manager`, field: 'manager_email' });
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
        if (!code) {
          failed++;
          continue;
        }

        const existing = await fetchRegionByCode(code);
        if (existing) {
          failed++;
          continue;
        }

        let managerId: string | undefined;
        if (row.manager_email?.trim()) {
          const manager = getUserByEmail(row.manager_email.trim());
          if (manager?.role === 'regional_manager') {
            managerId = manager.id;
          }
        }

        await createRegion({
          name: row.name,
          code,
          description: row.description || undefined,
          manager_id: managerId,
        });
        success++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast.success(`${success} regions imported successfully`);
    } else {
      toast.warning(`${success} of ${success + failed} regions imported. ${failed} failed.`);
    }

    await loadData();
    return { success, failed };
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex items-center justify-end gap-3">
        <Button
          variant="outline"
          className="border-primary text-primary hover:bg-primary/5"
          onClick={() => setShowImportModal(true)}
        >
          <Upload className="mr-2 h-4 w-4" />
          Import Regions
        </Button>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Region
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by name or code..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[280px]"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
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
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Branches</TableHead>
              <TableHead>BCKs</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-8" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-8 w-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : paginatedRegions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No regions found. Try adjusting your filters.</p>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedRegions.map((region) => {
                const manager = region.manager_id ? getUserById(region.manager_id) : null;
                const branchCount = getBranchCountByRegion(region.id);
                const bckCount = getBCKCountByRegion(region.id);

                return (
                  <TableRow key={region.id}>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-sm">{region.name}</p>
                        <p className="text-xs text-muted-foreground">{region.code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {manager ? manager.full_name : <span className="text-muted-foreground">Unassigned</span>}
                    </TableCell>
                    <TableCell className="text-sm">{branchCount}</TableCell>
                    <TableCell className="text-sm">{bckCount}</TableCell>
                    <TableCell>
                      <EntityStatusBadge status={region.status} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingRegion(region)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingRegion(region)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
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
      {!isLoading && filteredRegions.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {filteredRegions.length} regions
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
      <RegionModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={loadData}
      />

      <RegionModal
        open={!!editingRegion}
        onOpenChange={(open) => !open && setEditingRegion(null)}
        onSuccess={loadData}
        region={editingRegion}
      />

      <EntityImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={loadData}
        entityName="Regions"
        templateFileName="regions_import_template.csv"
        templateContent="name,code,description,manager_email\nRiyadh Region,RYD,Central Saudi Arabia,regionalmgr@burgerizzr.sa"
        columns={importColumns}
        validateRow={validateImportRow}
        importData={handleImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingRegion} onOpenChange={(open) => !open && setDeletingRegion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Region</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingRegion?.name} region? This will NOT delete branches or BCKs inside it.
              They will become unassigned.
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
