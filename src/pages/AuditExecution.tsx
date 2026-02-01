import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditExecution } from '@/hooks/useAuditExecution';
import { ChecklistSection } from '@/components/audits/execution/ChecklistSection';
import { ScoreBar } from '@/components/audits/execution/ScoreBar';
import { AuditSummary } from '@/components/audits/execution/AuditSummary';
import { getEntityName } from '@/lib/auditStorage';
import { getUserById } from '@/lib/entityStorage';
import { cn } from '@/lib/utils';

export default function AuditExecution() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    audit,
    template,
    itemStates,
    isLoading,
    isSaving,
    isSubmitting,
    scoreResult,
    completionStats,
    isReadOnly,
    submittedFindings,
    submittedCAPAs,
    updateItemResponse,
    addEvidenceFile,
    removeEvidenceFile,
    removeEvidenceUrl,
    updateManualFinding,
    saveDraft,
    submitAudit,
  } = useAuditExecution(id || '');

  const handleSaveDraft = async () => {
    await saveDraft();
    toast({
      title: 'Draft saved',
      description: 'Your progress has been saved.',
    });
  };

  const handleSubmit = async () => {
    const result = await submitAudit();
    
    if (!result.success) {
      toast({
        title: 'Submission failed',
        description: result.error,
        variant: 'destructive',
      });
      
      // Scroll to problematic item
      if (result.scrollToItemId) {
        const element = document.getElementById(`item-${result.scrollToItemId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('animate-pulse');
          setTimeout(() => element.classList.remove('animate-pulse'), 2000);
        }
      }
      return;
    }

    toast({
      title: 'Audit submitted successfully',
      description: `${result.findingsCount} findings generated, ${result.capaCount} CAPA assigned.`,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!audit || !template) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted-foreground">Audit not found</p>
        <Button variant="link" onClick={() => navigate('/audits')}>
          Back to Audits
        </Button>
      </div>
    );
  }

  const entityName = getEntityName(audit.entity_type, audit.entity_id);
  const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;

  const statusColors: Record<string, string> = {
    scheduled: 'bg-gray-100 text-gray-700',
    in_progress: 'bg-blue-100 text-blue-700',
    submitted: 'bg-yellow-100 text-yellow-700',
    pending_verification: 'bg-orange-100 text-orange-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-500 line-through',
  };

  const entityTypeBadgeColors: Record<string, string> = {
    branch: 'bg-gray-100 text-gray-700',
    bck: 'bg-purple-100 text-purple-700',
    supplier: 'bg-blue-100 text-blue-700',
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background border-b -mx-6 px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left side */}
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/audits')}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Audits
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{audit.audit_code}</span>
                <span className="text-muted-foreground">{entityName}</span>
                <Badge className={cn('text-xs', entityTypeBadgeColors[audit.entity_type])}>
                  {audit.entity_type.toUpperCase()}
                </Badge>
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Progress */}
            <div className="hidden md:flex items-center gap-3 min-w-[200px]">
              <Progress value={completionStats.percentage} className="h-2" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {completionStats.answered} of {completionStats.total} ({completionStats.percentage}%)
              </span>
            </div>

            {/* Actions */}
            {!isReadOnly && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button
                  size="sm"
                  className="bg-[#8B0000] hover:bg-[#8B0000]/90"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  <Send className="h-4 w-4 mr-1" />
                  {isSubmitting ? 'Submitting...' : 'Submit Audit'}
                </Button>
              </>
            )}

            {/* Status Badge */}
            <Badge className={cn('ml-2', statusColors[audit.status])}>
              {audit.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Audit Info Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Audit Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Entity:</span>
              <p className="font-medium">{entityName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Template:</span>
              <p className="font-medium">{template.name}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Scheduled Date:</span>
              <p className="font-medium">
                {format(new Date(audit.scheduled_date), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Auditor:</span>
              <p className="font-medium">{auditor?.full_name || 'Unassigned'}</p>
            </div>
            {audit.started_at && (
              <div>
                <span className="text-muted-foreground">Started:</span>
                <p className="font-medium">
                  {format(new Date(audit.started_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}
            {audit.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed:</span>
                <p className="font-medium">
                  {format(new Date(audit.completed_at), 'MMM d, yyyy h:mm a')}
                </p>
              </div>
            )}
            {audit.score !== undefined && (
              <div>
                <span className="text-muted-foreground">Final Score:</span>
                <p className={cn(
                  'font-bold',
                  audit.pass_fail === 'pass' ? 'text-green-600' : 'text-destructive'
                )}>
                  {audit.score.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Checklist Sections */}
      <div className="space-y-4">
        {template.checklist_json.sections
          .sort((a, b) => a.order - b.order)
          .map(section => (
            <ChecklistSection
              key={section.id}
              section={section}
              itemStates={itemStates}
              isReadOnly={isReadOnly}
              onResponseChange={updateItemResponse}
              onAddEvidence={addEvidenceFile}
              onRemoveEvidence={removeEvidenceFile}
              onRemoveEvidenceUrl={removeEvidenceUrl}
              onManualFindingChange={updateManualFinding}
            />
          ))}
      </div>

      {/* Summary for completed audits */}
      {isReadOnly && (submittedFindings.length > 0 || submittedCAPAs.length > 0 || audit.status === 'submitted') && (
        <AuditSummary findings={submittedFindings} capas={submittedCAPAs} />
      )}

      {/* Score Bar */}
      {!isReadOnly && (
        <ScoreBar
          score={scoreResult.totalScore}
          passThreshold={template.scoring_config.pass_threshold}
          passFail={scoreResult.passFail}
          criticalFail={scoreResult.criticalFail}
          isSubmitting={isSubmitting}
          isReadOnly={isReadOnly}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
