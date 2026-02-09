import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Branch, Region, User, BranchStatus } from '@/types';
import { getRegions, getUsersByRole } from '@/lib/userStorage';
import { createBranch, updateBranch, fetchBranchByCode } from '@/lib/entitySupabase';

const branchSchema = z.object({
  code: z
    .string()
    .min(1, 'Branch code is required')
    .transform((val) => val.toUpperCase()),
  name: z.string().min(1, 'Branch name is required'),
  region_id: z.string().min(1, 'Region is required'),
  city: z.string().min(1, 'City is required'),
  address: z.string().optional(),
  manager_id: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  status: z.enum(['active', 'inactive', 'under_renovation', 'temporarily_closed']),
  opening_date: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchSchema>;

interface BranchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  branch?: Branch | null;
}

export function BranchModal({ open, onOpenChange, onSuccess, branch }: BranchModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const isEditing = !!branch;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      code: '',
      name: '',
      region_id: '',
      city: '',
      address: '',
      manager_id: '',
      phone: '',
      email: '',
      status: 'active',
      opening_date: '',
    },
  });

  useEffect(() => {
    setRegions(getRegions().filter((r) => r.status === 'active'));
    setManagers(getUsersByRole('branch_manager'));
  }, [open]);

  useEffect(() => {
    if (branch) {
      reset({
        code: branch.code,
        name: branch.name,
        region_id: branch.region_id,
        city: branch.city || '',
        address: branch.address || '',
        manager_id: branch.manager_id || '',
        phone: branch.phone || '',
        email: branch.email || '',
        status: branch.status,
        opening_date: branch.opening_date || '',
      });
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
        status: 'active',
        opening_date: '',
      });
    }
  }, [branch, reset, open]);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: BranchFormData) => {
    setIsLoading(true);

    try {
      if (!isEditing) {
        const existingBranch = await fetchBranchByCode(data.code);
        if (existingBranch) {
          toast.error('A branch with this code already exists');
          setIsLoading(false);
          return;
        }
      }

      if (isEditing && branch) {
        await updateBranch(branch.id, {
          name: data.name,
          region_id: data.region_id,
          city: data.city,
          address: data.address || undefined,
          manager_id: data.manager_id || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          status: data.status,
          opening_date: data.opening_date || undefined,
        });
        toast.success(`Branch ${data.name} updated successfully`);
      } else {
        await createBranch({
          code: data.code,
          name: data.name,
          region_id: data.region_id,
          city: data.city,
          address: data.address || undefined,
          manager_id: data.manager_id || undefined,
          phone: data.phone || undefined,
          email: data.email || undefined,
          status: data.status,
          opening_date: data.opening_date || undefined,
        });
        toast.success(`Branch ${data.name} created successfully`);
      }

      handleClose();
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update branch' : 'Failed to create branch');
    } finally {
      setIsLoading(false);
    }
  };

  const watchRegionId = watch('region_id');
  const watchManagerId = watch('manager_id');
  const watchStatus = watch('status');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Branch Code *</Label>
              <Input
                id="code"
                placeholder="e.g. RYD-001"
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
                onValueChange={(value) => setValue('status', value as BranchStatus, { shouldDirty: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="under_renovation">Under Renovation</SelectItem>
                  <SelectItem value="temporarily_closed">Temporarily Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Branch Name *</Label>
            <Input
              id="name"
              placeholder="e.g. King Fahd Road Branch"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

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

          <div className="grid grid-cols-2 gap-4">
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

            <div className="space-y-2">
              <Label htmlFor="opening_date">Opening Date</Label>
              <Input
                id="opening_date"
                type="date"
                {...register('opening_date')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              placeholder="e.g. 123 King Fahd Road"
              {...register('address')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager">Manager</Label>
          <Select
              value={watchManagerId || "__none__"}
              onValueChange={(value) => setValue('manager_id', value === "__none__" ? '' : value, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a branch manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No manager</SelectItem>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.full_name} ({manager.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                placeholder="branch@burgerizzr.sa"
                {...register('email')}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || (isEditing && !isDirty)}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Creating...'}
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Branch'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
