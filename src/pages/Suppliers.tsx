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
import {
  getSuppliers,
  deleteSupplier,
  updateSupplier,
  getSupplierByCode,
  importSuppliers,
} from '@/lib/entityStorage';
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

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

  const loadData = () => {
    setIsLoading(true);
    setTimeout(() => {
      setSuppliers(getSuppliers());
      setIsLoading(false);
    }, 300);
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const handleSuspend = () => {
    if (!suspendingSupplier) return;
    updateSupplier(suspendingSupplier.id, { status: 'suspended' });
    toast.success(`Supplier ${suspendingSupplier.name} suspended`);
    setSuspendingSupplier(null);
    loadData();
  };

  const handleActivate = (supplier: Supplier) => {
    updateSupplier(supplier.id, { status: 'active' });
    toast.success(`Supplier ${supplier.name} activated`);
    loadData();
  };

  const handleDelete = () => {
    if (!deletingSupplier) return;

    const result = deleteSupplier(deletingSupplier.id);
    if (result.success) {
      toast.success(`Supplier ${deletingSupplier.name} deleted successfully`);
      loadData();
    } else {
      toast.error(result.error);
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
    { key: 'supplier_code', label: 'Code' },
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type' },
    { key: 'risk_level', label: 'Risk' },
    { key: 'status', label: 'Status' },
  ];

  const validateImportRow = (row: Record<string, string>, rowIndex: number) => {
    const errors: { row: number; message: string; field?: string }[] = [];
    const rowNum = rowIndex + 2;

    if (!row.supplier_code?.trim()) {
      errors.push({ row: rowNum, message: 'Supplier code is required', field: 'supplier_code' });
    } else if (getSupplierByCode(row.supplier_code)) {
      errors.push({ row: rowNum, message: `Code '${row.supplier_code}' already exists`, field: 'supplier_code' });
    }

    if (!row.name?.trim()) {
      errors.push({ row: rowNum, message: 'Name is required', field: 'name' });
    }

    const validTypes = ['food', 'packaging', 'equipment', 'service'];
    if (row.type && !validTypes.includes(row.type.toLowerCase())) {
      errors.push({ row: rowNum, message: `Type '${row.type}' is not valid`, field: 'type' });
    }

    const validRiskLevels = ['low', 'medium', 'high'];
    if (row.risk_level && !validRiskLevels.includes(row.risk_level.toLowerCase())) {
      errors.push({ row: rowNum, message: `Risk level '${row.risk_level}' is not valid`, field: 'risk_level' });
    }

    return errors;
  };

  const handleImport = (data: Record<string, string>[]) => {
    const result = importSuppliers(
      data.map((row) => ({
        supplier_code: row.supplier_code,
        name: row.name,
        type: row.type?.toLowerCase(),
        category: row.category,
        risk_level: row.risk_level?.toLowerCase(),
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
        contact_email: row.contact_email,
        city: row.city,
        status: row.status?.toLowerCase(),
      }))
    );

    if (result.failed === 0) {
      toast.success(`${result.success} suppliers imported successfully`);
    } else {
      toast.warning(`${result.success} of ${result.success + result.failed} suppliers imported. ${result.failed} failed.`);
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
        templateContent="supplier_code,name,type,category,risk_level,contact_name,contact_phone,contact_email,city,status\nSUP-001,Al-Watania Poultry,food,Meat,high,Mohammed Al-Ahmad,+966501234567,supplier@watania.com,Riyadh,active"
        columns={importColumns}
        validateRow={validateImportRow}
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
