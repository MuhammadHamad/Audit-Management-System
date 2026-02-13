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
import { getUserByEmail, getRegions, getBranches, getBCKs, createAssignment } from '@/lib/userStorage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'audit_manager', label: 'Audit Manager' },
  { value: 'regional_manager', label: 'Regional Manager' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'bck_manager', label: 'BCK Manager' },
  { value: 'staff', label: 'Staff' },
];

const rolesRequiringAssignment: UserRole[] = ['regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff'];

const formSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(100),
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  phone: z.string().optional(),
  role: z.enum(['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff']),
  assigned_id: z.string().optional(),
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
    },
  });

  const selectedRole = form.watch('role');

  useEffect(() => {
    if (open) {
      setRegions(getRegions());
      setBranches(getBranches());
      setBCKs(getBCKs());
    }
  }, [open]);

  useEffect(() => {
    // Clear assignment when role changes
    form.setValue('assigned_id', '');
  }, [selectedRole, form]);

  const needsAssignment = selectedRole && rolesRequiringAssignment.includes(selectedRole);
  const isAssignmentRequired = selectedRole && ['regional_manager', 'branch_manager', 'bck_manager', 'staff'].includes(selectedRole);

  const getAssignmentOptions = () => {
    if (!selectedRole) return [];
    
    if (selectedRole === 'regional_manager' || selectedRole === 'auditor') {
      return regions.map(r => ({ id: r.id, label: r.name, type: 'region' as const }));
    }
    if (selectedRole === 'branch_manager' || selectedRole === 'staff') {
      return branches.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'branch' as const }));
    }
    if (selectedRole === 'bck_manager') {
      return bcks.map(b => ({ id: b.id, label: `${b.code} — ${b.name}`, type: 'bck' as const }));
    }
    return [];
  };

  const getAssignmentLabel = () => {
    if (selectedRole === 'regional_manager' || selectedRole === 'auditor') return 'Assign Region';
    if (selectedRole === 'branch_manager' || selectedRole === 'staff') return 'Assign Branch';
    if (selectedRole === 'bck_manager') return 'Assign BCK';
    return 'Assign To';
  };

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      // Call the secure RPC to create both Auth user and public.users row
      const { data: result, error } = await (supabase as any).rpc('create_user_with_auth', {
        _email: data.email,
        _password: data.password,
        _full_name: data.full_name,
        _phone: data.phone || null,
        _role: data.role,
        _status: 'active',
      });

      if (error) {
        toast.error(error.message || 'Failed to create user.');
        return;
      }

      if (!result || result.length === 0) {
        toast.error('Unexpected error: No response from server.');
        return;
      }

      const { success, message, user_id } = result[0];
      if (!success) {
        form.setError('email', { message });
        return;
      }

      // Create assignment if needed
      if (data.assigned_id && needsAssignment) {
        const options = getAssignmentOptions();
        const selected = options.find(o => o.id === data.assigned_id);
        if (selected) {
          await createAssignment({
            user_id,
            assigned_type: selected.type,
            assigned_id: selected.id,
          });
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add New User</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Ahmed Ali" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="e.g. ahmed@burgerizzr.sa" {...field} />
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
                  <FormLabel>Password *</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Min 6 characters" {...field} />
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
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input placeholder="+966 5XX XXX XXXX" {...field} />
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
                  <FormLabel>Role *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
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

            {needsAssignment && (
              <FormField
                control={form.control}
                name="assigned_id"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>
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
                                'w-full justify-between',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              {selectedAssignment?.label || 'Select...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0">
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
                          <SelectTrigger>
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

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
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
