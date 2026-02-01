/**
 * Dashboard Statistics Module
 * Provides data aggregation for the Audit Manager Dashboard
 */

import { getAudits, Audit } from './auditStorage';
import { getCAPAs, getFindings, Finding, CAPA } from './auditExecutionStorage';
import { getIncidents, Incident } from './incidentStorage';
import { 
  getBranches, 
  getBCKs, 
  getSuppliers, 
  getRegions, 
  getUserById 
} from './entityStorage';
import { getUsers } from './userStorage';
import { Branch, BCK, Supplier, Region } from '@/types';

// ============= KPI TYPES =============
export interface KPIData {
  totalEntities: number;
  auditsThisMonth: number;
  auditsLastMonth: number;
  passRate: number;
  passRatePrevious: number;
  openCAPA: number;
  openCAPAPrevious: number;
  criticalFindings: number;
  criticalFindingsPrevious: number;
  pendingVerification: number;
  pendingVerificationPrevious: number;
}

export interface CriticalAlert {
  id: string;
  type: 'critical_finding' | 'escalated_capa' | 'critical_incident' | 'suspended_supplier';
  title: string;
  entityName: string;
  linkTo: string;
}

export interface HeatmapEntity {
  id: string;
  code: string;
  name: string;
  type: 'branch' | 'bck';
  score: number;
  hasAuditHistory: boolean;
}

export interface HeatmapRegion {
  id: string;
  name: string;
  code: string;
  branches: HeatmapEntity[];
  bcks: HeatmapEntity[];
}

export interface ActiveAuditItem {
  id: string;
  auditCode: string;
  entityName: string;
  auditorName: string;
  scheduledDate: string;
  status: Audit['status'];
  needsAttention: boolean;
}

export interface CAPAOverviewData {
  open: number;
  inProgress: number;
  pendingVerification: number;
  escalated: number;
  closed: number;
  overdue: number;
  topOverdue: Array<{
    id: string;
    capaCode: string;
    entityName: string;
    daysOverdue: number;
    priority: string;
  }>;
}

export interface IncidentSummaryData {
  openThisMonth: number;
  critical: number;
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recent: Array<{
    id: string;
    code: string;
    title: string;
    severity: string;
    entityName: string;
    createdAt: string;
  }>;
}

export interface AuditorWorkloadItem {
  id: string;
  name: string;
  avatarUrl?: string;
  scheduled: number;
  inProgress: number;
  submitted: number;
  completed30d: number;
  workloadScore: number;
}

// ============= KPI CALCULATIONS =============
export const getKPIData = (): KPIData => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Entities count
  const branches = getBranches().filter(b => b.status !== 'inactive');
  const bcks = getBCKs().filter(b => b.status !== 'inactive');
  const suppliers = getSuppliers().filter(s => s.status !== 'inactive');
  const totalEntities = branches.length + bcks.length + suppliers.length;

  // Audits
  const audits = getAudits();
  
  const auditsThisMonth = audits.filter(a => {
    const date = new Date(a.scheduled_date);
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }).length;

  const auditsLastMonth = audits.filter(a => {
    const date = new Date(a.scheduled_date);
    return date.getMonth() === previousMonth && date.getFullYear() === previousMonthYear;
  }).length;

  // Pass rate (90 days)
  const approvedAudits = audits.filter(a => 
    a.status === 'approved' && 
    new Date(a.completed_at || a.updated_at) >= ninetyDaysAgo
  );
  const passedAudits = approvedAudits.filter(a => a.pass_fail === 'pass');
  const passRate = approvedAudits.length > 0 
    ? Math.round((passedAudits.length / approvedAudits.length) * 100)
    : 0;

  // Previous 90 days for comparison
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const previousApprovedAudits = audits.filter(a => 
    a.status === 'approved' && 
    new Date(a.completed_at || a.updated_at) >= oneEightyDaysAgo &&
    new Date(a.completed_at || a.updated_at) < ninetyDaysAgo
  );
  const previousPassedAudits = previousApprovedAudits.filter(a => a.pass_fail === 'pass');
  const passRatePrevious = previousApprovedAudits.length > 0 
    ? Math.round((previousPassedAudits.length / previousApprovedAudits.length) * 100)
    : 0;

  // Open CAPA
  const capas = getCAPAs();
  const openCAPA = capas.filter(c => 
    ['open', 'in_progress', 'escalated'].includes(c.status)
  ).length;

  // Previous month CAPA (approximation based on created_at)
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const startOfPreviousMonth = new Date(previousMonthYear, previousMonth, 1);
  const previousMonthCapas = capas.filter(c => {
    const createdAt = new Date(c.created_at);
    return createdAt >= startOfPreviousMonth && createdAt < startOfMonth;
  });
  const openCAPAPrevious = previousMonthCapas.filter(c => 
    ['open', 'in_progress', 'escalated'].includes(c.status)
  ).length;

  // Critical Findings
  const findings = getFindings();
  const criticalFindings = findings.filter(f => 
    f.severity === 'critical' && !['closed', 'resolved'].includes(f.status)
  ).length;
  
  const previousMonthFindings = findings.filter(f => {
    const createdAt = new Date(f.created_at);
    return createdAt >= startOfPreviousMonth && createdAt < startOfMonth;
  });
  const criticalFindingsPrevious = previousMonthFindings.filter(f => 
    f.severity === 'critical' && !['closed', 'resolved'].includes(f.status)
  ).length;

  // Pending Verification
  const pendingVerification = audits.filter(a => a.status === 'pending_verification').length;
  
  const previousMonthAudits = audits.filter(a => {
    const createdAt = new Date(a.created_at);
    return createdAt >= startOfPreviousMonth && createdAt < startOfMonth;
  });
  const pendingVerificationPrevious = previousMonthAudits.filter(a => 
    a.status === 'pending_verification'
  ).length;

  return {
    totalEntities,
    auditsThisMonth,
    auditsLastMonth,
    passRate,
    passRatePrevious,
    openCAPA,
    openCAPAPrevious,
    criticalFindings,
    criticalFindingsPrevious,
    pendingVerification,
    pendingVerificationPrevious,
  };
};

// ============= CRITICAL ALERTS =============
export const getCriticalAlerts = (): CriticalAlert[] => {
  const alerts: CriticalAlert[] = [];
  const audits = getAudits();

  // Critical findings (open)
  const findings = getFindings();
  const criticalFindings = findings.filter(f => 
    f.severity === 'critical' && f.status === 'open'
  );
  
  for (const finding of criticalFindings) {
    const audit = audits.find(a => a.id === finding.audit_id);
    if (audit) {
      const entityName = getEntityName(audit.entity_type, audit.entity_id);
      alerts.push({
        id: finding.id,
        type: 'critical_finding',
        title: `Critical Finding`,
        entityName,
        linkTo: `/audits/${audit.id}`,
      });
    }
  }

  // Escalated CAPA
  const capas = getCAPAs();
  const escalatedCapas = capas.filter(c => c.status === 'escalated');
  
  for (const capa of escalatedCapas) {
    const entityName = getEntityName(capa.entity_type, capa.entity_id);
    alerts.push({
      id: capa.id,
      type: 'escalated_capa',
      title: `Escalated CAPA`,
      entityName,
      linkTo: `/capa/${capa.id}`,
    });
  }

  // Critical incidents
  const incidents = getIncidents();
  const criticalIncidents = incidents.filter(i => 
    i.severity === 'critical' && ['open', 'under_investigation'].includes(i.status)
  );
  
  for (const incident of criticalIncidents) {
    const entityName = getEntityName(incident.entity_type, incident.entity_id);
    alerts.push({
      id: incident.id,
      type: 'critical_incident',
      title: `Critical Incident`,
      entityName,
      linkTo: `/incidents/${incident.id}`,
    });
  }

  // Suspended suppliers
  const suppliers = getSuppliers();
  const suspendedSuppliers = suppliers.filter(s => s.status === 'suspended');
  
  for (const supplier of suspendedSuppliers) {
    alerts.push({
      id: supplier.id,
      type: 'suspended_supplier',
      title: `Supplier Suspended`,
      entityName: supplier.name,
      linkTo: `/suppliers`,
    });
  }

  return alerts;
};

// ============= HEATMAP DATA =============
export const getHeatmapData = (): HeatmapRegion[] => {
  const regions = getRegions().filter(r => r.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const branches = getBranches();
  const bcks = getBCKs();

  return regions.map(region => {
    const regionBranches = branches
      .filter(b => b.region_id === region.id && b.status !== 'inactive')
      .map(b => ({
        id: b.id,
        code: b.code,
        name: b.name,
        type: 'branch' as const,
        score: b.health_score,
        hasAuditHistory: !!b.last_audit_date,
      }))
      .sort((a, b) => a.score - b.score); // Lowest scores first

    const regionBcks = bcks
      .filter(b => b.region_id === region.id && b.status !== 'inactive')
      .map(b => ({
        id: b.id,
        code: b.code,
        name: b.name,
        type: 'bck' as const,
        score: b.health_score,
        hasAuditHistory: !!b.last_audit_date,
      }))
      .sort((a, b) => a.score - b.score);

    return {
      id: region.id,
      name: region.name,
      code: region.code,
      branches: regionBranches,
      bcks: regionBcks,
    };
  }).filter(r => r.branches.length > 0 || r.bcks.length > 0);
};

// ============= ACTIVE AUDIT FEED =============
export const getActiveAuditFeed = (filterNeedsAttention: boolean = false): ActiveAuditItem[] => {
  const audits = getAudits();
  const activeStatuses: Audit['status'][] = ['scheduled', 'in_progress', 'submitted', 'pending_verification', 'overdue'];
  
  let activeAudits = audits.filter(a => activeStatuses.includes(a.status));

  if (filterNeedsAttention) {
    activeAudits = activeAudits.filter(a => 
      ['pending_verification', 'submitted', 'overdue'].includes(a.status)
    );
  }

  // Sort by urgency
  const statusPriority: Record<string, number> = {
    'overdue': 0,
    'pending_verification': 1,
    'submitted': 2,
    'in_progress': 3,
    'scheduled': 4,
  };

  activeAudits.sort((a, b) => 
    (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99)
  );

  return activeAudits.slice(0, 12).map(audit => {
    const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;
    const entityName = getEntityName(audit.entity_type, audit.entity_id);

    return {
      id: audit.id,
      auditCode: audit.audit_code,
      entityName,
      auditorName: auditor ? auditor.full_name.split(' ')[0] : 'Unassigned',
      scheduledDate: audit.scheduled_date,
      status: audit.status,
      needsAttention: ['pending_verification', 'submitted', 'overdue'].includes(audit.status),
    };
  });
};

// ============= CAPA OVERVIEW =============
export const getCAPAOverview = (): CAPAOverviewData => {
  const capas = getCAPAs();
  const today = new Date().toISOString().split('T')[0];

  const open = capas.filter(c => c.status === 'open').length;
  const inProgress = capas.filter(c => c.status === 'in_progress').length;
  const pendingVerification = capas.filter(c => c.status === 'pending_verification').length;
  const escalated = capas.filter(c => c.status === 'escalated').length;
  const closed = capas.filter(c => ['closed', 'approved'].includes(c.status)).length;

  const overdueCapas = capas.filter(c => 
    c.due_date < today && !['closed', 'approved'].includes(c.status)
  );
  const overdue = overdueCapas.length;

  // Top 3 overdue
  const topOverdue = overdueCapas
    .map(c => {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const entityName = getEntityName(c.entity_type, c.entity_id);
      return {
        id: c.id,
        capaCode: c.capa_code,
        entityName,
        daysOverdue,
        priority: c.priority,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 3);

  return {
    open,
    inProgress,
    pendingVerification,
    escalated,
    closed,
    overdue,
    topOverdue,
  };
};

// ============= INCIDENT SUMMARY =============
export const getIncidentSummary = (): IncidentSummaryData => {
  const incidents = getIncidents();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const openThisMonth = incidents.filter(i => 
    new Date(i.created_at) >= startOfMonth && i.status !== 'closed'
  ).length;

  const openIncidents = incidents.filter(i => !['resolved', 'closed'].includes(i.status));
  const critical = openIncidents.filter(i => i.severity === 'critical').length;

  const bySeverity = {
    critical: openIncidents.filter(i => i.severity === 'critical').length,
    high: openIncidents.filter(i => i.severity === 'high').length,
    medium: openIncidents.filter(i => i.severity === 'medium').length,
    low: openIncidents.filter(i => i.severity === 'low').length,
  };

  // Recent 5 incidents
  const recent = [...incidents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(i => {
      const entityName = getEntityName(i.entity_type, i.entity_id);
      return {
        id: i.id,
        code: i.incident_code,
        title: i.title,
        severity: i.severity,
        entityName,
        createdAt: i.created_at,
      };
    });

  return {
    openThisMonth,
    critical,
    bySeverity,
    recent,
  };
};

// ============= AUDITOR WORKLOAD =============
export const getAuditorWorkload = (): AuditorWorkloadItem[] => {
  const users = getUsers();
  const auditors = users.filter(u => u.role === 'auditor' && u.status === 'active');
  const audits = getAudits();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  return auditors.map(auditor => {
    const auditorAudits = audits.filter(a => a.auditor_id === auditor.id);

    const scheduled = auditorAudits.filter(a => a.status === 'scheduled').length;
    const inProgress = auditorAudits.filter(a => a.status === 'in_progress').length;
    const submitted = auditorAudits.filter(a => a.status === 'submitted').length;
    const completed30d = auditorAudits.filter(a => 
      a.status === 'approved' && 
      new Date(a.completed_at || a.updated_at) >= thirtyDaysAgo
    ).length;

    const workloadScore = scheduled + inProgress;

    return {
      id: auditor.id,
      name: auditor.full_name,
      avatarUrl: auditor.avatar_url,
      scheduled,
      inProgress,
      submitted,
      completed30d,
      workloadScore,
    };
  }).sort((a, b) => b.workloadScore - a.workloadScore);
};

// ============= HELPER FUNCTIONS =============
const getEntityName = (
  entityType: 'branch' | 'bck' | 'supplier', 
  entityId: string
): string => {
  if (entityType === 'branch') {
    const branch = getBranches().find(b => b.id === entityId);
    return branch?.name || 'Unknown Branch';
  } else if (entityType === 'bck') {
    const bck = getBCKs().find(b => b.id === entityId);
    return bck?.name || 'Unknown BCK';
  } else {
    const supplier = getSuppliers().find(s => s.id === entityId);
    return supplier?.name || 'Unknown Supplier';
  }
};
