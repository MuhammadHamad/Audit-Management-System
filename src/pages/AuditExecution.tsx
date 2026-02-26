import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Send, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAuditExecution } from '@/hooks/useAuditExecution';
import { ChecklistSection } from '@/components/audits/execution/ChecklistSection';
import { ScoreBar } from '@/components/audits/execution/ScoreBar';
import { AuditSummary } from '@/components/audits/execution/AuditSummary';
import { getEntityName } from '@/lib/auditStorage';
import { getUserById } from '@/lib/entityStorage';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  buildAuditComprehensiveExportBundle,
  exportAuditComprehensiveReportToExcel,
  openAuditComprehensiveReportPrintView,
} from '@/lib/capaExport';

export default function AuditExecution() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isExportingAudit, setIsExportingAudit] = useState(false);

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
    updateItemCAPAPriority,
    updateItemCAPADueDate,
    saveDraft,
    submitAudit,
  } = useAuditExecution(id || '');

  const canExportReport = ['head_of_quality', 'audit_manager', 'super_admin'].includes(user?.role || '');
  const getAuditBundleQueryKey = (auditId: string) => ['auditComprehensiveExportBundle', auditId] as const;

  const getOrFetchAuditBundle = async (auditId: string) => {
    const key = getAuditBundleQueryKey(auditId);
    const cached = queryClient.getQueryData<any>(key);
    if (cached) return cached;
    return queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => buildAuditComprehensiveExportBundle(auditId),
      staleTime: 2 * 60 * 1000,
    });
  };

  const handleExportAuditPdf = async () => {
    if (!canExportReport) return;
    if (!audit?.id) return;
    if (isExportingAudit) return;

    setIsExportingAudit(true);
    try {
      const bundle = await getOrFetchAuditBundle(audit.id);
      openAuditComprehensiveReportPrintView(bundle);
      toast({ title: 'Report opened', description: 'Use your browser Print → Save as PDF.' });
    } catch (e: any) {
      console.error('Audit comprehensive export (pdf) failed', e);
      toast({ title: 'Error', description: e?.message || 'Failed to open report', variant: 'destructive' });
    } finally {
      setIsExportingAudit(false);
    }
  };

  const handleExportAuditExcel = async () => {
    if (!canExportReport) return;
    if (!audit?.id) return;
    if (isExportingAudit) return;

    setIsExportingAudit(true);
    try {
      const bundle = await getOrFetchAuditBundle(audit.id);
      exportAuditComprehensiveReportToExcel(bundle);
      toast({ title: 'Exported', description: 'Excel report downloaded.' });
    } catch (e: any) {
      console.error('Audit comprehensive export (excel) failed', e);
      toast({ title: 'Error', description: e?.message || 'Failed to export Excel', variant: 'destructive' });
    } finally {
      setIsExportingAudit(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await saveDraft();
      toast({
        title: 'Draft saved',
        description: 'Your progress has been saved.',
      });
    } catch (e: any) {
      toast({
        title: 'Save failed',
        description: e?.message || 'Failed to save draft',
        variant: 'destructive',
      });
    }
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
    scheduled: 'border-slate-300/60 bg-slate-500/10 text-slate-700 dark:text-slate-200',
    in_progress: 'border-sky-300/60 bg-sky-500/10 text-sky-700 dark:text-sky-200',
    submitted: 'border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    pending_verification: 'border-orange-300/60 bg-orange-500/10 text-orange-700 dark:text-orange-200',
    approved: 'border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    rejected: 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    overdue: 'border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    cancelled: 'border-slate-300/60 bg-slate-500/10 text-slate-500 line-through',
  };

  const entityTypeBadgeColors: Record<string, string> = {
    branch: 'border-slate-300/60 bg-slate-500/10 text-slate-700 dark:text-slate-200',
    bck: 'border-violet-300/60 bg-violet-500/10 text-violet-700 dark:text-violet-200',
    supplier: 'border-sky-300/60 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background border-b -mx-4 md:-mx-6 px-4 md:px-6 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Left side */}
            <div className="flex items-start gap-3 min-w-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/audits')}
                className="shrink-0"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Audits
              </Button>

              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold truncate">{audit.audit_code}</span>
                  <Badge
                    className={cn(
                      'h-5 px-2 text-[10px] font-medium rounded-md border shrink-0 uppercase tracking-wide',
                      statusColors[audit.status]
                    )}
                  >
                    {audit.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                  <span className="truncate">{entityName}</span>
                  <Badge
                    className={cn(
                      'h-5 px-2 text-[10px] font-medium rounded-md border uppercase tracking-wide',
                      entityTypeBadgeColors[audit.entity_type]
                    )}
                  >
                    {audit.entity_type.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Right side */}
            <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
              {canExportReport && (
                <>
                  <div className="hidden sm:flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportAuditPdf}
                      disabled={isExportingAudit}
                    >
                      Export PDF
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportAuditExcel}
                      disabled={isExportingAudit}
                    >
                      Export Excel
                    </Button>
                  </div>

                  <div className="sm:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isExportingAudit}>
                          Export
                          <MoreVertical className="h-4 w-4 ml-1" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handleExportAuditPdf}>
                          Export PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleExportAuditExcel}>
                          Export Excel
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              )}

              {!isReadOnly && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                  >
                    <Save className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save Draft'}</span>
                    <span className="sm:hidden">{isSaving ? 'Saving...' : 'Save'}</span>
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#8B0000] hover:bg-[#8B0000]/90"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    <Send className="h-4 w-4 mr-1" />
                    <span className="hidden sm:inline">{isSubmitting ? 'Submitting...' : 'Submit Audit'}</span>
                    <span className="sm:hidden">{isSubmitting ? 'Submitting...' : 'Submit'}</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <Progress value={completionStats.percentage} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {completionStats.answered}/{completionStats.total} ({completionStats.percentage}%)
            </span>
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
              onCAPAPriorityChange={updateItemCAPAPriority}
              onCAPADueDateChange={updateItemCAPADueDate}
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
