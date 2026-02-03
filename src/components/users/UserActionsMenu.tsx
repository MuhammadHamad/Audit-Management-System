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
import { updateUser, deleteUser } from '@/lib/userStorage';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UserActionsMenuProps {
  user: User;
  onEdit: () => void;
  onRefresh: () => void;
}

export function UserActionsMenu({ user, onEdit, onRefresh }: UserActionsMenuProps) {
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showResetPasswordDialog, setShowResetPasswordDialog] = useState(false);

  const isActive = user.status === 'active';
  const canDelete = !user.last_login_at;

  const handleToggleStatus = async () => {
    const newStatus = isActive ? 'inactive' : 'active';
    await updateUser(user.id, { status: newStatus });
    toast.success(`User ${user.full_name} ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
    setShowDeactivateDialog(false);
    onRefresh();
  };

  const handleDelete = async () => {
    const success = await deleteUser(user.id);
    if (success) {
      toast.success(`User ${user.full_name} deleted`);
      onRefresh();
    } else {
      toast.error('Cannot delete this user');
    }
    setShowDeleteDialog(false);
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
              This will permanently delete {user.full_name}. This action cannot be undone.
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
