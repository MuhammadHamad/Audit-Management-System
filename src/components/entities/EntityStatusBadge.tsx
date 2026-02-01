import { cn } from '@/lib/utils';

type StatusType =
  | 'active'
  | 'inactive'
  | 'under_renovation'
  | 'temporarily_closed'
  | 'under_maintenance'
  | 'under_review'
  | 'suspended'
  | 'blacklisted';

interface EntityStatusBadgeProps {
  status: StatusType;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  active: { label: 'Active', className: 'text-green-600' },
  inactive: { label: 'Inactive', className: 'text-red-600' },
  under_renovation: { label: 'Under Renovation', className: 'text-orange-600' },
  temporarily_closed: { label: 'Temporarily Closed', className: 'text-yellow-600' },
  under_maintenance: { label: 'Under Maintenance', className: 'text-orange-600' },
  under_review: { label: 'Under Review', className: 'text-yellow-600' },
  suspended: { label: 'Suspended', className: 'text-red-600' },
  blacklisted: { label: 'Blacklisted', className: 'text-red-800' },
};

export function EntityStatusBadge({ status }: EntityStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.inactive;

  return (
    <span className={cn('text-sm font-medium', config.className)}>
      {config.label}
    </span>
  );
}
