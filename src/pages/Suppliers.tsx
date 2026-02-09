import { useState, useEffect, useMemo } from 'react';
import { Upload, Plus, MoreHorizontal, Pencil, Trash2, Ban, Power } from 'lucide-react';
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
import { QualityScoreBadge } from '@/components/entities/HealthScoreIndicator';
import { CertificationBadge } from '@/components/entities/CertificationBadge';
import { SupplierTypeBadge } from '@/components/entities/SupplierTypeBadge';
import { RiskLevelBadge } from '@/components/entities/RiskLevelBadge';
import { EntityImportModal } from '@/components/entities/EntityImportModal';
import { SupplierModal } from '@/components/suppliers/SupplierModal';
import { Supplier } from '@/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchSuppliers,
  fetchSupplierByCode,
  fetchBCKs,
  fetchBranches,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '@/lib/entitySupabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const PAGE_SIZE = 25;

const statusFilterOptions = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'blacklisted', label: 'Blacklisted' },
];

const typeFilterOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'food', label: 'Food' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'service', label: 'Service' },
];

const riskFilterOptions = [
  { value: 'all', label: 'All Risk Levels' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function SuppliersPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin';

  const queryClient = useQueryClient();
  const { data: suppliers = [], isLoading: isSuppliersLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
  });
  const { data: bcks = [], isLoading: isBCKsLoading } = useQuery({
    queryKey: ['bcks'],
    queryFn: fetchBCKs,
  });
  const { data: branches = [], isLoading: isBranchesLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: fetchBranches,
  });

  const isLoading = isSuppliersLoading || isBCKsLoading || isBranchesLoading;
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<Supplier | null>(null);
  const [suspendingSupplier, setSuspendingSupplier] = useState<Supplier | null>(null);

  const loadData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
      queryClient.invalidateQueries({ queryKey: ['bcks'] }),
      queryClient.invalidateQueries({ queryKey: ['branches'] }),
    ]);
  };

  // Filter suppliers
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((supplier) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        supplier.name.toLowerCase().includes(searchLower) ||
        supplier.supplier_code.toLowerCase().includes(searchLower);

      const matchesStatus = statusFilter === 'all' || supplier.status === statusFilter;
      const matchesType = typeFilter === 'all' || supplier.type === typeFilter;
      const matchesRisk = riskFilter === 'all' || supplier.risk_level === riskFilter;

      return matchesSearch && matchesStatus && matchesType && matchesRisk;
    });
  }, [suppliers, search, statusFilter, typeFilter, riskFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredSuppliers.length / PAGE_SIZE);
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredSuppliers.slice(start, start + PAGE_SIZE);
  }, [filteredSuppliers, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, typeFilter, riskFilter]);

  const handleSuspend = async () => {
    if (!suspendingSupplier) return;
    try {
      await updateSupplier(suspendingSupplier.id, { status: 'suspended' });
      toast.success(`Supplier ${suspendingSupplier.name} suspended`);
      await loadData();
    } catch {
      toast.error('Failed to suspend supplier');
    } finally {
      setSuspendingSupplier(null);
    }
  };

  const handleActivate = async (supplier: Supplier) => {
    try {
      await updateSupplier(supplier.id, { status: 'active' });
      toast.success(`Supplier ${supplier.name} activated`);
      await loadData();
    } catch {
      toast.error('Failed to activate supplier');
    }
  };

  const handleDelete = async () => {
    if (!deletingSupplier) return;

    if (deletingSupplier.last_audit_date) {
      toast.error('Cannot delete. This supplier has audit history. Deactivate it instead.');
      setDeletingSupplier(null);
      return;
    }

    try {
      await deleteSupplier(deletingSupplier.id);
      toast.success(`Supplier ${deletingSupplier.name} deleted successfully`);
      await loadData();
    } catch {
      toast.error('Failed to delete supplier');
    }
    setDeletingSupplier(null);
  };

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
    setRiskFilter('all');
  };

  const showingStart = (currentPage - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(currentPage * PAGE_SIZE, filteredSuppliers.length);

  // Import configuration
  const importColumns = [
    { key: 'code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'risk_level', label: 'Risk' },
    { key: 'contact_email', label: 'Contact' },
    { key: 'status', label: 'Status' },
  ];

  // Helper to parse certifications string "HACCP:2026-12-31,Halal:2027-01-31"
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

  const validateImportRow = (row: Record<string, string>, rowIndex: number, allRows?: Record<string, string>[]) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;
    const code = row.code?.trim() || row.supplier_code?.trim();

    // Required: code
    if (!code) {
      errors.push({ row: rowNum, message: 'Supplier code is required', field: 'code' });
    } else {
      const upperCode = code.toUpperCase();
      if (suppliers.some((s) => s.supplier_code.toUpperCase() === upperCode)) {
        errors.push({ row: rowNum, message: `Code '${upperCode}' already exists in the system`, field: 'code' });
      }
      // Check duplicates within CSV
      if (allRows) {
        const duplicates = allRows.filter((r, i) => {
          const otherCode = r.code?.trim() || r.supplier_code?.trim();
          return i !== rowIndex && otherCode?.toUpperCase() === upperCode;
        });
        if (duplicates.length > 0) {
          errors.push({ row: rowNum, message: `Duplicate code '${upperCode}' within this file`, field: 'code' });
        }
      }
    }

    // Required: name
    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
    }

    // Required: type
    const validTypes = ['food', 'packaging', 'equipment', 'service'];
    if (!row.type?.trim()) {
      errors.push({ row: rowNum, message: 'Type is required', field: 'type' });
    } else if (!validTypes.includes(row.type.trim().toLowerCase())) {
      errors.push({ row: rowNum, message: `Type '${row.type}' is not valid. Use: ${validTypes.join(', ')}`, field: 'type' });
    }

    // Required: risk_level
    const validRiskLevels = ['low', 'medium', 'high'];
    if (!row.risk_level?.trim()) {
      errors.push({ row: rowNum, message: 'Risk level is required', field: 'risk_level' });
    } else if (!validRiskLevels.includes(row.risk_level.trim().toLowerCase())) {
      errors.push({ row: rowNum, message: `Risk level '${row.risk_level}' is not valid. Use: ${validRiskLevels.join(', ')}`, field: 'risk_level' });
    }

    // Optional: contact_email - validate format
    if (row.contact_email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(row.contact_email.trim())) {
        errors.push({ row: rowNum, message: 'Contact email format is invalid', field: 'contact_email' });
      }
    }

    // Optional: contract_start and contract_end
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (row.contract_start?.trim()) {
      if (!dateRegex.test(row.contract_start.trim())) {
        errors.push({ row: rowNum, message: 'Contract start must be in YYYY-MM-DD format', field: 'contract_start' });
      }
    }
    if (row.contract_end?.trim()) {
      if (!dateRegex.test(row.contract_end.trim())) {
        errors.push({ row: rowNum, message: 'Contract end must be in YYYY-MM-DD format', field: 'contract_end' });
      }
    }
    if (row.contract_start?.trim() && row.contract_end?.trim()) {
      const start = new Date(row.contract_start.trim());
      const end = new Date(row.contract_end.trim());
      if (end <= start) {
        errors.push({ row: rowNum, message: 'Contract end date must be after start date', field: 'contract_end' });
      }
    }

    // Optional: supplies_to_bck_codes
    if (row.supplies_to_bck_codes?.trim()) {
      const codes = row.supplies_to_bck_codes.split(',').map(c => c.trim()).filter(Boolean);
      const invalidCodes = codes.filter(c => !bcks.some((b) => b.code.toUpperCase() === c.toUpperCase()));
      if (invalidCodes.length > 0) {
        errors.push({ row: rowNum, message: `BCK codes not found: ${invalidCodes.join(', ')}`, field: 'supplies_to_bck_codes' });
      }
    }

    // Optional: supplies_to_branch_codes
    if (row.supplies_to_branch_codes?.trim()) {
      const codes = row.supplies_to_branch_codes.split(',').map(c => c.trim()).filter(Boolean);
      const invalidCodes = codes.filter(c => !branches.some((b) => b.code.toUpperCase() === c.toUpperCase()));
      if (invalidCodes.length > 0) {
        errors.push({ row: rowNum, message: `Branch codes not found: ${invalidCodes.join(', ')}`, field: 'supplies_to_branch_codes' });
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
    const validStatuses = ['active', 'inactive', 'under_review', 'suspended', 'blacklisted'];
    if (row.status?.trim() && !validStatuses.includes(row.status.trim().toLowerCase())) {
      errors.push({ row: rowNum, message: `Status '${row.status}' is not valid. Use: ${validStatuses.join(', ')}`, field: 'status' });
    }

    return errors;
  };

  const handleImport = async (data: Record<string, string>[]) => {
    let success = 0;
    let failed = 0;

    const bckCodeToId = new Map(bcks.map((b) => [b.code.toUpperCase(), b.id]));
    const branchCodeToId = new Map(branches.map((b) => [b.code.toUpperCase(), b.id]));

    for (const row of data) {
      try {
        const supplierCode = ((row.code || row.supplier_code) ?? '').trim();
        const name = (row.name ?? '').trim();
        const type = (row.type ?? '').trim().toLowerCase() as Supplier['type'];
        const riskLevel = (row.risk_level ?? '').trim().toLowerCase() as Supplier['risk_level'];

        if (!supplierCode || !name || !type || !riskLevel) {
          failed++;
          continue;
        }

        const existing = await fetchSupplierByCode(supplierCode);
        if (existing) {
          failed++;
          continue;
        }

        const suppliesToBckIds: string[] = [];
        if (row.supplies_to_bck_codes?.trim()) {
          for (const c of row.supplies_to_bck_codes.split(',')) {
            const trimmed = c.trim();
            if (!trimmed) continue;
            const id = bckCodeToId.get(trimmed.toUpperCase());
            if (id) suppliesToBckIds.push(id);
          }
        }

        const suppliesToBranchIds: string[] = [];
        if (row.supplies_to_branch_codes?.trim()) {
          for (const c of row.supplies_to_branch_codes.split(',')) {
            const trimmed = c.trim();
            if (!trimmed) continue;
            const id = branchCodeToId.get(trimmed.toUpperCase());
            if (id) suppliesToBranchIds.push(id);
          }
        }

        const certifications = row.certifications?.trim() ? (parseCertifications(row.certifications.trim()) ?? []) : [];
        if (row.certifications?.trim() && certifications === null) {
          failed++;
          continue;
        }

        await createSupplier({
          supplier_code: supplierCode,
          name,
          type,
          category: row.category?.trim() || undefined,
          risk_level: riskLevel,
          contact_name: row.contact_name?.trim() || '',
          contact_phone: row.contact_phone?.trim() || undefined,
          contact_email: row.contact_email?.trim() || undefined,
          address: row.address?.trim() || undefined,
          city: row.city?.trim() || undefined,
          registration_number: row.registration_number?.trim() || undefined,
          contract_start: row.contract_start?.trim() || undefined,
          contract_end: row.contract_end?.trim() || undefined,
          supplies_to: { bcks: suppliesToBckIds, branches: suppliesToBranchIds },
          certifications: certifications as any,
          status: (row.status?.trim().toLowerCase() as Supplier['status']) || 'active',
        });

        success++;
      } catch {
        failed++;
      }
    }

    if (failed === 0) {
      toast.success(`${success} suppliers imported successfully`);
    } else {
      toast.warning(`${success} of ${success + failed} suppliers imported. ${failed} failed.`);
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
            Import Suppliers
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Supplier
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-4 flex-wrap">
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
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            {typeFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Risk Levels" />
          </SelectTrigger>
          <SelectContent>
            {riskFilterOptions.map((option) => (
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
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Risk Level</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Quality Score</TableHead>
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
                    <Skeleton className="h-4 w-20 mb-1" />
                    <Skeleton className="h-3 w-32" />
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28 mb-1" />
                    <Skeleton className="h-3 w-36" />
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  {canEdit && <TableCell><Skeleton className="h-8 w-8" /></TableCell>}
                </TableRow>
              ))
            ) : paginatedSuppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 8 : 7} className="h-48 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-muted-foreground">No suppliers found. Try adjusting your filters.</p>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Reset Filters
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-sm">{supplier.supplier_code}</p>
                      <p className="text-xs text-muted-foreground">{supplier.name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <SupplierTypeBadge type={supplier.type} />
                  </TableCell>
                  <TableCell>
                    <RiskLevelBadge level={supplier.risk_level} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{supplier.contact_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{supplier.contact_email || '—'}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <QualityScoreBadge score={supplier.quality_score} hasAudits={!!supplier.last_audit_date} />
                  </TableCell>
                  <TableCell>
                    <CertificationBadge certifications={supplier.certifications} />
                  </TableCell>
                  <TableCell>
                    <EntityStatusBadge status={supplier.status} />
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
                          <DropdownMenuItem onClick={() => setEditingSupplier(supplier)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {supplier.status === 'active' ? (
                            <DropdownMenuItem onClick={() => setSuspendingSupplier(supplier)}>
                              <Ban className="mr-2 h-4 w-4" />
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleActivate(supplier)}>
                              <Power className="mr-2 h-4 w-4" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setDeletingSupplier(supplier)}
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {!isLoading && filteredSuppliers.length > 0 && (
        <div className="flex items-center justify-end gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {showingStart}-{showingEnd} of {filteredSuppliers.length} suppliers
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
      <SupplierModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onSuccess={loadData}
      />

      <SupplierModal
        open={!!editingSupplier}
        onOpenChange={(open) => !open && setEditingSupplier(null)}
        onSuccess={loadData}
        supplier={editingSupplier}
      />

      <EntityImportModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        onSuccess={loadData}
        entityName="Suppliers"
        templateFileName="suppliers_import_template.csv"
        templateContent={`code,name,type,category,risk_level,contact_name,contact_phone,contact_email,address,city,registration_number,contract_start,contract_end,supplies_to_bck_codes,supplies_to_branch_codes,certifications,status\nSUP-001,Al-Safi Dairy,food,dairy,high,Khalid Ahmed,+966503333333,khalid@alsafi.sa,789 Dairy St,Riyadh,CR-123456,2024-01-01,2026-12-31,"BCK-RYD-01","RYD-001,RYD-002","HACCP:2026-12-31,Halal:2027-01-31",active`}
        columns={importColumns}
        validateRow={(row, index) => validateImportRow(row, index)}
        importData={handleImport}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingSupplier} onOpenChange={(open) => !open && setDeletingSupplier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {deletingSupplier?.name}? This removes the supplier and all its audit history permanently.
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

      {/* Suspend Confirmation */}
      <AlertDialog open={!!suspendingSupplier} onOpenChange={(open) => !open && setSuspendingSupplier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Suspend {suspendingSupplier?.name}? This will stop all orders from this supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSuspend} className="bg-warning text-warning-foreground hover:bg-warning/90">
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
