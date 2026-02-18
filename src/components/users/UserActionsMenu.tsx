import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { MoreHorizontal, Pencil, UserX, UserCheck, KeyRound, Trash2 } from 'lucide-react';
import { User } from '@/types';
import { updateUser } from '@/lib/userStorage';
import { supabase } from '@/integrations/supabase/client';
import { getAdminClient } from '@/integrations/supabase/adminClient';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface UserActionsMenuProps {
  user: User;
  onEdit: () => void;
  onRefresh: () => void;
}

export function UserActionsMenu({ user, onEdit, onRefresh }: UserActionsMenuProps) {
  const { user: currentUser } = useAuth();
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);

  const isActive = user.status === 'active';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  // Super admins can delete any user except themselves; others can only delete users who never logged in
  const canDelete = isSuperAdmin ? user.id !== currentUser?.id : !user.last_login_at;

  const handleToggleStatus = async () => {
    const newStatus = isActive ? 'inactive' : 'active';
    await updateUser(user.id, { status: newStatus });
    toast.success(`User ${user.full_name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    setShowDeactivateDialog(false);
    onRefresh();
  };

  const handleDelete = async () => {
    try {
      const adminClient = getAdminClient();
      if (!adminClient) {
        toast.error('Service role key is not configured. Cannot delete users.');
        return;
      }

      // Step 1: Nullify FK references so the user row can be deleted
      try {
        await (supabase as any).rpc('cleanup_user_references', { _user_id: user.id });
      } catch {
        // RPC may not exist yet or may fail — fall back to admin client cleanup below
      }

      // Step 2: Nullify FK references via admin client (bypasses RLS, handles cases RPC missed)
      const tables: { table: string; column: string }[] = [
        { table: 'regions', column: 'manager_id' },
        { table: 'branches', column: 'manager_id' },
        { table: 'bcks', column: 'manager_id' },
        { table: 'audit_plans', column: 'assigned_auditor_id' },
        { table: 'audit_plans', column: 'created_by' },
        { table: 'audits', column: 'auditor_id' },
        { table: 'audits', column: 'created_by' },
        { table: 'audit_templates', column: 'created_by' },
        { table: 'capa', column: 'assigned_to' },
        { table: 'capa_activity', column: 'user_id' },
        { table: 'incidents', column: 'assigned_to' },
        { table: 'incidents', column: 'created_by' },
        { table: 'audit_logs', column: 'user_id' },
      ];

      await Promise.allSettled(
        tables.map(({ table, column }) =>
          adminClient
            .from(table)
            .update({ [column]: null })
            .eq(column, user.id)
            .then(({ error }) => {
              if (error && !error.message.includes('column') && !error.message.includes('relation')) {
                console.warn(`Cleanup failed for ${table}.${column}:`, error);
              }
            })
        )
      );

      // Step 3: Delete owned rows via admin client
      const ownedTables = ['notifications', 'user_assignments', 'department_members', 'user_roles'];
      await Promise.allSettled(
        ownedTables.map(table =>
          adminClient
            .from(table)
            .delete()
            .eq('user_id', user.id)
        )
      );

      // Step 4: Delete public.users row via admin client (bypasses RLS)
      const { error: deleteError } = await adminClient
        .from('users')
        .delete()
        .eq('id', user.id);

      if (deleteError) {
        toast.error(deleteError.message || 'Failed to delete user profile.');
        return;
      }

      // Step 5: Delete Auth user via admin API (best-effort)
      try {
        await adminClient.auth.admin.deleteUser(user.id);
      } catch {
        // Auth user may not exist (e.g. manually added to public.users only)
      }

      toast.success(`User ${user.full_name} deleted`);
      setShowDeleteDialog(false);
      onRefresh();
    } catch (err: any) {
      console.error('Delete user error:', err);
      toast.error(err?.message || 'Failed to delete user. Please try again.');
    }
  };

  const handleResetPassword = async () => {
    try {
      // Use Supabase Auth to send password reset email
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      
      if (error) {
        toast.error('Failed to send password reset email');
      } else {
        toast.success(`Password reset email sent to ${user.email}`);
      }
    } catch {
      toast.error('Failed to reset password');
    }
    setShowResetPasswordDialog(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeactivateDialog(true)}>
            {isActive ? (
              <>
                <UserX className="mr-2 h-4 w-4" />
                Deactivate
              </>
            ) : (
              <>
                <UserCheck className="mr-2 h-4 w-4" />
                Activate
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowResetPasswordDialog(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Reset Password
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deactivate/Activate Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isActive ? 'Deactivate' : 'Activate'} {user.full_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isActive
                ? 'This user will no longer be able to log in. You can reactivate them later.'
                : 'This user will be able to log in again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleToggleStatus}>
              {isActive ? 'Deactivate' : 'Activate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {user.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {user.full_name} and all their associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <AlertDialog open={showResetPasswordDialog} onOpenChange={setShowResetPasswordDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password for {user.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A password reset email will be sent to {user.email}.
              <br />
              They will need to click the link to set a new password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetPassword}>Send Reset Email</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
