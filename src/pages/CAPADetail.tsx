import { useMemo, useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Upload,
  X,
  Plus,
  Trash2,
  Circle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User as UserIcon,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { CAPA, Finding, SubTask } from '@/lib/auditExecutionStorage';
import { fetchAuditById } from '@/lib/auditSupabase';
import { fetchFindingsByAuditId } from '@/lib/executionSupabase';
import {
  createSignedCAPAEvidenceUrl,
  fetchCAPAById,
  updateCAPA,
  uploadCAPAEvidenceFile,
} from '@/lib/executionSupabase';
import {
  fetchCAPAActivitiesByCAPAId,
  CAPAActivity,
} from '@/lib/verificationSupabase';
import { supabase } from '@/integrations/supabase/client';
import { fetchUserAssignments, fetchUsers } from '@/lib/userStorage';
import { fetchUserIdsByRole, insertNotification, insertNotifications } from '@/lib/notificationsSupabase';
import { EvidenceLightbox } from '@/components/verification/EvidenceLightbox';
import { format, formatDistanceToNow } from 'date-fns';

export default function CAPADetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [capa, setCAPA] = useState<CAPA | null>(null);
  const [capaEvidencePaths, setCapaEvidencePaths] = useState<string[]>([]);
  const [subTaskEvidencePathsById, setSubTaskEvidencePathsById] = useState<Record<string, string[]>>({});
  const [finding, setFinding] = useState<Finding | null>(null);
  const [audit, setAudit] = useState<any>(null);
  const [activities, setActivities] = useState<CAPAActivity[]>([]);
  const [entityInfo, setEntityInfo] = useState<{ name: string; code: string; type: string } | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  
  // Staff for sub-task assignment
  const [availableStaff, setAvailableStaff] = useState<{ id: string; full_name: string }[]>([]);
  
  // Sub-task form
  const [showSubTaskForm, setShowSubTaskForm] = useState(false);
  const [newSubTaskDescription, setNewSubTaskDescription] = useState('');
  const [newSubTaskAssignee, setNewSubTaskAssignee] = useState('');
  
  // Delete confirmation
  const [deleteSubTaskId, setDeleteSubTaskId] = useState<string | null>(null);
  
  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const [users, setUsers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [assignments, setAssignments] = useState<Array<{ user_id: string; assigned_type: string; assigned_id: string }>>([]);

  const isStaff = user?.role === 'staff';
  const isManager = ['branch_manager', 'bck_manager', 'audit_manager'].includes(user?.role || '');
  const isReadOnly = ['regional_manager', 'super_admin'].includes(user?.role || '');
  const isAuditManager = user?.role === 'audit_manager';

  const userNameById = useMemo(() => {
    const map = new Map(users.map(u => [u.id, u.full_name] as const));
    return (id?: string | null) => (id ? map.get(id) : undefined);
  }, [users]);

  // For staff, find their specific sub-task
  const staffSubTask = isStaff && capa 
    ? capa.sub_tasks?.find(st => st.assigned_to_user_id === user?.id)
    : null;

  const isImageUrl = (url: string): boolean => {
    if (!url) return false;
    if (url.startsWith('data:image')) return true;
    const base = url.split('?')[0].toLowerCase();
    return (
      base.endsWith('.jpg') ||
      base.endsWith('.jpeg') ||
      base.endsWith('.png') ||
      base.endsWith('.gif') ||
      base.endsWith('.webp')
    );
  };

  const isPdfUrl = (url: string): boolean => {
    if (!url) return false;
    const base = url.split('?')[0].toLowerCase();
    return base.endsWith('.pdf');
  };

  const buildSubTasksPayload = (signedSubTasks: SubTask[]): any[] => {
    return signedSubTasks.map(st => ({
      ...st,
      evidence_urls: subTaskEvidencePathsById[st.id] ?? [],
    }));
  };

  useEffect(() => {
    if (id && user) {
      loadData();
    }
  }, [id, user]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [usersData, assignmentsData] = await Promise.all([
        fetchUsers(),
        fetchUserAssignments(),
      ]);
      setUsers(usersData.map(u => ({ id: u.id, full_name: u.full_name })));
      setAssignments(assignmentsData.map(a => ({ user_id: a.user_id, assigned_type: a.assigned_type, assigned_id: a.assigned_id })));

      const capaData = id ? await fetchCAPAById(id) : null;
      if (!capaData) {
        navigate('/capa');
        return;
      }

      const evidencePaths = capaData.evidence_urls || [];
      setCapaEvidencePaths(evidencePaths);

      const signedEvidence = await Promise.all(evidencePaths.map(p => createSignedCAPAEvidenceUrl(p)));

      const subTaskEvidencePaths: Record<string, string[]> = {};
      const signedSubTasks: SubTask[] = await Promise.all(
        (capaData.sub_tasks || []).map(async (st) => {
          const paths = Array.isArray(st.evidence_urls) ? st.evidence_urls : [];
          subTaskEvidencePaths[st.id] = paths;
          const signed = await Promise.all(paths.map(p => createSignedCAPAEvidenceUrl(p)));
          return {
            ...st,
            evidence_urls: signed,
          };
        })
      );
      setSubTaskEvidencePathsById(subTaskEvidencePaths);

      setCAPA({
        ...capaData,
        evidence_urls: signedEvidence,
        sub_tasks: signedSubTasks,
      });
      setNotes(capaData.notes || '');

      const auditData = capaData.audit_id ? await fetchAuditById(capaData.audit_id) : null;
      setAudit(auditData);

      // Resolve finding: if user is admin/audit_manager, we can fetch findings by audit and match.
      if (capaData.audit_id && ['super_admin', 'audit_manager'].includes(user?.role || '')) {
        const findings = await fetchFindingsByAuditId(capaData.audit_id);
        const f = findings.find(x => x.id === capaData.finding_id) ?? null;
        setFinding(f);
      } else {
        setFinding(null);
      }

      // Entity info: use audit + dynamic lookup (no additional deps)
      if (auditData?.entity_type === 'branch') {
        const { data, error } = await supabase.from('branches').select('name,code').eq('id', auditData.entity_id).maybeSingle();
        if (!error) setEntityInfo({ name: data?.name || 'Unknown', code: data?.code || '', type: 'Branch' });
      } else if (auditData?.entity_type === 'bck') {
        const { data, error } = await supabase.from('bcks').select('name,code').eq('id', auditData.entity_id).maybeSingle();
        if (!error) setEntityInfo({ name: data?.name || 'Unknown', code: data?.code || '', type: 'BCK' });
      } else if (auditData?.entity_type === 'supplier') {
        const { data, error } = await supabase.from('suppliers').select('name,code').eq('id', auditData.entity_id).maybeSingle();
        if (!error) setEntityInfo({ name: data?.name || 'Unknown', code: data?.code || '', type: 'Supplier' });
      }

      const activityData = await fetchCAPAActivitiesByCAPAId(capaData.id);
      setActivities(activityData.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));

      const rejectionActivity = activityData.find(a => a.action === 'rejected');
      if (rejectionActivity && capaData.status === 'rejected') {
        setRejectionReason(rejectionActivity.details || 'No reason provided');
      } else {
        setRejectionReason(null);
      }

      if ((user?.role === 'branch_manager' || user?.role === 'bck_manager') && capaData.entity_type !== 'supplier') {
        const staff = usersData
          .filter(u => u.role === 'staff' && u.status === 'active')
          .filter(u => assignmentsData.some(a => a.user_id === u.id && a.assigned_type === capaData.entity_type && a.assigned_id === capaData.entity_id))
          .map(u => ({ id: u.id, full_name: u.full_name }));
        setAvailableStaff(staff);
      } else {
        setAvailableStaff([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate, user?.role]);

  const handleNotesBlur = () => {
    if (capa && notes !== capa.notes) {
      void updateCAPA(capa.id, { notes });
    }
  };

  const handleAddSubTask = () => {
    if (!newSubTaskDescription.trim() || !newSubTaskAssignee) {
      toast({ title: 'Error', description: 'Please fill in all fields.', variant: 'destructive' });
      return;
    }
    
    const now = new Date().toISOString();
    const newSubTask: SubTask = {
      id: crypto.randomUUID(),
      assigned_to_user_id: newSubTaskAssignee,
      description: newSubTaskDescription,
      status: 'pending',
      evidence_urls: [],
      completed_at: null,
      created_at: now,
    };
    const nextSigned = [...(capa!.sub_tasks || []), newSubTask];
    void updateCAPA(capa!.id, { sub_tasks: buildSubTasksPayload(nextSigned) });
    void supabase.from('capa_activity').insert({
      capa_id: capa!.id,
      user_id: user!.id,
      action: 'sub_task_added',
      details: `${userNameById(user!.id) || 'Manager'}: Sub-task added`,
      created_at: now,
    });

    void insertNotification({
      user_id: newSubTaskAssignee,
      type: 'task_assigned',
      message: `New task assigned\nYou have been assigned a new sub-task in ${capa!.capa_code}.`,
      link_to: `/capa/${capa!.id}`,
    });

    setNewSubTaskDescription('');
    setNewSubTaskAssignee('');
    setShowSubTaskForm(false);
    void loadData();
    toast({ title: 'Sub-task added', description: 'The staff member has been notified.' });
  };

  const handleDeleteSubTask = () => {
    if (!deleteSubTaskId) return;
    const filteredSigned = (capa!.sub_tasks || []).filter(st => st.id !== deleteSubTaskId);
    void updateCAPA(capa!.id, { sub_tasks: buildSubTasksPayload(filteredSigned) });
    setDeleteSubTaskId(null);
    void loadData();
    toast({ title: 'Sub-task deleted' });
  };

  const handleSubTaskStatusChange = (subTaskId: string, status: SubTask['status']) => {
    const subTasks = capa!.sub_tasks || [];
    const idx = subTasks.findIndex(st => st.id === subTaskId);
    if (idx === -1) return;
    const updatedSigned = subTasks.map(st =>
      st.id === subTaskId
        ? {
            ...st,
            status,
            completed_at: status === 'completed' ? new Date().toISOString() : st.completed_at,
          }
        : st
    );
    void updateCAPA(capa!.id, { sub_tasks: buildSubTasksPayload(updatedSigned) });
    void supabase.from('capa_activity').insert({
      capa_id: capa!.id,
      user_id: user!.id,
      action: `sub_task_${status}`,
      details: `${userNameById(user!.id) || 'User'} marked sub-task as ${status.replace('_', ' ')}`,
      created_at: new Date().toISOString(),
    });
    void loadData();
    toast({ title: `Task marked as ${status.replace('_', ' ')}` });
  };

  const handleEvidenceUpload = async (files: FileList, isSubTask: boolean = false, subTaskId?: string) => {
    const paths: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { path, signedUrl } = await uploadCAPAEvidenceFile(capa!.id, file);
      paths.push(path);
    }

    if (isSubTask && subTaskId) {
      const existingPaths = subTaskEvidencePathsById[subTaskId] ?? [];
      const updatedSigned = (capa!.sub_tasks || []).map(st =>
        st.id === subTaskId
          ? { ...st, evidence_urls: [...existingPaths, ...paths] }
          : st
      );
      // Convert to payload paths for all tasks to avoid overwriting paths with signed URLs
      const payload = updatedSigned.map(st => ({
        ...st,
        evidence_urls: st.id === subTaskId ? [...existingPaths, ...paths] : (subTaskEvidencePathsById[st.id] ?? []),
      }));
      void updateCAPA(capa!.id, { sub_tasks: payload as any[] });
    } else {
      void updateCAPA(capa!.id, { evidence_urls: [...capaEvidencePaths, ...paths] });
    }

    await loadData();
    toast({ title: 'Evidence uploaded' });
  };

  const handleRemoveEvidence = (url: string) => {
    if (!capa) return;
    const index = (capa.evidence_urls || []).findIndex(u => u === url);
    if (index === -1) return;

    const nextPaths = capaEvidencePaths.filter((_, i) => i !== index);
    void updateCAPA(capa.id, { evidence_urls: nextPaths });
    void loadData();
  };

  const handleMarkPendingVerification = () => {
    if (!canMarkPendingVerification()) {
      toast({ title: 'Error', description: getVerificationDisabledReason(), variant: 'destructive' });
      return;
    }

    void updateCAPA(capa!.id, { status: 'pending_verification' });
    void supabase.from('capa_activity').insert({
      capa_id: capa!.id,
      user_id: user!.id,
      action: 'pending_verification',
      details: `${userNameById(user!.id) || 'Manager'}: Marked as pending verification`,
      created_at: new Date().toISOString(),
    });

    void (async () => {
      try {
        const hoqUserIds = await fetchUserIdsByRole('audit_manager');
        await insertNotifications(
          hoqUserIds.map(uid => ({
            user_id: uid,
            type: 'capa_pending_verification',
            message: `CAPA pending verification\n${capa!.capa_code} has been submitted for verification.`,
            link_to: `/capa/${capa!.id}`,
          }))
        );
      } catch (e) {
        console.error('Failed to notify Head of Quality for verification', e);
      }
    })();

    void loadData();
    toast({ title: 'Submitted for verification' });
  };

  const handleResubmit = () => {
    if (!canMarkPendingVerification()) {
      toast({ title: 'Error', description: getVerificationDisabledReason(), variant: 'destructive' });
      return;
    }

    void updateCAPA(capa!.id, { status: 'pending_verification' });
    void supabase.from('capa_activity').insert({
      capa_id: capa!.id,
      user_id: user!.id,
      action: 'resubmitted',
      details: `${userNameById(user!.id) || 'Manager'}: Reworked and resubmitted for verification`,
      created_at: new Date().toISOString(),
    });

    void (async () => {
      try {
        const hoqUserIds = await fetchUserIdsByRole('audit_manager');
        await insertNotifications(
          hoqUserIds.map(uid => ({
            user_id: uid,
            type: 'capa_resubmitted',
            message: `CAPA resubmitted\n${capa!.capa_code} has been resubmitted for verification.`,
            link_to: `/capa/${capa!.id}`,
          }))
        );
      } catch (e) {
        console.error('Failed to notify Head of Quality for resubmission', e);
      }
    })();

    void loadData();
    toast({ title: 'Resubmitted for verification' });
  };

  const openLightbox = (images: string[], index: number = 0) => {
    setLightboxImages(images);
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const getPriorityBadge = (priority: string) => {
    const colors: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-blue-100 text-blue-800',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-gray-100 text-gray-800',
      in_progress: 'bg-blue-100 text-blue-800',
      pending_verification: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-orange-100 text-orange-800',
      escalated: 'bg-red-100 text-red-800',
      closed: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const canMarkPendingVerification = () => {
    if (!capa || !isManager) return false;
    if (capa.status !== 'in_progress' && capa.status !== 'open') return false;
    
    const capaEvidence = capa.evidence_urls || [];
    return capaEvidence.length > 0;
  };

  const getVerificationDisabledReason = () => {
    if (!capa) return '';
    const capaEvidence = capa.evidence_urls || [];
    if (capaEvidence.length === 0) {
      return 'Upload at least one piece of evidence before submitting.';
    }
    return '';
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

  if (!capa) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">CAPA not found.</p>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const isOverdue = capa.due_date < today && !['closed', 'approved'].includes(capa.status);

  // Staff view: simplified view showing only their sub-task
  if (isStaff) {
    if (!staffSubTask) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">You don't have access to this CAPA.</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/capa')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>My Tasks</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{capa.capa_code}</h1>
              <Badge className={getPriorityBadge(capa.priority)}>
                {capa.priority.toUpperCase()}
              </Badge>
            </div>
          </div>
        </div>

        {/* Task Card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Assigned Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="font-medium">{staffSubTask.description}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Due: {format(new Date(capa.due_date), 'MMM d, yyyy')}
                {isOverdue && <span className="text-red-600 ml-2">(Overdue)</span>}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Badge className={getStatusBadge(staffSubTask.status)}>
                {staffSubTask.status.replace('_', ' ')}
              </Badge>
            </div>

            {/* Evidence Upload */}
            <div>
              <Label className="mb-2 block">Evidence</Label>
              {staffSubTask.evidence_urls.length > 0 && (
                <div className="flex gap-2 flex-wrap mb-2">
                  {staffSubTask.evidence_urls.map((url, idx) => (
                    <img
                      key={idx}
                      src={url}
                      alt={`Evidence ${idx + 1}`}
                      className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80"
                      onClick={() => openLightbox(staffSubTask.evidence_urls, idx)}
                    />
                  ))}
                </div>
              )}
              {staffSubTask.status !== 'completed' && (
                <label className="flex items-center gap-2 text-sm text-blue-600 cursor-pointer hover:text-blue-800">
                  <Upload className="h-4 w-4" />
                  Upload Evidence
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleEvidenceUpload(e.target.files, true, staffSubTask.id)}
                  />
                </label>
              )}
            </div>

            {/* Action Buttons */}
            {staffSubTask.status !== 'completed' && (
              <div className="flex gap-2 pt-4 border-t">
                {staffSubTask.status === 'pending' && (
                  <Button
                    onClick={() => handleSubTaskStatusChange(staffSubTask.id, 'in_progress')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Mark In Progress
                  </Button>
                )}
                {staffSubTask.status === 'in_progress' && (
                  <Button
                    onClick={() => handleSubTaskStatusChange(staffSubTask.id, 'completed')}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Mark Complete
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <EvidenceLightbox
          images={lightboxImages}
          initialIndex={lightboxIndex}
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
        />
      </div>
    );
  }

  // Manager/Admin full view
  return (
    <div className="space-y-6 pb-8">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b py-4 -mx-6 px-6">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate('/capa')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>CAPA</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">{capa.capa_code}</h1>
              <Badge className={getPriorityBadge(capa.priority)}>
                {capa.priority.toUpperCase()}
              </Badge>
            </div>
          </div>
          
          {isManager && !isReadOnly && (
            <div className="flex items-center gap-2">
              {capa.status === 'rejected' ? (
                <Button onClick={handleResubmit} disabled={!canMarkPendingVerification()}>
                  Resubmit for Verification
                </Button>
              ) : (capa.status === 'in_progress' || capa.status === 'open') && (
                <Button 
                  onClick={handleMarkPendingVerification} 
                  disabled={!canMarkPendingVerification()}
                  title={getVerificationDisabledReason()}
                >
                  Mark Pending Verification
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Rejection Banner */}
      {capa.status === 'rejected' && rejectionReason && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800">This CAPA was rejected</p>
              <p className="text-sm text-yellow-700 mt-1">{rejectionReason}</p>
              <p className="text-sm text-yellow-600 mt-2">Review the feedback above and rework.</p>
            </div>
          </div>
        </div>
      )}

      {/* Section A: CAPA Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>CAPA Details</CardTitle>
            <Badge className={`text-lg px-3 py-1 ${getStatusBadge(capa.status)}`}>
              {capa.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground">Finding</p>
            {finding ? (
              <Link 
                to={`/audits/${capa.audit_id}`}
                className="text-blue-600 hover:underline font-mono text-sm"
              >
                {finding.finding_code}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
            <p className="text-sm mt-1">{finding?.description || capa.description || 'No description'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Entity</p>
            <p className="font-medium">{entityInfo?.name}</p>
            <Badge variant="outline" className="mt-1">{entityInfo?.type}</Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Audit</p>
            <Link 
              to={`/audits/${capa.audit_id}`}
              className="text-blue-600 hover:underline font-mono text-sm"
            >
              {audit?.audit_code || 'Unknown'}
            </Link>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Assigned To</p>
            <p className="font-medium">{userNameById(capa.assigned_to) || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Due Date</p>
            <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
              {format(new Date(capa.due_date), 'MMM d, yyyy')}
              {isOverdue && <span className="text-sm ml-2">(Overdue)</span>}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p>{format(new Date(capa.created_at), 'MMM d, yyyy')}</p>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Corrective Action & Evidence */}
      <Card>
        <CardHeader>
          <CardTitle>Corrective Action & Evidence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Notes */}
          <div>
            <Label htmlFor="notes">Corrective action taken</Label>
            {isManager && !isReadOnly ? (
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Describe what was done to address this finding..."
                rows={4}
                className="mt-2"
              />
            ) : (
              <p className="text-sm mt-2 p-3 bg-muted rounded-md">
                {notes || 'No notes yet.'}
              </p>
            )}
          </div>

          {/* Evidence */}
          <div>
            <Label>Evidence</Label>
            {(capa.evidence_urls || []).length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2 mb-4">
                {capa.evidence_urls?.map((url, idx) => (
                  <div key={idx} className="relative group">
                    {isImageUrl(url) ? (
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80"
                        onClick={() => openLightbox(capa.evidence_urls || [], idx)}
                      />
                    ) : (
                      <div
                        className="w-20 h-20 bg-muted rounded flex items-center justify-center cursor-pointer hover:opacity-80"
                        onClick={() => isPdfUrl(url) && window.open(url, '_blank')}
                        title={isPdfUrl(url) ? 'Open PDF' : undefined}
                      >
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {isManager && !isReadOnly && (
                      <button
                        onClick={() => handleRemoveEvidence(url)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {isManager && !isReadOnly && (
              <label className="block mt-2">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drop evidence here or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Images or PDF files
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleEvidenceUpload(e.target.files)}
                />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sub-Tasks section hidden for demo — department handles corrective actions directly */}

      {/* Section D: Activity Log */}
      {!isStaff && (
        <Card>
          <CardHeader>
            <CardTitle>Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No activity yet.</p>
            ) : (
              <div className="space-y-4">
                {activities.map(activity => {
                  const activityUserName = activity.user_id === 'system'
                    ? 'System'
                    : userNameById(activity.user_id) || 'Unknown';
                  
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {activity.user_id === 'system'
                            ? 'SYS'
                            : activityUserName.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
                          }
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {activityUserName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {activity.details || activity.action.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}


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
