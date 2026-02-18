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
  updateMemberRole,
} from '@/lib/departmentSupabase';
import { fetchUsers } from '@/lib/userStorage';

type RoleInDept = 'member' | 'head';

export default function QualityMembersPage() {
  const queryClient = useQueryClient();

  const { data: qualityDept, isLoading: isLoadingDept } = useQuery({
    queryKey: ['department', 'quality'],
    queryFn: async () => {
      return fetchDepartmentBySlug('quality');
    },
  });

  const deptId = qualityDept?.id ?? null;

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
  const [selectedRoleInDept, setSelectedRoleInDept] = useState<RoleInDept>('member');
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
      queryClient.invalidateQueries({ queryKey: ['department', 'quality'] }),
      queryClient.invalidateQueries({ queryKey: ['department_members', deptId] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
    ]);
  };

  const handleAdd = async () => {
    if (!deptId) {
      toast.error('Quality department is not available. Run migrations/seed.');
      return;
    }
    if (!selectedUserId) {
      toast.error('Please select a user.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDepartmentMember(deptId, selectedUserId, selectedRoleInDept);
      toast.success('User added to Quality successfully');
      setSelectedUserId('');
      setSelectedRoleInDept('member');
      await refresh();
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        toast.error('This user is already a member of Quality.');
      } else {
        toast.error('Failed to add member');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (userId: string, nextRole: RoleInDept) => {
    if (!deptId) return;
    try {
      await updateMemberRole(deptId, userId, nextRole);
      toast.success('Role updated');
      await refresh();
    } catch {
      toast.error('Failed to update role');
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
          <h1 className="text-2xl font-semibold">Quality Department Members</h1>
          <p className="text-sm text-muted-foreground">Add users as Quality members or mark them as Heads of Quality.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="w-full md:w-[420px]">
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

        <div className="w-full md:w-[220px]">
          <div className="text-sm font-medium mb-1">Role in Quality</div>
          <Select value={selectedRoleInDept} onValueChange={(v) => setSelectedRoleInDept(v as RoleInDept)}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="head">Head</SelectItem>
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
              <TableHead className="w-[180px]">Role in Quality</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  No members in Quality yet.
                </TableCell>
              </TableRow>
            ) : (
              members.map(m => {
                const u = usersById.get(m.user_id);
                const name = u?.full_name ?? 'Unknown';
                const email = u?.email ?? '';
                const role = (m.role_in_dept as RoleInDept) || 'member';

                return (
                  <TableRow key={m.user_id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>{email}</TableCell>
                    <TableCell>
                      <Select value={role} onValueChange={(v) => void handleRoleChange(m.user_id, v as RoleInDept)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="head">Head</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
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
              Are you sure you want to remove {removing?.name ?? 'this user'} from the Quality department?
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
