import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Supplier, Branch, BCK, SupplierType, SupplierStatus, RiskLevel } from '@/types';
import { getBranches, getBCKs } from '@/lib/userStorage';
import { createSupplier, updateSupplier, fetchSupplierByCode } from '@/lib/entitySupabase';

const certificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
});

const supplierSchema = z.object({
  supplier_code: z
    .string()
    .min(1, 'Supplier code is required')
    .transform((val) => val.toUpperCase()),
  name: z.string().min(1, 'Supplier name is required'),
  type: z.enum(['food', 'packaging', 'equipment', 'service']),
  category: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high']),
  contact_name: z.string().min(1, 'Contact name is required'),
  contact_phone: z.string().optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  registration_number: z.string().optional(),
  contract_start: z.string().optional(),
  contract_end: z.string().optional(),
  certifications: z.array(certificationSchema).optional(),
  status: z.enum(['active', 'inactive', 'under_review', 'suspended', 'blacklisted']),
});

type SupplierFormData = z.infer<typeof supplierSchema>;

interface SupplierModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  supplier?: Supplier | null;
}

export function SupplierModal({ open, onOpenChange, onSuccess, supplier }: SupplierModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bcks, setBCKs] = useState<BCK[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedBCKs, setSelectedBCKs] = useState<string[]>([]);
  const isEditing = !!supplier;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      supplier_code: '',
      name: '',
      type: 'food',
      category: '',
      risk_level: 'medium',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      city: '',
      registration_number: '',
      contract_start: '',
      contract_end: '',
      certifications: [],
      status: 'active',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'certifications',
  });

  useEffect(() => {
    setBranches(getBranches().filter((b) => b.status === 'active'));
    setBCKs(getBCKs().filter((b) => b.status === 'active'));
  }, [open]);

  useEffect(() => {
    if (supplier) {
      // Parse certifications from Supplier format
      const certifications = supplier.certifications.map((cert) => {
        if (typeof cert === 'string') {
          return { name: cert, expiry_date: '' };
        }
        return cert as { name: string; expiry_date: string };
      });

      reset({
        supplier_code: supplier.supplier_code,
        name: supplier.name,
        type: supplier.type,
        category: supplier.category || '',
        risk_level: supplier.risk_level,
        contact_name: supplier.contact_name || '',
        contact_phone: supplier.contact_phone || '',
        contact_email: supplier.contact_email || '',
        address: supplier.address || '',
        city: supplier.city || '',
        registration_number: supplier.registration_number || '',
        contract_start: supplier.contract_start || '',
        contract_end: supplier.contract_end || '',
        certifications: certifications,
        status: supplier.status,
      });
      setSelectedBranches(supplier.supplies_to?.branches || []);
      setSelectedBCKs(supplier.supplies_to?.bcks || []);
    } else {
      reset({
        supplier_code: '',
        name: '',
        type: 'food',
        category: '',
        risk_level: 'medium',
        contact_name: '',
        contact_phone: '',
        contact_email: '',
        address: '',
        city: '',
        registration_number: '',
        contract_start: '',
        contract_end: '',
        certifications: [],
        status: 'active',
      });
      setSelectedBranches([]);
      setSelectedBCKs([]);
    }
  }, [supplier, reset, open]);

  const handleClose = () => {
    reset();
    setSelectedBranches([]);
    setSelectedBCKs([]);
    onOpenChange(false);
  };

  const onSubmit = async (data: SupplierFormData) => {
    setIsLoading(true);

    try {
      if (!isEditing) {
        const existingSupplier = await fetchSupplierByCode(data.supplier_code);
        if (existingSupplier) {
          toast.error('A supplier with this code already exists');
          setIsLoading(false);
          return;
        }
      }

      // Keep certifications in object format, filtering out any incomplete entries
      const certifications = (data.certifications || [])
        .filter(cert => cert.name && cert.expiry_date)
        .map(cert => ({ name: cert.name!, expiry_date: cert.expiry_date! }));

      const suppliesTo = {
        bcks: selectedBCKs,
        branches: selectedBranches,
      };

      if (isEditing && supplier) {
        await updateSupplier(supplier.id, {
          name: data.name,
          type: data.type,
          category: data.category || undefined,
          risk_level: data.risk_level,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone || undefined,
          contact_email: data.contact_email || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          registration_number: data.registration_number || undefined,
          contract_start: data.contract_start || undefined,
          contract_end: data.contract_end || undefined,
          supplies_to: suppliesTo,
          certifications: certifications,
          status: data.status,
        });
        toast.success(`Supplier ${data.name} updated successfully`);
      } else {
        await createSupplier({
          supplier_code: data.supplier_code,
          name: data.name,
          type: data.type,
          category: data.category || undefined,
          risk_level: data.risk_level,
          contact_name: data.contact_name,
          contact_phone: data.contact_phone || undefined,
          contact_email: data.contact_email || undefined,
          address: data.address || undefined,
          city: data.city || undefined,
          registration_number: data.registration_number || undefined,
          contract_start: data.contract_start || undefined,
          contract_end: data.contract_end || undefined,
          supplies_to: suppliesTo,
          certifications: certifications,
          status: data.status,
        });
        toast.success(`Supplier ${data.name} created successfully`);
      }

      handleClose();
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update supplier' : 'Failed to create supplier');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBranch = (branchId: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const toggleBCK = (bckId: string) => {
    setSelectedBCKs((prev) =>
      prev.includes(bckId) ? prev.filter((id) => id !== bckId) : [...prev, bckId]
    );
  };

  const watchType = watch('type');
  const watchRiskLevel = watch('risk_level');
  const watchStatus = watch('status');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="supplier_code">Supplier Code *</Label>
                <Input
                  id="supplier_code"
                  placeholder="e.g. SUP-001"
                  disabled={isEditing}
                  {...register('supplier_code')}
                  className="uppercase"
                />
                {errors.supplier_code && (
                  <p className="text-sm text-destructive">{errors.supplier_code.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={watchStatus}
                  onValueChange={(value) => setValue('status', value as SupplierStatus, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="blacklisted">Blacklisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Supplier Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Al-Watania Poultry"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select
                  value={watchType}
                  onValueChange={(value) => setValue('type', value as SupplierType, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="food">Food</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  placeholder="e.g. Meat"
                  {...register('category')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk_level">Risk Level *</Label>
                <Select
                  value={watchRiskLevel}
                  onValueChange={(value) => setValue('risk_level', value as RiskLevel, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name *</Label>
                <Input
                  id="contact_name"
                  placeholder="e.g. Mohammed Al-Ahmad"
                  {...register('contact_name')}
                />
                {errors.contact_name && (
                  <p className="text-sm text-destructive">{errors.contact_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_phone">Contact Phone</Label>
                <Input
                  id="contact_phone"
                  placeholder="+966 5XX XXX XXXX"
                  {...register('contact_phone')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contact_email">Contact Email</Label>
                <Input
                  id="contact_email"
                  type="email"
                  placeholder="supplier@example.com"
                  {...register('contact_email')}
                />
                {errors.contact_email && (
                  <p className="text-sm text-destructive">{errors.contact_email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  placeholder="e.g. Riyadh"
                  {...register('city')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="e.g. Industrial Area, Building 5"
                {...register('address')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registration_number">Registration Number</Label>
                <Input
                  id="registration_number"
                  placeholder="e.g. CR-1234567890"
                  {...register('registration_number')}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="contract_start">Contract Start</Label>
                  <Input
                    id="contract_start"
                    type="date"
                    {...register('contract_start')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contract_end">Contract End</Label>
                  <Input
                    id="contract_end"
                    type="date"
                    {...register('contract_end')}
                  />
                </div>
              </div>
            </div>

            {/* Supplies To BCKs */}
            <div className="space-y-2">
              <Label>Supplies To BCKs</Label>
              <div className="border rounded-md p-3 max-h-28 overflow-y-auto">
                {bcks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No BCKs available</p>
                ) : (
                  <div className="space-y-2">
                    {bcks.map((bck) => (
                      <label key={bck.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBCKs.includes(bck.id)}
                          onChange={() => toggleBCK(bck.id)}
                          className="rounded border-input"
                        />
                        <span className="text-sm">
                          {bck.code} — {bck.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Supplies To Branches */}
            <div className="space-y-2">
              <Label>Supplies To Branches</Label>
              <div className="border rounded-md p-3 max-h-28 overflow-y-auto">
                {branches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No branches available</p>
                ) : (
                  <div className="space-y-2">
                    {branches.map((branch) => (
                      <label key={branch.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBranches.includes(branch.id)}
                          onChange={() => toggleBranch(branch.id)}
                          className="rounded border-input"
                        />
                        <span className="text-sm">
                          {branch.code} — {branch.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Certifications */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Certifications</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ name: '', expiry_date: '' })}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Add
                </Button>
              </div>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">No certifications added</p>
              ) : (
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="e.g. Halal Certified"
                          {...register(`certifications.${index}.name`)}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          type="date"
                          {...register(`certifications.${index}.expiry_date`)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditing ? 'Saving...' : 'Creating...'}
                  </>
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create Supplier'
                )}
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
