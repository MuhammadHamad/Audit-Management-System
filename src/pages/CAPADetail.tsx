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
  FileText,
  FileSpreadsheet
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
import { fetchFindingById } from '@/lib/executionSupabase';
import {
  createSignedCAPAEvidenceUrls,
  createSignedAuditEvidenceUrls,
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
import { buildCAPAExportBundle, exportCAPAReportToExcel, openCAPAReportPrintView } from '@/lib/capaExport';

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
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
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
  const isManager = ['branch_manager', 'bck_manager', 'head_of_quality', 'audit_manager', 'area_manager', 'regional_operational_manager', 'national_operational_manager'].includes(user?.role || '');
  const isReadOnly = ['regional_manager', 'super_admin'].includes(user?.role || '');
  const isAuditManager = user?.role === 'head_of_quality' || user?.role === 'audit_manager';
  const canExportReport = ['head_of_quality', 'audit_manager', 'super_admin'].includes(user?.role || '');

  const isEscalationManagerRole = ['area_manager', 'regional_operational_manager', 'national_operational_manager'].includes(user?.role || '');

  const userNameById = useMemo(() => {
    const map = new Map(users.map(u => [u.id, u.full_name] as const));
    return (id?: string | null) => (id ? map.get(id) : undefined);
  }, [users]);

  // For staff, find their specific sub-task
  const staffSubTask = isStaff && capa 
    ? capa.sub_tasks?.find(st => st.assigned_to_user_id === user?.id)
    : null;

  const trySignEvidencePaths = useCallback(async (paths: string[]): Promise<string[]> => {
    if (paths.length === 0) return [];
    try {
      return await createSignedCAPAEvidenceUrls(paths);
    } catch {
      try {
        return await createSignedAuditEvidenceUrls(paths);
      } catch {
        console.warn('Failed to sign evidence paths; falling back to original paths');
        return paths;
      }
    }
  }, []);

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
      const capaData = id ? await fetchCAPAById(id) : null;
      if (!capaData) {
        navigate('/capa');
        return;
      }

      // Parallelize independent data fetches after getting initial CAPA data
      const [usersData, assignmentsData, auditData, activityData] = await Promise.all([
        fetchUsers(),
        fetchUserAssignments(),
        capaData.audit_id ? fetchAuditById(capaData.audit_id) : Promise.resolve(null),
        fetchCAPAActivitiesByCAPAId(capaData.id).catch(() => []),
      ]);

      setUsers(usersData.map(u => ({ id: u.id, full_name: u.full_name })));
      setAssignments(assignmentsData.map(a => ({ user_id: a.user_id, assigned_type: a.assigned_type, assigned_id: a.assigned_id })));
      setAudit(auditData);

      // Sign main evidence and sub-task evidence in one single batch call
      const evidencePaths = capaData.evidence_urls || [];
      setCapaEvidencePaths(evidencePaths);

      const allSubTaskPaths = (capaData.sub_tasks || []).flatMap(st => Array.isArray(st.evidence_urls) ? st.evidence_urls : []);
      const combinedPaths = [...evidencePaths, ...allSubTaskPaths];
      
      const allSignedUrls = await trySignEvidencePaths(combinedPaths);

      const signedMainEvidence = allSignedUrls.slice(0, evidencePaths.length);
      const signedAllSubTaskEvidence = allSignedUrls.slice(evidencePaths.length);

      // Re-map signed sub-task evidence
      const subTaskEvidencePaths: Record<string, string[]> = {};
      let subIdx = 0;
      const signedSubTasks: SubTask[] = (capaData.sub_tasks || []).map(st => {
        const paths = Array.isArray(st.evidence_urls) ? st.evidence_urls : [];
        subTaskEvidencePaths[st.id] = paths;
        const signed = signedAllSubTaskEvidence.slice(subIdx, subIdx + paths.length);
        subIdx += paths.length;
        return { ...st, evidence_urls: signed };
      });

      setSubTaskEvidencePathsById(subTaskEvidencePaths);
      setCAPA({
        ...capaData,
        evidence_urls: signedMainEvidence,
        sub_tasks: signedSubTasks,
      });
      setNotes(capaData.notes || '');

      // Fetch Finding and Entity info in parallel
      const effectiveEntityType = (auditData?.entity_type ?? capaData.entity_type) as CAPA['entity_type'];
      const effectiveEntityId = (auditData?.entity_id ?? capaData.entity_id) as string;

      const getEntityInfoPromise = async () => {
        if (effectiveEntityType === 'branch') {
          const { data } = await supabase.from('branches').select('name,code').eq('id', effectiveEntityId).maybeSingle();
          return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'Branch' } : null;
        } else if (effectiveEntityType === 'bck') {
          const { data } = await supabase.from('bcks').select('name,code').eq('id', effectiveEntityId).maybeSingle();
          return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'BCK' } : null;
        } else if (effectiveEntityType === 'supplier') {
          const { data } = await supabase.from('suppliers').select('name,code').eq('id', effectiveEntityId).maybeSingle();
          return data ? { name: data.name || 'Unknown', code: data.code || '', type: 'Supplier' } : null;
        }
        return null;
      };

      const [findingData, info] = await Promise.all([
        capaData.finding_id ? fetchFindingById(capaData.finding_id).catch(() => null) : Promise.resolve(null),
        getEntityInfoPromise()
      ]);

      setFinding(findingData);
      if (info) setEntityInfo(info);

      // Activity processing
      setActivities(activityData.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      const rejectionActivity = activityData.find(a => a.action === 'rejected');
      setRejectionReason(rejectionActivity && capaData.status === 'rejected' ? rejectionActivity.details || 'No reason provided' : null);

      // Staff filter
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
  }, [id, navigate, user?.role, trySignEvidencePaths]);

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

    setIsUploadingEvidence(true);

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { path } = await uploadCAPAEvidenceFile(capa!.id, file);
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

        await updateCAPA(capa!.id, { sub_tasks: payload as any[] });
        setSubTaskEvidencePathsById(prev => ({
          ...prev,
          [subTaskId]: [...existingPaths, ...paths],
        }));
      } else {
        const nextPaths = [...capaEvidencePaths, ...paths];
        await updateCAPA(capa!.id, { evidence_urls: nextPaths });
        setCapaEvidencePaths(nextPaths);

        const signedNew = await trySignEvidencePaths(paths);

        setCAPA(prev => prev ? {
          ...prev,
          evidence_urls: [...(prev.evidence_urls || []), ...signedNew],
        } : prev);
      }

      toast({ title: 'Evidence uploaded' });
    } finally {
      setIsUploadingEvidence(false);
    }
  };

  const handleRemoveEvidence = (url: string) => {
    if (!capa) return;
    const index = (capa.evidence_urls || []).findIndex(u => u === url);
    if (index === -1) return;

    const nextPaths = capaEvidencePaths.filter((_, i) => i !== index);
    setCapaEvidencePaths(nextPaths);
    setCAPA(prev => prev ? {
      ...prev,
      evidence_urls: (prev.evidence_urls || []).filter((_, i) => i !== index),
    } : prev);
    void updateCAPA(capa.id, { evidence_urls: nextPaths });
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
        const hoqPrimary = await fetchUserIdsByRole('head_of_quality');
        const hoqLegacy = hoqPrimary.length ? [] : await fetchUserIdsByRole('audit_manager');
        const hoqUserIds = Array.from(new Set([...hoqPrimary, ...hoqLegacy]));
        await insertNotifications(
          hoqUserIds.map(uid => ({
            user_id: uid,
            type: 'capa_pending_verification',
            message: `CAPA ${capa!.capa_code} is pending verification`,
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

  const handleExportExcel = async () => {
    if (!capa) return;
    if (!canExportReport) return;

    setIsExporting(true);
    try {
      const bundle = await buildCAPAExportBundle(capa.id);
      exportCAPAReportToExcel(bundle);
      toast({ title: 'Exported', description: 'Excel report downloaded.' });
    } catch (e: any) {
      console.error('CAPA export (excel) failed', e);
      toast({ title: 'Export failed', description: e?.message || 'Failed to export Excel report.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!capa) return;
    if (!canExportReport) return;

    setIsExporting(true);
    try {
      const bundle = await buildCAPAExportBundle(capa.id);
      openCAPAReportPrintView(bundle);
      toast({ title: 'Report opened', description: 'Use your browser Print → Save as PDF.' });
    } catch (e: any) {
      console.error('CAPA export (pdf) failed', e);
      toast({ title: 'Export failed', description: e?.message || 'Failed to open PDF report.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
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
        const hoqPrimary = await fetchUserIdsByRole('head_of_quality');
        const hoqLegacy = hoqPrimary.length ? [] : await fetchUserIdsByRole('audit_manager');
        const hoqUserIds = Array.from(new Set([...hoqPrimary, ...hoqLegacy]));
        await insertNotifications(
          hoqUserIds.map(uid => ({
            user_id: uid,
            type: 'capa_resubmitted',
            message: `CAPA ${capa!.capa_code} was resubmitted for verification`,
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
      expired: 'bg-gray-200 text-gray-900',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const canMarkPendingVerification = () => {
    if (!capa || !user) return false;
    if (!isManager) return false;
    if (isReadOnly) return false;
    if (isEscalationManagerRole && capa.assigned_to !== user.id) return false;
    if (capa.status !== 'in_progress' && capa.status !== 'open') return false;
    const capaEvidence = capaEvidencePaths || [];
    return capaEvidence.length > 0;
  };

  const getVerificationDisabledReason = () => {
    if (!capa) return '';
    const capaEvidence = capaEvidencePaths || [];
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
  const effectiveDueDate =
    (capa.escalation_level ?? 0) > 0 && capa.escalation_due_date
      ? capa.escalation_due_date
      : capa.due_date;
  const isOverdue = effectiveDueDate < today && !['closed', 'approved', 'expired'].includes(capa.status);

  const canManage =
    !!user &&
    isManager &&
    !isReadOnly &&
    capa.status !== 'expired' &&
    (!isEscalationManagerRole || capa.assigned_to === user.id);

  // Staff view: simplified view showing only their sub-task (if they have one)
  if (isStaff && staffSubTask) {
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
                Due: {format(new Date(effectiveDueDate), 'MMM d, yyyy')}
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
                  {staffSubTask.evidence_urls.map((url, idx) => {
                    if (isImageUrl(url)) {
                      const images = staffSubTask.evidence_urls.filter(isImageUrl);
                      const imageIndex = images.indexOf(url);
                      return (
                        <img
                          key={idx}
                          src={url}
                          alt={`Evidence ${idx + 1}`}
                          className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80"
                          onClick={() => openLightbox(images, Math.max(0, imageIndex))}
                        />
                      );
                    }

                    if (isPdfUrl(url)) {
                      return (
                        <a
                          key={idx}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          View PDF {idx + 1}
                        </a>
                      );
                    }

                    return null;
                  })}
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
          
          <div className="flex items-center gap-2">
            {canExportReport && (
              <>
                <Button variant="outline" onClick={handleExportPdf} disabled={isExporting}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
              </>
            )}

            {canManage && (
              <>
                {capa.status === 'rejected' ? (
                  <Button onClick={handleResubmit} disabled={!canMarkPendingVerification()}>
                    Resubmit for Verification
                  </Button>
                ) : (capa.status === 'in_progress' || capa.status === 'open') && (
                  <Button
                    onClick={handleMarkPendingVerification}
                    disabled={isUploadingEvidence || !canMarkPendingVerification()}
                    title={getVerificationDisabledReason()}
                  >
                    Mark Pending Verification
                  </Button>
                )}
              </>
            )}
          </div>
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
            <p className="font-medium">{entityInfo?.name || 'Unknown'}</p>
            <Badge variant="outline" className="mt-1">{entityInfo?.type || '—'}</Badge>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Audit</p>
            {audit?.audit_code ? (
              <Link 
                to={`/audits/${capa.audit_id}`}
                className="text-blue-600 hover:underline font-mono text-sm"
              >
                {audit.audit_code}
              </Link>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Assigned To</p>
            <p className="font-medium">{userNameById(capa.assigned_to) || userNameById(user?.id) || 'Unknown'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Due Date</p>
            <p className={`font-medium ${isOverdue ? 'text-red-600' : ''}`}>
              {format(new Date(effectiveDueDate), 'MMM d, yyyy')}
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
          <div>
            <Label htmlFor="notes">Corrective action taken</Label>
            {canManage ? (
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Describe the corrective actions taken..."
                className="min-h-[120px]"
              />
            ) : (
              <div className="p-4 bg-muted/50 rounded-md whitespace-pre-wrap">
                {capa.notes || <span className="text-muted-foreground">No notes provided</span>}
              </div>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Evidence</Label>
            {(capa.evidence_urls || []).length === 0 ? (
              <div className="p-6 border border-dashed rounded-lg text-center text-sm text-muted-foreground">
                No evidence uploaded.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(capa.evidence_urls || []).map((url, idx) => (
                  <div key={idx} className="relative group">
                    {isImageUrl(url) ? (
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="w-full h-28 object-cover rounded-md cursor-pointer"
                        onClick={() => openLightbox((capa.evidence_urls || []).filter(isImageUrl), 0)}
                      />
                    ) : isPdfUrl(url) ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center w-full h-28 rounded-md border bg-muted/30 hover:bg-muted/40"
                      >
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </a>
                    ) : (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center w-full h-28 rounded-md border bg-muted/30 hover:bg-muted/40 text-xs text-muted-foreground"
                      >
                        View file
                      </a>
                    )}

                    {canManage && (
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

            {canManage && (
              <label className="block mt-2">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Upload evidence</p>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
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
