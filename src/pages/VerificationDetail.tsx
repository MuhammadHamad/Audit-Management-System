import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  FileText
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
import { useQuery } from '@tanstack/react-query';
import { getAuditById, Audit } from '@/lib/auditStorage';
import { 
  getFindings, 
  getCAPAs, 
  getAuditResultsByAuditId,
  Finding,
  CAPA,
  AuditResult
} from '@/lib/auditExecutionStorage';
import {
  approveCAPA,
  rejectCAPA,
  approveAudit,
  flagAudit,
  getCAPAActivitiesByCAPAId,
  CAPAActivity
} from '@/lib/verificationStorage';
import { 
  getBranches, 
  getBCKs, 
  getSuppliers, 
  getUserById 
} from '@/lib/entityStorage';
import { EvidenceLightbox } from '@/components/verification/EvidenceLightbox';
import { format, formatDistanceToNow } from 'date-fns';
import { fetchTemplateById } from '@/lib/templateSupabase';

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
  const { toast } = useToast();
  const { user } = useAuth();
  
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

  const loadData = () => {
    setIsLoading(true);
    try {
      const auditData = getAuditById(id!);
      if (!auditData) {
        navigate('/verification');
        return;
      }
      
      setAudit(auditData);
      
      // Load entity info
      let entity: any;
      if (auditData.entity_type === 'branch') {
        entity = getBranches().find(b => b.id === auditData.entity_id);
        setEntityInfo({
          name: entity?.name || 'Unknown',
          code: entity?.code || '',
          city: entity?.city,
          type: 'Branch'
        });
      } else if (auditData.entity_type === 'bck') {
        entity = getBCKs().find(b => b.id === auditData.entity_id);
        setEntityInfo({
          name: entity?.name || 'Unknown',
          code: entity?.code || '',
          city: entity?.city,
          type: 'BCK'
        });
      } else if (auditData.entity_type === 'supplier') {
        entity = getSuppliers().find(s => s.id === auditData.entity_id);
        setEntityInfo({
          name: entity?.name || 'Unknown',
          code: entity?.supplier_code || '',
          city: entity?.city,
          type: 'Supplier'
        });
      }
      
      // Load auditor name
      if (auditData.auditor_id) {
        const auditor = getUserById(auditData.auditor_id);
        setAuditorName(auditor?.full_name || 'Unknown');
      }
      
      // Template is loaded via React Query; sections will be built in a separate effect.
      setTemplateName('');
      setSections([]);
      setFindings([]);
      
      // Load CAPA and activities
      const auditCapas = getCAPAs().filter(c => c.audit_id === auditData.id);
      setCapas(auditCapas);
      
      const activities: Record<string, CAPAActivity[]> = {};
      const decisions: Record<string, 'approved' | 'rejected' | 'pending'> = {};
      
      for (const capa of auditCapas) {
        activities[capa.id] = getCAPAActivitiesByCAPAId(capa.id);
        decisions[capa.id] = capa.status === 'closed' || capa.status === 'approved' 
          ? 'approved' 
          : capa.status === 'rejected' 
            ? 'rejected' 
            : 'pending';
      }
      
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

    const results = getAuditResultsByAuditId(audit.id);
    const allFindings = getFindings().filter(f => f.audit_id === audit.id);
    setFindings(allFindings);

    const sectionsData: ChecklistSectionDisplay[] = (template.checklist_json.sections as any[]).map((section: any) => {
      const items: ChecklistItemDisplay[] = (section.items as any[]).map((item: any) => {
        const result = results.find(r => r.item_id === item.id);
        const finding = allFindings.find(f => f.item_id === item.id);

        return {
          id: item.id,
          text: item.text,
          response: result?.response,
          evidence: result?.evidence_urls || [],
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
  }, [audit, templateQuery.data]);

  const handleApproveCAPA = (capaId: string) => {
    const result = approveCAPA(capaId, user!.id);
    if (result.success) {
      setCAPADecisions(prev => ({ ...prev, [capaId]: 'approved' }));
      loadData(); // Refresh to get updated activities
      toast({ title: 'CAPA approved', description: 'The corrective action has been approved.' });
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const handleInlineRejectCAPA = (capaId: string) => {
    if (!inlineRejectReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    
    const result = rejectCAPA(capaId, user!.id, inlineRejectReason);
    if (result.success) {
      setCAPADecisions(prev => ({ ...prev, [capaId]: 'rejected' }));
      setInlineRejectCapaId(null);
      setInlineRejectReason('');
      loadData();
      toast({ title: 'CAPA rejected', description: 'The entity manager has been notified.' });
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const handleBulkRejectCAPAs = () => {
    if (selectedCAPAsForReject.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one CAPA to reject.', variant: 'destructive' });
      return;
    }
    if (!rejectReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for rejection.', variant: 'destructive' });
      return;
    }
    
    for (const capaId of selectedCAPAsForReject) {
      rejectCAPA(capaId, user!.id, rejectReason);
      setCAPADecisions(prev => ({ ...prev, [capaId]: 'rejected' }));
    }
    
    setIsRejectModalOpen(false);
    setSelectedCAPAsForReject(new Set());
    setRejectReason('');
    loadData();
    toast({ title: 'CAPA(s) rejected', description: 'The entity manager has been notified.' });
  };

  const handleApproveAudit = () => {
    const result = approveAudit(audit!.id, user!.id);
    if (result.success) {
      setIsRecalculating(true);
      setTimeout(() => {
        setIsRecalculating(false);
        toast({ title: 'Audit approved', description: 'Health score recalculation triggered.' });
        navigate('/audits/pending-verification');
      }, 2000);
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const handleFlagAudit = () => {
    if (!flagReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for flagging.', variant: 'destructive' });
      return;
    }
    
    const result = flagAudit(audit!.id, user!.id, flagReason);
    if (result.success) {
      setIsFlagModalOpen(false);
      toast({ title: 'Audit flagged', description: 'Audit Manager has been notified.' });
      navigate('/audits/pending-verification');
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
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
              onClick={() => navigate('/audits/pending-verification')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Pending Verification</span>
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
                        item.finding?.severity === 'critical' ? 'border-l-red-500 bg-red-50' :
                        item.finding?.severity === 'high' ? 'border-l-orange-500 bg-orange-50' :
                        item.finding?.severity === 'medium' ? 'border-l-yellow-500 bg-yellow-50' :
                        item.finding?.severity === 'low' ? 'border-l-blue-500 bg-blue-50' :
                        'border-l-green-500 bg-green-50/50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{item.text}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Response: {formatResponse(item.response, item.id)}
                          </p>
                          <p className="text-sm text-muted-foreground">
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
          <CardTitle>Findings & CAPA Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {findings.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No findings for this audit.</p>
          ) : (
            findings.map(finding => {
              const capa = capas.find(c => c.finding_id === finding.id);
              const activities = capa ? capaActivities[capa.id] || [] : [];
              const decision = capa ? capaDecisions[capa.id] : undefined;
              const today = new Date().toISOString().split('T')[0];
              const isOverdue = capa && capa.due_date < today && capa.status !== 'closed';
              const hasEvidence = capa && capa.evidence_urls && capa.evidence_urls.length > 0;
              const isAutoApproved = activities.some(a => a.action === 'auto_approved');
              
              return (
                <div key={finding.id} className="border rounded-lg overflow-hidden">
                  {/* Finding Header */}
                  <div className="p-4 bg-muted/30">
                    <div className="flex items-start justify-between">
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
                  
                  {/* CAPA Block */}
                  {capa && (
                    <div className="p-4 border-t">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{capa.capa_code}</span>
                          <Badge className={getCAPAStatusBadge(decision === 'approved' ? 'closed' : decision === 'rejected' ? 'rejected' : capa.status)}>
                            {isAutoApproved ? 'Auto-approved' : 
                             decision === 'approved' ? 'Approved' : 
                             decision === 'rejected' ? 'Rejected' : 
                             capa.status.replace('_', ' ')}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{getUserById(capa.assigned_to)?.full_name || 'Unassigned'}</span>
                          </div>
                          <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-600' : ''}`}>
                            <Clock className="h-4 w-4" />
                            <span>Due: {format(new Date(capa.due_date), 'MMM d, yyyy')}</span>
                            {isOverdue && <AlertTriangle className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-medium mb-1">Corrective Action Taken:</p>
                          <p className="text-sm text-muted-foreground">
                            {capa.description || 'No description provided.'}
                          </p>
                        </div>
                        
                        {/* CAPA Evidence */}
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
                        
                        {/* Activity Log */}
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
                                    {getUserById(activity.user_id)?.full_name || 'System'}: {activity.details || activity.action}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Action Buttons */}
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
                                    onClick={() => handleInlineRejectCAPA(capa.id)}
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
                                  onClick={() => handleApproveCAPA(capa.id)}
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
                        
                        {/* Show approved/rejected state */}
                        {decision === 'approved' && !isAutoApproved && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-green-100 text-green-800">
                              ✓ Approved
                            </Badge>
                          </div>
                        )}
                        
                        {decision === 'rejected' && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-red-100 text-red-800">
                              ✗ Rejected
                            </Badge>
                            <p className="text-sm text-muted-foreground mt-2">
                              {activities.find(a => a.action === 'rejected')?.details}
                            </p>
                          </div>
                        )}
                        
                        {isAutoApproved && (
                          <div className="pt-4 border-t">
                            <Badge className="bg-green-100 text-green-800">
                              ✓ Auto-approved
                            </Badge>
                            <p className="text-sm text-muted-foreground mt-1">
                              {capa.priority} severity with evidence uploaded
                            </p>
                          </div>
                        )}
                      </div>
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
