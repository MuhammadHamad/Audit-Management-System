import { cn } from '@/lib/utils';
import { SupplierType } from '@/types';

interface SupplierTypeBadgeProps {
  type: SupplierType;
}

const typeConfig: Record<SupplierType, { label: string; className: string }> = {
  food: { label: 'Food', className: 'bg-green-100 text-green-700 border-green-200' },
  packaging: { label: 'Packaging', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  equipment: { label: 'Equipment', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  service: { label: 'Service', className: 'bg-orange-100 text-orange-700 border-orange-200' },
};

export function SupplierTypeBadge({ type }: SupplierTypeBadgeProps) {
  const config = typeConfig[type] || typeConfig.food;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}
