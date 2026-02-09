import {
  getCAPAs,
  updateCAPA,
  getFindings,
  updateFinding,
  CAPA,
  Finding,
  createNotification
} from './auditExecutionStorage';
import {
  getAudits,
  updateAudit,
  getAuditsForUser,
  Audit
} from './auditStorage';
import {
  getBranches,
  getBCKs,
  getSuppliers,
  getRegions,
  getUsersByRole,
  getUserById
} from './entityStorage';
import { getAssignmentsForUser } from './userStorage';

// ============= CAPA ACTIVITY =============
export interface CAPAActivity {
  id: string;
  capa_id: string;
  user_id: string;
  action: string;
  details?: string;
  created_at: string;
}

const CAPA_ACTIVITY_KEY = 'burgerizzr_capa_activity';

export const getCAPAActivities = (): CAPAActivity[] => {
  const data = localStorage.getItem(CAPA_ACTIVITY_KEY);
  return data ? JSON.parse(data) : [];
};

export const getCAPAActivitiesByCAPAId = (capaId: string): CAPAActivity[] => {
  return getCAPAActivities().filter(a => a.capa_id === capaId);
};

export const createCAPAActivity = (
  activity: Omit<CAPAActivity, 'id' | 'created_at'>
): CAPAActivity => {
  const activities = getCAPAActivities();
  const newActivity: CAPAActivity = {
    ...activity,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  activities.push(newActivity);
  localStorage.setItem(CAPA_ACTIVITY_KEY, JSON.stringify(activities));
  return newActivity;
};

// ============= AUTO-APPROVAL LOGIC =============
export const runAutoApproval = (): { autoApproved: number; auditsReady: number } => {
  const capas = getCAPAs();
  let autoApproved = 0;
  const auditsToCheck = new Set<string>();

  // Check all CAPA at pending_verification
  for (const capa of capas) {
    if (capa.status !== 'pending_verification') continue;

    // Auto-approve low/medium with evidence
    if (
      (capa.priority === 'low' || capa.priority === 'medium') &&
      capa.evidence_urls &&
      capa.evidence_urls.length > 0
    ) {
      updateCAPA(capa.id, { status: 'closed' });
      createCAPAActivity({
        capa_id: capa.id,
        user_id: 'system',
        action: 'auto_approved',
        details: `Auto-approved (${capa.priority} severity with evidence)`,
      });
      autoApproved++;
      auditsToCheck.add(capa.audit_id);
    }
  }

  // Check if audits are ready for verification
  let auditsReady = 0;
  for (const auditId of auditsToCheck) {
    const auditCapas = getCAPAs().filter(c => c.audit_id === auditId);
    const allReady = auditCapas.every(c =>
      c.status === 'closed' || c.status === 'approved' || c.status === 'pending_verification'
    );
    const noneOpen = !auditCapas.some(c => c.status === 'open' || c.status === 'in_progress');

    if (allReady && noneOpen) {
      const audit = getAudits().find(a => a.id === auditId);
      if (audit && audit.status === 'submitted') {
        updateAudit(auditId, { status: 'pending_verification' });
        auditsReady++;
      }
    }
  }

  return { autoApproved, auditsReady };
};

// ============= VERIFICATION QUEUE =============
export interface VerificationQueueItem {
  audit: Audit;
  entityName: string;
  entityCode: string;
  entityCity?: string;
  auditorName: string;
  findingsCount: number;
  criticalFindingsCount: number;
  capaTotal: number;
  capaClosed: number;
  capaPending: number;
  hasOverdueCapa: boolean;
  submittedAt: string;
}

export const getVerificationQueue = (
  userId: string,
  userRole: string
): VerificationQueueItem[] => {
  // Run auto-approval first
  runAutoApproval();

  // Get audits that need verification
  let audits = getAudits().filter(a =>
    a.status === 'pending_verification' ||
    (a.status === 'submitted' && shouldShowInQueue(a.id))
  );

  // Role-based filtering
  if (userRole === 'regional_manager') {
    // Only branches/BCKs in their region
    const assignments = getAssignmentsForUser(userId);
    const regionIds = assignments
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);

    const branches = getBranches().filter(b => regionIds.includes(b.region_id));
    const bcks = getBCKs().filter(b => regionIds.includes(b.region_id));

    const branchIds = branches.map(b => b.id);
    const bckIds = bcks.map(b => b.id);

    audits = audits.filter(a =>
      (a.entity_type === 'branch' && branchIds.includes(a.entity_id)) ||
      (a.entity_type === 'bck' && bckIds.includes(a.entity_id))
    );
  } else if (userRole === 'audit_manager') {
    // Audit manager sees all (including suppliers)
    // No additional filtering needed
  } else if (userRole !== 'super_admin') {
    // Other roles cannot access
    return [];
  }

  const today = new Date().toISOString().split('T')[0];

  return audits.map(audit => {
    const findings = getFindings().filter(f => f.audit_id === audit.id);
    const capas = getCAPAs().filter(c => c.audit_id === audit.id);

    let entityName = '';
    let entityCode = '';
    let entityCity = '';

    if (audit.entity_type === 'branch') {
      const branch = getBranches().find(b => b.id === audit.entity_id);
      entityName = branch?.name || 'Unknown';
      entityCode = branch?.code || '';
      entityCity = branch?.city || '';
    } else if (audit.entity_type === 'bck') {
      const bck = getBCKs().find(b => b.id === audit.entity_id);
      entityName = bck?.name || 'Unknown';
      entityCode = bck?.code || '';
      entityCity = bck?.city || '';
    } else if (audit.entity_type === 'supplier') {
      const supplier = getSuppliers().find(s => s.id === audit.entity_id);
      entityName = supplier?.name || 'Unknown';
      entityCode = supplier?.supplier_code || '';
      entityCity = supplier?.city || '';
    }

    const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;

    return {
      audit,
      entityName,
      entityCode,
      entityCity,
      auditorName: auditor?.full_name || 'Unassigned',
      findingsCount: findings.length,
      criticalFindingsCount: findings.filter(f => f.severity === 'critical').length,
      capaTotal: capas.length,
      capaClosed: capas.filter(c => c.status === 'closed' || c.status === 'approved').length,
      capaPending: capas.filter(c => c.status === 'pending_verification').length,
      hasOverdueCapa: capas.some(c => c.due_date < today && c.status !== 'closed'),
      submittedAt: audit.completed_at || audit.updated_at,
    };
  });
};

const shouldShowInQueue = (auditId: string): boolean => {
  const capas = getCAPAs().filter(c => c.audit_id === auditId);
  if (capas.length === 0) return true; // No CAPA means ready for review

  // All CAPA must be at pending_verification or closed
  return capas.every(c =>
    c.status === 'pending_verification' ||
    c.status === 'closed' ||
    c.status === 'approved'
  );
};

// ============= VERIFICATION ACTIONS =============
export const approveCAPA = (
  capaId: string,
  verifierId: string
): { success: boolean; error?: string } => {
  const capa = getCAPAs().find(c => c.id === capaId);
  if (!capa) return { success: false, error: 'CAPA not found' };

  updateCAPA(capaId, { status: 'closed' });

  const verifier = getUserById(verifierId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: verifierId,
    action: 'approved',
    details: `${verifier?.full_name || 'Verifier'}: CAPA approved`,
  });

  // Update related finding to resolved
  const finding = getFindings().find(f => f.id === capa.finding_id);
  if (finding) {
    updateFinding(finding.id, { status: 'resolved' });
  }

  return { success: true };
};

export const rejectCAPA = (
  capaId: string,
  verifierId: string,
  reason: string
): { success: boolean; error?: string } => {
  const capa = getCAPAs().find(c => c.id === capaId);
  if (!capa) return { success: false, error: 'CAPA not found' };

  updateCAPA(capaId, { status: 'rejected' });

  const verifier = getUserById(verifierId);
  createCAPAActivity({
    capa_id: capaId,
    user_id: verifierId,
    action: 'rejected',
    details: `${verifier?.full_name || 'Verifier'}: Rejected - ${reason}`,
  });

  // Notify the assignee
  if (capa.assigned_to) {
    createNotification({
      user_id: capa.assigned_to,
      type: 'capa_rejected',
      title: 'CAPA Rejected',
      message: `CAPA ${capa.capa_code} was rejected. Feedback: ${reason}. Please rework and resubmit.`,
      link_to: `/capa/${capa.id}`,
      read: false,
    });
  }

  return { success: true };
};

export const approveAudit = (
  auditId: string,
  verifierId: string
): { success: boolean; error?: string } => {
  // Import dynamically to avoid circular dependency
  const { recalculateAndSaveHealthScore } = require('./healthScoreEngine');
  
  const audit = getAudits().find(a => a.id === auditId);
  if (!audit) return { success: false, error: 'Audit not found' };

  const capas = getCAPAs().filter(c => c.audit_id === auditId);
  const allClosed = capas.every(c => c.status === 'closed' || c.status === 'approved');

  if (!allClosed) {
    return { success: false, error: 'All CAPA must be approved before finalizing' };
  }

  updateAudit(auditId, { status: 'approved' });

  // Mark all findings as resolved
  const findings = getFindings().filter(f => f.audit_id === auditId);
  for (const finding of findings) {
    updateFinding(finding.id, { status: 'resolved' });
  }

  // Log activity for each CAPA
  const verifier = getUserById(verifierId);
  for (const capa of capas) {
    createCAPAActivity({
      capa_id: capa.id,
      user_id: verifierId,
      action: 'audit_finalized',
      details: `${verifier?.full_name || 'Verifier'}: Audit approved and finalized`,
    });
  }

  // Notify entity manager that audit is approved
  let entityName = '';
  let managerId: string | undefined;
  
  if (audit.entity_type === 'branch') {
    const branch = getBranches().find(b => b.id === audit.entity_id);
    entityName = branch?.name || 'Unknown';
    managerId = branch?.manager_id;
  } else if (audit.entity_type === 'bck') {
    const bck = getBCKs().find(b => b.id === audit.entity_id);
    entityName = bck?.name || 'Unknown';
    managerId = bck?.manager_id;
  } else if (audit.entity_type === 'supplier') {
    const supplier = getSuppliers().find(s => s.id === audit.entity_id);
    entityName = supplier?.name || 'Unknown';
    // For suppliers, notify the audit manager instead
    const auditManagers = getUsersByRole('audit_manager');
    if (auditManagers.length > 0) {
      managerId = auditManagers[0].id;
    }
  }

  if (managerId) {
    createNotification({
      user_id: managerId,
      type: 'audit_approved',
      title: 'Audit Approved',
      message: `Audit ${audit.audit_code} for ${entityName} has been approved and finalized.`,
      link_to: `/audits/${audit.id}`,
      read: false,
    });
  }

  // Trigger health score recalculation using the shared engine
  recalculateAndSaveHealthScore(audit.entity_type as 'branch' | 'bck' | 'supplier', audit.entity_id);

  return { success: true };
};

export const flagAudit = (
  auditId: string,
  verifierId: string,
  reason: string
): { success: boolean; error?: string } => {
  const audit = getAudits().find(a => a.id === auditId);
  if (!audit) return { success: false, error: 'Audit not found' };

  updateAudit(auditId, { status: 'rejected' });

  // Notify Audit Manager
  const auditManagers = getUsersByRole('audit_manager');
  for (const manager of auditManagers) {
    createNotification({
      user_id: manager.id,
      type: 'audit_flagged',
      title: 'Audit Flagged for Review',
      message: `Audit ${audit.audit_code} has been flagged. Reason: ${reason}. Review required.`,
      link_to: `/audits/${audit.id}`,
      read: false,
    });
  }

  return { success: true };
};

// ============= RE-EXPORT HEALTH SCORE FUNCTIONS =============
// For backwards compatibility, re-export from the shared engine
export {
  getHealthScores,
  upsertHealthScore,
  recalculateAndSaveHealthScore as recalculateHealthScore,
  type HealthScoreRecord,
} from './healthScoreEngine';
