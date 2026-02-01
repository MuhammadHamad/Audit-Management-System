import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserRole } from '@/types';
import { cn } from '@/lib/utils';

const roleColors: Record<UserRole, string> = {
  super_admin: 'bg-role-super-admin',
  audit_manager: 'bg-role-audit-manager',
  regional_manager: 'bg-role-regional-manager',
  auditor: 'bg-role-auditor',
  branch_manager: 'bg-role-branch-manager',
  bck_manager: 'bg-role-bck-manager',
  staff: 'bg-role-staff',
};

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  role: UserRole;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ name, avatarUrl, role, size = 'md' }: UserAvatarProps) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base',
  };

  return (
    <Avatar className={sizeClasses[size]}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className={cn(roleColors[role], 'text-white font-medium')}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
