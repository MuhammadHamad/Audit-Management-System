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
import { BCK, Region, User, Branch, BCKStatus } from '@/types';
import { getRegions, getBranches, getUsersByRole } from '@/lib/userStorage';
import { createBCK, updateBCK, fetchBCKByCode } from '@/lib/entitySupabase';

const certificationSchema = z.object({
  name: z.string().min(1, 'Certification name is required'),
  expiry_date: z.string().min(1, 'Expiry date is required'),
});

const bckSchema = z.object({
  code: z
    .string()
    .min(1, 'BCK code is required')
    .transform((val) => val.toUpperCase()),
  name: z.string().min(1, 'BCK name is required'),
  region_id: z.string().min(1, 'Region is required'),
  city: z.string().min(1, 'City is required'),
  address: z.string().optional(),
  manager_id: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  production_capacity: z.string().optional(),
  supplies_branches: z.array(z.string()).optional(),
  certifications: z.array(certificationSchema).optional(),
  status: z.enum(['active', 'inactive', 'under_maintenance']),
});

type BCKFormData = z.infer<typeof bckSchema>;

interface BCKModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  bck?: BCK | null;
}

export function BCKModal({ open, onOpenChange, onSuccess, bck }: BCKModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const isEditing = !!bck;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<BCKFormData>({
    resolver: zodResolver(bckSchema),
    defaultValues: {
      code: '',
      name: '',
      region_id: '',
      city: '',
      address: '',
      manager_id: '',
      phone: '',
      email: '',
      production_capacity: '',
      supplies_branches: [],
      certifications: [],
      status: 'active',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'certifications',
  });

  useEffect(() => {
    setRegions(getRegions().filter((r) => r.status === 'active'));
    setManagers(getUsersByRole('bck_manager'));
    setBranches(getBranches().filter((b) => b.status === 'active'));
  }, [open]);

  useEffect(() => {
    if (bck) {
      // Parse certifications from BCK format
      const certifications = bck.certifications.map((cert) => {
        if (typeof cert === 'string') {
          return { name: cert, expiry_date: '' };
        }
        return cert as { name: string; expiry_date: string };
      });

      reset({
        code: bck.code,
        name: bck.name,
        region_id: bck.region_id,
        city: bck.city || '',
        address: bck.address || '',
        manager_id: bck.manager_id || '',
        phone: bck.phone || '',
        email: bck.email || '',
        production_capacity: bck.production_capacity || '',
        supplies_branches: bck.supplies_branches || [],
        certifications: certifications,
        status: bck.status,
      });
      setSelectedBranches(bck.supplies_branches || []);
    } else {
      reset({
        code: '',
        name: '',
        region_id: '',
        city: '',
        address: '',
        manager_id: '',
        phone: '',
        email: '',
        production_capacity: '',
        supplies_branches: [],
        certifications: [],
        status: 'active',
      });
      setSelectedBranches([]);
    }
  }, [bck, reset, open]);

  const handleClose = () => {
    reset();
    setSelectedBranches([]);
    onOpenChange(false);
  };

  const onSubmit = async (data: BCKFormData) => {
    setIsLoading(true);

    try {
      if (!isEditing) {
        const existingBCK = await fetchBCKByCode(data.code);
        if (existingBCK) {
          toast.error('A BCK with this code already exists');
          setIsLoading(false);
          return;
        }
      }

      // Keep certifications in object format, filtering out any incomplete entries
      const certifications = (data.certifications || [])
        .filter(cert => cert.name && cert.expiry_date)
        .map(cert => ({ name: cert.name!, expiry_date: cert.expiry_date! }));

      if (isEditing && bck) {
        await updateBCK(bck.id, {
          name: data.name,
          region_id: data.region_id,
          city: data.city,
          address: data.address || undefined,
          manager_id: data.manager_id || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          production_capacity: data.production_capacity || undefined,
          supplies_branches: selectedBranches,
          certifications: certifications,
          status: data.status,
        });
        toast.success(`BCK ${data.name} updated successfully`);
      } else {
        await createBCK({
          code: data.code,
          name: data.name,
          region_id: data.region_id,
          city: data.city,
          address: data.address || undefined,
          manager_id: data.manager_id || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          production_capacity: data.production_capacity || undefined,
          supplies_branches: selectedBranches,
          certifications: certifications,
          status: data.status,
        });
        toast.success(`BCK ${data.name} created successfully`);
      }

      handleClose();
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update BCK' : 'Failed to create BCK');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBranch = (branchId: string) => {
    setSelectedBranches((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const watchRegionId = watch('region_id');
  const watchManagerId = watch('manager_id');
  const watchStatus = watch('status');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit BCK' : 'Add New BCK'}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">BCK Code *</Label>
                <Input
                  id="code"
                  placeholder="e.g. BCK-RYD-01"
                  disabled={isEditing}
                  {...register('code')}
                  className="uppercase"
                />
                {errors.code && (
                  <p className="text-sm text-destructive">{errors.code.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={watchStatus}
                  onValueChange={(value) => setValue('status', value as BCKStatus, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="under_maintenance">Under Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">BCK Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Riyadh Central Kitchen"
                {...register('name')}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="region">Region *</Label>
                <Select
                  value={watchRegionId}
                  onValueChange={(value) => setValue('region_id', value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.id} value={region.id}>
                        {region.name} ({region.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.region_id && (
                  <p className="text-sm text-destructive">{errors.region_id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  placeholder="e.g. Riyadh"
                  {...register('city')}
                />
                {errors.city && (
                  <p className="text-sm text-destructive">{errors.city.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                placeholder="e.g. 456 Industrial Road"
                {...register('address')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="manager">Manager</Label>
                <Select
                  value={watchManagerId || "__none__"}
                  onValueChange={(value) => setValue('manager_id', value === "__none__" ? '' : value, { shouldDirty: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a BCK manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No manager</SelectItem>
                    {managers.map((manager) => (
                      <SelectItem key={manager.id} value={manager.id}>
                        {manager.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="production_capacity">Production Capacity</Label>
                <Input
                  id="production_capacity"
                  placeholder="e.g. 500 meals/day"
                  {...register('production_capacity')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  placeholder="+966 5XX XXX XXXX"
                  {...register('phone')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="bck@burgerizzr.sa"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Supplies Branches */}
            <div className="space-y-2">
              <Label>Supplies Branches</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
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
                          placeholder="e.g. HACCP"
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
              <Button type="submit" disabled={isLoading || (isEditing && !isDirty && selectedBranches === (bck?.supplies_branches || []))}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isEditing ? 'Saving...' : 'Creating...'}
                  </>
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create BCK'
                )}
              </Button>
            </DialogFooter>
          </form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
