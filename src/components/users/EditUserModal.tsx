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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { User, UserRole, Region, Branch, BCK, UserAssignment } from '@/types';
import {
  getRegions,
  getBranches,
  getBCKs,
  updateUser,
  getAssignmentsForUser,
  deleteAssignmentsForUser,
  createAssignment,
} from '@/lib/userStorage';
import { 
  fetchDepartmentBySlug, 
  addDepartmentMember, 
  removeDepartmentMember,
  isDepartmentMember 
} from '@/lib/departmentSupabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'head_of_quality', label: 'Head of Quality' },
  { value: 'audit_manager', label: 'Head of Quality (Legacy)' },
  { value: 'regional_manager', label: 'Regional Manager' },
  { value: 'area_manager', label: 'Area Manager' },
  { value: 'regional_operational_manager', label: 'Regional Operational Manager' },
  { value: 'national_operational_manager', label: 'National Operational Manager' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'bck_manager', label: 'BCK Manager' },
  { value: 'staff', label: 'Staff' },
];

const rolesRequiringAssignment: UserRole[] = [
  'regional_manager',
  'auditor',
  'branch_manager',
  'bck_manager',
  'staff',
  'area_manager',
  'regional_operational_manager',
];

const formSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email format').max(255),
  phone: z.string().optional(),
  role: z.enum([
    'super_admin',
    'head_of_quality',
    'audit_manager',
    'regional_manager',
    'area_manager',
    'regional_operational_manager',
    'national_operational_manager',
    'auditor',
    'branch_manager',
    'bck_manager',
    'staff',
  ]),
  assigned_id: z.string().optional(),
  is_maintenance: z.boolean().default(false),
});

type FormData = z.infer<typeof formSchema>;

interface EditUserModalProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditUserModal({ user, open, onOpenChange, onSuccess }: EditUserModalProps) {
  const { user: currentUser } = useAuth();
  const [regions, setRegions] = useState<Region[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bcks, setBCKs] = useState<BCK[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<UserAssignment | null>(null);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      role: undefined,
      assigned_id: '',
      is_maintenance: false,
    },
  });

  const selectedRole = form.watch('role');
  const isMaintenance = form.watch('is_maintenance');

  useEffect(() => {
    if (open && user) {
      setRegions(getRegions());
      setBranches(getBranches());
      setBCKs(getBCKs());

      const assignments = getAssignmentsForUser(user.id);
      const assignment = assignments[0] || null;
      setCurrentAssignment(assignment);

      // Check maintenance department membership
      const checkMaintenance = async () => {
        const isMaintenance = await isDepartmentMember(user.id, 'maintenance');
        form.setValue('is_maintenance', isMaintenance);
      };
      void checkMaintenance();

      form.reset({
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        assigned_id: assignment?.assigned_id || '',
        is_maintenance: false, // will be updated by checkMaintenance
      });
    }
  }, [open, user, form]);

  // Clear assignment when role or maintenance status changes
  const originalRole = user?.role;
  useEffect(() => {
    if (selectedRole !== originalRole || isMaintenance) {
      form.setValue('assigned_id', '');
    }
  }, [selectedRole, originalRole, isMaintenance, form]);

  const needsAssignment = selectedRole && rolesRequiringAssignment.includes(selectedRole) && !isMaintenance;
  const isAssignmentRequired = selectedRole && ['regional_manager', 'regional_operational_manager', 'branch_manager', 'bck_manager', 'staff', 'area_manager'].includes(selectedRole) && !isMaintenance;
  const isEditingSelf = user?.id === currentUser?.id;

  const getAssignmentOptions = () => {
    if (!selectedRole) return [];
    
    if (selectedRole === 'regional_manager' || selectedRole === 'regional_operational_manager' || selectedRole === 'auditor') {
      return regions.map(r => ({ id: r.id, label: r.name, type: 'region' as const }));
    }
    if (selectedRole === 'branch_manager' || selectedRole === 'staff') {
      return branches.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'branch' as const }));
    }
    if (selectedRole === 'bck_manager') {
      return bcks.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'bck' as const }));
    }
    if (selectedRole === 'area_manager') {
      return [
        ...branches.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'branch' as const })),
        ...bcks.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'bck' as const })),
      ];
    }
    return [];
  };

  const getAssignmentLabel = () => {
    if (selectedRole === 'regional_manager' || selectedRole === 'regional_operational_manager' || selectedRole === 'auditor') return 'Assign Region';
    if (selectedRole === 'branch_manager' || selectedRole === 'staff') return 'Assign Branch';
    if (selectedRole === 'bck_manager') return 'Assign BCK';
    if (selectedRole === 'area_manager') return 'Assign Branch / BCK';
    return 'Assign To';
  };

  const onSubmit = async (data: FormData) => {
    if (!user) return;

    setIsSubmitting(true);

    try {
      updateUser(user.id, {
        full_name: data.full_name,
        phone: data.phone || undefined,
        role: data.role,
      });

      // Handle assignment changes
      const options = getAssignmentOptions();
      const selected = options.find(o => o.id === data.assigned_id);
      
      // Delete existing assignments
      deleteAssignmentsForUser(user.id);
      
      // Create new assignment if needed
      if (data.assigned_id && selected && needsAssignment) {
        createAssignment({
          user_id: user.id,
          assigned_type: selected.type,
          assigned_id: selected.id,
        });
      }

      // Handle Maintenance Department changes
      try {
        const maintenanceDept = await fetchDepartmentBySlug('maintenance');
        if (maintenanceDept) {
          const currentlyMaintenance = await isDepartmentMember(user.id, 'maintenance');
          if (data.is_maintenance && !currentlyMaintenance) {
            await addDepartmentMember(maintenanceDept.id, user.id, 'member');
          } else if (!data.is_maintenance && currentlyMaintenance) {
            await removeDepartmentMember(maintenanceDept.id, user.id);
          }
        }
      } catch (deptErr) {
        console.error('Failed to update maintenance department membership:', deptErr);
      }

      toast.success(`User ${data.full_name} updated successfully`);
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error('Failed to update user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  // Check if form has changed
  const hasChanges = () => {
    if (!user) return false;
    const values = form.getValues();
    return (
      values.full_name !== user.full_name ||
      values.phone !== (user.phone || '') ||
      values.role !== user.role ||
      values.assigned_id !== (currentAssignment?.assigned_id || '')
    );
  };

  const assignmentOptions = getAssignmentOptions();
  const selectedAssignment = assignmentOptions.find(o => o.id === form.watch('assigned_id'));
  const useSearchableSelect = selectedRole && ['branch_manager', 'bck_manager', 'staff'].includes(selectedRole);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 bg-muted/30">
          <DialogTitle className="text-xl font-bold">Edit User</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="px-6 py-4 space-y-5">
            <div className="grid grid-cols-1 gap-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Ahmed Ali" {...field} className="h-11" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email *</FormLabel>
                      <FormControl>
                        <Input type="email" disabled {...field} className="h-11 bg-muted/50 font-medium" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</FormLabel>
                      <FormControl>
                        <Input placeholder="+966 5XX XXX XXXX" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isEditingSelf}
                    >
                      <FormControl>
                        <SelectTrigger className={cn("h-11", isEditingSelf && "bg-muted/50")}>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roleOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isEditingSelf && (
                      <p className="text-[10px] text-muted-foreground mt-1">You cannot change your own role.</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_maintenance"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        Maintenance Department Member
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        User will receive maintenance-related audit notifications and see routed CAPAs.
                      </p>
                    </div>
                  </FormItem>
                )}
              />

              {needsAssignment && (
                <FormField
                  control={form.control}
                  name="assigned_id"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {getAssignmentLabel()} {isAssignmentRequired ? '*' : '(Optional)'}
                      </FormLabel>
                      {useSearchableSelect ? (
                        <Popover open={assignmentOpen} onOpenChange={setAssignmentOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  'w-full justify-between h-11',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {selectedAssignment?.label || 'Select...'}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[450px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Search..." />
                              <CommandList>
                                <CommandEmpty>No results found.</CommandEmpty>
                                <CommandGroup>
                                  {assignmentOptions.map(option => (
                                    <CommandItem
                                      key={option.id}
                                      value={option.label}
                                      onSelect={() => {
                                        form.setValue('assigned_id', option.id);
                                        setAssignmentOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === option.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      {option.label}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ) : (
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {assignmentOptions.map(option => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter className="px-0 pt-4 pb-6 gap-3 sm:gap-0">
              <Button type="button" variant="ghost" onClick={handleClose} className="h-11 px-6">
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-11 px-8 min-w-[140px]"
                disabled={isSubmitting || !hasChanges() || (isAssignmentRequired && !form.watch('assigned_id'))}
              >
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
