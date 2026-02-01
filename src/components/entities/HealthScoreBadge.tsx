import { cn } from '@/lib/utils';

interface HealthScoreBadgeProps {
  score: number;
  hasAudits?: boolean;
  showLabel?: boolean;
}

export function HealthScoreBadge({ score, hasAudits = true, showLabel = false }: HealthScoreBadgeProps) {
  if (!hasAudits || score === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
  }

  const getScoreConfig = (score: number) => {
    if (score >= 85) {
      return { label: 'Excellent', className: 'bg-green-100 text-green-700 border-green-200' };
    }
    if (score >= 70) {
      return { label: 'Good', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    }
    if (score >= 50) {
      return { label: 'Needs Improvement', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
    return { label: 'Critical', className: 'bg-red-100 text-red-700 border-red-200' };
  };

  const config = getScoreConfig(score);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
        config.className
      )}
    >
      {score}
      {showLabel && <span className="ml-0.5">• {config.label}</span>}
    </span>
  );
}
