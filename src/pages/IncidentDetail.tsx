import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  CalendarPlus, 
  FileSearch, 
  CheckCircle, 
  XCircle,
  Clock,
  User,
  Building,
  Calendar,
  Link as LinkIcon,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  getIncidentById,
  getIncidentActivitiesByIncidentId,
  assignIncident,
  markUnderInvestigation,
  updateInvestigationNotes,
  resolveIncident,
  closeIncident,
  triggerAuditFromIncident,
  getManagersForAssignment,
  Incident,
  IncidentActivity,
  IncidentSeverity,
  IncidentStatus,
  IncidentEntityType,
} from '@/lib/incidentStorage';
import { getBranches, getBCKs, getSuppliers, getUserById } from '@/lib/entityStorage';
import { getAuditById } from '@/lib/auditStorage';
import { getUsers } from '@/lib/entityStorage';
import { EvidenceLightbox } from '@/components/verification/EvidenceLightbox';
import { fetchTemplates } from '@/lib/templateSupabase';

const severityColors: Record<IncidentSeverity, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-white',
  low: 'bg-blue-500 text-white',
};

const statusColors: Record<IncidentStatus, string> = {
  open: 'bg-secondary text-secondary-foreground',
  under_investigation: 'bg-blue-500 text-white',
  resolved: 'bg-green-500 text-white',
  closed: 'bg-green-700 text-white',
};

const statusLabels: Record<IncidentStatus, string> = {
  open: 'Open',
  under_investigation: 'Under Investigation',
  resolved: 'Resolved',
  closed: 'Closed',
};

const entityTypeColors: Record<IncidentEntityType, string> = {
  branch: 'bg-blue-100 text-blue-800',
  bck: 'bg-purple-100 text-purple-800',
  supplier: 'bg-amber-100 text-amber-800',
};

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: fetchTemplates,
  });

  const [incident, setIncident] = useState<Incident | null>(null);
  const [activities, setActivities] = useState<IncidentActivity[]>([]);
  const [entityInfo, setEntityInfo] = useState<{ name: string; code: string; city?: string } | null>(null);
  const [assignedToUser, setAssignedToUser] = useState<string | undefined>();
  const [createdByUser, setCreatedByUser] = useState<string | undefined>();
  const [relatedAudit, setRelatedAudit] = useState<{ id: string; code: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Investigation notes
  const [investigationNotes, setInvestigationNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // Resolution
  const [showResolution, setShowResolution] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isResolving, setIsResolving] = useState(false);

  // Assignment modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [availableManagers, setAvailableManagers] = useState<Array<{ id: string; name: string; role: string }>>([]);

  // Trigger audit modal
  const [showTriggerAuditModal, setShowTriggerAuditModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [selectedAuditor, setSelectedAuditor] = useState('');
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string; name: string }>>([]);
  const [availableAuditors, setAvailableAuditors] = useState<Array<{ id: string; name: string }>>([]);

  // Lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    const activeSupplierTemplates = templates.filter(
      (t) => t.entity_type === 'supplier' && t.status === 'active'
    );
    setAvailableTemplates(activeSupplierTemplates.map((t) => ({ id: t.id, name: t.name })));
  }, [templates]);

  const loadData = () => {
    if (!id) return;

    const inc = getIncidentById(id);
    if (!inc) {
      navigate('/incidents');
      return;
    }

    setIncident(inc);
    setInvestigationNotes(inc.investigation_notes || '');
    setActivities(getIncidentActivitiesByIncidentId(id));

    // Get entity info
    if (inc.entity_type === 'branch') {
      const branch = getBranches().find(b => b.id === inc.entity_id);
      setEntityInfo(branch ? { name: branch.name, code: branch.code, city: branch.city } : null);
    } else if (inc.entity_type === 'bck') {
      const bck = getBCKs().find(b => b.id === inc.entity_id);
      setEntityInfo(bck ? { name: bck.name, code: bck.code, city: bck.city } : null);
    } else {
      const supplier = getSuppliers().find(s => s.id === inc.entity_id);
      setEntityInfo(supplier ? { name: supplier.name, code: supplier.supplier_code, city: supplier.city } : null);
    }

    // Get user names
    if (inc.assigned_to) {
      const assignedUser = getUserById(inc.assigned_to);
      setAssignedToUser(assignedUser?.full_name);
    }
    const createdUser = getUserById(inc.created_by);
    setCreatedByUser(createdUser?.full_name);

    // Get related audit
    if (inc.related_audit_id) {
      const audit = getAuditById(inc.related_audit_id);
      if (audit) {
        setRelatedAudit({ id: audit.id, code: audit.audit_code });
      }
    }

    // Load templates for trigger audit modal
    const activeSupplierTemplates = templates.filter(t => t.entity_type === 'supplier' && t.status === 'active');
    setAvailableTemplates(activeSupplierTemplates.map(t => ({ id: t.id, name: t.name })));

    // Load auditors
    const auditors = getUsers().filter(u => u.role === 'auditor' && u.status === 'active');
    setAvailableAuditors(auditors.map(a => ({ id: a.id, name: a.full_name })));

    // Default scheduled date
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setScheduledDate(defaultDate.toISOString().split('T')[0]);

    setIsLoading(false);
  };

  const canModify = user && incident && (
    (user.role === 'regional_manager') ||
    (user.role === 'branch_manager' && incident.assigned_to === user.id) ||
    (user.role === 'bck_manager' && incident.assigned_to === user.id)
  );

  const canAssign = user?.role === 'regional_manager';
  const canClose = user?.role === 'regional_manager';
  const canTriggerAudit = user?.role === 'audit_manager' && 
    incident?.entity_type === 'supplier' && 
    !incident.related_audit_id &&
    ['open', 'under_investigation'].includes(incident.status);

  const handleSaveNotes = async () => {
    if (!incident || !user) return;
    setNotesSaving(true);
    updateInvestigationNotes(incident.id, investigationNotes, user.id);
    setNotesSaving(false);
    toast({ title: 'Notes saved' });
    loadData();
  };

  const handleMarkUnderInvestigation = () => {
    if (!incident || !user) return;
    markUnderInvestigation(incident.id, user.id);
    toast({ title: 'Status Updated', description: 'Incident marked as under investigation.' });
    loadData();
  };

  const handleResolve = () => {
    if (!incident || !user || !resolutionNotes.trim()) return;
    setIsResolving(true);
    resolveIncident(incident.id, resolutionNotes, user.id);
    toast({ title: 'Incident Resolved', description: 'The incident has been resolved.' });
    setShowResolution(false);
    setIsResolving(false);
    loadData();
  };

  const handleClose = () => {
    if (!incident || !user) return;
    closeIncident(incident.id, user.id);
    toast({ title: 'Incident Closed' });
    loadData();
  };

  const handleOpenAssignModal = () => {
    if (!user || !incident) return;
    const managers = getManagersForAssignment(user.id, user.role, incident.entity_type, incident.entity_id);
    setAvailableManagers(managers);
    setSelectedAssignee(incident.assigned_to || '');
    setShowAssignModal(true);
  };

  const handleAssign = () => {
    if (!incident || !user || !selectedAssignee || selectedAssignee === '__none__') return;
    assignIncident(incident.id, selectedAssignee, user.id);
    toast({ title: 'Incident Assigned' });
    setShowAssignModal(false);
    loadData();
  };

  const handleTriggerAudit = () => {
    if (!incident || !user || !selectedTemplate || !scheduledDate) return;
    const auditId = triggerAuditFromIncident(
      incident.id,
      selectedTemplate,
      scheduledDate,
      selectedAuditor || undefined,
      user.id
    );
    if (auditId) {
      toast({ 
        title: 'Audit Scheduled', 
        description: 'An audit has been triggered from this incident.' 
      });
      setShowTriggerAuditModal(false);
      loadData();
    } else {
      toast({ 
        title: 'Error', 
        description: 'Failed to create audit.',
        variant: 'destructive'
      });
    }
  };

  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  if (isLoading || !incident) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b pb-4 -mx-6 px-6 pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/incidents')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">{incident.incident_code}</span>
                <Badge className={severityColors[incident.severity]}>
                  {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canAssign && (
              <Button variant="outline" onClick={handleOpenAssignModal}>
                Assign
              </Button>
            )}
            {canModify && incident.status === 'open' && (
              <Button 
                variant="outline" 
                className="bg-blue-500 hover:bg-blue-600 text-white"
                onClick={handleMarkUnderInvestigation}
              >
                <FileSearch className="mr-2 h-4 w-4" />
                Mark Under Investigation
              </Button>
            )}
            {canModify && incident.status === 'under_investigation' && (
              <Button 
                variant="outline"
                className="bg-green-500 hover:bg-green-600 text-white"
                onClick={() => setShowResolution(true)}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Resolve
              </Button>
            )}
            {canClose && incident.status === 'resolved' && (
              <Button variant="outline" onClick={handleClose}>
                <XCircle className="mr-2 h-4 w-4" />
                Close
              </Button>
            )}
            {canTriggerAudit && (
              <Button onClick={() => setShowTriggerAuditModal(true)}>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Trigger Audit
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Section A: Incident Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">{incident.title}</CardTitle>
            <Badge className={statusColors[incident.status]}>
              {statusLabels[incident.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Entity:</span>
                <span className="font-medium">{entityInfo?.name}</span>
                <span className="text-muted-foreground">({entityInfo?.code})</span>
                <Badge className={entityTypeColors[incident.entity_type]}>
                  {incident.entity_type.toUpperCase()}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Type:</span>
                <Badge variant="outline">{incident.type}</Badge>
                <span className="text-muted-foreground">•</span>
                <span>{incident.category}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Reported By:</span>
                <span>{createdByUser || 'Unknown'}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Reported At:</span>
                <span>{format(new Date(incident.created_at), 'PPp')}</span>
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Assigned To:</span>
                <span>{assignedToUser || <span className="text-muted-foreground">Unassigned</span>}</span>
              </div>
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Related Audit:</span>
                {relatedAudit ? (
                  <Button 
                    variant="link" 
                    className="p-0 h-auto"
                    onClick={() => navigate(`/audits/${relatedAudit.id}`)}
                  >
                    {relatedAudit.code}
                  </Button>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Description & Evidence */}
      <Card>
        <CardHeader>
          <CardTitle>Description & Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-muted-foreground">Description</Label>
            <p className="mt-1 whitespace-pre-wrap">{incident.description}</p>
          </div>
          {incident.evidence_urls.length > 0 && (
            <div>
              <Label className="text-muted-foreground">Evidence</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {incident.evidence_urls.map((url, index) => (
                  <div 
                    key={index}
                    className="cursor-pointer"
                    onClick={() => openLightbox(incident.evidence_urls, index)}
                  >
                    {url.startsWith('data:image') ? (
                      <img
                        src={url}
                        alt={`Evidence ${index + 1}`}
                        className="h-20 w-20 object-cover rounded hover:opacity-80 transition-opacity"
                      />
                    ) : (
                      <div className="h-20 w-20 bg-muted rounded flex items-center justify-center text-xs hover:bg-muted/80 transition-colors">
                        PDF
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section C: Investigation Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Investigation Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {canModify ? (
            <div className="space-y-2">
              <Textarea
                value={investigationNotes}
                onChange={(e) => setInvestigationNotes(e.target.value)}
                placeholder="Document your findings, actions taken, and observations..."
                rows={4}
              />
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={notesSaving}
                >
                  {notesSaving ? 'Saving...' : 'Save Notes'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {investigationNotes || 'No investigation notes recorded.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section D: Resolution (shown after resolved) */}
      {(incident.status === 'resolved' || incident.status === 'closed') && incident.resolution_notes && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <CardTitle className="text-green-800">Resolution</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-green-900">{incident.resolution_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Inline Resolution Form (when resolve is clicked) */}
      {showResolution && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle>Resolution Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Describe the root cause and what was done to prevent recurrence..."
              rows={4}
            />
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => setShowResolution(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResolve}
                disabled={!resolutionNotes.trim() || isResolving}
                className="bg-green-600 hover:bg-green-700"
              >
                {isResolving ? 'Resolving...' : 'Confirm Resolution'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section E: Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-muted-foreground">No activity recorded.</p>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => {
                const activityUser = getUserById(activity.user_id);
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                      {activityUser?.full_name?.charAt(0) || 'S'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">
                        <span className="font-medium">{activityUser?.full_name || 'System'}</span>
                        {' '}
                        <span className="text-muted-foreground">{activity.details || activity.action}</span>
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assignment Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Incident</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select investigator" />
                </SelectTrigger>
                <SelectContent>
                  {availableManagers.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedAssignee || selectedAssignee === '__none__'}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trigger Audit Modal */}
      <Dialog open={showTriggerAuditModal} onOpenChange={setShowTriggerAuditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trigger Supplier Audit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Template *</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select audit template" />
                </SelectTrigger>
                <SelectContent>
                  {availableTemplates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date *</Label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Auditor (Optional)</Label>
              <Select value={selectedAuditor} onValueChange={setSelectedAuditor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select auditor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {availableAuditors.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTriggerAuditModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleTriggerAudit} 
              disabled={!selectedTemplate || !scheduledDate}
            >
              Schedule Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Lightbox */}
      <EvidenceLightbox
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        initialIndex={lightboxIndex}
      />
    </div>
  );
}
