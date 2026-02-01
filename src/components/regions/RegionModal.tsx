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
import { Textarea } from '@/components/ui/textarea';
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
import { Region, User } from '@/types';
import {
  createRegion,
  updateRegion,
  getRegionByCode,
  getUsersByRole,
} from '@/lib/entityStorage';

const regionSchema = z.object({
  name: z.string().min(1, 'Region name is required'),
  code: z
    .string()
    .min(1, 'Region code is required')
    .max(5, 'Code must be 5 characters or less')
    .transform((val) => val.toUpperCase()),
  description: z.string().optional(),
  manager_id: z.string().optional(),
});

type RegionFormData = z.infer<typeof regionSchema>;

interface RegionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  region?: Region | null;
}

export function RegionModal({ open, onOpenChange, onSuccess, region }: RegionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [managers, setManagers] = useState<User[]>([]);
  const isEditing = !!region;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<RegionFormData>({
    resolver: zodResolver(regionSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      manager_id: '',
    },
  });

  useEffect(() => {
    setManagers(getUsersByRole('regional_manager'));
  }, [open]);

  useEffect(() => {
    if (region) {
      reset({
        name: region.name,
        code: region.code,
        description: region.description || '',
        manager_id: region.manager_id || '',
      });
    } else {
      reset({
        name: '',
        code: '',
        description: '',
        manager_id: '',
      });
    }
  }, [region, reset, open]);

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onSubmit = async (data: RegionFormData) => {
    setIsLoading(true);

    try {
      // Check for duplicate code (only for new regions or if code changed)
      if (!isEditing || data.code !== region?.code) {
        const existingRegion = getRegionByCode(data.code);
        if (existingRegion) {
          toast.error('A region with this code already exists');
          setIsLoading(false);
          return;
        }
      }

      if (isEditing && region) {
        updateRegion(region.id, {
          name: data.name,
          code: data.code,
          description: data.description,
          manager_id: data.manager_id || undefined,
        });
        toast.success(`Region ${data.name} updated successfully`);
      } else {
        createRegion({
          name: data.name,
          code: data.code,
          description: data.description,
          manager_id: data.manager_id || undefined,
          status: 'active',
        });
        toast.success(`Region ${data.name} created successfully`);
      }

      handleClose();
      onSuccess();
    } catch {
      toast.error(isEditing ? 'Failed to update region' : 'Failed to create region');
    } finally {
      setIsLoading(false);
    }
  };

  const watchManagerId = watch('manager_id');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Region' : 'Add New Region'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Region Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Riyadh Region"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Region Code *</Label>
            <Input
              id="code"
              placeholder="e.g. RYD"
              maxLength={5}
              disabled={isEditing}
              {...register('code')}
              className="uppercase"
            />
            {errors.code && (
              <p className="text-sm text-destructive">{errors.code.message}</p>
            )}
            {isEditing && (
              <p className="text-xs text-muted-foreground">Code cannot be changed after creation</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="e.g. Central Saudi Arabia including Riyadh city"
              {...register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="manager">Manager</Label>
            <Select
              value={watchManagerId}
              onValueChange={(value) => setValue('manager_id', value, { shouldDirty: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a regional manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No manager</SelectItem>
                {managers.map((manager) => (
                  <SelectItem key={manager.id} value={manager.id}>
                    {manager.full_name} ({manager.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                'Create Region'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
