import { getTemplates } from './templateStorage';
import { getBranches, getBCKs, getSuppliers, getRegions, getUsersByRole } from './entityStorage';
import { getAssignmentsForUser } from './userStorage';

// Types
export interface RecurrencePattern {
  type: 'one_time' | 'recurring';
  scheduled_date?: string;
  frequency?: 'daily' | 'weekly' | 'monthly';
  days_of_week?: number[];
  day_of_month?: number;
  start_date?: string;
  end_date?: string;
  entity_ids: string[];
}

export interface AuditPlan {
  id: string;
  name: string;
  description?: string;
  template_id: string;
  entity_type: 'branch' | 'bck' | 'supplier';
  recurrence_pattern: RecurrencePattern;
  scope: {
    type: 'all' | 'specific';
    entity_ids?: string[];
  };
  assignment_strategy: 'auto_round_robin' | 'assign_specific' | 'manual';
  assigned_auditor_id?: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type AuditStatus = 
  | 'scheduled' 
  | 'in_progress' 
  | 'submitted' 
  | 'pending_verification' 
  | 'approved' 
  | 'rejected' 
  | 'overdue' 
  | 'cancelled';

export interface Audit {
  id: string;
  audit_code: string;
  plan_id?: string;
  template_id: string;
  entity_type: 'branch' | 'bck' | 'supplier';
  entity_id: string;
  auditor_id?: string;
  scheduled_date: string;
  started_at?: string;
  completed_at?: string;
  status: AuditStatus;
  score?: number;
  pass_fail?: 'pass' | 'fail';
  created_by: string;
  created_at: string;
  updated_at: string;
}

const AUDIT_PLANS_KEY = 'burgerizzr_audit_plans';
const AUDITS_KEY = 'burgerizzr_audits';

// ============= AUDIT PLANS =============
export const getAuditPlans = (): AuditPlan[] => {
  const data = localStorage.getItem(AUDIT_PLANS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getAuditPlanById = (id: string): AuditPlan | undefined => {
  return getAuditPlans().find(p => p.id === id);
};

export const createAuditPlan = (
  plan: Omit<AuditPlan, 'id' | 'created_at' | 'updated_at'>
): AuditPlan => {
  const plans = getAuditPlans();
  const newPlan: AuditPlan = {
    ...plan,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  plans.push(newPlan);
  localStorage.setItem(AUDIT_PLANS_KEY, JSON.stringify(plans));
  return newPlan;
};

export const updateAuditPlan = (id: string, updates: Partial<AuditPlan>): AuditPlan | null => {
  const plans = getAuditPlans();
  const index = plans.findIndex(p => p.id === id);
  if (index === -1) return null;

  plans[index] = {
    ...plans[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(AUDIT_PLANS_KEY, JSON.stringify(plans));
  return plans[index];
};

export const deleteAuditPlan = (id: string): { success: boolean; error?: string } => {
  const plan = getAuditPlanById(id);
  if (!plan) return { success: false, error: 'Plan not found' };
  
  if (plan.status !== 'draft') {
    return { 
      success: false, 
      error: 'Cannot delete an active plan. Pause it first, then set to draft.' 
    };
  }

  const plans = getAuditPlans().filter(p => p.id !== id);
  localStorage.setItem(AUDIT_PLANS_KEY, JSON.stringify(plans));
  return { success: true };
};

// ============= AUDITS =============
export const getAudits = (): Audit[] => {
  const data = localStorage.getItem(AUDITS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getAuditById = (id: string): Audit | undefined => {
  return getAudits().find(a => a.id === id);
};

export const generateAuditCode = (): string => {
  const audits = getAudits();
  const currentYear = new Date().getFullYear();
  const prefix = `AUD-${currentYear}-`;
  
  const existingCodes = audits
    .filter(a => a.audit_code.startsWith(prefix))
    .map(a => parseInt(a.audit_code.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNumber = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

export const createAudit = (
  audit: Omit<Audit, 'id' | 'audit_code' | 'created_at' | 'updated_at'>
): Audit => {
  const audits = getAudits();
  const newAudit: Audit = {
    ...audit,
    id: crypto.randomUUID(),
    audit_code: generateAuditCode(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  audits.push(newAudit);
  localStorage.setItem(AUDITS_KEY, JSON.stringify(audits));
  return newAudit;
};

export const updateAudit = (id: string, updates: Partial<Audit>): Audit | null => {
  const audits = getAudits();
  const index = audits.findIndex(a => a.id === id);
  if (index === -1) return null;

  audits[index] = {
    ...audits[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(AUDITS_KEY, JSON.stringify(audits));
  return audits[index];
};

export const cancelAudit = (id: string): Audit | null => {
  return updateAudit(id, { status: 'cancelled' });
};

// ============= AUDIT GENERATION =============

// Get auditors sorted by current audit count (for round robin)
export const getAuditorsForRoundRobin = () => {
  const auditors = getUsersByRole('auditor');
  const audits = getAudits().filter(a => a.status === 'scheduled');
  
  return auditors
    .map(auditor => ({
      ...auditor,
      scheduledCount: audits.filter(a => a.auditor_id === auditor.id).length,
    }))
    .sort((a, b) => {
      if (a.scheduledCount !== b.scheduledCount) {
        return a.scheduledCount - b.scheduledCount;
      }
      return a.full_name.localeCompare(b.full_name);
    });
};

// Generate audits from an audit plan
export const generateAuditsFromPlan = (
  plan: AuditPlan,
  createdBy: string
): Audit[] => {
  const createdAudits: Audit[] = [];
  
  // Get entities based on scope
  let entityIds: string[] = [];
  if (plan.scope.type === 'all') {
    if (plan.entity_type === 'branch') {
      entityIds = getBranches().filter(b => b.status === 'active').map(b => b.id);
    } else if (plan.entity_type === 'bck') {
      entityIds = getBCKs().filter(b => b.status === 'active').map(b => b.id);
    } else if (plan.entity_type === 'supplier') {
      entityIds = getSuppliers().filter(s => s.status === 'active').map(s => s.id);
    }
  } else {
    entityIds = plan.scope.entity_ids || [];
  }

  // Get dates to generate audits for
  const dates = getScheduledDates(plan.recurrence_pattern);
  
  // Get auditors for round robin
  let auditors = plan.assignment_strategy === 'auto_round_robin' 
    ? getAuditorsForRoundRobin() 
    : [];
  let auditorIndex = 0;

  // Generate audits for each date and entity
  for (const date of dates) {
    for (const entityId of entityIds) {
      let auditorId: string | undefined;
      
      if (plan.assignment_strategy === 'assign_specific') {
        auditorId = plan.assigned_auditor_id;
      } else if (plan.assignment_strategy === 'auto_round_robin' && auditors.length > 0) {
        auditorId = auditors[auditorIndex % auditors.length].id;
        auditorIndex++;
      }
      // For 'manual', auditorId remains undefined

      const audit = createAudit({
        plan_id: plan.id,
        template_id: plan.template_id,
        entity_type: plan.entity_type,
        entity_id: entityId,
        auditor_id: auditorId,
        scheduled_date: date,
        status: 'scheduled',
        created_by: createdBy,
      });
      
      createdAudits.push(audit);
    }
  }

  return createdAudits;
};

// Get scheduled dates based on recurrence pattern (for next 30 days)
const getScheduledDates = (pattern: RecurrencePattern): string[] => {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (pattern.type === 'one_time' && pattern.scheduled_date) {
    return [pattern.scheduled_date];
  }

  if (pattern.type === 'recurring' && pattern.start_date) {
    const startDate = new Date(pattern.start_date);
    const endDate = pattern.end_date 
      ? new Date(pattern.end_date) 
      : new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const actualEndDate = endDate < maxDate ? endDate : maxDate;

    let currentDate = new Date(Math.max(startDate.getTime(), today.getTime()));
    
    while (currentDate <= actualEndDate) {
      const shouldInclude = shouldIncludeDate(currentDate, pattern);
      if (shouldInclude) {
        dates.push(currentDate.toISOString().split('T')[0]);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return dates;
};

const shouldIncludeDate = (date: Date, pattern: RecurrencePattern): boolean => {
  if (pattern.frequency === 'daily') {
    return true;
  }
  
  if (pattern.frequency === 'weekly' && pattern.days_of_week) {
    const dayOfWeek = date.getDay();
    return pattern.days_of_week.includes(dayOfWeek);
  }
  
  if (pattern.frequency === 'monthly' && pattern.day_of_month) {
    return date.getDate() === pattern.day_of_month;
  }
  
  return false;
};

// Update overdue audits
export const updateOverdueAudits = (): number => {
  const audits = getAudits();
  const today = new Date().toISOString().split('T')[0];
  let updatedCount = 0;

  for (const audit of audits) {
    if (audit.status === 'scheduled' && audit.scheduled_date < today) {
      updateAudit(audit.id, { status: 'overdue' });
      updatedCount++;
    }
  }

  return updatedCount;
};

// Get next scheduled audit date for a plan
export const getNextAuditDateForPlan = (planId: string): string | null => {
  const today = new Date().toISOString().split('T')[0];
  const audits = getAudits()
    .filter(a => a.plan_id === planId && a.scheduled_date >= today && a.status === 'scheduled')
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
  
  return audits.length > 0 ? audits[0].scheduled_date : null;
};

// ============= ROLE-BASED FILTERING =============
export const getAuditsForUser = (
  userId: string,
  userRole: string
): Audit[] => {
  let audits = getAudits();

  if (userRole === 'auditor') {
    // Auditors see only their own audits
    audits = audits.filter(a => a.auditor_id === userId);
  } else if (userRole === 'regional_manager') {
    // Regional managers see audits for entities in their region
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
  }
  // Super admin and audit manager see all audits

  return audits;
};

// Get entity name helper
export const getEntityName = (entityType: string, entityId: string): string => {
  if (entityType === 'branch') {
    const branch = getBranches().find(b => b.id === entityId);
    return branch ? branch.name : 'Unknown Branch';
  } else if (entityType === 'bck') {
    const bck = getBCKs().find(b => b.id === entityId);
    return bck ? bck.name : 'Unknown BCK';
  } else if (entityType === 'supplier') {
    const supplier = getSuppliers().find(s => s.id === entityId);
    return supplier ? supplier.name : 'Unknown Supplier';
  }
  return 'Unknown';
};

// Get template name helper
export const getTemplateName = (templateId: string): string => {
  const template = getTemplates().find(t => t.id === templateId);
  return template ? template.name : 'Unknown Template';
};
