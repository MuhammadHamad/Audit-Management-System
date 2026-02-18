import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { toast } from 'sonner';
import {
  addDepartmentMember,
  fetchDepartmentBySlug,
  fetchDepartmentMembers,
  removeDepartmentMember,
} from '@/lib/departmentSupabase';
import { fetchUsers } from '@/lib/userStorage';

export default function MaintenanceMembersPage() {
  const queryClient = useQueryClient();

  const { data: maintenanceDept, isLoading: isLoadingDept } = useQuery({
    queryKey: ['department', 'maintenance'],
    queryFn: async () => {
      return fetchDepartmentBySlug('maintenance');
    },
  });

  const deptId = maintenanceDept?.id ?? null;

  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
  });

  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ['department_members', deptId],
    enabled: !!deptId,
    queryFn: async () => {
      if (!deptId) return [];
      return fetchDepartmentMembers(deptId);
    },
  });

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);

  const usersById = useMemo(() => {
    const map = new Map<string, { id: string; full_name: string; email: string }>();
    for (const u of users) {
      map.set(u.id, { id: u.id, full_name: u.full_name, email: u.email });
    }
    return map;
  }, [users]);

  const memberUserIds = useMemo(() => new Set(members.map(m => m.user_id)), [members]);

  const availableUsers = useMemo(() => {
    return users
      .filter(u => u.status === 'active')
      .filter(u => !memberUserIds.has(u.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [users, memberUserIds]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['department', 'maintenance'] }),
      queryClient.invalidateQueries({ queryKey: ['department_members', deptId] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);
  };

  const handleAdd = async () => {
    if (!deptId) {
      toast.error('Maintenance department is not available. Run migrations/seed.');
      return;
    }
    if (!selectedUserId) {
      toast.error('Please select a user.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDepartmentMember(deptId, selectedUserId, 'member');
      toast.success('User added to Maintenance successfully');
      setSelectedUserId('');
      await refresh();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        toast.error('This user is already a member of Maintenance.');
      } else {
        toast.error('Failed to add member');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    if (!deptId || !removing) return;

    setIsSubmitting(true);
    try {
      await removeDepartmentMember(deptId, removing.userId);
      toast.success('Member removed');
      setRemoving(null);
      await refresh();
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = isLoadingDept || isLoadingUsers || isLoadingMembers;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-[420px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Maintenance Department Members</h1>
          <p className="text-sm text-muted-foreground">Users added here will receive maintenance-related audit notifications.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="w-full md:w-[520px]">
          <div className="text-sm font-medium mb-1">User</div>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger>
              <SelectValue placeholder={availableUsers.length > 0 ? 'Select a user' : 'No available users'} />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map(u => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleAdd} disabled={isSubmitting || !selectedUserId || !deptId}>
          <Plus className="mr-2 h-4 w-4" />
          Add
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                  No members in Maintenance yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map(m => {
                const u = usersById.get(m.user_id);
                const name = u?.full_name ?? 'Unknown';
                const email = u?.email ?? '';

                return (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>{email}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setRemoving({ userId: m.user_id, name })}
                        disabled={isSubmitting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removing?.name ?? 'this user'} from the Maintenance department?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={isSubmitting}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
