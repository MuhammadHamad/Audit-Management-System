import { 
  getCAPAs, 
  updateCAPA, 
  CAPA, 
  SubTask,
  getFindings,
  updateFinding,
  createNotification 
} from './auditExecutionStorage';
import { 
  createCAPAActivity,
  getCAPAActivitiesByCAPAId,
  CAPAActivity
} from './verificationStorage';
import { 
  getBranches, 
  getBCKs, 
  getSuppliers, 
  getUserById,
  getUsers
} from './entityStorage';
import { getAssignmentsForUser } from './userStorage';
import { getAuditById } from './auditStorage';

// ============= CAPA LIST QUERIES =============

export interface CAPAListItem {
  capa: CAPA;
  finding: {
    id: string;
    finding_code: string;
    description: string;
    severity: string;
  } | null;
  entityName: string;
  entityCode: string;
  entityType: string;
  isOverdue: boolean;
  subTaskProgress: {
    completed: number;
    total: number;
  };
}

export interface StaffTaskItem {
  capaId: string;
  capaCode: string;
  capaPriority: string;
  capaDueDate: string;
  subTask: SubTask;
  isOverdue: boolean;
}

export const getCAPAsForUser = (
  userId: string,
  userRole: string
): CAPAListItem[] => {
  const capas = getCAPAs();
  const findings = getFindings();
  const today = new Date().toISOString().split('T')[0];
  let filteredCapas: CAPA[] = [];

  if (userRole === 'branch_manager') {
    // Get branches managed by this user
    const assignments = getAssignmentsForUser(userId);
    const branchIds = assignments
      .filter(a => a.assigned_type === 'branch')
      .map(a => a.assigned_id);
    
    // Also check branches where this user is the manager
    const branches = getBranches().filter(b => b.manager_id === userId);
    const allBranchIds = [...new Set([...branchIds, ...branches.map(b => b.id)])];
    
    filteredCapas = capas.filter(c => 
      c.entity_type === 'branch' && allBranchIds.includes(c.entity_id)
    );
  } else if (userRole === 'bck_manager') {
    // Get BCKs managed by this user
    const assignments = getAssignmentsForUser(userId);
    const bckIds = assignments
      .filter(a => a.assigned_type === 'bck')
      .map(a => a.assigned_id);
    
    // Also check BCKs where this user is the manager
    const bcks = getBCKs().filter(b => b.manager_id === userId);
    const allBckIds = [...new Set([...bckIds, ...bcks.map(b => b.id)])];
    
    filteredCapas = capas.filter(c => 
      c.entity_type === 'bck' && allBckIds.includes(c.entity_id)
    );
  } else if (userRole === 'audit_manager') {
    // Audit Manager sees supplier CAPA + all escalated CAPA
    filteredCapas = capas.filter(c => 
      c.entity_type === 'supplier' || c.status === 'escalated'
    );
  } else if (userRole === 'regional_manager') {
    // Read-only view of CAPA for entities in their region
    const assignments = getAssignmentsForUser(userId);
    const regionIds = assignments
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);
    
    const branches = getBranches().filter(b => regionIds.includes(b.region_id));
    const bcks = getBCKs().filter(b => regionIds.includes(b.region_id));
    
    const branchIds = branches.map(b => b.id);
    const bckIds = bcks.map(b => b.id);
    
    filteredCapas = capas.filter(c => 
      (c.entity_type === 'branch' && branchIds.includes(c.entity_id)) ||
      (c.entity_type === 'bck' && bckIds.includes(c.entity_id))
    );
  } else if (userRole === 'super_admin') {
    // See all CAPA
    filteredCapas = capas;
  }

  return filteredCapas.map(capa => {
    const finding = findings.find(f => f.id === capa.finding_id);
    let entityName = '';
    let entityCode = '';
    
    if (capa.entity_type === 'branch') {
      const branch = getBranches().find(b => b.id === capa.entity_id);
      entityName = branch?.name || 'Unknown';
      entityCode = branch?.code || '';
    } else if (capa.entity_type === 'bck') {
      const bck = getBCKs().find(b => b.id === capa.entity_id);
      entityName = bck?.name || 'Unknown';
      entityCode = bck?.code || '';
    } else if (capa.entity_type === 'supplier') {
      const supplier = getSuppliers().find(s => s.id === capa.entity_id);
      entityName = supplier?.name || 'Unknown';
      entityCode = supplier?.supplier_code || '';
    }

    const subTasks = capa.sub_tasks || [];
    
    return {
      capa,
      finding: finding ? {
        id: finding.id,
        finding_code: finding.finding_code,
        description: finding.description,
        severity: finding.severity,
      } : null,
      entityName,
      entityCode,
      entityType: capa.entity_type,
      isOverdue: capa.due_date < today && !['closed', 'approved'].includes(capa.status),
      subTaskProgress: {
        completed: subTasks.filter(st => st.status === 'completed').length,
        total: subTasks.length,
      },
    };
  });
};

export const getStaffTasksForUser = (userId: string): StaffTaskItem[] => {
  const capas = getCAPAs();
  const today = new Date().toISOString().split('T')[0];
  const tasks: StaffTaskItem[] = [];

  for (const capa of capas) {
    const subTasks = capa.sub_tasks || [];
    for (const subTask of subTasks) {
      if (subTask.assigned_to_user_id === userId) {
        tasks.push({
          capaId: capa.id,
          capaCode: capa.capa_code,
          capaPriority: capa.priority,
          capaDueDate: capa.due_date,
          subTask,
          isOverdue: capa.due_date < today && subTask.status !== 'completed',
        });
      }
    }
  }

  return tasks;
};

// ============= CAPA STATS =============

export interface CAPAStats {
  open: number;
  overdue: number;
  pendingVerification: number;
  escalated: number;
}

export const getCAPAStats = (userId: string, userRole: string): CAPAStats => {
  const items = getCAPAsForUser(userId, userRole);
  const today = new Date().toISOString().split('T')[0];

  return {
    open: items.filter(i => ['open', 'in_progress'].includes(i.capa.status)).length,
    overdue: items.filter(i => 
      i.capa.due_date < today && !['closed', 'approved'].includes(i.capa.status)
    ).length,
    pendingVerification: items.filter(i => i.capa.status === 'pending_verification').length,
    escalated: items.filter(i => i.capa.status === 'escalated').length,
  };
};

// ============= ESCALATION LOGIC =============

export const runEscalationCheck = (userId: string, userRole: string): number => {
  const items = getCAPAsForUser(userId, userRole);
  const today = new Date();
  let escalatedCount = 0;

  for (const item of items) {
    const { capa } = item;
    if (capa.status !== 'escalated' && ['open', 'in_progress'].includes(capa.status)) {
      const dueDate = new Date(capa.due_date);
      const daysPastDue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysPastDue >= 3) {
        updateCAPA(capa.id, { status: 'escalated' });
        createCAPAActivity({
          capa_id: capa.id,
          user_id: 'system',
          action: 'auto_escalated',
          details: `Auto-escalated: overdue by ${daysPastDue} days`,
        });

        // Notify appropriate manager
        if (capa.entity_type === 'branch' || capa.entity_type === 'bck') {
          // Notify Regional Manager
          const entity = capa.entity_type === 'branch' 
            ? getBranches().find(b => b.id === capa.entity_id)
            : getBCKs().find(b => b.id === capa.entity_id);
          
          if (entity) {
            const users = getUsers();
            const regionalManagers = users.filter(u => u.role === 'regional_manager');
            for (const rm of regionalManagers) {
              const assignments = getAssignmentsForUser(rm.id);
              if (assignments.some(a => a.assigned_type === 'region' && a.assigned_id === entity.region_id)) {
                createNotification({
                  user_id: rm.id,
                  type: 'capa_escalated',
                  title: 'CAPA Auto-Escalated',
                  message: `CAPA ${capa.capa_code} has been auto-escalated. It is ${daysPastDue} days overdue.`,
                  link_to: `/capa/${capa.id}`,
                  read: false,
                });
              }
            }
          }
        } else {
          // Notify Audit Manager for suppliers
          const users = getUsers();
          const auditManagers = users.filter(u => u.role === 'audit_manager');
          for (const am of auditManagers) {
            createNotification({
              user_id: am.id,
              type: 'capa_escalated',
              title: 'CAPA Auto-Escalated',
              message: `CAPA ${capa.capa_code} has been auto-escalated. It is ${daysPastDue} days overdue.`,
              link_to: `/capa/${capa.id}`,
              read: false,
            });
          }
        }

        escalatedCount++;
      }
    }
  }

  return escalatedCount;
};

// ============= SUB-TASK OPERATIONS =============

export const addSubTask = (
  capaId: string,
  description: string,
  assignedToUserId: string,
  createdByUserId: string
): SubTask | null => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return null;

  const newSubTask: SubTask = {
    id: crypto.randomUUID(),
    assigned_to_user_id: assignedToUserId,
    description,
    status: 'pending',
    evidence_urls: [],
    completed_at: null,
    created_at: new Date().toISOString(),
  };

  const subTasks = [...(capa.sub_tasks || []), newSubTask];
  updateCAPA(capaId, { sub_tasks: subTasks });

  const assignedUser = getUserById(assignedToUserId);
  const createdByUser = getUserById(createdByUserId);
  
  createCAPAActivity({
    capa_id: capaId,
    user_id: createdByUserId,
    action: 'sub_task_added',
    details: `${createdByUser?.full_name || 'Manager'}: Sub-task added, assigned to ${assignedUser?.full_name || 'Staff'}`,
  });

  // Notify the staff member
  createNotification({
    user_id: assignedToUserId,
    type: 'task_assigned',
    title: 'New Task Assigned',
    message: `New task assigned to you. CAPA: ${capa.capa_code}. Task: ${description}`,
    link_to: `/capa/${capaId}`,
    read: false,
  });

  return newSubTask;
};

export const updateSubTaskStatus = (
  capaId: string,
  subTaskId: string,
  status: SubTask['status'],
  userId: string
): boolean => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return false;

  const subTasks = capa.sub_tasks || [];
  const subTaskIndex = subTasks.findIndex(st => st.id === subTaskId);
  if (subTaskIndex === -1) return false;

  subTasks[subTaskIndex] = {
    ...subTasks[subTaskIndex],
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : subTasks[subTaskIndex].completed_at,
  };

  updateCAPA(capaId, { sub_tasks: subTasks });

  const user = getUserById(userId);
  const statusText = status === 'in_progress' ? 'in progress' : status;
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: `sub_task_${status}`,
    details: `${user?.full_name || 'User'} marked sub-task as ${statusText}`,
  });

  return true;
};

export const uploadSubTaskEvidence = (
  capaId: string,
  subTaskId: string,
  evidenceUrls: string[],
  userId: string
): boolean => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return false;

  const subTasks = capa.sub_tasks || [];
  const subTaskIndex = subTasks.findIndex(st => st.id === subTaskId);
  if (subTaskIndex === -1) return false;

  subTasks[subTaskIndex] = {
    ...subTasks[subTaskIndex],
    evidence_urls: [...subTasks[subTaskIndex].evidence_urls, ...evidenceUrls],
  };

  updateCAPA(capaId, { sub_tasks: subTasks });

  const user = getUserById(userId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: 'evidence_uploaded',
    details: `${user?.full_name || 'User'}: Evidence uploaded (${evidenceUrls.length} file${evidenceUrls.length > 1 ? 's' : ''}) for sub-task`,
  });

  return true;
};

export const deleteSubTask = (
  capaId: string,
  subTaskId: string,
  userId: string
): boolean => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return false;

  const subTasks = capa.sub_tasks || [];
  const subTask = subTasks.find(st => st.id === subTaskId);
  if (!subTask || subTask.status !== 'pending') return false;

  const filteredSubTasks = subTasks.filter(st => st.id !== subTaskId);
  updateCAPA(capaId, { sub_tasks: filteredSubTasks });

  const user = getUserById(userId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: 'sub_task_deleted',
    details: `${user?.full_name || 'Manager'}: Sub-task deleted`,
  });

  return true;
};

// ============= CAPA EVIDENCE =============

export const uploadCAPAEvidence = (
  capaId: string,
  evidenceUrls: string[],
  userId: string
): boolean => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return false;

  const currentEvidence = capa.evidence_urls || [];
  updateCAPA(capaId, { evidence_urls: [...currentEvidence, ...evidenceUrls] });

  const user = getUserById(userId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: 'evidence_uploaded',
    details: `${user?.full_name || 'Manager'}: Evidence uploaded (${evidenceUrls.length} file${evidenceUrls.length > 1 ? 's' : ''})`,
  });

  return true;
};

export const removeCAPAEvidence = (
  capaId: string,
  evidenceUrl: string,
  userId: string
): boolean => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return false;

  const filteredEvidence = (capa.evidence_urls || []).filter(url => url !== evidenceUrl);
  updateCAPA(capaId, { evidence_urls: filteredEvidence });

  return true;
};

// ============= CAPA NOTES =============

export const updateCAPANotes = (
  capaId: string,
  notes: string,
  userId: string
): boolean => {
  const result = updateCAPA(capaId, { notes });
  return result !== null;
};

// ============= MARK PENDING VERIFICATION =============

export const markCAPAPendingVerification = (
  capaId: string,
  userId: string
): { success: boolean; error?: string } => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return { success: false, error: 'CAPA not found' };

  // Check sub-tasks are completed
  const subTasks = capa.sub_tasks || [];
  if (subTasks.length > 0) {
    const allCompleted = subTasks.every(st => st.status === 'completed');
    if (!allCompleted) {
      return { success: false, error: 'All sub-tasks must be completed first.' };
    }
  }

  // Check evidence exists
  const capaEvidence = capa.evidence_urls || [];
  const subTaskEvidence = subTasks.flatMap(st => st.evidence_urls);
  const totalEvidence = capaEvidence.length + subTaskEvidence.length;
  
  if (totalEvidence === 0) {
    return { success: false, error: 'Upload at least one piece of evidence before submitting.' };
  }

  // Update CAPA status
  updateCAPA(capaId, { status: 'pending_verification' });

  // Update finding status
  const finding = getFindings().find(f => f.id === capa.finding_id);
  if (finding && finding.status !== 'in_progress') {
    updateFinding(finding.id, { status: 'in_progress' });
  }

  const user = getUserById(userId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: 'pending_verification',
    details: `${user?.full_name || 'Manager'}: Marked as pending verification`,
  });

  // Notify verifier
  if (capa.entity_type === 'branch' || capa.entity_type === 'bck') {
    // Notify Regional Manager
    const entity = capa.entity_type === 'branch' 
      ? getBranches().find(b => b.id === capa.entity_id)
      : getBCKs().find(b => b.id === capa.entity_id);
    
    if (entity) {
      const users = getUsers();
      const regionalManagers = users.filter(u => u.role === 'regional_manager');
      for (const rm of regionalManagers) {
        const assignments = getAssignmentsForUser(rm.id);
        if (assignments.some(a => a.assigned_type === 'region' && a.assigned_id === entity.region_id)) {
          createNotification({
            user_id: rm.id,
            type: 'capa_pending_verification',
            title: 'CAPA Pending Verification',
            message: `CAPA ${capa.capa_code} is pending your verification for ${entity.name}.`,
            link_to: `/audits/${capa.audit_id}/verify`,
            read: false,
          });
        }
      }
    }
  } else {
    // Notify Audit Manager for suppliers
    const supplier = getSuppliers().find(s => s.id === capa.entity_id);
    const users = getUsers();
    const auditManagers = users.filter(u => u.role === 'audit_manager');
    for (const am of auditManagers) {
      createNotification({
        user_id: am.id,
        type: 'capa_pending_verification',
        title: 'CAPA Pending Verification',
        message: `CAPA ${capa.capa_code} for supplier ${supplier?.name || 'Unknown'} is pending verification.`,
        link_to: `/audits/${capa.audit_id}/verify`,
        read: false,
      });
    }
  }

  return { success: true };
};

// ============= REWORK (resubmit after rejection) =============

export const resubmitCAPA = (
  capaId: string,
  userId: string
): { success: boolean; error?: string } => {
  const capas = getCAPAs();
  const capa = capas.find(c => c.id === capaId);
  if (!capa) return { success: false, error: 'CAPA not found' };
  
  if (capa.status !== 'rejected') {
    return { success: false, error: 'CAPA is not in rejected status' };
  }

  // Same validation as markPendingVerification
  const subTasks = capa.sub_tasks || [];
  if (subTasks.length > 0) {
    const allCompleted = subTasks.every(st => st.status === 'completed');
    if (!allCompleted) {
      return { success: false, error: 'All sub-tasks must be completed first.' };
    }
  }

  const capaEvidence = capa.evidence_urls || [];
  const subTaskEvidence = subTasks.flatMap(st => st.evidence_urls);
  const totalEvidence = capaEvidence.length + subTaskEvidence.length;
  
  if (totalEvidence === 0) {
    return { success: false, error: 'Upload at least one piece of evidence before submitting.' };
  }

  updateCAPA(capaId, { status: 'pending_verification' });

  const user = getUserById(userId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: userId,
    action: 'resubmitted',
    details: `${user?.full_name || 'Manager'}: Reworked and resubmitted for verification`,
  });

  return { success: true };
};

// ============= GET STAFF FOR ENTITY =============

export const getStaffForEntity = (
  entityType: 'branch' | 'bck',
  entityId: string
): { id: string; full_name: string }[] => {
  const users = getUsers();
  const allAssignments = JSON.parse(localStorage.getItem('burgerizzr_user_assignments') || '[]');
  
  return users
    .filter(u => u.role === 'staff' && u.status === 'active')
    .filter(u => {
      const userAssignments = allAssignments.filter((a: any) => a.user_id === u.id);
      return userAssignments.some((a: any) => 
        a.assigned_type === entityType && a.assigned_id === entityId
      );
    })
    .map(u => ({ id: u.id, full_name: u.full_name }));
};

// Re-export for convenience
export { getCAPAActivitiesByCAPAId };
export type { CAPAActivity };
