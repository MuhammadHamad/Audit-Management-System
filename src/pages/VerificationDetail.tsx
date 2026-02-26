import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, 
  Check, 
  X, 
  Flag,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  AlertTriangle,
  Clock,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Audit } from '@/lib/auditStorage';
import { 
  Finding,
  CAPA,
  AuditResult
} from '@/lib/auditExecutionStorage';
import {
  approveCAPA,
  rejectCAPA,
  approveAudit,
  rejectAudit,
  fetchCAPAActivitiesByCAPAIds,
  signAuditEvidencePaths,
  CAPAActivity
} from '@/lib/verificationSupabase';
import { fetchAuditById } from '@/lib/auditSupabase';
import {
  fetchAuditResults,
  fetchCAPAsByAuditId,
  fetchFindingsByAuditId,
  createSignedCAPAEvidenceUrls,
  createSignedAuditEvidenceUrls,
} from '@/lib/executionSupabase';
import { fetchAuditEntityAndAuditorInfo } from '@/lib/verificationSupabase';
import { getUsers } from '@/lib/userStorage';
import { EvidenceLightbox } from '@/components/verification/EvidenceLightbox';
import { format, formatDistanceToNow } from 'date-fns';
import { fetchTemplateById } from '@/lib/templateSupabase';
import {
  buildAuditComprehensiveExportBundle,
  buildCAPAExportBundle,
  exportAuditComprehensiveReportToExcel,
  exportCAPAReportToExcel,
  openAuditComprehensiveReportPrintView,
  openCAPAReportPrintView,
} from '@/lib/capaExport';

interface ChecklistItemDisplay {
  id: string;
  text: string;
  response: any;
  evidence: string[];
  points: number;
  maxPoints: number;
  finding?: Finding;
}

interface ChecklistSectionDisplay {
  id: string;
  name: string;
  weight: number;
  items: ChecklistItemDisplay[];
  score: number;
  maxScore: number;
}

export default function VerificationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const from = searchParams.get('from');
  const backHref = from === 'capa' ? '/capa/pending-verification' : '/audits/pending-verification';
  
  const [isLoading, setIsLoading] = useState(true);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [capas, setCapas] = useState<CAPA[]>([]);
  const [capaActivities, setCAPAActivities] = useState<Record<string, CAPAActivity[]>>({});
  const [capaDecisions, setCAPADecisions] = useState<Record<string, 'approved' | 'rejected' | 'pending'>>({});
  const [sections, setSections] = useState<ChecklistSectionDisplay[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  
  // Lightbox state
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  
  // Modal states
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [flagReason, setFlagReason] = useState('');
  const [selectedCAPAsForReject, setSelectedCAPAsForReject] = useState<Set<string>>(new Set());
  
  // Inline rejection state for individual CAPA
  const [inlineRejectCapaId, setInlineRejectCapaId] = useState<string | null>(null);
  const [inlineRejectReason, setInlineRejectReason] = useState('');
  
  // Entity info
  const [entityInfo, setEntityInfo] = useState<{
    name: string;
    code: string;
    city?: string;
    type: string;
  } | null>(null);
  
  const [auditorName, setAuditorName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [evidenceByItemId, setEvidenceByItemId] = useState<Map<string, string[]>>(new Map());
  const [isExportingCapaId, setIsExportingCapaId] = useState<string | null>(null);
  const [isExportingAudit, setIsExportingAudit] = useState(false);

  const canExportReport = ['head_of_quality', 'audit_manager', 'super_admin'].includes(user?.role || '');

  const getBundleQueryKey = (capaId: string) => ['capaExportBundle', capaId] as const;
  const getAuditBundleQueryKey = (auditId: string) => ['auditComprehensiveExportBundle', auditId] as const;

  const getOrFetchExportBundle = async (capaId: string) => {
    const key = getBundleQueryKey(capaId);
    const cached = queryClient.getQueryData<any>(key);
    if (cached) return cached;
    return queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => buildCAPAExportBundle(capaId),
      staleTime: 2 * 60 * 1000,
    });
  };

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

  const templateQuery = useQuery({
    queryKey: ['template', audit?.template_id],
    queryFn: async () => {
      if (!audit?.template_id) return null;
      return fetchTemplateById(audit.template_id);
    },
    enabled: !!audit?.template_id,
  });

  useEffect(() => {
    if (id && user) {
      loadData();
    }
  }, [id, user]);

  useEffect(() => {
    if (from !== 'capa') return;
    // If opened from CAPA verification queue, auto-scroll to CAPA section.
    // Delay until after initial render.
    const t = window.setTimeout(() => {
      document.getElementById('findings-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
    return () => window.clearTimeout(t);
  }, [from]);

  useEffect(() => {
    if (!canExportReport) return;
    if (!capas.length) return;

    let cancelled = false;
    const ids = capas.map((c) => c.id);

    const concurrency = 3;

    const run = async () => {
      for (let i = 0; i < ids.length; i += concurrency) {
        if (cancelled) return;
        const batch = ids.slice(i, i + concurrency);
        const tasks = batch.map((capaId) =>
          queryClient.prefetchQuery({
            queryKey: getBundleQueryKey(capaId),
            queryFn: () => buildCAPAExportBundle(capaId),
            staleTime: 2 * 60 * 1000,
          })
        );
        await Promise.allSettled(tasks);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [canExportReport, capas, queryClient]);

  const signCAPAEvidencePaths = async (paths: string[]): Promise<string[]> => {
    return createSignedCAPAEvidenceUrls(paths).catch(() => createSignedAuditEvidenceUrls(paths)).catch(() => paths);
  };

  const handleExportCAPAExcel = async (capaId: string) => {
    if (!canExportReport) return;
    if (isExportingCapaId) return;

    setIsExportingCapaId(capaId);
    try {
      const bundle = await getOrFetchExportBundle(capaId);
      exportCAPAReportToExcel(bundle);
      toast({ title: 'Exported', description: 'Excel report downloaded.' });
    } catch (e: any) {
      console.error('CAPA export (excel) failed', e);
      toast({ title: 'Error', description: e?.message || 'Failed to export Excel report', variant: 'destructive' });
    } finally {
      setIsExportingCapaId(null);
    }
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

  const handleExportCAPAPdf = async (capaId: string) => {
    if (!canExportReport) return;
    if (isExportingCapaId) return;

    setIsExportingCapaId(capaId);
    try {
      const bundle = await getOrFetchExportBundle(capaId);
      openCAPAReportPrintView(bundle);
      toast({ title: 'Report opened', description: 'Use your browser Print → Save as PDF.' });
    } catch (e: any) {
      console.error('CAPA export (pdf) failed', e);
      toast({ title: 'Error', description: e?.message || 'Failed to open PDF report', variant: 'destructive' });
    } finally {
      setIsExportingCapaId(null);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const auditData = await fetchAuditById(id!);
      if (!auditData) {
        navigate(backHref);
        return;
      }
      
      setAudit(auditData);

      // Fetch all related data in parallel
      const [info, auditCapas, auditFindings, results] = await Promise.all([
        fetchAuditEntityAndAuditorInfo(auditData),
        fetchCAPAsByAuditId(auditData.id),
        fetchFindingsByAuditId(auditData.id),
        fetchAuditResults(auditData.id),
      ]);

      setEntityInfo({
        name: info.entityName,
        code: info.entityCode,
        city: info.entityCity,
        type: info.entityTypeLabel,
      });
      setAuditorName(info.auditorName);
      
      setTemplateName('');
      setSections([]);

      const sanitizeCapaEvidencePaths = (paths: unknown): string[] => {
        if (!Array.isArray(paths)) return [];
        return (paths as unknown[])
          .filter((p): p is string => typeof p === 'string')
          .filter((p) => p.split('/').length === 2);
      };

      const sanitizedAuditCapas = auditCapas.map((c) => ({
        ...c,
        evidence_urls: sanitizeCapaEvidencePaths(c.evidence_urls),
      }));

      // Sign all evidence and fetch activities in parallel
      const allEvidencePaths: string[] = [
        ...auditFindings.flatMap(f => f.evidence_urls || []),
        ...sanitizedAuditCapas.flatMap(c => c.evidence_urls || []),
        ...results.flatMap(r => r.evidence_urls || [])
      ];

      const [allSignedUrls, activities] = await Promise.all([
        allEvidencePaths.length > 0 
          ? createSignedAuditEvidenceUrls(allEvidencePaths).catch(() => createSignedCAPAEvidenceUrls(allEvidencePaths)).catch(() => allEvidencePaths)
          : Promise.resolve([]),
        fetchCAPAActivitiesByCAPAIds(sanitizedAuditCapas.map(c => c.id))
      ]);

      const signedUrlMap = new Map<string, string>();
      allEvidencePaths.forEach((path, i) => signedUrlMap.set(path, allSignedUrls[i]));

      const getSigned = (paths: string[]) => (paths || []).map(p => signedUrlMap.get(p) || p);

      const signedFindings = auditFindings.map(f => ({
        ...f,
        evidence_urls: getSigned(f.evidence_urls || [])
      }));

      const signedCapas = sanitizedAuditCapas.map(c => ({
        ...c,
        evidence_urls: getSigned(c.evidence_urls || [])
      }));

      setCapas(signedCapas);
      setFindings(signedFindings);
      setAuditResults(results);

      const signedMap = new Map<string, string[]>();
      results.forEach(r => {
        signedMap.set(r.item_id, getSigned(r.evidence_urls || []));
      });
      setEvidenceByItemId(signedMap);
      
      const decisions: Record<string, 'approved' | 'rejected' | 'pending'> = {};
      
      auditCapas.forEach((capa) => {
        decisions[capa.id] = capa.status === 'closed' || capa.status === 'approved' 
          ? 'approved' 
          : capa.status === 'rejected' 
            ? 'rejected' 
            : 'pending';
      });
      
      setCAPAActivities(activities);
      setCAPADecisions(decisions);
      
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!audit) return;
    const template = templateQuery.data;
    if (!template) return;

    setTemplateName(template.name || 'Unknown Template');

    if (!template.checklist_json) {
      setSections([]);
      return;
    }

    const results = auditResults;
    const allFindings = findings;

    const sectionsData: ChecklistSectionDisplay[] = (template.checklist_json.sections as any[]).map((section: any) => {
      const items: ChecklistItemDisplay[] = (section.items as any[]).map((item: any) => {
        const result = results.find(r => r.item_id === item.id);
        const finding = allFindings.find(f => f.item_id === item.id);

        return {
          id: item.id,
          text: item.text,
          response: result?.response,
          evidence: evidenceByItemId.get(item.id) || [],
          points: result?.points_earned || 0,
          maxPoints: item.points,
          finding,
        };
      });

      return {
        id: section.id,
        name: section.name,
        weight: section.weight,
        items,
        score: items.reduce((sum, i) => sum + i.points, 0),
        maxScore: items.reduce((sum, i) => sum + i.maxPoints, 0),
      };
    });

    setSections(sectionsData);
  }, [audit, templateQuery.data, auditResults, evidenceByItemId, findings]);

  const handleApproveCAPA = async (capaId: string) => {
    try {
      await approveCAPA(capaId, user!.id);
      setCAPADecisions(prev => ({ ...prev, [capaId]: 'approved' }));
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      void queryClient.invalidateQueries({ queryKey: ['bcks'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      await loadData();
      toast({ title: 'CAPA approved', description: 'The corrective action has been approved.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to approve CAPA', variant: 'destructive' });
    }
  };

  const handleInlineRejectCAPA = async (capaId: string) => {
    if (!inlineRejectReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    
    try {
      await rejectCAPA(capaId, user!.id, inlineRejectReason);
      setCAPADecisions(prev => ({ ...prev, [capaId]: 'rejected' }));
      setInlineRejectCapaId(null);
      setInlineRejectReason('');
      await loadData();
      toast({ title: 'CAPA rejected', description: 'The entity manager has been notified.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to reject CAPA', variant: 'destructive' });
    }
  };

  const handleBulkRejectCAPAs = async () => {
    if (selectedCAPAsForReject.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one CAPA to reject.', variant: 'destructive' });
      return;
    }
    if (!rejectReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }

    try {
      for (const capaId of selectedCAPAsForReject) {
        await rejectCAPA(capaId, user!.id, rejectReason);
        setCAPADecisions(prev => ({ ...prev, [capaId]: 'rejected' }));
      }

      setIsRejectModalOpen(false);
      setSelectedCAPAsForReject(new Set());
      setRejectReason('');
      await loadData();
      toast({ title: 'CAPA(s) rejected', description: 'The entity manager has been notified.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to reject CAPA(s)', variant: 'destructive' });
    }
  };

  const handleApproveAudit = async () => {
    try {
      setIsRecalculating(true);
      
      // Perform approval
      await approveAudit(audit!.id, user!.id);
      
      // Clear React Query cache for audits to ensure lists are updated immediately
      void queryClient.invalidateQueries({ queryKey: ['audits'] });
      void queryClient.invalidateQueries({ queryKey: ['branches'] });
      void queryClient.invalidateQueries({ queryKey: ['bcks'] });
      void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      
      toast({ title: 'Audit approved', description: 'The audit has been successfully finalized.' });
      
      // Navigate immediately
      navigate(backHref);
    } catch (e: any) {
      setIsRecalculating(false);
      toast({ title: 'Error', description: e?.message || 'Failed to approve audit', variant: 'destructive' });
    }
  };

  const handleFlagAudit = async () => {
    if (!flagReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for flagging.', variant: 'destructive' });
      return;
    }

    try {
      await rejectAudit(audit!.id, user!.id, flagReason);
      setIsFlagModalOpen(false);
      toast({ title: 'Audit rejected', description: 'Audit has been rejected.' });
      navigate(backHref);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to reject audit', variant: 'destructive' });
    }
  };

  const openLightbox = (images: string[], index: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const scrollToFindings = () => {
    document.getElementById('findings-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Check if all CAPA are in terminal state
  const allCAPAResolved = capas.every(c => 
    capaDecisions[c.id] === 'approved' || c.status === 'closed'
  );
  
  // Count pending CAPAs
  const pendingCapas = capas.filter(c => 
    c.status === 'pending_verification' && capaDecisions[c.id] === 'pending'
  );

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      high: 'bg-orange-100 text-orange-800 border-orange-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-blue-100 text-blue-800 border-blue-200',
    };
    return colors[severity] || 'bg-gray-100 text-gray-800';
  };

  const getCAPAStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending_verification: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      closed: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getUserName = (userId: string | undefined): string => {
    if (!userId) return 'Unassigned';
    const u = getUsers().find(x => x.id === userId);
    return u?.full_name || 'Unassigned';
  };

  const getScoreColor = (score: number | undefined) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 85) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatResponse = (response: any, itemId: string): string => {
    if (!response) return '—';
    
    if (response.value === 'pass') return '✓ Pass';
    if (response.value === 'fail') return '✗ Fail';
    if (typeof response.value === 'number') return response.value.toString();
    if (typeof response.value === 'string') return response.value;
    if (typeof response.value === 'object' && response.value !== null) {
      // Checklist type
      const checked = Object.entries(response.value).filter(([, v]) => v).length;
      const total = Object.keys(response.value).length;
      return `${checked}/${total} items checked`;
    }
    return '—';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!audit || !entityInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">Audit not found.</p>
      </div>
    );
  }

  const criticalItemsPassed = sections.flatMap(s => s.items).filter(i => i.finding?.severity !== 'critical').length;
  const criticalItemsFailed = findings.filter(f => f.severity === 'critical').length;

  return (
  <div className="space-y-6 pb-24">
    {/* Sticky Header */}
    <div className="sticky top-0 z-10 bg-background border-b py-4 -mx-6 px-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(backHref)}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Queue
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{audit.audit_code}</h1>
            <span className="text-muted-foreground">{entityInfo.name}</span>
            <Badge variant="outline" className="bg-gray-100">
              {entityInfo.type}
            </Badge>
          </div>
        </div>
          
          <div className="flex items-center gap-2">
            {isRecalculating && (
              <span className="text-sm text-muted-foreground animate-pulse">
                Recalculating health score...
              </span>
            )}

            {canExportReport && (
              <>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleExportAuditPdf();
                  }}
                  disabled={isExportingAudit}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Export Full Audit PDF
                </Button>
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleExportAuditExcel();
                  }}
                  disabled={isExportingAudit}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Full Audit Excel
                </Button>
              </>
            )}
            
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    onClick={handleApproveAudit}
                    disabled={!allCAPAResolved || isRecalculating}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </span>
              </TooltipTrigger>
              {!allCAPAResolved && (
                <TooltipContent>
                  All CAPA must be approved before finalizing this audit.
                </TooltipContent>
              )}
            </Tooltip>
            
            <Button
              variant="outline"
              onClick={() => setIsRejectModalOpen(true)}
              disabled={pendingCapas.length === 0}
              className="border-orange-500 text-orange-600 hover:bg-orange-50"
            >
              <X className="h-4 w-4 mr-2" />
              Reject CAPA
            </Button>
            
            <Button
              variant="outline"
              onClick={() => setIsFlagModalOpen(true)}
              className="border-red-500 text-red-600 hover:bg-red-50"
            >
              <Flag className="h-4 w-4 mr-2" />
              Flag Audit
            </Button>
          </div>
        </div>
      </div>

      {/* Section A: Audit Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Entity</p>
              <p className="font-medium">{entityInfo.name}</p>
              <p className="text-sm text-muted-foreground">{entityInfo.code} • {entityInfo.city}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Auditor</p>
              <p className="font-medium">{auditorName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Schedule</p>
              <p className="font-medium">
                {format(new Date(audit.scheduled_date), 'MMM d')} → {audit.completed_at && format(new Date(audit.completed_at), 'MMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Final Score</p>
              <div className="flex items-center gap-2">
                <span className={`text-3xl font-bold ${getScoreColor(audit.score)}`}>
                  {audit.score?.toFixed(1) || '—'}
                </span>
                {audit.pass_fail && (
                  <Badge 
                    variant={audit.pass_fail === 'pass' ? 'default' : 'destructive'}
                    className="text-lg px-3 py-1"
                  >
                    {audit.pass_fail.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Template: {templateName}</p>
              <p className="text-sm text-muted-foreground">
                Items answered: {sections.flatMap(s => s.items).filter(i => i.response).length} / {sections.flatMap(s => s.items).length}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm">
                Critical Items: <span className="text-green-600">{criticalItemsPassed} passed</span>
                {criticalItemsFailed > 0 && (
                  <>, <span className="text-red-600">{criticalItemsFailed} failed</span></>
                )}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Audit Checklist (Read-Only) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Audit Checklist</CardTitle>
          <Button variant="link" onClick={scrollToFindings}>
            Jump to Findings →
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {sections.map(section => (
            <Collapsible 
              key={section.id}
              open={expandedSections.has(section.id)}
              onOpenChange={() => toggleSection(section.id)}
            >
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted">
                  <div className="flex items-center gap-3">
                    {expandedSections.has(section.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="font-semibold">{section.name}</span>
                    <Badge variant="outline">{section.weight}%</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {section.score}/{section.maxScore} points
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2">
                  {section.items.map(item => (
                    <div 
                      key={item.id}
                      className={`p-4 rounded-lg border-l-4 ${
                        item.finding?.severity === 'critical' ? 'border-l-red-500 bg-red-50 text-slate-900 dark:bg-red-950/25 dark:text-slate-50' :
                        item.finding?.severity === 'high' ? 'border-l-orange-500 bg-orange-50 text-slate-900 dark:bg-orange-950/25 dark:text-slate-50' :
                        item.finding?.severity === 'medium' ? 'border-l-yellow-500 bg-yellow-50 text-slate-900 dark:bg-yellow-950/25 dark:text-slate-50' :
                        item.finding?.severity === 'low' ? 'border-l-blue-500 bg-blue-50 text-slate-900 dark:bg-blue-950/25 dark:text-slate-50' :
                        'border-l-green-500 bg-green-50/50 text-slate-900 dark:bg-green-950/25 dark:text-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{item.text}</p>
                          <p className="text-sm text-muted-foreground dark:text-slate-200/80 mt-1">
                            Response: {formatResponse(item.response, item.id)}
                          </p>
                          <p className="text-sm text-muted-foreground dark:text-slate-200/80">
                            Points: {item.points}/{item.maxPoints}
                          </p>
                        </div>
                        {item.evidence.length > 0 && (
                          <div className="flex gap-2">
                            {item.evidence.slice(0, 3).map((url, idx) => (
                              <img
                                key={idx}
                                src={url}
                                alt={`Evidence ${idx + 1}`}
                                className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                                onClick={() => openLightbox(item.evidence, idx)}
                              />
                            ))}
                            {item.evidence.length > 3 && (
                              <div 
                                className="w-12 h-12 bg-muted rounded flex items-center justify-center text-sm cursor-pointer hover:bg-muted/80"
                                onClick={() => openLightbox(item.evidence, 3)}
                              >
                                +{item.evidence.length - 3}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* Section C: Findings & CAPA Review */}
      <Card id="findings-section">
        <CardHeader>
          <CardTitle>Findings &amp; CAPA Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {findings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No findings for this audit.</p>
          ) : (
            findings.map((finding) => {
              const capa = capas.find(c => c.finding_id === finding.id);
              const activities = capa ? capaActivities[capa.id] || [] : [];
              const decision = capa ? capaDecisions[capa.id] : undefined;
              const today = new Date().toISOString().split('T')[0];
              const isOverdue = !!capa && capa.due_date < today && capa.status !== 'closed';
              const hasEvidence = !!capa && (capa.evidence_urls?.length || 0) > 0;
              const isAutoApproved = activities.some(a => a.action === 'auto_approved');

              return (
                <div key={finding.id} className="border rounded-lg overflow-hidden">
                  <div className="p-4 bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={getSeverityBadge(finding.severity)}>
                            {finding.severity.toUpperCase()}
                          </Badge>
                          <span className="font-mono text-sm">{finding.finding_code}</span>
                        </div>
                        <p className="font-medium">{finding.description}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Section: {finding.section_name} • Category: {finding.category}
                        </p>
                      </div>

                      {finding.evidence_urls && finding.evidence_urls.length > 0 && (
                        <div className="flex gap-2">
                          {finding.evidence_urls.slice(0, 2).map((url, idx) => (
                            <img
                              key={idx}
                              src={url}
                              alt={`Finding evidence ${idx + 1}`}
                              className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80"
                              onClick={() => openLightbox(finding.evidence_urls, idx)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {capa ? (
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{capa.capa_code}</h4>
                            <Badge className={
                              decision === 'approved' ? 'bg-green-100 text-green-800' :
                              decision === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }>
                              {decision === 'approved' ? 'Approved' :
                              decision === 'rejected' ? 'Rejected' :
                              capa.status.replace('_', ' ')}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-1">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span>{getUserName(capa.assigned_to)}</span>
                            </div>
                            <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : ''}`}>
                              <Clock className="h-4 w-4" />
                              <span>Due: {format(new Date(capa.due_date), 'MMM d, yyyy')}</span>
                              {isOverdue && <AlertTriangle className="h-4 w-4" />}
                            </div>
                          </div>
                        </div>

                        {canExportReport && (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleExportCAPAPdf(capa.id);
                              }}
                              disabled={isExportingCapaId === capa.id}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              Export PDF
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleExportCAPAExcel(capa.id);
                              }}
                              disabled={isExportingCapaId === capa.id}
                            >
                              <FileSpreadsheet className="h-4 w-4 mr-2" />
                              Export Excel
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <p className="text-sm font-medium mb-1">Corrective Action Taken:</p>
                          <p className="text-sm text-muted-foreground">
                            {capa.notes || 'No corrective action notes provided.'}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm font-medium mb-1">CAPA Requirement:</p>
                          <p className="text-sm text-muted-foreground">
                            {capa.description || '—'}
                          </p>
                        </div>

                        {capa.evidence_urls && capa.evidence_urls.length > 0 ? (
                          <div>
                            <p className="text-sm font-medium mb-2">CAPA Evidence:</p>
                            <div className="flex gap-2 flex-wrap">
                              {capa.evidence_urls.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={url}
                                  alt={`CAPA evidence ${idx + 1}`}
                                  className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80"
                                  onClick={() => openLightbox(capa.evidence_urls || [], idx)}
                                />
                              ))}
                            </div>
                          </div>
                        ) : capa.status === 'pending_verification' && (
                          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-sm text-yellow-800 flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4" />
                              No evidence uploaded. This CAPA cannot be approved without evidence.
                            </p>
                          </div>
                        )}

                        {activities.length > 0 && (
                          <div>
                            <p className="text-sm font-medium mb-2">Activity Log:</p>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {activities.map(activity => (
                                <div key={activity.id} className="text-xs flex items-start gap-2">
                                  <span className="text-muted-foreground whitespace-nowrap">
                                    {format(new Date(activity.created_at), 'MMM d, HH:mm')}
                                  </span>
                                  <span>
                                    {getUserName(activity.user_id)}: {activity.details || activity.action}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!isAutoApproved && capa.status === 'pending_verification' && decision === 'pending' && (
                          <div className="pt-4 border-t">
                            {inlineRejectCapaId === capa.id ? (
                              <div className="space-y-2">
                                <Label>Reason for rejection (required)</Label>
                                <Textarea
                                  value={inlineRejectReason}
                                  onChange={(e) => setInlineRejectReason(e.target.value)}
                                  placeholder="Explain why this CAPA is being rejected..."
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setInlineRejectCapaId(null);
                                      setInlineRejectReason('');
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => void handleInlineRejectCAPA(capa.id)}
                                  >
                                    Submit Rejection
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => void handleApproveCAPA(capa.id)}
                                  disabled={!hasEvidence}
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-orange-500 text-orange-600 hover:bg-orange-50"
                                  onClick={() => setInlineRejectCapaId(capa.id)}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        )}

                        {decision === 'approved' && !isAutoApproved && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-green-100 text-green-800">✓ Approved</Badge>
                          </div>
                        )}

                        {decision === 'rejected' && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-red-100 text-red-800">✗ Rejected</Badge>
                            <p className="text-sm text-muted-foreground mt-2">
                              {activities.find(a => a.action === 'rejected')?.details}
                            </p>
                          </div>
                        )}

                        {isAutoApproved && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-green-100 text-green-800">✓ Auto-approved</Badge>
                            <p className="text-sm text-muted-foreground mt-1">
                              {capa.priority} severity with evidence uploaded
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      No CAPA created for this finding.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Section D: Decision Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              CAPA Decisions:{' '}
              <span className="text-green-600">
                {Object.values(capaDecisions).filter(d => d === 'approved').length} approved
              </span>
              ,{' '}
              <span className="text-red-600">
                {Object.values(capaDecisions).filter(d => d === 'rejected').length} rejected
              </span>
              ,{' '}
              <span className="text-yellow-600">
                {Object.values(capaDecisions).filter(d => d === 'pending').length} pending
              </span>
            </div>
            
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      onClick={handleApproveAudit}
                      disabled={!allCAPAResolved || isRecalculating}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </span>
                </TooltipTrigger>
                {!allCAPAResolved && (
                  <TooltipContent>
                    All CAPA must be approved before finalizing this audit.
                  </TooltipContent>
                )}
              </Tooltip>
              
              <Button
                variant="outline"
                onClick={() => setIsRejectModalOpen(true)}
                disabled={pendingCapas.length === 0}
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                <X className="h-4 w-4 mr-2" />
                Reject CAPA
              </Button>
              
              <Button
                variant="outline"
                onClick={() => setIsFlagModalOpen(true)}
                className="border-red-500 text-red-600 hover:bg-red-50"
              >
                <Flag className="h-4 w-4 mr-2" />
                Flag Audit
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reject CAPA Modal */}
      <Dialog open={isRejectModalOpen} onOpenChange={setIsRejectModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject CAPA</DialogTitle>
            <DialogDescription>
              Select the CAPA to reject and provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {pendingCapas.map(capa => (
                <div key={capa.id} className="flex items-start gap-3 p-2 rounded border">
                  <Checkbox
                    checked={selectedCAPAsForReject.has(capa.id)}
                    onCheckedChange={(checked) => {
                      setSelectedCAPAsForReject(prev => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(capa.id);
                        } else {
                          next.delete(capa.id);
                        }
                        return next;
                      });
                    }}
                  />
                  <div>
                    <p className="font-mono text-sm">{capa.capa_code}</p>
                    <p className="text-sm text-muted-foreground">{capa.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Label>Reason (required)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why these CAPA are being rejected..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBulkRejectCAPAs}
              disabled={selectedCAPAsForReject.size === 0 || !rejectReason.trim()}
            >
              Submit Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flag Audit Modal */}
      <Dialog open={isFlagModalOpen} onOpenChange={setIsFlagModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Audit for Review</DialogTitle>
            <DialogDescription>
              Flag this audit if you believe it requires additional review or contains quality issues.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>Reason for flagging (required)</Label>
            <Textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g. Insufficient photo evidence. Responses appear inconsistent with entity history."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFlagModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleFlagAudit}
              disabled={!flagReason.trim()}
            >
              Submit Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <EvidenceLightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
      />
    </div>
  );
}
