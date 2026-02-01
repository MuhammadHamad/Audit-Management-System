import { cn } from '@/lib/utils';
import {
  EntityType,
  getThresholdConfig,
  COMPONENT_WEIGHTS,
  COMPONENT_LABELS,
} from '@/lib/healthScoreEngine';

interface HealthScoreIndicatorProps {
  score: number;
  entityType: EntityType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showComponents?: boolean;
  components?: Record<string, number> | null;
  hasAudits?: boolean;
}

export function HealthScoreIndicator({
  score,
  entityType,
  size = 'sm',
  showLabel = false,
  showComponents = false,
  components = null,
  hasAudits = true,
}: HealthScoreIndicatorProps) {
  // No data state
  if (!hasAudits || score === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
  }

  const config = getThresholdConfig(score, entityType);
  const displayScore = score % 1 === 0 ? score.toString() : score.toFixed(1);

  // Small size - colored badge pill
  if (size === 'sm') {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white min-w-[32px]"
        style={{ backgroundColor: config.color }}
      >
        {displayScore}
      </span>
    );
  }

  // Medium size - circular gauge
  if (size === 'md') {
    const circumference = 2 * Math.PI * 30; // radius = 30
    const progress = (score / 100) * circumference;

    return (
      <div className="flex flex-col items-center">
        <div className="relative w-[72px] h-[72px]">
          <svg className="w-full h-full -rotate-90">
            {/* Background circle */}
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted/30"
            />
            {/* Progress arc */}
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              stroke={config.color}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference - progress}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-semibold">{displayScore}</span>
          </div>
        </div>
        {showLabel && (
          <span
            className="mt-1 text-xs font-medium"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
        )}
      </div>
    );
  }

  // Large size - full gauge with optional component breakdown
  const circumference = 2 * Math.PI * 50; // radius = 50
  const progress = (score / 100) * circumference;
  const weights = COMPONENT_WEIGHTS[entityType];

  return (
    <div className="flex flex-col items-center">
      {/* Large circular gauge */}
      <div className="relative w-[120px] h-[120px]">
        <svg className="w-full h-full -rotate-90">
          {/* Background circle */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          {/* Progress arc */}
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={config.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold">{displayScore}</span>
        </div>
      </div>
      
      {showLabel && (
        <span
          className="mt-2 text-sm font-medium"
          style={{ color: config.color }}
        >
          {config.label}
        </span>
      )}

      {/* Component breakdown */}
      {showComponents && components && (
        <div className="mt-4 w-full max-w-xs space-y-2">
          {Object.entries(weights).map(([key, weight]) => {
            const value = components[key] ?? 0;
            const componentConfig = getThresholdConfig(value, entityType);
            const displayValue = value % 1 === 0 ? value.toString() : value.toFixed(1);

            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {COMPONENT_LABELS[key] || key}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{displayValue}</span>
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(weight * 100)}%)
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${value}%`,
                      backgroundColor: componentConfig.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact inline badge variant for tables (backwards compatible)
export function HealthScoreBadge({
  score,
  hasAudits = true,
  showLabel = false,
}: {
  score: number;
  hasAudits?: boolean;
  showLabel?: boolean;
}) {
  return (
    <HealthScoreIndicator
      score={score}
      entityType="branch"
      size="sm"
      hasAudits={hasAudits}
      showLabel={showLabel}
    />
  );
}

// Quality score badge for suppliers
export function QualityScoreBadge({
  score,
  hasAudits = true,
}: {
  score: number;
  hasAudits?: boolean;
}) {
  if (!hasAudits || score === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
  }

  const config = getThresholdConfig(score, 'supplier');
  const displayScore = score % 1 === 0 ? score.toString() : score.toFixed(1);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium border',
      )}
      style={{
        backgroundColor: `${config.color}20`,
        color: config.color,
        borderColor: `${config.color}40`,
      }}
    >
      {displayScore} • {config.label}
    </span>
  );
}
