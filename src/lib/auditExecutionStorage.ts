import { getBranchById, getBCKById, getSupplierById, getUsersByRole, getUserById } from './entityStorage';

// ============= TYPES =============
export interface AuditResult {
  id: string;
  audit_id: string;
  section_id: string;
  item_id: string;
  response: AuditItemResponse;
  evidence_urls: string[];
  points_earned: number;
  created_at: string;
  updated_at: string;
}

export type AuditItemResponse = 
  | { value: 'pass' | 'fail' }
  | { value: number }
  | { value: string }
  | { value: Record<string, boolean> }
  | { value: null };

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FindingStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Finding {
  id: string;
  finding_code: string;
  audit_id: string;
  item_id: string;
  section_name: string;
  category: string;
  severity: FindingSeverity;
  description: string;
  evidence_urls: string[];
  status: FindingStatus;
  created_at: string;
  updated_at: string;
}

export type CAPAStatus = 'open' | 'in_progress' | 'pending_verification' | 'approved' | 'rejected' | 'escalated' | 'closed';
export type CAPAPriority = 'low' | 'medium' | 'high' | 'critical';

export interface SubTask {
  id: string;
  assigned_to_user_id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  evidence_urls: string[];
  completed_at: string | null;
  created_at: string;
}

export interface CAPA {
  id: string;
  capa_code: string;
  finding_id: string;
  audit_id: string;
  entity_type: 'branch' | 'bck' | 'supplier';
  entity_id: string;
  description: string;
  assigned_to: string;
  due_date: string;
  status: CAPAStatus;
  priority: CAPAPriority;
  evidence_urls: string[];
  notes?: string;
  sub_tasks: SubTask[];
  created_at: string;
  updated_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  link_to?: string;
  read: boolean;
  created_at: string;
}

// ============= STORAGE KEYS =============
const AUDIT_RESULTS_KEY = 'burgerizzr_audit_results';
const FINDINGS_KEY = 'burgerizzr_findings';
const CAPA_KEY = 'burgerizzr_capa';
const NOTIFICATIONS_KEY = 'burgerizzr_notifications';

// ============= AUDIT RESULTS =============
export const getAuditResults = (): AuditResult[] => {
  const data = localStorage.getItem(AUDIT_RESULTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getAuditResultsByAuditId = (auditId: string): AuditResult[] => {
  return getAuditResults().filter(r => r.audit_id === auditId);
};

export const getAuditResultByItemId = (auditId: string, itemId: string): AuditResult | undefined => {
  return getAuditResults().find(r => r.audit_id === auditId && r.item_id === itemId);
};

export const saveAuditResult = (result: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>): AuditResult => {
  const results = getAuditResults();
  const existingIndex = results.findIndex(r => r.audit_id === result.audit_id && r.item_id === result.item_id);
  
  const now = new Date().toISOString();
  
  if (existingIndex !== -1) {
    // Update existing
    results[existingIndex] = {
      ...results[existingIndex],
      ...result,
      updated_at: now,
    };
    localStorage.setItem(AUDIT_RESULTS_KEY, JSON.stringify(results));
    return results[existingIndex];
  } else {
    // Create new
    const newResult: AuditResult = {
      ...result,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    };
    results.push(newResult);
    localStorage.setItem(AUDIT_RESULTS_KEY, JSON.stringify(results));
    return newResult;
  }
};

export const saveBulkAuditResults = (results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[]): void => {
  const allResults = getAuditResults();
  const now = new Date().toISOString();
  
  for (const result of results) {
    const existingIndex = allResults.findIndex(r => r.audit_id === result.audit_id && r.item_id === result.item_id);
    
    if (existingIndex !== -1) {
      allResults[existingIndex] = {
        ...allResults[existingIndex],
        ...result,
        updated_at: now,
      };
    } else {
      allResults.push({
        ...result,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
      });
    }
  }
  
  localStorage.setItem(AUDIT_RESULTS_KEY, JSON.stringify(allResults));
};

// ============= FINDINGS =============
export const getFindings = (): Finding[] => {
  const data = localStorage.getItem(FINDINGS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getFindingsByAuditId = (auditId: string): Finding[] => {
  return getFindings().filter(f => f.audit_id === auditId);
};

export const generateFindingCode = (): string => {
  const findings = getFindings();
  const currentYear = new Date().getFullYear();
  const prefix = `FND-${currentYear}-`;
  
  const existingCodes = findings
    .filter(f => f.finding_code.startsWith(prefix))
    .map(f => parseInt(f.finding_code.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNumber = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

export const createFinding = (finding: Omit<Finding, 'id' | 'finding_code' | 'created_at' | 'updated_at'>): Finding => {
  const findings = getFindings();
  const newFinding: Finding = {
    ...finding,
    id: crypto.randomUUID(),
    finding_code: generateFindingCode(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  findings.push(newFinding);
  localStorage.setItem(FINDINGS_KEY, JSON.stringify(findings));
  return newFinding;
};

export const updateFinding = (id: string, updates: Partial<Finding>): Finding | null => {
  const findings = getFindings();
  const index = findings.findIndex(f => f.id === id);
  if (index === -1) return null;
  
  findings[index] = {
    ...findings[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(FINDINGS_KEY, JSON.stringify(findings));
  return findings[index];
};

// ============= CAPA =============
export const getCAPAs = (): CAPA[] => {
  const data = localStorage.getItem(CAPA_KEY);
  return data ? JSON.parse(data) : [];
};

export const getCAPAsByAuditId = (auditId: string): CAPA[] => {
  return getCAPAs().filter(c => c.audit_id === auditId);
};

export const getCAPAById = (id: string): CAPA | undefined => {
  return getCAPAs().find(c => c.id === id);
};

export const generateCAPACode = (): string => {
  const capas = getCAPAs();
  const currentYear = new Date().getFullYear();
  const prefix = `CPA-${currentYear}-`;
  
  const existingCodes = capas
    .filter(c => c.capa_code.startsWith(prefix))
    .map(c => parseInt(c.capa_code.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNumber = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

export const createCAPA = (capa: Omit<CAPA, 'id' | 'capa_code' | 'created_at' | 'updated_at'>): CAPA => {
  const capas = getCAPAs();
  const newCAPA: CAPA = {
    ...capa,
    id: crypto.randomUUID(),
    capa_code: generateCAPACode(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  capas.push(newCAPA);
  localStorage.setItem(CAPA_KEY, JSON.stringify(capas));
  return newCAPA;
};

export const updateCAPA = (id: string, updates: Partial<CAPA>): CAPA | null => {
  const capas = getCAPAs();
  const index = capas.findIndex(c => c.id === id);
  if (index === -1) return null;
  
  capas[index] = {
    ...capas[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(CAPA_KEY, JSON.stringify(capas));
  return capas[index];
};

// ============= NOTIFICATIONS =============
export const getNotifications = (): AppNotification[] => {
  const data = localStorage.getItem(NOTIFICATIONS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getNotificationsForUser = (userId: string): AppNotification[] => {
  return getNotifications().filter(n => n.user_id === userId);
};

export const createNotification = (notification: Omit<AppNotification, 'id' | 'created_at'>): AppNotification => {
  const notifications = getNotifications();
  const newNotification: AppNotification = {
    ...notification,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  notifications.push(newNotification);
  localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  return newNotification;
};

export const markNotificationAsRead = (id: string): void => {
  const notifications = getNotifications();
  const index = notifications.findIndex(n => n.id === id);
  if (index !== -1) {
    notifications[index].read = true;
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));
  }
};

// ============= CAPA ASSIGNMENT LOGIC =============
export const getAssigneeForCAPA = (
  entityType: 'branch' | 'bck' | 'supplier',
  entityId: string
): string | undefined => {
  if (entityType === 'branch') {
    const branch = getBranchById(entityId);
    return branch?.manager_id;
  } else if (entityType === 'bck') {
    const bck = getBCKById(entityId);
    return bck?.manager_id;
  } else if (entityType === 'supplier') {
    // Assign to audit manager
    const auditManagers = getUsersByRole('audit_manager');
    return auditManagers[0]?.id;
  }
  return undefined;
};

export const calculateDueDate = (severity: FindingSeverity): string => {
  const now = new Date();
  let daysToAdd = 30; // Default for low
  
  if (severity === 'critical') {
    daysToAdd = 3;
  } else if (severity === 'high') {
    daysToAdd = 7;
  } else if (severity === 'medium') {
    daysToAdd = 14;
  }
  
  now.setDate(now.getDate() + daysToAdd);
  return now.toISOString().split('T')[0];
};
