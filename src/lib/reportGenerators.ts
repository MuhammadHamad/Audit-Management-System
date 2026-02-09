/**
 * Report Generation Engine
 * 
 * Generates CSV and Excel reports for various data types.
 * All reports are generated client-side using the browser.
 */

import * as XLSX from 'xlsx';
import { getAudits, Audit, getEntityName } from './auditStorage';
import { getCAPAs, getFindings, Finding, CAPA } from './auditExecutionStorage';
import { getIncidents, Incident } from './incidentStorage';
import { 
  getBranches, 
  getBCKs, 
  getSuppliers, 
  getRegions, 
  getUserById,
  getUsersByRole 
} from './entityStorage';
import { getHealthScores, HealthScoreRecord, EntityType } from './healthScoreEngine';
import { getCAPAActivitiesByCAPAId } from './verificationStorage';
import { getAssignmentsForUser } from './userStorage';
import { format, differenceInDays, isWithinInterval, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';

// ============= TYPES =============
export type ReportType = 
  | 'audit_summary'
  | 'health_score_rankings'
  | 'capa_performance'
  | 'finding_trends'
  | 'incident_analysis'
  | 'supplier_quality'
  | 'auditor_performance';

export type FileFormat = 'csv' | 'xlsx';

export interface ReportConfig {
  reportType: ReportType;
  dateRange: {
    from: Date;
    to: Date;
  };
  entityIds?: string[];
  includeEvidence: boolean;
  fileFormat: FileFormat;
}

export interface LastReportMeta {
  filename: string;
  timestamp: string;
  reportType: ReportType;
  config: ReportConfig;
}

const LAST_REPORT_KEY = 'burgerizzr_last_report';

// ============= HELPERS =============

export const saveLastReportMeta = (meta: LastReportMeta): void => {
  localStorage.setItem(LAST_REPORT_KEY, JSON.stringify(meta));
};

export const getLastReportMeta = (): LastReportMeta | null => {
  const data = localStorage.getItem(LAST_REPORT_KEY);
  return data ? JSON.parse(data) : null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toCSV = (data: any[]): string => {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => 
    Object.values(row).map(v => {
      const val = v === null || v === undefined ? '' : String(v);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );
  return [headers, ...rows].join('\n');
};

const downloadFile = (content: string | Blob, filename: string, mimeType: string): void => {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const formatDate = (date: Date): string => format(date, 'yyyy-MM-dd');

const formatFilename = (reportType: string, from: Date, to: Date, format: FileFormat): string => {
  return `${reportType}_${formatDate(from)}_to_${formatDate(to)}.${format}`;
};

// ============= DATA FILTERING BY ROLE =============

interface UserScope {
  branches: string[];
  bcks: string[];
  suppliers: string[];
  regionIds: string[];
}

export const getUserScope = (userId: string, userRole: string): UserScope => {
  const assignments = getAssignmentsForUser(userId);
  
  if (userRole === 'super_admin' || userRole === 'audit_manager') {
    return {
      branches: getBranches().map(b => b.id),
      bcks: getBCKs().map(b => b.id),
      suppliers: getSuppliers().map(s => s.id),
      regionIds: getRegions().map(r => r.id),
    };
  }
  
  if (userRole === 'regional_manager') {
    const regionIds = assignments
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);
    
    const branches = getBranches().filter(b => regionIds.includes(b.region_id));
    const bcks = getBCKs().filter(b => regionIds.includes(b.region_id));
    
    return {
      branches: branches.map(b => b.id),
      bcks: bcks.map(b => b.id),
      suppliers: [], // Regional managers don't see supplier reports
      regionIds,
    };
  }
  
  if (userRole === 'branch_manager') {
    const branchAssignments = assignments.filter(a => a.assigned_type === 'branch');
    const managerBranches = getBranches().filter(b => b.manager_id === userId);
    const branchIds = [...new Set([
      ...branchAssignments.map(a => a.assigned_id),
      ...managerBranches.map(b => b.id)
    ])];
    
    return {
      branches: branchIds,
      bcks: [],
      suppliers: [],
      regionIds: [],
    };
  }
  
  if (userRole === 'bck_manager') {
    const bckAssignments = assignments.filter(a => a.assigned_type === 'bck');
    const managerBcks = getBCKs().filter(b => b.manager_id === userId);
    const bckIds = [...new Set([
      ...bckAssignments.map(a => a.assigned_id),
      ...managerBcks.map(b => b.id)
    ])];
    
    // Get suppliers that supply to these BCKs
    const suppliers = getSuppliers().filter(s => 
      s.supplies_to.bcks.some(bckId => bckIds.includes(bckId))
    );
    
    return {
      branches: [],
      bcks: bckIds,
      suppliers: suppliers.map(s => s.id),
      regionIds: [],
    };
  }
  
  return { branches: [], bcks: [], suppliers: [], regionIds: [] };
};

// ============= REPORT GENERATORS =============

interface AuditSummaryRow {
  audit_code: string;
  entity_type: string;
  entity_code: string;
  entity_name: string;
  template_name: string;
  auditor_name: string;
  scheduled_date: string;
  completed_at: string;
  score: number | string;
  pass_fail: string;
  status: string;
  finding_count: number;
  critical_finding_count: number;
  evidence_urls?: string;
}

export const generateAuditSummaryReport = (
  config: ReportConfig,
  scope: UserScope,
  templateNameById?: TemplateNameById
): { data: AuditSummaryRow[]; kpis: Record<string, number | string> } => {
  const allAudits = getAudits();
  const allFindings = getFindings();
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  
  const scopedEntityIds = [...scope.branches, ...scope.bcks, ...scope.suppliers];
  
  const filteredAudits = allAudits.filter(audit => {
    const completedDate = audit.completed_at ? new Date(audit.completed_at) : null;
    const scheduledDate = new Date(audit.scheduled_date);
    const dateToCheck = completedDate || scheduledDate;
    
    const inDateRange = isWithinInterval(dateToCheck, {
      start: config.dateRange.from,
      end: config.dateRange.to
    });
    
    const inScope = scopedEntityIds.includes(audit.entity_id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(audit.entity_id);
    
    return inDateRange && inScope && matchesFilter;
  });
  
  const data: AuditSummaryRow[] = filteredAudits.map(audit => {
    let entityCode = '';
    let entityName = getEntityName(audit.entity_type, audit.entity_id);
    
    if (audit.entity_type === 'branch') {
      const branch = branches.find(b => b.id === audit.entity_id);
      entityCode = branch?.code || '';
    } else if (audit.entity_type === 'bck') {
      const bck = bcks.find(b => b.id === audit.entity_id);
      entityCode = bck?.code || '';
    } else {
      const supplier = suppliers.find(s => s.id === audit.entity_id);
      entityCode = supplier?.supplier_code || '';
    }
    
    const auditor = audit.auditor_id ? getUserById(audit.auditor_id) : null;
    const findings = allFindings.filter(f => f.audit_id === audit.id);
    
    const row: AuditSummaryRow = {
      audit_code: audit.audit_code,
      entity_type: audit.entity_type,
      entity_code: entityCode,
      entity_name: entityName,
      template_name: templateNameById?.[audit.template_id] || 'Unknown Template',
      auditor_name: auditor?.full_name || 'Unassigned',
      scheduled_date: audit.scheduled_date,
      completed_at: audit.completed_at || '',
      score: audit.status === 'approved' ? (audit.score ?? '') : '',
      pass_fail: audit.pass_fail || '',
      status: audit.status,
      finding_count: findings.length,
      critical_finding_count: findings.filter(f => f.severity === 'critical').length,
    };
    
    if (config.includeEvidence) {
      row.evidence_urls = findings.flatMap(f => f.evidence_urls).join('; ');
    }
    
    return row;
  });
  
  // Calculate KPIs
  const approvedAudits = filteredAudits.filter(a => a.status === 'approved');
  const passedAudits = approvedAudits.filter(a => a.pass_fail === 'pass');
  const passRate = approvedAudits.length > 0 
    ? Math.round((passedAudits.length / approvedAudits.length) * 100) 
    : 0;
  const avgScore = approvedAudits.length > 0 
    ? Math.round(approvedAudits.reduce((sum, a) => sum + (a.score || 0), 0) / approvedAudits.length)
    : 0;
  const totalFindings = filteredAudits.reduce((sum, audit) => {
    return sum + allFindings.filter(f => f.audit_id === audit.id).length;
  }, 0);
  const criticalFindings = filteredAudits.reduce((sum, audit) => {
    return sum + allFindings.filter(f => f.audit_id === audit.id && f.severity === 'critical').length;
  }, 0);
  
  return {
    data,
    kpis: {
      'Total Audits': filteredAudits.length,
      'Pass Rate (%)': passRate,
      'Average Score': avgScore,
      'Total Findings': totalFindings,
      'Critical Findings': criticalFindings,
    },
  };
};

interface HealthScoreRow {
  entity_type: string;
  entity_code: string;
  entity_name: string;
  region_name: string;
  health_score: number;
  audit_performance: number | string;
  capa_completion: number | string;
  repeat_findings: number | string;
  incident_rate: number | string;
  verification_pass: number | string;
  haccp_compliance: number | string;
  last_calculated: string;
}

export const generateHealthScoreRankingsReport = (
  config: ReportConfig,
  scope: UserScope
): { data: HealthScoreRow[] } => {
  const healthScores = getHealthScores().filter(hs => hs.entity_type !== '_batch_meta');
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  const regions = getRegions();
  
  const scopedEntityIds = [...scope.branches, ...scope.bcks, ...scope.suppliers];
  
  const filteredScores = healthScores.filter(hs => {
    const inScope = scopedEntityIds.includes(hs.entity_id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(hs.entity_id);
    return inScope && matchesFilter;
  });
  
  const data: HealthScoreRow[] = filteredScores.map(hs => {
    let entityCode = '';
    let entityName = '';
    let regionName = '';
    
    if (hs.entity_type === 'branch') {
      const branch = branches.find(b => b.id === hs.entity_id);
      entityCode = branch?.code || '';
      entityName = branch?.name || '';
      const region = regions.find(r => r.id === branch?.region_id);
      regionName = region?.name || '';
    } else if (hs.entity_type === 'bck') {
      const bck = bcks.find(b => b.id === hs.entity_id);
      entityCode = bck?.code || '';
      entityName = bck?.name || '';
      const region = regions.find(r => r.id === bck?.region_id);
      regionName = region?.name || '';
    } else {
      const supplier = suppliers.find(s => s.id === hs.entity_id);
      entityCode = supplier?.supplier_code || '';
      entityName = supplier?.name || '';
      regionName = 'N/A';
    }
    
    return {
      entity_type: hs.entity_type,
      entity_code: entityCode,
      entity_name: entityName,
      region_name: regionName,
      health_score: hs.score,
      audit_performance: hs.components.audit_performance ?? '',
      capa_completion: hs.components.capa_completion ?? '',
      repeat_findings: hs.components.repeat_findings ?? '',
      incident_rate: hs.components.incident_rate ?? '',
      verification_pass: hs.components.verification_pass ?? '',
      haccp_compliance: hs.components.haccp_compliance ?? '',
      last_calculated: hs.calculated_at ? format(new Date(hs.calculated_at), 'yyyy-MM-dd HH:mm') : '',
    };
  });
  
  // Sort by health_score descending
  data.sort((a, b) => b.health_score - a.health_score);
  
  return { data };
};

interface CAPAPerformanceRow {
  capa_code: string;
  finding_code: string;
  entity_type: string;
  entity_code: string;
  entity_name: string;
  priority: string;
  due_date: string;
  status: string;
  assigned_to_name: string;
  days_to_close: number | string;
  overdue: string;
}

export const generateCAPAPerformanceReport = (
  config: ReportConfig,
  scope: UserScope
): { data: CAPAPerformanceRow[]; kpis: Record<string, number | string> } => {
  const allCapas = getCAPAs();
  const allFindings = getFindings();
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  const today = new Date();
  
  const scopedEntityIds = [...scope.branches, ...scope.bcks, ...scope.suppliers];
  
  const filteredCapas = allCapas.filter(capa => {
    const createdDate = new Date(capa.created_at);
    const inDateRange = isWithinInterval(createdDate, {
      start: config.dateRange.from,
      end: config.dateRange.to
    });
    const inScope = scopedEntityIds.includes(capa.entity_id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(capa.entity_id);
    return inDateRange && inScope && matchesFilter;
  });
  
  const data: CAPAPerformanceRow[] = filteredCapas.map(capa => {
    let entityCode = '';
    let entityName = '';
    
    if (capa.entity_type === 'branch') {
      const branch = branches.find(b => b.id === capa.entity_id);
      entityCode = branch?.code || '';
      entityName = branch?.name || '';
    } else if (capa.entity_type === 'bck') {
      const bck = bcks.find(b => b.id === capa.entity_id);
      entityCode = bck?.code || '';
      entityName = bck?.name || '';
    } else {
      const supplier = suppliers.find(s => s.id === capa.entity_id);
      entityCode = supplier?.supplier_code || '';
      entityName = supplier?.name || '';
    }
    
    const assignedUser = getUserById(capa.assigned_to);
    const finding = allFindings.find(f => f.id === capa.finding_id);
    
    // Calculate days to close
    let daysToClose: number | string = '';
    const isClosed = ['closed', 'approved'].includes(capa.status);
    if (isClosed && capa.updated_at) {
      daysToClose = differenceInDays(new Date(capa.updated_at), new Date(capa.created_at));
    }
    
    // Check if overdue
    const dueDate = new Date(capa.due_date);
    const isOverdue = isClosed 
      ? (new Date(capa.updated_at) > dueDate)
      : (today > dueDate && !isClosed);
    
    return {
      capa_code: capa.capa_code,
      finding_code: finding?.finding_code || '',
      entity_type: capa.entity_type,
      entity_code: entityCode,
      entity_name: entityName,
      priority: capa.priority,
      due_date: capa.due_date,
      status: capa.status,
      assigned_to_name: assignedUser?.full_name || '',
      days_to_close: daysToClose,
      overdue: isOverdue ? 'Yes' : 'No',
    };
  });
  
  // Calculate KPIs
  const closedCapas = filteredCapas.filter(c => ['closed', 'approved'].includes(c.status));
  const closedOnTime = closedCapas.filter(c => new Date(c.updated_at) <= new Date(c.due_date));
  const avgDaysToClose = closedCapas.length > 0
    ? Math.round(closedCapas.reduce((sum, c) => 
        sum + differenceInDays(new Date(c.updated_at), new Date(c.created_at)), 0) / closedCapas.length)
    : 0;
  const overdueCount = filteredCapas.filter(c => 
    !['closed', 'approved'].includes(c.status) && new Date(c.due_date) < today
  ).length;
  
  return {
    data,
    kpis: {
      'Total CAPA': filteredCapas.length,
      '% Closed On Time': closedCapas.length > 0 
        ? Math.round((closedOnTime.length / closedCapas.length) * 100) 
        : 0,
      'Avg Days to Close': avgDaysToClose,
      'Currently Overdue': overdueCount,
    },
  };
};

interface FindingTrendRow {
  finding_code: string;
  audit_code: string;
  entity_type: string;
  entity_code: string;
  entity_name: string;
  section_name: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
}

export const generateFindingTrendsReport = (
  config: ReportConfig,
  scope: UserScope
): { data: FindingTrendRow[]; trends: Record<string, Record<string, number>> } => {
  const allFindings = getFindings();
  const allAudits = getAudits();
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  
  const scopedEntityIds = [...scope.branches, ...scope.bcks, ...scope.suppliers];
  
  const filteredFindings = allFindings.filter(finding => {
    const audit = allAudits.find(a => a.id === finding.audit_id);
    if (!audit) return false;
    
    const createdDate = new Date(finding.created_at);
    const inDateRange = isWithinInterval(createdDate, {
      start: config.dateRange.from,
      end: config.dateRange.to
    });
    const inScope = scopedEntityIds.includes(audit.entity_id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(audit.entity_id);
    return inDateRange && inScope && matchesFilter;
  });
  
  const data: FindingTrendRow[] = filteredFindings.map(finding => {
    const audit = allAudits.find(a => a.id === finding.audit_id);
    let entityCode = '';
    let entityName = '';
    
    if (audit?.entity_type === 'branch') {
      const branch = branches.find(b => b.id === audit.entity_id);
      entityCode = branch?.code || '';
      entityName = branch?.name || '';
    } else if (audit?.entity_type === 'bck') {
      const bck = bcks.find(b => b.id === audit.entity_id);
      entityCode = bck?.code || '';
      entityName = bck?.name || '';
    } else if (audit) {
      const supplier = suppliers.find(s => s.id === audit.entity_id);
      entityCode = supplier?.supplier_code || '';
      entityName = supplier?.name || '';
    }
    
    return {
      finding_code: finding.finding_code,
      audit_code: audit?.audit_code || '',
      entity_type: audit?.entity_type || '',
      entity_code: entityCode,
      entity_name: entityName,
      section_name: finding.section_name,
      category: finding.category || finding.section_name,
      severity: finding.severity,
      description: finding.description,
      status: finding.status,
      created_at: format(new Date(finding.created_at), 'yyyy-MM-dd'),
    };
  });
  
  // Build trends - section by severity matrix
  const trends: Record<string, Record<string, number>> = {};
  filteredFindings.forEach(finding => {
    const section = finding.section_name;
    if (!trends[section]) {
      trends[section] = { low: 0, medium: 0, high: 0, critical: 0 };
    }
    trends[section][finding.severity]++;
  });
  
  return { data, trends };
};

interface IncidentAnalysisRow {
  incident_code: string;
  entity_type: string;
  entity_code: string;
  entity_name: string;
  type: string;
  category: string;
  severity: string;
  title: string;
  status: string;
  assigned_to_name: string;
  created_at: string;
  resolution_notes: string;
}

export const generateIncidentAnalysisReport = (
  config: ReportConfig,
  scope: UserScope
): { data: IncidentAnalysisRow[]; kpis: Record<string, number | string> } => {
  const allIncidents = getIncidents();
  const branches = getBranches();
  const bcks = getBCKs();
  const suppliers = getSuppliers();
  
  const scopedEntityIds = [...scope.branches, ...scope.bcks, ...scope.suppliers];
  
  const filteredIncidents = allIncidents.filter(incident => {
    const createdDate = new Date(incident.created_at);
    const inDateRange = isWithinInterval(createdDate, {
      start: config.dateRange.from,
      end: config.dateRange.to
    });
    const inScope = scopedEntityIds.includes(incident.entity_id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(incident.entity_id);
    return inDateRange && inScope && matchesFilter;
  });
  
  const data: IncidentAnalysisRow[] = filteredIncidents.map(incident => {
    let entityCode = '';
    let entityName = '';
    
    if (incident.entity_type === 'branch') {
      const branch = branches.find(b => b.id === incident.entity_id);
      entityCode = branch?.code || '';
      entityName = branch?.name || '';
    } else if (incident.entity_type === 'bck') {
      const bck = bcks.find(b => b.id === incident.entity_id);
      entityCode = bck?.code || '';
      entityName = bck?.name || '';
    } else {
      const supplier = suppliers.find(s => s.id === incident.entity_id);
      entityCode = supplier?.supplier_code || '';
      entityName = supplier?.name || '';
    }
    
    const assignedUser = incident.assigned_to ? getUserById(incident.assigned_to) : null;
    
    return {
      incident_code: incident.incident_code,
      entity_type: incident.entity_type,
      entity_code: entityCode,
      entity_name: entityName,
      type: incident.type,
      category: incident.category,
      severity: incident.severity,
      title: incident.title,
      status: incident.status,
      assigned_to_name: assignedUser?.full_name || '',
      created_at: format(new Date(incident.created_at), 'yyyy-MM-dd'),
      resolution_notes: incident.resolution_notes || '',
    };
  });
  
  // Calculate KPIs
  const openCount = filteredIncidents.filter(i => i.status === 'open').length;
  const resolvedCount = filteredIncidents.filter(i => ['resolved', 'closed'].includes(i.status)).length;
  const severityBreakdown = {
    low: filteredIncidents.filter(i => i.severity === 'low').length,
    medium: filteredIncidents.filter(i => i.severity === 'medium').length,
    high: filteredIncidents.filter(i => i.severity === 'high').length,
    critical: filteredIncidents.filter(i => i.severity === 'critical').length,
  };
  
  return {
    data,
    kpis: {
      'Total Incidents': filteredIncidents.length,
      'Open': openCount,
      'Resolved/Closed': resolvedCount,
      'Critical': severityBreakdown.critical,
      'High': severityBreakdown.high,
      'Medium': severityBreakdown.medium,
      'Low': severityBreakdown.low,
    },
  };
};

interface SupplierQualityRow {
  supplier_code: string;
  supplier_name: string;
  supplier_type: string;
  risk_level: string;
  quality_score: number;
  audit_performance: number | string;
  product_quality: number | string;
  compliance: number | string;
  delivery_perf: number | string;
  last_audit_date: string;
  last_audit_score: number | string;
  incident_count: number;
  status: string;
}

export const generateSupplierQualityReport = (
  config: ReportConfig,
  scope: UserScope
): { data: SupplierQualityRow[] } => {
  const allSuppliers = getSuppliers();
  const healthScores = getHealthScores();
  const audits = getAudits();
  const incidents = getIncidents();
  
  const filteredSuppliers = allSuppliers.filter(supplier => {
    const inScope = scope.suppliers.includes(supplier.id);
    const matchesFilter = !config.entityIds?.length || config.entityIds.includes(supplier.id);
    return inScope && matchesFilter;
  });
  
  const data: SupplierQualityRow[] = filteredSuppliers.map(supplier => {
    const hs = healthScores.find(h => h.entity_type === 'supplier' && h.entity_id === supplier.id);
    const supplierAudits = audits.filter(a => 
      a.entity_type === 'supplier' && 
      a.entity_id === supplier.id && 
      a.status === 'approved'
    ).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    
    const lastAudit = supplierAudits[0];
    const incidentCount = incidents.filter(i => 
      i.entity_type === 'supplier' && i.entity_id === supplier.id
    ).length;
    
    return {
      supplier_code: supplier.supplier_code,
      supplier_name: supplier.name,
      supplier_type: supplier.type,
      risk_level: supplier.risk_level,
      quality_score: supplier.quality_score,
      audit_performance: hs?.components.audit_performance ?? '',
      product_quality: hs?.components.product_quality ?? '',
      compliance: hs?.components.compliance ?? '',
      delivery_perf: hs?.components.delivery_perf ?? '',
      last_audit_date: lastAudit?.completed_at?.split('T')[0] || '',
      last_audit_score: lastAudit?.score ?? '',
      incident_count: incidentCount,
      status: supplier.status,
    };
  });
  
  // Sort by quality_score descending
  data.sort((a, b) => b.quality_score - a.quality_score);
  
  return { data };
};

interface AuditorPerformanceRow {
  auditor_name: string;
  audits_completed: number;
  average_score: number;
  audits_on_time: number;
  on_time_rate: number;
  findings_generated: number;
  critical_findings: number;
}

export const generateAuditorPerformanceReport = (
  config: ReportConfig
): { data: AuditorPerformanceRow[] } => {
  const auditors = getUsersByRole('auditor');
  const allAudits = getAudits();
  const allFindings = getFindings();
  
  const data: AuditorPerformanceRow[] = auditors.map(auditor => {
    const auditorAudits = allAudits.filter(a => 
      a.auditor_id === auditor.id && 
      a.status === 'approved' &&
      a.completed_at &&
      isWithinInterval(new Date(a.completed_at), {
        start: config.dateRange.from,
        end: config.dateRange.to
      })
    );
    
    const avgScore = auditorAudits.length > 0
      ? Math.round(auditorAudits.reduce((sum, a) => sum + (a.score || 0), 0) / auditorAudits.length)
      : 0;
    
    const onTimeAudits = auditorAudits.filter(a => 
      a.completed_at && new Date(a.completed_at) <= new Date(a.scheduled_date + 'T23:59:59')
    ).length;
    
    const onTimeRate = auditorAudits.length > 0
      ? Math.round((onTimeAudits / auditorAudits.length) * 100)
      : 0;
    
    const findings = allFindings.filter(f => 
      auditorAudits.some(a => a.id === f.audit_id)
    );
    const criticalFindings = findings.filter(f => f.severity === 'critical').length;
    
    return {
      auditor_name: auditor.full_name,
      audits_completed: auditorAudits.length,
      average_score: avgScore,
      audits_on_time: onTimeAudits,
      on_time_rate: onTimeRate,
      findings_generated: findings.length,
      critical_findings: criticalFindings,
    };
  });
  
  // Sort by audits_completed descending
  data.sort((a, b) => b.audits_completed - a.audits_completed);
  
  return { data };
};

// ============= MAIN GENERATION FUNCTION =============

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReportData = any[];

type TemplateNameById = Record<string, string>;

export const generateReport = (
  config: ReportConfig,
  userId: string,
  userRole: string,
  options?: { templateNameById?: TemplateNameById }
): void => {
  const scope = getUserScope(userId, userRole);
  const filename = formatFilename(config.reportType, config.dateRange.from, config.dateRange.to, config.fileFormat);
  
  let data: ReportData = [];
  let kpis: Record<string, number | string> = {};
  
  switch (config.reportType) {
    case 'audit_summary': {
      const result = generateAuditSummaryReport(config, scope, options?.templateNameById);
      data = result.data;
      kpis = result.kpis;
      break;
    }
    case 'health_score_rankings': {
      const result = generateHealthScoreRankingsReport(config, scope);
      data = result.data;
      break;
    }
    case 'capa_performance': {
      const result = generateCAPAPerformanceReport(config, scope);
      data = result.data;
      kpis = result.kpis;
      break;
    }
    case 'finding_trends': {
      const result = generateFindingTrendsReport(config, scope);
      data = result.data;
      break;
    }
    case 'incident_analysis': {
      const result = generateIncidentAnalysisReport(config, scope);
      data = result.data;
      kpis = result.kpis;
      break;
    }
    case 'supplier_quality': {
      const result = generateSupplierQualityReport(config, scope);
      data = result.data;
      break;
    }
    case 'auditor_performance': {
      const result = generateAuditorPerformanceReport(config);
      data = result.data;
      break;
    }
  }
  
  if (config.fileFormat === 'csv') {
    const csvContent = toCSV(data);
    downloadFile(csvContent, filename, 'text/csv;charset=utf-8;');
  } else {
    // Excel format
    const wb = XLSX.utils.book_new();
    
    // Add KPIs sheet if we have them
    if (Object.keys(kpis).length > 0) {
      const kpiData = Object.entries(kpis).map(([key, value]) => ({ Metric: key, Value: value }));
      const kpiSheet = XLSX.utils.json_to_sheet(kpiData);
      XLSX.utils.book_append_sheet(wb, kpiSheet, 'Summary');
    }
    
    // Add main data sheet
    const dataSheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Details');
    
    XLSX.writeFile(wb, filename);
  }
  
  // Save last report meta
  saveLastReportMeta({
    filename,
    timestamp: new Date().toISOString(),
    reportType: config.reportType,
    config,
  });
};

// ============= QUICK EXPORT FUNCTIONS =============

export const quickExportAudits = (userId: string, userRole: string): void => {
  const scope = getUserScope(userId, userRole);
  const ninetyDaysAgo = subDays(new Date(), 90);
  const config: ReportConfig = {
    reportType: 'audit_summary',
    dateRange: { from: ninetyDaysAgo, to: new Date() },
    includeEvidence: false,
    fileFormat: 'csv',
  };
  
  const { data } = generateAuditSummaryReport(config, scope);
  const filteredData = data.filter(row => row.status === 'approved');
  
  const filename = `audits_last_90_days_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadFile(toCSV(filteredData), filename, 'text/csv;charset=utf-8;');
};

export const quickExportOpenCAPA = (userId: string, userRole: string): void => {
  const scope = getUserScope(userId, userRole);
  const config: ReportConfig = {
    reportType: 'capa_performance',
    dateRange: { from: subDays(new Date(), 365), to: new Date() },
    includeEvidence: false,
    fileFormat: 'csv',
  };
  
  const { data } = generateCAPAPerformanceReport(config, scope);
  const filteredData = data.filter(row => ['open', 'in_progress', 'escalated'].includes(row.status));
  
  const filename = `open_capa_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadFile(toCSV(filteredData), filename, 'text/csv;charset=utf-8;');
};

export const quickExportHealthScores = (userId: string, userRole: string): void => {
  const scope = getUserScope(userId, userRole);
  const config: ReportConfig = {
    reportType: 'health_score_rankings',
    dateRange: { from: subDays(new Date(), 1), to: new Date() },
    includeEvidence: false,
    fileFormat: 'csv',
  };
  
  const { data } = generateHealthScoreRankingsReport(config, scope);
  
  const filename = `health_scores_snapshot_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  downloadFile(toCSV(data), filename, 'text/csv;charset=utf-8;');
};
