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
import { useAuth } from '@/contexts/AuthContext';
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
  phone: z.string().optional(),
  role: z.enum(['super_admin', 'audit_manager', 'regional_manager', 'auditor', 'branch_manager', 'bck_manager', 'staff']),
  assigned_id: z.string().optional(),
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
    },
  });

  const selectedRole = form.watch('role');

  useEffect(() => {
    if (open && user) {
      setRegions(getRegions());
      setBranches(getBranches());
      setBCKs(getBCKs());

      const assignments = getAssignmentsForUser(user.id);
      const assignment = assignments[0] || null;
      setCurrentAssignment(assignment);

      form.reset({
        full_name: user.full_name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        assigned_id: assignment?.assigned_id || '',
      });
    }
  }, [open, user, form]);

  // Clear assignment when role changes to a different type
  const originalRole = user?.role;
  useEffect(() => {
    if (selectedRole !== originalRole) {
      form.setValue('assigned_id', '');
    }
  }, [selectedRole, originalRole, form]);

  const needsAssignment = selectedRole && rolesRequiringAssignment.includes(selectedRole);
  const isAssignmentRequired = selectedRole && ['regional_manager', 'branch_manager', 'bck_manager', 'staff'].includes(selectedRole);
  const isEditingSelf = user?.id === currentUser?.id;

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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
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
                    <Input type="email" disabled {...field} className="bg-muted" />
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
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isEditingSelf}
                  >
                    <FormControl>
                      <SelectTrigger className={isEditingSelf ? 'bg-muted' : ''}>
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
                  {isEditingSelf && (
                    <p className="text-xs text-muted-foreground">You cannot change your own role.</p>
                  )}
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
