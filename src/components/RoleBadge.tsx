import { UserRole } from '@/types';
import { cn } from '@/lib/utils';

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

const roleConfig: Record<UserRole, { label: string; className: string }> = {
  super_admin: {
    label: 'Super Admin',
    className: 'bg-role-super-admin text-white',
  },
  audit_manager: {
    label: 'Audit Manager',
    className: 'bg-role-audit-manager text-white',
  },
  regional_manager: {
    label: 'Regional Manager',
    className: 'bg-role-regional-manager text-white',
  },
  auditor: {
    label: 'Auditor',
    className: 'bg-role-auditor text-white',
  },
  branch_manager: {
    label: 'Branch Manager',
    className: 'bg-role-branch-manager text-white',
  },
  bck_manager: {
    label: 'BCK Manager',
    className: 'bg-role-bck-manager text-white',
  },
  staff: {
    label: 'Staff',
    className: 'bg-role-staff text-white',
  },
};

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const config = roleConfig[role];
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
