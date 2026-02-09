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

export async function insertFindings(
  rows: Array<{
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
  }>
): Promise<void> {
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from('findings').insert(
    rows.map(r => ({
      id: r.id,
      finding_code: r.finding_code,
      audit_id: r.audit_id,
      item_id: r.item_id,
      section_name: r.section_name,
      category: r.category,
      severity: r.severity,
      description: r.description,
      evidence_urls: r.evidence_urls,
      status: r.status,
      updated_at: now,
    }))
  );

  if (error) throw error;
}

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

export async function insertCAPAs(
  rows: Array<{
    id: string;
    capa_code: string;
    finding_id: string;
    audit_id: string;
    entity_type: CAPA['entity_type'];
    entity_id: string;
    description: string;
    assigned_to?: string;
    due_date: string;
    status: CAPAStatus;
    priority: CAPAPriority;
    evidence_urls: string[];
    notes?: string;
    sub_tasks: any[];
  }>
): Promise<void> {
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from('capa').insert(
    rows.map(r => ({
      id: r.id,
      capa_code: r.capa_code,
      finding_id: r.finding_id,
      audit_id: r.audit_id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      description: r.description,
      assigned_to: r.assigned_to ?? null,
      due_date: r.due_date,
      status: r.status,
      priority: r.priority,
      evidence_urls: r.evidence_urls,
      notes: r.notes ?? null,
      sub_tasks: r.sub_tasks,
      updated_at: now,
    }))
  );

  if (error) throw error;
}

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

export async function upsertAuditResults(
  results: Omit<AuditResult, 'id' | 'created_at' | 'updated_at'>[]
): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();
  const rows = results.map(r => ({
    audit_id: r.audit_id,
    section_id: r.section_id,
    item_id: r.item_id,
    response: r.response,
    evidence_urls: r.evidence_urls,
    points_earned: r.points_earned,
    updated_at: now,
  }));

  const { error } = await supabase
    .from('audit_results')
    .upsert(rows, { onConflict: 'audit_id,item_id' });

  if (error) throw error;
}

// ============= AUDIT EVIDENCE (STORAGE) =============

export async function uploadAuditEvidenceFile(
  auditId: string,
  itemId: string,
  file: File
): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeExt = (ext || 'bin').toLowerCase();
  const objectName = `${crypto.randomUUID()}.${safeExt}`;
  const path = `${auditId}/${itemId}/${objectName}`;

  const { error: uploadError } = await supabase
    .storage
    .from('audit-evidence')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase
    .storage
    .from('audit-evidence')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError) throw signError;
  if (!data?.signedUrl) throw new Error('Failed to create signed URL');

  return { path, signedUrl: data.signedUrl };
}

export async function createSignedAuditEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from('audit-evidence')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Failed to create signed URL');
  return data.signedUrl;
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
