import { cn } from '@/lib/utils';

interface QualityScoreBadgeProps {
  score: number;
  hasAudits?: boolean;
}

export function QualityScoreBadge({ score, hasAudits = true }: QualityScoreBadgeProps) {
  if (!hasAudits || score === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
  }

  const getScoreConfig = (score: number) => {
    if (score >= 90) {
      return { label: 'Approved', className: 'bg-green-100 text-green-700 border-green-200' };
    }
    if (score >= 75) {
      return { label: 'Conditional', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    }
    if (score >= 60) {
      return { label: 'Under Review', className: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
    return { label: 'Suspended', className: 'bg-red-100 text-red-700 border-red-200' };
  };

  const config = getScoreConfig(score);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
        config.className
      )}
    >
      {score} • {config.label}
    </span>
  );
}
