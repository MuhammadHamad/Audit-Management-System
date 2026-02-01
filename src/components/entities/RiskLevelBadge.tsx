import { cn } from '@/lib/utils';
import { RiskLevel } from '@/types';

interface RiskLevelBadgeProps {
  level: RiskLevel;
}

const levelConfig: Record<RiskLevel, { label: string; dotClass: string }> = {
  low: { label: 'Low', dotClass: 'bg-green-500' },
  medium: { label: 'Medium', dotClass: 'bg-yellow-500' },
  high: { label: 'High', dotClass: 'bg-red-500' },
};

export function RiskLevelBadge({ level }: RiskLevelBadgeProps) {
  const config = levelConfig[level] || levelConfig.medium;

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={cn('h-2 w-2 rounded-full', config.dotClass)} />
      {config.label}
    </span>
  );
}
