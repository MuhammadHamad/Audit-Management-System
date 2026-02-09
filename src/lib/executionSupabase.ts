import { supabase } from '@/integrations/supabase/client';
import type { Finding, CAPA, AuditResult, FindingSeverity, FindingStatus, CAPAStatus, CAPAPriority } from './auditExecutionStorage';

// ============= FINDINGS =============

export async function fetchFindings(): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapFinding);
}

export async function fetchFindingsByAuditId(auditId: string): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapFinding);
}

export async function fetchFindingsBySeverity(severity: FindingSeverity): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .eq('severity', severity)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapFinding);
}

const mapFinding = (row: any): Finding => ({
  id: row.id,
  finding_code: row.finding_code,
  audit_id: row.audit_id,
  item_id: row.item_id,
  section_name: row.section_name,
  category: row.category,
  severity: row.severity,
  description: row.description,
  evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
  status: row.status,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// ============= CAPAs =============

export async function fetchCAPAs(): Promise<CAPA[]> {
  const { data, error } = await supabase
    .from('capa')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapCAPA);
}

export async function fetchCAPAsByAuditId(auditId: string): Promise<CAPA[]> {
  const { data, error } = await supabase
    .from('capa')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapCAPA);
}

export async function fetchCAPAsByStatus(status: CAPAStatus): Promise<CAPA[]> {
  const { data, error } = await supabase
    .from('capa')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapCAPA);
}

export async function fetchCAPAsByEntityId(entityId: string): Promise<CAPA[]> {
  const { data, error } = await supabase
    .from('capa')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapCAPA);
}

const mapCAPA = (row: any): CAPA => ({
  id: row.id,
  capa_code: row.capa_code,
  finding_id: row.finding_id,
  audit_id: row.audit_id,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  description: row.description,
  assigned_to: row.assigned_to ?? undefined,
  due_date: row.due_date ?? undefined,
  priority: row.priority,
  status: row.status,
  evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
  notes: row.notes ?? undefined,
  sub_tasks: Array.isArray(row.sub_tasks) ? row.sub_tasks : [],
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// ============= AUDIT RESULTS =============

export async function fetchAuditResults(auditId: string): Promise<AuditResult[]> {
  const { data, error } = await supabase
    .from('audit_results')
    .select('*')
    .eq('audit_id', auditId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  return (data ?? []).map(mapAuditResult);
}

const mapAuditResult = (row: any): AuditResult => ({
  id: row.id,
  audit_id: row.audit_id,
  section_id: row.section_id,
  item_id: row.item_id,
  response: row.response,
  evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
  points_earned: row.points_earned ?? 0,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
