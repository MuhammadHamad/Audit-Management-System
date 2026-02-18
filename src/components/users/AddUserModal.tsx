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
import { UserRole, Region, Branch, BCK } from '@/types';
import { getRegions, getBranches, getBCKs, createAssignment } from '@/lib/userStorage';
import { fetchDepartmentBySlug, addDepartmentMember } from '@/lib/departmentSupabase';
import { supabase } from '@/integrations/supabase/client';
import { getAdminClient } from '@/integrations/supabase/adminClient';
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
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
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

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddUserModal({ open, onOpenChange, onSuccess }: AddUserModalProps) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [bcks, setBCKs] = useState<BCK[]>([]);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      full_name: '',
      email: '',
      password: '',
      phone: '',
      role: undefined,
      assigned_id: '',
      is_maintenance: false,
    },
  });

  const selectedRole = form.watch('role');
  const isMaintenance = form.watch('is_maintenance');

  useEffect(() => {
    if (open) {
      setRegions(getRegions());
      setBranches(getBranches());
      setBCKs(getBCKs());
    }
  }, [open]);

  useEffect(() => {
    // Clear assignment when role or maintenance status changes
    form.setValue('assigned_id', '');
  }, [selectedRole, isMaintenance, form]);

  const needsAssignment = selectedRole && rolesRequiringAssignment.includes(selectedRole) && !isMaintenance;
  const isAssignmentRequired = selectedRole && ['regional_manager', 'regional_operational_manager', 'branch_manager', 'bck_manager', 'staff', 'area_manager'].includes(selectedRole) && !isMaintenance;

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
    setIsSubmitting(true);

    try {
      const adminClient = getAdminClient();
      if (!adminClient) {
        toast.error('Service role key is not configured. Cannot create users.');
        return;
      }

      // Step 1: Create Auth user via admin API
      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
      });

      if (authError) {
        if (authError.message?.includes('already been registered')) {
          form.setError('email', { message: 'This email is already registered.' });
        } else {
          toast.error(authError.message || 'Failed to create Auth user.');
        }
        return;
      }

      const authUserId = authData.user?.id;
      if (!authUserId) {
        toast.error('Auth user created but no ID returned.');
        return;
      }

      // Step 2: Create public.users row
      const { error: publicError } = await supabase.from('users').insert({
        id: authUserId,
        email: data.email,
        full_name: data.full_name,
        phone: data.phone || null,
        role: data.role,
        status: 'active',
      });

      if (publicError) {
        // Rollback: delete the Auth user we just created
        await adminClient.auth.admin.deleteUser(authUserId);
        toast.error(publicError.message || 'Failed to create user profile.');
        return;
      }

      // Step 3: Create assignments if needed
      if (data.assigned_id && authData.user && needsAssignment) {
        const options = getAssignmentOptions();
        const selected = options.find(o => o.id === data.assigned_id);
        if (!selected) {
          toast.error('Selected assignment is invalid.');
          return;
        }

        await createAssignment({
          user_id: authData.user.id,
          assigned_type: selected.type,
          assigned_id: selected.id,
        });
      }

      // Step 4: Handle Maintenance Department if checked
      if (data.is_maintenance && authData.user) {
        try {
          const maintenanceDept = await fetchDepartmentBySlug('maintenance');
          if (maintenanceDept) {
            await addDepartmentMember(maintenanceDept.id, authData.user.id, 'member');
          }
        } catch (deptErr) {
          console.error('Failed to add user to maintenance department:', deptErr);
        }
      }

      toast.success(`User ${data.full_name} created successfully`);
      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      console.error('Create user error:', err);
      toast.error(err?.message || 'Failed to create user. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  const assignmentOptions = getAssignmentOptions();
  const selectedAssignment = assignmentOptions.find(o => o.id === form.watch('assigned_id'));
  const useSearchableSelect = selectedRole && ['branch_manager', 'bck_manager', 'staff'].includes(selectedRole);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="px-6 pt-6 pb-4 bg-muted/30">
          <DialogTitle className="text-xl font-bold">Add New User</DialogTitle>
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
                        <Input type="email" placeholder="e.g. ahmed@burgerizzr.sa" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password *</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Min 6 characters" {...field} className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-11">
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                disabled={isSubmitting || !form.formState.isValid || (isAssignmentRequired && !form.watch('assigned_id'))}
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
