/**
 * Dashboard Statistics Module (Supabase-backed)
 * Provides data aggregation for dashboards using React Query data
 */

import type { Audit } from './auditStorage';
import type { Finding, CAPA } from './auditExecutionStorage';
import type { Incident } from './incidentStorage';
import type { Branch, BCK, Supplier, Region } from '@/types';
import { getUserById } from './entityStorage';

// Re-export types from dashboardStats for compatibility
export type {
  KPIData,
  CriticalAlert,
  HeatmapEntity,
  HeatmapRegion,
  ActiveAuditItem,
  CAPAOverviewData,
  IncidentSummaryData,
  AuditorWorkloadItem,
} from './dashboardStats';

// ============= KPI CALCULATIONS =============
export const calculateKPIData = (
  audits: Audit[],
  capas: CAPA[],
  findings: Finding[],
  branches: Branch[],
  bcks: BCK[],
  suppliers: Supplier[]
) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const previousMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const previousMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Entities count
  const totalEntities = 
    branches.filter(b => b.status !== 'inactive').length +
    bcks.filter(b => b.status !== 'inactive').length +
    suppliers.filter(s => s.status !== 'inactive').length;

  // Audits
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
  const openCAPA = capas.filter(c => 
    ['open', 'in_progress', 'escalated'].includes(c.status)
  ).length;

  // Previous month CAPA
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
export const calculateCriticalAlerts = (
  audits: Audit[],
  findings: Finding[],
  capas: CAPA[],
  incidents: Incident[],
  suppliers: Supplier[],
  getEntityName: (entityType: string, entityId: string) => string
) => {
  const alerts: Array<{
    id: string;
    type: 'critical_finding' | 'escalated_capa' | 'critical_incident' | 'suspended_supplier';
    title: string;
    entityName: string;
    linkTo: string;
  }> = [];

  // Critical findings (open)
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
export const calculateHeatmapData = (
  regions: Region[],
  branches: Branch[],
  bcks: BCK[]
) => {
  return regions
    .filter(r => r.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(region => {
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
        .sort((a, b) => a.score - b.score);

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
    })
    .filter(r => r.branches.length > 0 || r.bcks.length > 0);
};

// ============= ACTIVE AUDIT FEED =============
export const calculateActiveAuditFeed = (
  audits: Audit[],
  filterNeedsAttention: boolean,
  getEntityName: (entityType: string, entityId: string) => string
) => {
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
      auditorName: auditor?.full_name || 'Unassigned',
      scheduledDate: audit.scheduled_date,
      status: audit.status,
      needsAttention: ['pending_verification', 'submitted', 'overdue'].includes(audit.status),
    };
  });
};

// ============= CAPA OVERVIEW =============
export const calculateCAPAOverview = (
  capas: CAPA[],
  getEntityName: (entityType: string, entityId: string) => string
) => {
  const now = new Date();
  
  const open = capas.filter(c => c.status === 'open').length;
  const inProgress = capas.filter(c => c.status === 'in_progress').length;
  const pendingVerification = capas.filter(c => c.status === 'pending_verification').length;
  const escalated = capas.filter(c => c.status === 'escalated').length;
  const closed = capas.filter(c => c.status === 'closed').length;

  // Overdue CAPAs
  const overdueCapas = capas.filter(c => {
    if (!c.due_date || ['closed', 'approved'].includes(c.status)) return false;
    return new Date(c.due_date) < now;
  });
  const overdue = overdueCapas.length;

  // Top 5 overdue
  const topOverdue = overdueCapas
    .map(c => {
      const daysOverdue = Math.floor((now.getTime() - new Date(c.due_date).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: c.id,
        capaCode: c.capa_code,
        entityName: getEntityName(c.entity_type, c.entity_id),
        daysOverdue,
        priority: c.priority,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
    .slice(0, 5);

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
export const calculateIncidentSummary = (
  incidents: Incident[],
  getEntityName: (entityType: string, entityId: string) => string
) => {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const openThisMonth = incidents.filter(i => {
    const date = new Date(i.created_at);
    return ['open', 'under_investigation'].includes(i.status) &&
           date.getMonth() === currentMonth &&
           date.getFullYear() === currentYear;
  }).length;

  const critical = incidents.filter(i => 
    i.severity === 'critical' && ['open', 'under_investigation'].includes(i.status)
  ).length;

  const bySeverity = {
    critical: incidents.filter(i => i.severity === 'critical' && ['open', 'under_investigation'].includes(i.status)).length,
    high: incidents.filter(i => i.severity === 'high' && ['open', 'under_investigation'].includes(i.status)).length,
    medium: incidents.filter(i => i.severity === 'medium' && ['open', 'under_investigation'].includes(i.status)).length,
    low: incidents.filter(i => i.severity === 'low' && ['open', 'under_investigation'].includes(i.status)).length,
  };

  const recent = incidents
    .filter(i => ['open', 'under_investigation'].includes(i.status))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map(i => ({
      id: i.id,
      code: i.incident_code,
      title: i.title,
      severity: i.severity,
      entityName: getEntityName(i.entity_type, i.entity_id),
      createdAt: i.created_at,
    }));

  return {
    openThisMonth,
    critical,
    bySeverity,
    recent,
  };
};

// ============= AUDITOR WORKLOAD =============
export const calculateAuditorWorkload = (
  audits: Audit[],
  auditors: Array<{ id: string; full_name: string; avatar_url?: string }>
) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return auditors.map(auditor => {
    const auditorAudits = audits.filter(a => a.auditor_id === auditor.id);
    
    const scheduled = auditorAudits.filter(a => a.status === 'scheduled').length;
    const inProgress = auditorAudits.filter(a => a.status === 'in_progress').length;
    const submitted = auditorAudits.filter(a => a.status === 'submitted').length;
    
    const completed30d = auditorAudits.filter(a => 
      a.status === 'approved' &&
      a.completed_at &&
      new Date(a.completed_at) >= thirtyDaysAgo
    ).length;

    // Workload score: weighted sum
    const workloadScore = (scheduled * 1) + (inProgress * 2) + (submitted * 1.5);

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
