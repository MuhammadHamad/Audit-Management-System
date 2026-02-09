/**
 * Health Score Calculation Engine
 * 
 * This is the authoritative, shared module for calculating health scores.
 * All health score calculations in the app import and call this module.
 */

import { getAudits } from './auditStorage';
import { getCAPAs, getFindings, createNotification } from './auditExecutionStorage';
import { getCAPAActivitiesByCAPAId } from './verificationStorage';
import { getIncidents } from './incidentStorage';
import {
  getBranches,
  getBCKs,
  getSuppliers,
  updateBranchSync,
  updateBCKSync,
  updateSupplierSync,
  getUsersByRole,
} from './entityStorage';

// ============= TYPES =============
export type EntityType = 'branch' | 'bck' | 'supplier';

export interface HealthScoreResult {
  score: number;
  components: Record<string, number>;
}

export interface HealthScoreRecord {
  id: string;
  entity_type: EntityType | '_batch_meta';
  entity_id: string;
  score: number;
  components: Record<string, number>;
  calculated_at: string;
}

// ============= CONSTANTS =============
const HEALTH_SCORES_KEY = 'burgerizzr_health_scores';
const BATCH_META_ENTITY_ID = '00000000-0000-0000-0000-000000000000';
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// Stopwords for repeat finding detection
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'and', 'or', 'it', 'this', 'that', 'with', 'has', 'had', 'have', 'been',
  'be', 'not', 'no', 'but', 'by', 'from', 'as', 'if', 'so', 'than', 'then'
]);

// ============= THRESHOLDS =============
export const BRANCH_THRESHOLDS = {
  excellent: { min: 85, color: 'hsl(160, 84%, 39%)', label: 'Excellent' },
  good: { min: 70, color: 'hsl(38, 92%, 50%)', label: 'Good' },
  needsImprovement: { min: 50, color: 'hsl(25, 95%, 53%)', label: 'Needs Improvement' },
  critical: { min: 0, color: 'hsl(0, 84%, 60%)', label: 'Critical' },
};

export const SUPPLIER_THRESHOLDS = {
  approved: { min: 90, color: 'hsl(160, 84%, 39%)', label: 'Approved' },
  conditional: { min: 75, color: 'hsl(38, 92%, 50%)', label: 'Conditional' },
  underReview: { min: 60, color: 'hsl(25, 95%, 53%)', label: 'Under Review' },
  suspended: { min: 0, color: 'hsl(0, 84%, 60%)', label: 'Suspended' },
};

export const getThresholdConfig = (
  score: number,
  entityType: EntityType
): { color: string; label: string } => {
  if (entityType === 'supplier') {
    if (score >= 90) return SUPPLIER_THRESHOLDS.approved;
    if (score >= 75) return SUPPLIER_THRESHOLDS.conditional;
    if (score >= 60) return SUPPLIER_THRESHOLDS.underReview;
    return SUPPLIER_THRESHOLDS.suspended;
  } else {
    if (score >= 85) return BRANCH_THRESHOLDS.excellent;
    if (score >= 70) return BRANCH_THRESHOLDS.good;
    if (score >= 50) return BRANCH_THRESHOLDS.needsImprovement;
    return BRANCH_THRESHOLDS.critical;
  }
};

// ============= HEALTH SCORE STORAGE =============
export const getHealthScores = (): HealthScoreRecord[] => {
  const data = localStorage.getItem(HEALTH_SCORES_KEY);
  return data ? JSON.parse(data) : [];
};

export const getHealthScoreForEntity = (
  entityType: EntityType,
  entityId: string
): HealthScoreRecord | undefined => {
  return getHealthScores().find(
    s => s.entity_type === entityType && s.entity_id === entityId
  );
};

export const upsertHealthScore = (
  record: Omit<HealthScoreRecord, 'id'>
): HealthScoreRecord => {
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

// ============= HELPER FUNCTIONS =============

/**
 * Tokenize a description into lowercase words, removing stopwords
 */
const tokenize = (text: string): Set<string> => {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
  return new Set(words);
};

/**
 * Calculate word overlap between two descriptions
 * Returns a value between 0 and 1
 */
const calculateWordOverlap = (desc1: string, desc2: string): number => {
  const words1 = tokenize(desc1);
  const words2 = tokenize(desc2);
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
};

/**
 * Round score to 1 decimal place
 */
const roundScore = (score: number): number => {
  return Math.round(score * 10) / 10;
};

// ============= CALCULATION ENGINE =============

/**
 * Main calculation function - calculates health score for any entity type
 */
export const calculateHealthScore = (
  entityType: EntityType,
  entityId: string
): HealthScoreResult => {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get approved audits for this entity in last 90 days
  const approvedAudits = getAudits().filter(a =>
    a.status === 'approved' &&
    a.entity_id === entityId &&
    a.entity_type === entityType &&
    new Date(a.completed_at || a.updated_at) >= ninetyDaysAgo
  );

  // Get all CAPA for this entity
  const allCapas = getCAPAs().filter(c =>
    c.entity_id === entityId &&
    c.entity_type === entityType
  );
  const closedCapas = allCapas.filter(c => 
    c.status === 'closed' || c.status === 'approved'
  );

  let score = 0;
  const components: Record<string, number> = {};

  if (entityType === 'branch') {
    // ============= BRANCH HEALTH SCORE =============
    // audit_performance (40%)
    const avgAuditScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.audit_performance = roundScore(avgAuditScore);

    // capa_completion (25%)
    const onTimeCapas = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const closedActivity = activities.find(a => 
        a.action === 'approved' || a.action === 'auto_approved' || a.action === 'audit_finalized'
      );
      if (!closedActivity) return true;
      return closedActivity.created_at <= c.due_date + 'T23:59:59';
    });
    components.capa_completion = closedCapas.length > 0
      ? roundScore((onTimeCapas.length / closedCapas.length) * 100)
      : 100;

    // repeat_findings (15%)
    const allFindings = getFindings();
    const entityFindings = allFindings.filter(f => {
      const audit = getAudits().find(a => a.id === f.audit_id);
      return audit?.entity_id === entityId && audit?.entity_type === entityType;
    });
    
    // Get the most recent audit and its findings
    const sortedAudits = approvedAudits.sort((a, b) => 
      (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at)
    );
    const latestAudit = sortedAudits[0];
    
    let repeatCount = 0;
    if (latestAudit) {
      const latestFindings = entityFindings.filter(f => f.audit_id === latestAudit.id);
      const previousFindings = entityFindings.filter(f => {
        if (f.audit_id === latestAudit.id) return false;
        const audit = getAudits().find(a => a.id === f.audit_id);
        return audit && new Date(audit.completed_at || audit.updated_at) >= sixtyDaysAgo;
      });

      for (const finding of latestFindings) {
        for (const prevFinding of previousFindings) {
          const overlap = calculateWordOverlap(finding.description, prevFinding.description);
          if (overlap >= 0.6) {
            repeatCount++;
            break; // Count each finding as repeat only once
          }
        }
      }
    }
    const repeatPenalty = Math.min(50, repeatCount * 10);
    components.repeat_findings = roundScore(100 - repeatPenalty);

    // incident_rate (10%)
    const incidents = getIncidents().filter(i =>
      i.entity_type === 'branch' &&
      i.entity_id === entityId &&
      new Date(i.created_at) >= thirtyDaysAgo &&
      i.status !== 'closed'
    );
    components.incident_rate = roundScore(Math.max(0, 100 - incidents.length * 20));

    // verification_pass (10%)
    const firstTimeApproved = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const rejections = activities.filter(a => a.action === 'rejected');
      return rejections.length === 0;
    });
    components.verification_pass = closedCapas.length > 0
      ? roundScore((firstTimeApproved.length / closedCapas.length) * 100)
      : 100;

    score =
      components.audit_performance * 0.40 +
      components.capa_completion * 0.25 +
      components.repeat_findings * 0.15 +
      components.incident_rate * 0.10 +
      components.verification_pass * 0.10;

  } else if (entityType === 'bck') {
    // ============= BCK HEALTH SCORE =============
    // haccp_compliance (50%)
    const latestAudit = approvedAudits.sort((a, b) =>
      (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at)
    )[0];
    components.haccp_compliance = roundScore(latestAudit?.score || 0);

    // production_audit_perf (25%)
    const avgAuditScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.production_audit_perf = roundScore(avgAuditScore);

    // supplier_quality (15%)
    const suppliers = getSuppliers();
    const relevantSuppliers = suppliers.filter(s =>
      s.supplies_to.bcks.includes(entityId)
    );
    components.supplier_quality = relevantSuppliers.length > 0
      ? roundScore(relevantSuppliers.reduce((sum, s) => sum + s.quality_score, 0) / relevantSuppliers.length)
      : 100;

    // capa_completion (10%)
    const onTimeCapas = closedCapas.filter(c => {
      const activities = getCAPAActivitiesByCAPAId(c.id);
      const closedActivity = activities.find(a => 
        a.action === 'approved' || a.action === 'auto_approved' || a.action === 'audit_finalized'
      );
      if (!closedActivity) return true;
      return closedActivity.created_at <= c.due_date + 'T23:59:59';
    });
    components.capa_completion = closedCapas.length > 0
      ? roundScore((onTimeCapas.length / closedCapas.length) * 100)
      : 100;

    score =
      components.haccp_compliance * 0.50 +
      components.production_audit_perf * 0.25 +
      components.supplier_quality * 0.15 +
      components.capa_completion * 0.10;

  } else if (entityType === 'supplier') {
    // ============= SUPPLIER QUALITY SCORE =============
    // audit_performance (40%)
    const avgAuditScore = approvedAudits.length > 0
      ? approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length
      : 0;
    components.audit_performance = roundScore(avgAuditScore);

    // product_quality (30%)
    const incidents = getIncidents().filter(i =>
      i.entity_type === 'supplier' && i.entity_id === entityId
    );
    components.product_quality = roundScore(Math.max(0, 100 - incidents.length * 10));

    // compliance (20%)
    const supplier = getSuppliers().find(s => s.id === entityId);
    if (!supplier?.certifications || supplier.certifications.length === 0) {
      components.compliance = 50; // No certifications = compliance risk
    } else {
      // For MVP, check if certifications array has items (expiry checking would need date fields)
      // Simplified: if has certifications, compliance is 100
      components.compliance = 100;
    }

    // delivery_perf (10%)
    components.delivery_perf = 100; // Default full score for MVP

    score =
      components.audit_performance * 0.40 +
      components.product_quality * 0.30 +
      components.compliance * 0.20 +
      components.delivery_perf * 0.10;
  }

  return {
    score: roundScore(score),
    components,
  };
};

/**
 * Recalculate and persist health score for an entity
 * This is the main entry point called by other modules
 */
export const recalculateAndSaveHealthScore = (
  entityType: EntityType,
  entityId: string
): number => {
  const result = calculateHealthScore(entityType, entityId);

  // Save to health_scores table
  upsertHealthScore({
    entity_type: entityType,
    entity_id: entityId,
    score: result.score,
    components: result.components,
    calculated_at: new Date().toISOString(),
  });

  // Update cached score on entity
  if (entityType === 'branch') {
    updateBranchSync(entityId, { health_score: result.score });
  } else if (entityType === 'bck') {
    updateBCKSync(entityId, { health_score: result.score });
  } else if (entityType === 'supplier') {
    updateSupplierSync(entityId, { quality_score: result.score });
    
    // Auto-suspension check for suppliers
    checkSupplierAutoSuspension(entityId, result.score);
  }

  return result.score;
};

/**
 * Check if supplier should be auto-suspended
 */
const checkSupplierAutoSuspension = (supplierId: string, score: number): void => {
  if (score >= 60) return;

  const supplier = getSuppliers().find(s => s.id === supplierId);
  if (!supplier || supplier.status === 'suspended') return;

  // Auto-suspend
  updateSupplierSync(supplierId, { status: 'suspended' });

  // Notify Audit Manager
  const auditManagers = getUsersByRole('audit_manager');
  for (const manager of auditManagers) {
    createNotification({
      user_id: manager.id,
      type: 'supplier_suspended',
      title: 'Supplier Auto-Suspended',
      message: `Supplier ${supplier.name} has been auto-suspended. Quality score dropped to ${score}. Orders should be stopped until the score recovers above 60.`,
      link_to: '/suppliers',
      read: false,
    });
  }
};

// ============= BATCH RECALCULATION =============

/**
 * Get the timestamp of the last batch recalculation
 */
const getLastBatchTimestamp = (): number => {
  const scores = getHealthScores();
  const metaRow = scores.find(
    s => s.entity_type === '_batch_meta' && s.entity_id === BATCH_META_ENTITY_ID
  );
  return metaRow?.score || 0;
};

/**
 * Update the batch meta timestamp
 */
const updateBatchTimestamp = (): void => {
  const scores = getHealthScores();
  const existingIndex = scores.findIndex(
    s => s.entity_type === '_batch_meta' && s.entity_id === BATCH_META_ENTITY_ID
  );

  const metaRecord: HealthScoreRecord = {
    id: existingIndex >= 0 ? scores[existingIndex].id : crypto.randomUUID(),
    entity_type: '_batch_meta',
    entity_id: BATCH_META_ENTITY_ID,
    score: Date.now(),
    components: {},
    calculated_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    scores[existingIndex] = metaRecord;
  } else {
    scores.push(metaRecord);
  }

  localStorage.setItem(HEALTH_SCORES_KEY, JSON.stringify(scores));
};

/**
 * Check if batch recalculation is stale (more than 6 hours old)
 */
export const isBatchStale = (): boolean => {
  const lastBatch = getLastBatchTimestamp();
  return Date.now() - lastBatch > SIX_HOURS_MS;
};

/**
 * Run batch recalculation for all entities
 * Processes suppliers first, then BCKs (which depend on supplier scores)
 */
export const runBatchRecalculation = async (): Promise<void> => {
  // Process suppliers first (BCKs depend on supplier quality scores)
  const suppliers = getSuppliers();
  for (const supplier of suppliers) {
    recalculateAndSaveHealthScore('supplier', supplier.id);
  }

  // Then process BCKs
  const bcks = getBCKs();
  for (const bck of bcks) {
    recalculateAndSaveHealthScore('bck', bck.id);
  }

  // Finally process branches
  const branches = getBranches();
  for (const branch of branches) {
    recalculateAndSaveHealthScore('branch', branch.id);
  }

  // Update batch timestamp
  updateBatchTimestamp();
};

/**
 * Check staleness and run batch if needed (silent background operation)
 */
export const checkAndRunBatchIfNeeded = (): void => {
  if (isBatchStale()) {
    // Run asynchronously without blocking
    setTimeout(() => {
      runBatchRecalculation();
    }, 0);
  }
};

// ============= COMPONENT WEIGHTS =============
export const COMPONENT_WEIGHTS: Record<EntityType, Record<string, number>> = {
  branch: {
    audit_performance: 0.40,
    capa_completion: 0.25,
    repeat_findings: 0.15,
    incident_rate: 0.10,
    verification_pass: 0.10,
  },
  bck: {
    haccp_compliance: 0.50,
    production_audit_perf: 0.25,
    supplier_quality: 0.15,
    capa_completion: 0.10,
  },
  supplier: {
    audit_performance: 0.40,
    product_quality: 0.30,
    compliance: 0.20,
    delivery_perf: 0.10,
  },
};

export const COMPONENT_LABELS: Record<string, string> = {
  audit_performance: 'Audit Performance',
  capa_completion: 'CAPA Completion',
  repeat_findings: 'Repeat Findings',
  incident_rate: 'Incident Rate',
  verification_pass: 'Verification Pass',
  haccp_compliance: 'HACCP Compliance',
  production_audit_perf: 'Production Audit',
  supplier_quality: 'Supplier Quality',
  product_quality: 'Product Quality',
  compliance: 'Compliance',
  delivery_perf: 'Delivery Performance',
};
