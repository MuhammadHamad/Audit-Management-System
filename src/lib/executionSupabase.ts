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

export async function fetchFindingById(id: string): Promise<Finding | null> {
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapFinding(data) : null;
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

export async function forceEscalateCAPA(capaId: string): Promise<{
  capa_id: string;
  new_assigned_to: string;
  new_escalation_level: number;
  new_escalated_to_role: string;
} | null> {
  const { data, error } = await (supabase as any).rpc('force_escalate_capa', {
    p_capa_id: capaId,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as any;
}

export async function uploadCAPAEvidenceFile(
  capaId: string,
  file: File
): Promise<{ path: string; signedUrl: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeExt = (ext || 'bin').toLowerCase();
  const objectName = `${crypto.randomUUID()}.${safeExt}`;
  const path = `${capaId}/${objectName}`;

  const { error: uploadError } = await supabase
    .storage
    .from('capa-evidence')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  const { data, error: signError } = await supabase
    .storage
    .from('capa-evidence')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (signError) throw signError;
  if (!data?.signedUrl) throw new Error('Failed to create signed URL');

  return { path, signedUrl: data.signedUrl };
}

export async function uploadAuditEvidenceFilePath(
  auditId: string,
  itemId: string,
  file: File
): Promise<{ path: string }> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeExt = (ext || 'bin').toLowerCase();
  const objectName = `${crypto.randomUUID()}.${safeExt}`;
  const path = `${auditId}/${itemId}/${objectName}`;

  const { error: uploadError } = await supabase
    .storage
    .from('audit-evidence')
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) throw uploadError;

  return { path };
}

export async function createSignedCAPAEvidenceUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase
    .storage
    .from('capa-evidence')
    .createSignedUrls(paths, 60 * 60 * 24 * 7);

  if (error) throw error;
  if (!data) throw new Error('Failed to create signed URLs');
  return data.map((d: any, i: number) => d?.signedUrl || paths[i]);
}

export async function createSignedCAPAEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase
    .storage
    .from('capa-evidence')
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error('Failed to create signed URL');
  return data.signedUrl;
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

export async function archiveCAPAsAssignedTo(userId: string): Promise<{ updatedCount: number }> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('capa')
    .update({ status: 'closed', updated_at: now })
    .eq('assigned_to', userId)
    .not('status', 'in', '(closed,approved,expired)')
    .select('id');

  if (error) throw error;

  return { updatedCount: Array.isArray(data) ? data.length : 0 };
}

const mapCAPA = (row: any): CAPA => ({
  id: row.id,
  capa_code: row.capa_code,
  finding_id: row.finding_id,
  audit_id: row.audit_id,
  department_id: row.department_id ?? null,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  description: row.description,
  assigned_to: row.assigned_to ?? '',
  due_date: row.due_date ?? '',
  priority: row.priority,
  status: row.status,
  escalation_level: typeof row.escalation_level === 'number' ? row.escalation_level : (row.escalation_level != null ? Number(row.escalation_level) : undefined),
  escalation_due_date: row.escalation_due_date ?? null,
  escalated_to_user_id: row.escalated_to_user_id ?? null,
  escalated_to_role: row.escalated_to_role ?? null,
  expired_at: row.expired_at ?? null,
  expired_reason: row.expired_reason ?? null,
  evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
  notes: row.notes ?? undefined,
  sub_tasks: Array.isArray(row.sub_tasks) ? row.sub_tasks : [],
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function fetchCAPAById(id: string): Promise<CAPA | null> {
  const { data, error } = await supabase
    .from('capa')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCAPA(data) : null;
}

export async function updateCAPA(
  id: string,
  updates: Partial<{
    status: CAPAStatus;
    notes: string | null;
    evidence_urls: string[];
    sub_tasks: any[];
    assigned_to: string | null;
    due_date: string | null;
    priority: CAPAPriority;
    description: string;
    escalation_level: number | null;
    escalation_due_date: string | null;
    escalated_to_user_id: string | null;
    escalated_to_role: string | null;
    expired_at: string | null;
    expired_reason: string | null;
  }>
): Promise<void> {
  const { error } = await supabase
    .from('capa')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

export async function insertCAPAs(
  rows: Array<{
    id: string;
    capa_code: string;
    finding_id: string;
    audit_id: string;
    department_id?: string | null;
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
      department_id: r.department_id ?? null,
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

export async function runCAPAEscalationLadder(force: boolean = false): Promise<{ escalatedCount: number; expiredCount: number }> {
  const { data, error } = force
    ? await (supabase as any).rpc('run_capa_escalation_ladder', { p_force: true })
    : await (supabase as any).rpc('run_capa_escalation_ladder');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return {
    escalatedCount: row?.escalated_count ?? 0,
    expiredCount: row?.expired_count ?? 0,
  };
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
    manual_finding: r.manual_finding ?? null,
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

export async function createSignedAuditEvidenceUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase
    .storage
    .from('audit-evidence')
    .createSignedUrls(paths, 60 * 60 * 24 * 7);

  if (error) throw error;
  if (!data) throw new Error('Failed to create signed URLs');
  return data.map((d: any, i: number) => d?.signedUrl || paths[i]);
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
  manual_finding: row.manual_finding ?? null,
  points_earned: row.points_earned ?? 0,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
