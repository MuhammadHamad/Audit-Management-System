import { useState, useEffect, useCallback } from 'react';
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
import { getCAPAs, CAPA, SubTask, getFindings } from '@/lib/auditExecutionStorage';
import { getAuditById } from '@/lib/auditStorage';
import {
  addSubTask,
  updateSubTaskStatus,
  uploadSubTaskEvidence,
  deleteSubTask,
  uploadCAPAEvidence,
  removeCAPAEvidence,
  updateCAPANotes,
  markCAPAPendingVerification,
  resubmitCAPA,
  getStaffForEntity,
  getCAPAActivitiesByCAPAId,
  CAPAActivity
} from '@/lib/capaStorage';
import { getBranches, getBCKs, getSuppliers, getUserById } from '@/lib/entityStorage';
import { EvidenceLightbox } from '@/components/verification/EvidenceLightbox';
import { format, formatDistanceToNow } from 'date-fns';

export default function CAPADetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isLoading, setIsLoading] = useState(true);
  const [capa, setCAPA] = useState<CAPA | null>(null);
  const [finding, setFinding] = useState<any>(null);
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

  const isStaff = user?.role === 'staff';
  const isManager = ['branch_manager', 'bck_manager', 'audit_manager'].includes(user?.role || '');
  const isReadOnly = ['regional_manager', 'super_admin'].includes(user?.role || '');
  const isAuditManager = user?.role === 'audit_manager';

  // For staff, find their specific sub-task
  const staffSubTask = isStaff && capa 
    ? capa.sub_tasks?.find(st => st.assigned_to_user_id === user?.id)
    : null;

  useEffect(() => {
    if (id && user) {
      loadData();
    }
  }, [id, user]);

  const loadData = useCallback(() => {
    setIsLoading(true);
    try {
      const capas = getCAPAs();
      const capaData = capas.find(c => c.id === id);
      
      if (!capaData) {
        navigate('/capa');
        return;
      }
      
      setCAPA(capaData);
      setNotes(capaData.notes || '');
      
      // Load finding
      const findings = getFindings();
      const findingData = findings.find(f => f.id === capaData.finding_id);
      setFinding(findingData);
      
      // Load audit
      const auditData = getAuditById(capaData.audit_id);
      setAudit(auditData);
      
      // Load entity info
      if (capaData.entity_type === 'branch') {
        const branch = getBranches().find(b => b.id === capaData.entity_id);
        setEntityInfo({ name: branch?.name || 'Unknown', code: branch?.code || '', type: 'Branch' });
      } else if (capaData.entity_type === 'bck') {
        const bck = getBCKs().find(b => b.id === capaData.entity_id);
        setEntityInfo({ name: bck?.name || 'Unknown', code: bck?.code || '', type: 'BCK' });
      } else if (capaData.entity_type === 'supplier') {
        const supplier = getSuppliers().find(s => s.id === capaData.entity_id);
        setEntityInfo({ name: supplier?.name || 'Unknown', code: supplier?.supplier_code || '', type: 'Supplier' });
      }
      
      // Load activities
      const activityData = getCAPAActivitiesByCAPAId(capaData.id);
      setActivities(activityData.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
      
      // Check for rejection reason
      const rejectionActivity = activityData.find(a => a.action === 'rejected');
      if (rejectionActivity && capaData.status === 'rejected') {
        setRejectionReason(rejectionActivity.details || 'No reason provided');
      } else {
        setRejectionReason(null);
      }
      
      // Load available staff for sub-task assignment (branch/BCK only)
      if ((user?.role === 'branch_manager' || user?.role === 'bck_manager') && 
          capaData.entity_type !== 'supplier') {
        const staff = getStaffForEntity(
          capaData.entity_type as 'branch' | 'bck',
          capaData.entity_id
        );
        setAvailableStaff(staff);
      }
      
    } finally {
      setIsLoading(false);
    }
  }, [id, user, navigate]);

  const handleNotesBlur = () => {
    if (capa && notes !== capa.notes) {
      updateCAPANotes(capa.id, notes, user!.id);
    }
  };

  const handleAddSubTask = () => {
    if (!newSubTaskDescription.trim() || !newSubTaskAssignee) {
      toast({ title: 'Error', description: 'Please fill in all fields.', variant: 'destructive' });
      return;
    }
    
    addSubTask(capa!.id, newSubTaskDescription, newSubTaskAssignee, user!.id);
    setNewSubTaskDescription('');
    setNewSubTaskAssignee('');
    setShowSubTaskForm(false);
    loadData();
    toast({ title: 'Sub-task added', description: 'The staff member has been notified.' });
  };

  const handleDeleteSubTask = () => {
    if (!deleteSubTaskId) return;
    deleteSubTask(capa!.id, deleteSubTaskId, user!.id);
    setDeleteSubTaskId(null);
    loadData();
    toast({ title: 'Sub-task deleted' });
  };

  const handleSubTaskStatusChange = (subTaskId: string, status: SubTask['status']) => {
    updateSubTaskStatus(capa!.id, subTaskId, status, user!.id);
    loadData();
    toast({ title: `Task marked as ${status.replace('_', ' ')}` });
  };

  const handleEvidenceUpload = async (files: FileList, isSubTask: boolean = false, subTaskId?: string) => {
    const urls: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Compress image if it's an image
      if (file.type.startsWith('image/')) {
        const compressedUrl = await compressImage(file);
        urls.push(compressedUrl);
      } else {
        // For non-images (PDFs), create a data URL
        const reader = new FileReader();
        const url = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        urls.push(url);
      }
    }
    
    if (isSubTask && subTaskId) {
      uploadSubTaskEvidence(capa!.id, subTaskId, urls, user!.id);
    } else {
      uploadCAPAEvidence(capa!.id, urls, user!.id);
    }
    
    loadData();
    toast({ title: 'Evidence uploaded' });
  };

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 1200;
          let { width, height } = img;
          
          if (width > height) {
            if (width > MAX_SIZE) {
              height = (height * MAX_SIZE) / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width = (width * MAX_SIZE) / height;
              height = MAX_SIZE;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveEvidence = (url: string) => {
    removeCAPAEvidence(capa!.id, url, user!.id);
    loadData();
  };

  const handleMarkPendingVerification = () => {
    const result = markCAPAPendingVerification(capa!.id, user!.id);
    if (result.success) {
      loadData();
      toast({ 
        title: 'Submitted for verification', 
        description: capa?.entity_type === 'supplier' 
          ? 'The Audit Manager has been notified.'
          : 'The Regional Manager has been notified.'
      });
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
  };

  const handleResubmit = () => {
    const result = resubmitCAPA(capa!.id, user!.id);
    if (result.success) {
      loadData();
      toast({ title: 'Resubmitted for verification' });
    } else {
      toast({ title: 'Error', description: result.error, variant: 'destructive' });
    }
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
    
    const subTasks = capa.sub_tasks || [];
    if (subTasks.length > 0) {
      const allCompleted = subTasks.every(st => st.status === 'completed');
      if (!allCompleted) return false;
    }
    
    const capaEvidence = capa.evidence_urls || [];
    const subTaskEvidence = subTasks.flatMap(st => st.evidence_urls);
    return capaEvidence.length + subTaskEvidence.length > 0;
  };

  const getVerificationDisabledReason = () => {
    if (!capa) return '';
    const subTasks = capa.sub_tasks || [];
    if (subTasks.length > 0 && !subTasks.every(st => st.status === 'completed')) {
      return 'All sub-tasks must be completed before submitting for verification.';
    }
    const capaEvidence = capa.evidence_urls || [];
    const subTaskEvidence = subTasks.flatMap(st => st.evidence_urls);
    if (capaEvidence.length + subTaskEvidence.length === 0) {
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
            <p className="text-sm mt-1">{finding?.description || 'No description'}</p>
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
            <p className="font-medium">{getUserById(capa.assigned_to)?.full_name || 'Unknown'}</p>
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
                    {url.startsWith('data:image') ? (
                      <img
                        src={url}
                        alt={`Evidence ${idx + 1}`}
                        className="w-20 h-20 object-cover rounded cursor-pointer hover:opacity-80"
                        onClick={() => openLightbox(capa.evidence_urls || [], idx)}
                      />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded flex items-center justify-center">
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

      {/* Section C: Sub-Tasks (Branch/BCK Manager only, not for suppliers) */}
      {!isAuditManager && capa.entity_type !== 'supplier' && (isManager || isReadOnly) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Sub-Tasks</CardTitle>
            {isManager && !isReadOnly && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSubTaskForm(!showSubTaskForm)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Sub-Task
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add Sub-Task Form */}
            {showSubTaskForm && isManager && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                <div>
                  <Label htmlFor="subTaskDesc">Description</Label>
                  <Input
                    id="subTaskDesc"
                    value={newSubTaskDescription}
                    onChange={(e) => setNewSubTaskDescription(e.target.value)}
                    placeholder="e.g. Recalibrate thermometer in kitchen"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Assign To</Label>
                  <Select value={newSubTaskAssignee} onValueChange={setNewSubTaskAssignee}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select staff member" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStaff.length === 0 ? (
                        <SelectItem value="__none__" disabled>No staff available</SelectItem>
                      ) : (
                        availableStaff.map(staff => (
                          <SelectItem key={staff.id} value={staff.id}>
                            {staff.full_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddSubTask}>Add</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowSubTaskForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Sub-Task List */}
            {(capa.sub_tasks || []).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No sub-tasks assigned yet.
              </p>
            ) : (
              <div className="space-y-3">
                {capa.sub_tasks?.map(subTask => {
                  const assignee = getUserById(subTask.assigned_to_user_id);
                  return (
                    <div 
                      key={subTask.id} 
                      className="p-4 border rounded-lg relative"
                    >
                      <div className="flex items-start gap-3">
                        {subTask.status === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                        ) : subTask.status === 'in_progress' ? (
                          <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-400 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{subTask.description}</p>
                          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {assignee?.full_name || 'Unknown'}
                            </span>
                            <span>
                              Added: {format(new Date(subTask.created_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                          
                          {/* Sub-task Evidence */}
                          {subTask.evidence_urls.length > 0 && (
                            <div className="flex gap-2 mt-3">
                              {subTask.evidence_urls.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={url}
                                  alt={`Evidence ${idx + 1}`}
                                  className="w-12 h-12 object-cover rounded cursor-pointer hover:opacity-80"
                                  onClick={() => openLightbox(subTask.evidence_urls, idx)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Delete button for pending sub-tasks */}
                        {isManager && !isReadOnly && subTask.status === 'pending' && (
                          <button
                            onClick={() => setDeleteSubTaskId(subTask.id)}
                            className="text-muted-foreground hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  const activityUser = activity.user_id === 'system' 
                    ? null 
                    : getUserById(activity.user_id);
                  
                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {activity.user_id === 'system' 
                            ? 'SYS' 
                            : activityUser?.full_name.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'
                          }
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {activity.user_id === 'system' ? 'System' : activityUser?.full_name || 'Unknown'}
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

      {/* Delete Sub-Task Confirmation */}
      <AlertDialog open={!!deleteSubTaskId} onOpenChange={() => setDeleteSubTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sub-Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the sub-task. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSubTask}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
