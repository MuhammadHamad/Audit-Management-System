import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ScoreBarProps {
  score: number;
  passThreshold: number;
  passFail: 'pass' | 'fail';
  criticalFail: boolean;
  isSubmitting: boolean;
  isReadOnly: boolean;
  onSubmit: () => void;
}

export function ScoreBar({
  score,
  passThreshold,
  passFail,
  criticalFail,
  isSubmitting,
  isReadOnly,
  onSubmit,
}: ScoreBarProps) {
  const isPassing = passFail === 'pass';

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-lg z-40">
      <div className="container max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Score */}
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Current Score:</span>
              <span
                className={cn(
                  'ml-2 text-2xl font-bold',
                  isPassing ? 'text-green-600' : 'text-destructive'
                )}
              >
                {score.toFixed(1)}
              </span>
              <span className="text-muted-foreground text-lg"> / 100</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Pass threshold: {passThreshold}%
            </div>
          </div>

          {/* Pass/Fail Badge */}
          <div className="flex-1 flex justify-center">
            {criticalFail ? (
              <Badge
                variant="destructive"
                className="text-sm px-4 py-1 animate-pulse"
              >
                CRITICAL FAIL
              </Badge>
            ) : (
              <Badge
                variant={isPassing ? 'default' : 'destructive'}
                className={cn(
                  'text-sm px-4 py-1',
                  isPassing && 'bg-green-600 hover:bg-green-600'
                )}
              >
                {isPassing ? 'PASS' : 'FAIL'}
              </Badge>
            )}
          </div>

          {/* Submit Button */}
          {!isReadOnly && (
            <Button
              onClick={onSubmit}
              disabled={isSubmitting}
              className="bg-[#8B0000] hover:bg-[#8B0000]/90"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Audit'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
