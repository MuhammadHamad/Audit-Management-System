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
  getUserById,
  updateBranch,
  updateBCK,
  updateSupplier
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

  // Trigger health score recalculation
  recalculateHealthScore(audit.entity_type, audit.entity_id);

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

// ============= HEALTH SCORE CALCULATION =============
const HEALTH_SCORES_KEY = 'burgerizzr_health_scores';

export interface HealthScoreRecord {
  id: string;
  entity_type: 'branch' | 'bck' | 'supplier';
  entity_id: string;
  score: number;
  components: Record<string, number>;
  calculated_at: string;
}

export const getHealthScores = (): HealthScoreRecord[] => {
  const data = localStorage.getItem(HEALTH_SCORES_KEY);
  return data ? JSON.parse(data) : [];
};

export const upsertHealthScore = (record: Omit<HealthScoreRecord, 'id'>): HealthScoreRecord => {
  const scores = getHealthScores();
  const existingIndex = scores.findIndex(
    s => s.entity_type === record.entity_type && s.entity_id === record.entity_id
  );

  const newRecord: HealthScoreRecord = {
    ...record,
    id: existingIndex >= 0 ? scores[existingIndex].id : crypto.randomUUID(),
  };

  if (existingIndex >= 0) {
    scores[existingIndex] = newRecord;
  } else {
    scores.push(newRecord);
  }

  localStorage.setItem(HEALTH_SCORES_KEY, JSON.stringify(scores));
  return newRecord;
};

export const recalculateHealthScore = (
  entityType: 'branch' | 'bck' | 'supplier',
  entityId: string
): number => {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const approvedAudits = getAudits().filter(a =>
    a.status === 'approved' &&
    a.entity_id === entityId &&
    a.entity_type === entityType &&
    new Date(a.completed_at || a.updated_at) >= ninetyDaysAgo
  );

  const allCapas = getCAPAs().filter(c =>
    c.entity_id === entityId &&
    c.entity_type === entityType
  );

  const closedCapas = allCapas.filter(c => c.status === 'closed');

  let score = 0;
  const components: Record<string, number> = {};

  if (entityType === 'branch') {
    // audit_performance (40%)
    const avgScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.audit_performance = avgScore;

    // capa_completion (25%)
    const onTimeCapas = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const closedActivity = activities.find(a => a.action === 'approved' || a.action === 'auto_approved');
      if (!closedActivity) return true;
      return closedActivity.created_at <= c.due_date + 'T23:59:59';
    });
    components.capa_completion = closedCapas.length > 0
      ? (onTimeCapas.length / closedCapas.length) * 100
      : 100;

    // repeat_findings (15%)
    const recentFindings = getFindings().filter(f => {
      const audit = getAudits().find(a => a.id === f.audit_id);
      return audit?.entity_id === entityId && new Date(f.created_at) >= sixtyDaysAgo;
    });
    const repeatPenalty = Math.min(50, recentFindings.length * 10);
    components.repeat_findings = 100 - repeatPenalty;

    // incident_rate (10%)
    // No incidents table yet, default to 100
    components.incident_rate = 100;

    // verification_pass (10%)
    const firstTimeApproved = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const rejections = activities.filter(a => a.action === 'rejected');
      return rejections.length === 0;
    });
    components.verification_pass = closedCapas.length > 0
      ? (firstTimeApproved.length / closedCapas.length) * 100
      : 100;

    score =
      components.audit_performance * 0.40 +
      components.capa_completion * 0.25 +
      components.repeat_findings * 0.15 +
      components.incident_rate * 0.10 +
      components.verification_pass * 0.10;

    // Update branch
    updateBranch(entityId, { health_score: Math.round(score * 10) / 10 });

  } else if (entityType === 'bck') {
    // haccp_compliance (50%)
    const latestAudit = approvedAudits.sort((a, b) =>
      (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at)
    )[0];
    components.haccp_compliance = latestAudit?.score || 0;

    // production_audit_perf (25%)
    const avgScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.production_audit_perf = avgScore;

    // supplier_quality (15%)
    const bck = getBCKs().find(b => b.id === entityId);
    const suppliers = getSuppliers();
    const relevantSuppliers = suppliers.filter(s =>
      s.supplies_to.bcks.includes(entityId)
    );
    components.supplier_quality = relevantSuppliers.length > 0
      ? relevantSuppliers.reduce((sum, s) => sum + s.quality_score, 0) / relevantSuppliers.length
      : 100;

    // capa_completion (10%)
    const onTimeCapas = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const closedActivity = activities.find(a => a.action === 'approved' || a.action === 'auto_approved');
      if (!closedActivity) return true;
      return closedActivity.created_at <= c.due_date + 'T23:59:59';
    });
    components.capa_completion = closedCapas.length > 0
      ? (onTimeCapas.length / closedCapas.length) * 100
      : 100;

    score =
      components.haccp_compliance * 0.50 +
      components.production_audit_perf * 0.25 +
      components.supplier_quality * 0.15 +
      components.capa_completion * 0.10;

    // Update BCK
    updateBCK(entityId, { health_score: Math.round(score * 10) / 10 });

  } else if (entityType === 'supplier') {
    // audit_performance (40%)
    const avgScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.audit_performance = avgScore;

    // product_quality (30%)
    // Based on findings/incidents - simplified for MVP
    const findings = getFindings().filter(f => {
      const audit = getAudits().find(a => a.id === f.audit_id);
      return audit?.entity_id === entityId;
    });
    components.product_quality = Math.max(0, 100 - findings.length * 10);

    // compliance (20%)
    const supplier = getSuppliers().find(s => s.id === entityId);
    // Check certification expiry - simplified for MVP
    components.compliance = (supplier?.certifications?.length || 0) > 0 ? 100 : 75;

    // delivery_perf (10%)
    components.delivery_perf = 100; // Default full score for MVP

    score =
      components.audit_performance * 0.40 +
      components.product_quality * 0.30 +
      components.compliance * 0.20 +
      components.delivery_perf * 0.10;

    // Update supplier quality_score
    updateSupplier(entityId, { quality_score: Math.round(score * 10) / 10 });
  }

  // Save health score record
  upsertHealthScore({
    entity_type: entityType,
    entity_id: entityId,
    score: Math.round(score * 10) / 10,
    components,
    calculated_at: new Date().toISOString(),
  });

  return score;
};
