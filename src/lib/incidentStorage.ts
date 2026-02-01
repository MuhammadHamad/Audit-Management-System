import { createNotification } from './auditExecutionStorage';
import { 
  getBranches, 
  getBCKs, 
  getSuppliers, 
  getUserById,
  getUsers
} from './entityStorage';
import { getAssignmentsForUser } from './userStorage';
import { createAudit, generateAuditCode } from './auditStorage';

// ============= TYPES =============

export type IncidentType = 
  | 'Customer Complaint'
  | 'Food Safety'
  | 'Equipment Failure'
  | 'Staff Issue'
  | 'Supplier Batch Rejection'
  | 'Production Defect'
  | 'Hygiene Violation'
  | 'Other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'under_investigation' | 'resolved' | 'closed';
export type IncidentEntityType = 'branch' | 'bck' | 'supplier';

export interface Incident {
  id: string;
  incident_code: string;
  entity_type: IncidentEntityType;
  entity_id: string;
  type: IncidentType;
  category: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  evidence_urls: string[];
  assigned_to?: string;
  status: IncidentStatus;
  resolution_notes?: string;
  investigation_notes?: string;
  related_audit_id?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface IncidentActivity {
  id: string;
  incident_id: string;
  user_id: string;
  action: string;
  details?: string;
  created_at: string;
}

// ============= CATEGORY MAPPING =============

export const categoryMapping: Record<IncidentType, string[]> = {
  'Customer Complaint': ['Food Quality', 'Service Issue', 'Hygiene Complaint', 'Foreign Object'],
  'Food Safety': ['Contamination', 'Temperature Breach', 'Allergen', 'Expiry'],
  'Equipment Failure': ['Refrigeration', 'Cooking', 'Cleaning', 'POS System'],
  'Staff Issue': ['Absenteeism', 'Training Gap', 'Conduct'],
  'Supplier Batch Rejection': ['Quality Below Standard', 'Wrong Specification', 'Packaging Defect', 'Temperature Breach'],
  'Production Defect': ['Taste', 'Texture', 'Portion', 'Labeling'],
  'Hygiene Violation': ['Pest', 'Sanitation', 'Personal Hygiene', 'Waste Disposal'],
  'Other': ['General'],
};

export const incidentTypes: IncidentType[] = [
  'Customer Complaint',
  'Food Safety',
  'Equipment Failure',
  'Staff Issue',
  'Supplier Batch Rejection',
  'Production Defect',
  'Hygiene Violation',
  'Other',
];

// ============= STORAGE KEYS =============
const INCIDENTS_KEY = 'burgerizzr_incidents';
const INCIDENT_ACTIVITIES_KEY = 'burgerizzr_incident_activities';

// ============= INCIDENTS CRUD =============

export const getIncidents = (): Incident[] => {
  const data = localStorage.getItem(INCIDENTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const getIncidentById = (id: string): Incident | undefined => {
  return getIncidents().find(i => i.id === id);
};

export const generateIncidentCode = (): string => {
  const incidents = getIncidents();
  const currentYear = new Date().getFullYear();
  const prefix = `INC-${currentYear}-`;
  
  const existingCodes = incidents
    .filter(i => i.incident_code.startsWith(prefix))
    .map(i => parseInt(i.incident_code.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNumber = existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

export const createIncident = (
  incident: Omit<Incident, 'id' | 'incident_code' | 'created_at' | 'updated_at'>
): Incident => {
  const incidents = getIncidents();
  const newIncident: Incident = {
    ...incident,
    id: crypto.randomUUID(),
    incident_code: generateIncidentCode(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  incidents.push(newIncident);
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents));
  
  // Log activity
  createIncidentActivity({
    incident_id: newIncident.id,
    user_id: incident.created_by,
    action: 'created',
    details: `Incident reported`,
  });

  // Notify assigned user if any
  if (incident.assigned_to) {
    createNotification({
      user_id: incident.assigned_to,
      type: 'incident_assigned',
      title: 'New Incident Assigned',
      message: `New incident assigned to you: ${incident.title}. Severity: ${incident.severity}.`,
      link_to: `/incidents/${newIncident.id}`,
      read: false,
    });
  }

  // Notify Regional Manager and Audit Manager for critical incidents
  if (incident.severity === 'critical') {
    const users = getUsers();
    
    // Get entity info for notification
    let entityName = '';
    if (incident.entity_type === 'branch') {
      const branch = getBranches().find(b => b.id === incident.entity_id);
      entityName = branch?.name || 'Unknown';
    } else if (incident.entity_type === 'bck') {
      const bck = getBCKs().find(b => b.id === incident.entity_id);
      entityName = bck?.name || 'Unknown';
    } else {
      const supplier = getSuppliers().find(s => s.id === incident.entity_id);
      entityName = supplier?.name || 'Unknown';
    }

    // Notify Regional Managers for branch/bck
    if (incident.entity_type !== 'supplier') {
      const entity = incident.entity_type === 'branch'
        ? getBranches().find(b => b.id === incident.entity_id)
        : getBCKs().find(b => b.id === incident.entity_id);
      
      if (entity) {
        const regionalManagers = users.filter(u => u.role === 'regional_manager');
        for (const rm of regionalManagers) {
          const assignments = getAssignmentsForUser(rm.id);
          if (assignments.some(a => a.assigned_type === 'region' && a.assigned_id === entity.region_id)) {
            createNotification({
              user_id: rm.id,
              type: 'critical_incident',
              title: 'Critical Incident Reported',
              message: `Critical incident reported at ${entityName}: ${incident.title}. Immediate attention required.`,
              link_to: `/incidents/${newIncident.id}`,
              read: false,
            });
          }
        }
      }
    }

    // Always notify Audit Managers for critical incidents
    const auditManagers = users.filter(u => u.role === 'audit_manager');
    for (const am of auditManagers) {
      createNotification({
        user_id: am.id,
        type: 'critical_incident',
        title: 'Critical Incident Reported',
        message: `Critical incident reported at ${entityName}: ${incident.title}. Immediate attention required.`,
        link_to: `/incidents/${newIncident.id}`,
        read: false,
      });
    }
  }

  return newIncident;
};

export const updateIncident = (id: string, updates: Partial<Incident>): Incident | null => {
  const incidents = getIncidents();
  const index = incidents.findIndex(i => i.id === id);
  if (index === -1) return null;
  
  incidents[index] = {
    ...incidents[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(INCIDENTS_KEY, JSON.stringify(incidents));
  return incidents[index];
};

// ============= INCIDENT ACTIVITIES =============

export const getIncidentActivities = (): IncidentActivity[] => {
  const data = localStorage.getItem(INCIDENT_ACTIVITIES_KEY);
  return data ? JSON.parse(data) : [];
};

export const getIncidentActivitiesByIncidentId = (incidentId: string): IncidentActivity[] => {
  return getIncidentActivities()
    .filter(a => a.incident_id === incidentId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

export const createIncidentActivity = (
  activity: Omit<IncidentActivity, 'id' | 'created_at'>
): IncidentActivity => {
  const activities = getIncidentActivities();
  const newActivity: IncidentActivity = {
    ...activity,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  activities.push(newActivity);
  localStorage.setItem(INCIDENT_ACTIVITIES_KEY, JSON.stringify(activities));
  return newActivity;
};

// ============= ROLE-BASED FILTERING =============

export interface IncidentListItem {
  incident: Incident;
  entityName: string;
  entityCode: string;
  entityRegionId?: string;
  assignedToName?: string;
  createdByName?: string;
  isStale: boolean; // Open for 48+ hours
  isCriticalOverdue: boolean; // Critical and open for 24+ hours
}

export const getIncidentsForUser = (
  userId: string,
  userRole: string
): IncidentListItem[] => {
  const incidents = getIncidents();
  const now = new Date();
  let filteredIncidents: Incident[] = [];

  if (userRole === 'branch_manager') {
    // Only incidents for their branch
    const branches = getBranches().filter(b => b.manager_id === userId);
    const branchIds = branches.map(b => b.id);
    
    filteredIncidents = incidents.filter(i => 
      i.entity_type === 'branch' && branchIds.includes(i.entity_id)
    );
  } else if (userRole === 'bck_manager') {
    // Incidents for their BCK + suppliers they receive from
    const bcks = getBCKs().filter(b => b.manager_id === userId);
    const bckIds = bcks.map(b => b.id);
    
    // Get suppliers that supply to these BCKs
    const supplierIds: string[] = [];
    for (const bck of bcks) {
      if (bck.supplies_branches) {
        // This is actually supplies_branches but we need to find suppliers that supply TO this BCK
        // For now, show all supplier incidents they might have created
      }
    }
    
    filteredIncidents = incidents.filter(i => 
      (i.entity_type === 'bck' && bckIds.includes(i.entity_id)) ||
      (i.entity_type === 'supplier' && i.created_by === userId)
    );
  } else if (userRole === 'regional_manager') {
    // Incidents for entities in their region
    const assignments = getAssignmentsForUser(userId);
    const regionIds = assignments
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);
    
    const branches = getBranches().filter(b => regionIds.includes(b.region_id));
    const bcks = getBCKs().filter(b => regionIds.includes(b.region_id));
    
    const branchIds = branches.map(b => b.id);
    const bckIds = bcks.map(b => b.id);
    
    // Regional manager can see branch, bck in their region, and all suppliers
    filteredIncidents = incidents.filter(i => 
      (i.entity_type === 'branch' && branchIds.includes(i.entity_id)) ||
      (i.entity_type === 'bck' && bckIds.includes(i.entity_id)) ||
      i.entity_type === 'supplier'
    );
  } else if (userRole === 'audit_manager' || userRole === 'super_admin') {
    // See all incidents
    filteredIncidents = incidents;
  }

  return filteredIncidents.map(incident => {
    let entityName = '';
    let entityCode = '';
    let entityRegionId: string | undefined;
    
    if (incident.entity_type === 'branch') {
      const branch = getBranches().find(b => b.id === incident.entity_id);
      entityName = branch?.name || 'Unknown';
      entityCode = branch?.code || '';
      entityRegionId = branch?.region_id;
    } else if (incident.entity_type === 'bck') {
      const bck = getBCKs().find(b => b.id === incident.entity_id);
      entityName = bck?.name || 'Unknown';
      entityCode = bck?.code || '';
      entityRegionId = bck?.region_id;
    } else {
      const supplier = getSuppliers().find(s => s.id === incident.entity_id);
      entityName = supplier?.name || 'Unknown';
      entityCode = supplier?.supplier_code || '';
    }

    const assignedUser = incident.assigned_to ? getUserById(incident.assigned_to) : undefined;
    const createdByUser = getUserById(incident.created_by);
    
    const createdAt = new Date(incident.created_at);
    const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
    
    return {
      incident,
      entityName,
      entityCode,
      entityRegionId,
      assignedToName: assignedUser?.full_name,
      createdByName: createdByUser?.full_name,
      isStale: hoursSinceCreation >= 48 && incident.status === 'open',
      isCriticalOverdue: incident.severity === 'critical' && 
        hoursSinceCreation >= 24 && 
        ['open', 'under_investigation'].includes(incident.status),
    };
  });
};

// ============= INCIDENT STATS =============

export interface IncidentStats {
  open: number;
  underInvestigation: number;
  critical: number;
  resolvedLast30Days: number;
}

export const getIncidentStats = (userId: string, userRole: string): IncidentStats => {
  const items = getIncidentsForUser(userId, userRole);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return {
    open: items.filter(i => i.incident.status === 'open').length,
    underInvestigation: items.filter(i => i.incident.status === 'under_investigation').length,
    critical: items.filter(i => 
      i.incident.severity === 'critical' && 
      !['resolved', 'closed'].includes(i.incident.status)
    ).length,
    resolvedLast30Days: items.filter(i => 
      i.incident.status === 'resolved' && 
      new Date(i.incident.updated_at) >= thirtyDaysAgo
    ).length,
  };
};

// ============= INCIDENT ACTIONS =============

export const assignIncident = (
  incidentId: string,
  assignedTo: string,
  assignedByUserId: string
): boolean => {
  const incident = getIncidentById(incidentId);
  if (!incident) return false;

  updateIncident(incidentId, { assigned_to: assignedTo });

  const assignedUser = getUserById(assignedTo);
  const assignedByUser = getUserById(assignedByUserId);

  createIncidentActivity({
    incident_id: incidentId,
    user_id: assignedByUserId,
    action: 'assigned',
    details: `${assignedByUser?.full_name || 'Manager'} assigned this to ${assignedUser?.full_name || 'User'}`,
  });

  createNotification({
    user_id: assignedTo,
    type: 'incident_assigned',
    title: 'Incident Assigned to You',
    message: `Incident ${incident.incident_code} has been assigned to you for investigation.`,
    link_to: `/incidents/${incidentId}`,
    read: false,
  });

  return true;
};

export const markUnderInvestigation = (
  incidentId: string,
  userId: string
): boolean => {
  const incident = getIncidentById(incidentId);
  if (!incident || incident.status !== 'open') return false;

  updateIncident(incidentId, { status: 'under_investigation' });

  const user = getUserById(userId);
  createIncidentActivity({
    incident_id: incidentId,
    user_id: userId,
    action: 'under_investigation',
    details: `${user?.full_name || 'User'} marked as under investigation`,
  });

  return true;
};

export const updateInvestigationNotes = (
  incidentId: string,
  notes: string,
  userId: string
): boolean => {
  const result = updateIncident(incidentId, { investigation_notes: notes });
  
  if (result) {
    const user = getUserById(userId);
    createIncidentActivity({
      incident_id: incidentId,
      user_id: userId,
      action: 'notes_updated',
      details: `${user?.full_name || 'User'} updated investigation notes`,
    });
  }
  
  return result !== null;
};

export const resolveIncident = (
  incidentId: string,
  resolutionNotes: string,
  userId: string
): boolean => {
  // Import dynamically to avoid circular dependency
  const { recalculateAndSaveHealthScore } = require('./healthScoreEngine');
  
  const incident = getIncidentById(incidentId);
  if (!incident || incident.status !== 'under_investigation') return false;

  updateIncident(incidentId, { 
    status: 'resolved',
    resolution_notes: resolutionNotes,
  });

  const user = getUserById(userId);
  createIncidentActivity({
    incident_id: incidentId,
    user_id: userId,
    action: 'resolved',
    details: `${user?.full_name || 'User'} resolved this incident`,
  });

  // Notify Audit Manager for critical incidents
  if (incident.severity === 'critical') {
    const auditManagers = getUsers().filter(u => u.role === 'audit_manager');
    for (const am of auditManagers) {
      createNotification({
        user_id: am.id,
        type: 'incident_resolved',
        title: 'Critical Incident Resolved',
        message: `Critical incident ${incident.incident_code} has been resolved.`,
        link_to: `/incidents/${incidentId}`,
        read: false,
      });
    }
  }

  // Trigger health score recalculation for the affected entity
  recalculateAndSaveHealthScore(incident.entity_type, incident.entity_id);

  return true;
};

export const closeIncident = (
  incidentId: string,
  userId: string
): boolean => {
  const incident = getIncidentById(incidentId);
  if (!incident || incident.status !== 'resolved') return false;

  updateIncident(incidentId, { status: 'closed' });

  const user = getUserById(userId);
  createIncidentActivity({
    incident_id: incidentId,
    user_id: userId,
    action: 'closed',
    details: `${user?.full_name || 'User'} closed this incident`,
  });

  return true;
};

// ============= TRIGGER AUDIT FROM INCIDENT =============

export const triggerAuditFromIncident = (
  incidentId: string,
  templateId: string,
  scheduledDate: string,
  auditorId: string | undefined,
  triggeredByUserId: string
): string | null => {
  const incident = getIncidentById(incidentId);
  if (!incident || incident.entity_type !== 'supplier') return null;

  // Check if already has related audit
  if (incident.related_audit_id) return null;

  const supplier = getSuppliers().find(s => s.id === incident.entity_id);
  if (!supplier) return null;
  
  const newAudit = createAudit({
    plan_id: undefined,
    template_id: templateId,
    entity_type: 'supplier',
    entity_id: incident.entity_id,
    scheduled_date: scheduledDate,
    status: 'scheduled',
    auditor_id: auditorId,
    created_by: triggeredByUserId,
  });

  if (!newAudit) return null;

  // Update incident with related audit
  updateIncident(incidentId, { related_audit_id: newAudit.id });

  const triggeredByUser = getUserById(triggeredByUserId);
  createIncidentActivity({
    incident_id: incidentId,
    user_id: triggeredByUserId,
    action: 'audit_triggered',
    details: `${triggeredByUser?.full_name || 'Audit Manager'} triggered audit ${newAudit.audit_code} from this incident`,
  });

  // Notify auditor if assigned
  if (auditorId) {
    createNotification({
      user_id: auditorId,
      type: 'audit_assigned',
      title: 'New Audit Scheduled',
      message: `New audit scheduled from incident ${incident.incident_code}. Supplier: ${supplier.name}. Scheduled: ${scheduledDate}.`,
      link_to: `/audits/${newAudit.id}`,
      read: false,
    });
  }

  return newAudit.id;
};

// ============= GET ENTITIES FOR USER (for create form) =============

export const getEntitiesForIncidentCreation = (
  userId: string,
  userRole: string,
  entityType: IncidentEntityType
): Array<{ id: string; name: string; code: string }> => {
  if (userRole === 'branch_manager' && entityType === 'branch') {
    const branches = getBranches().filter(b => b.manager_id === userId);
    return branches.map(b => ({ id: b.id, name: b.name, code: b.code }));
  }
  
  if (userRole === 'bck_manager') {
    if (entityType === 'bck') {
      const bcks = getBCKs().filter(b => b.manager_id === userId);
      return bcks.map(b => ({ id: b.id, name: b.name, code: b.code }));
    }
    if (entityType === 'supplier') {
      // All suppliers that supply to their BCK
      const suppliers = getSuppliers().filter(s => s.status === 'active');
      return suppliers.map(s => ({ id: s.id, name: s.name, code: s.supplier_code }));
    }
  }
  
  if (userRole === 'regional_manager') {
    const assignments = getAssignmentsForUser(userId);
    const regionIds = assignments
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);
    
    if (entityType === 'branch') {
      const branches = getBranches().filter(b => regionIds.includes(b.region_id));
      return branches.map(b => ({ id: b.id, name: b.name, code: b.code }));
    }
    if (entityType === 'bck') {
      const bcks = getBCKs().filter(b => regionIds.includes(b.region_id));
      return bcks.map(b => ({ id: b.id, name: b.name, code: b.code }));
    }
    if (entityType === 'supplier') {
      const suppliers = getSuppliers().filter(s => s.status === 'active');
      return suppliers.map(s => ({ id: s.id, name: s.name, code: s.supplier_code }));
    }
  }
  
  return [];
};

export const getManagersForAssignment = (
  userId: string,
  userRole: string,
  entityType: IncidentEntityType,
  entityId: string
): Array<{ id: string; name: string; role: string }> => {
  if (userRole !== 'regional_manager') return [];
  
  const users = getUsers();
  
  if (entityType === 'branch') {
    const branch = getBranches().find(b => b.id === entityId);
    if (branch) {
      // Get branch managers in this region
      const branchManagers = users.filter(u => 
        u.role === 'branch_manager' && u.status === 'active'
      );
      return branchManagers.map(u => ({ id: u.id, name: u.full_name, role: u.role }));
    }
  }
  
  if (entityType === 'bck') {
    const bck = getBCKs().find(b => b.id === entityId);
    if (bck) {
      const bckManagers = users.filter(u => 
        u.role === 'bck_manager' && u.status === 'active'
      );
      return bckManagers.map(u => ({ id: u.id, name: u.full_name, role: u.role }));
    }
  }
  
  return [];
};
