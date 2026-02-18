import { supabase } from '@/integrations/supabase/client';
import type { Audit } from '@/lib/auditStorage';
import type { CAPA, Finding, SubTask, CAPAStatus, CAPAPriority } from '@/lib/auditExecutionStorage';
import { fetchAuditsByStatus, updateAudit } from '@/lib/auditSupabase';
import { createSignedAuditEvidenceUrl, fetchCAPAsByAuditId, fetchFindingsByAuditId } from '@/lib/executionSupabase';
import { 
  fetchBCKs, 
  fetchBranches, 
  fetchSuppliers, 
  fetchUsers, 
  fetchBCKById, 
  fetchBranchById, 
  fetchSupplierById, 
  fetchUserById 
} from '@/lib/entitySupabase';
import { insertNotifications } from '@/lib/notificationsSupabase';
import type { Branch, BCK, Supplier, User } from '@/types';

export interface VerificationQueueItem {
  audit: Audit;
  entityName: string;
  entityCode: string;
  entityCity?: string;
  auditorName: string;
  findingsCount: number;
  criticalFindingsCount: number;
  capaTotal: number;
  capaClosed: number;
  capaPending: number;
  capaAwaitingEvidence: number;
  hasOverdueCapa: boolean;
  submittedAt: string;
}

export interface CAPAVerificationQueueItem {
  capa: CAPA;
  auditCode: string;
  entityName: string;
  entityCode: string;
  entityType: string;
  auditorName: string;
  assignedToName: string;
  evidenceCount: number;
  submittedAt: string;
}

export async function fetchVerificationQueue(params: {
  userId: string;
  userRole: string;
}): Promise<VerificationQueueItem[]> {
  const auditsAll = await fetchAuditsByStatus('pending_verification');
  let audits = auditsAll;

  if (params.userRole === 'regional_manager') {
    const { data, error } = await supabase
      .from('user_assignments')
      .select('assigned_id, assigned_type')
      .eq('user_id', params.userId)
      .eq('assigned_type', 'region');

    if (error) throw error;

    const regionIds = (data ?? []).map(a => a.assigned_id);
    
    // Fetch branches and BCKs in these regions only
    const [regionBranches, regionBCKs] = await Promise.all([
      supabase.from('branches').select('id').in('region_id', regionIds),
      supabase.from('bcks').select('id').in('region_id', regionIds),
    ]);

    const branchIds = (regionBranches.data ?? []).map(b => b.id);
    const bckIds = (regionBCKs.data ?? []).map(b => b.id);

    audits = audits.filter(a =>
      (a.entity_type === 'branch' && branchIds.includes(a.entity_id)) ||
      (a.entity_type === 'bck' && bckIds.includes(a.entity_id))
    );
  } else if (!['super_admin', 'head_of_quality', 'audit_manager'].includes(params.userRole)) {
    return [];
  }

  const auditIds = audits.map(a => a.id);
  const entityIds = Array.from(new Set(audits.map(a => a.entity_id)));
  const auditorIds = Array.from(new Set(audits.map(a => a.auditor_id).filter((id): id is string => !!id)));
  const today = new Date().toISOString().split('T')[0];

  // Fetch ONLY the required data for these specific audits
  const [findingsRes, capasRes, branchesRes, bcksRes, suppliersRes, usersRes] = await Promise.all([
    auditIds.length ? supabase.from('findings').select('audit_id,severity').in('audit_id', auditIds) : Promise.resolve({ data: [], error: null }),
    auditIds.length ? supabase.from('capa').select('audit_id,status,due_date').in('audit_id', auditIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('branches').select('id,name,code,city').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('bcks').select('id,name,code,city').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('suppliers').select('id,name,code,city').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    auditorIds.length ? supabase.from('users').select('id,full_name').in('id', auditorIds) : Promise.resolve({ data: [], error: null }),
  ]);

  if (findingsRes.error) throw findingsRes.error;
  if (capasRes.error) throw capasRes.error;

  const findingsByAudit = new Map<string, Array<{ severity: string }>>();
  for (const f of findingsRes.data ?? []) {
    const arr = findingsByAudit.get(f.audit_id) ?? [];
    arr.push({ severity: f.severity });
    findingsByAudit.set(f.audit_id, arr);
  }

  const capasByAudit = new Map<string, Array<{ status: string; due_date: string | null }>>();
  for (const c of capasRes.data ?? []) {
    const arr = capasByAudit.get(c.audit_id) ?? [];
    arr.push({ status: c.status, due_date: c.due_date ?? null });
    capasByAudit.set(c.audit_id, arr);
  }

  const branchMap = new Map<string, Branch>((branchesRes.data ?? []).map(b => [b.id, b as Branch]));
  const bckMap = new Map<string, BCK>((bcksRes.data ?? []).map(b => [b.id, b as BCK]));
  const supplierMap = new Map<string, Supplier>((suppliersRes.data ?? []).map(s => [s.id, s as Supplier]));
  const userMap = new Map<string, User>((usersRes.data ?? []).map(u => [u.id, u as User]));

  const items: VerificationQueueItem[] = audits.map(audit => {
    let entityName = '';
    let entityCode = '';
    let entityCity = '';

    if (audit.entity_type === 'branch') {
      const e = branchMap.get(audit.entity_id);
      entityName = e?.name || 'Unknown';
      entityCode = e?.code || '';
      entityCity = e?.city || '';
    } else if (audit.entity_type === 'bck') {
      const e = bckMap.get(audit.entity_id);
      entityName = e?.name || 'Unknown';
      entityCode = e?.code || '';
      entityCity = e?.city || '';
    } else if (audit.entity_type === 'supplier') {
      const e = supplierMap.get(audit.entity_id);
      entityName = e?.name || 'Unknown';
      entityCode = e?.supplier_code || '';
      entityCity = e?.city || '';
    }

    const auditor = audit.auditor_id ? userMap.get(audit.auditor_id) : undefined;
    const findings = findingsByAudit.get(audit.id) ?? [];
    const capas = capasByAudit.get(audit.id) ?? [];

    const capaClosed = capas.filter(c => c.status === 'closed' || c.status === 'approved').length;
    const capaPending = capas.filter(c => c.status === 'pending_verification').length;
    const capaAwaitingEvidence = capas.filter(c => c.status === 'open' || c.status === 'in_progress').length;
    const hasOverdueCapa = capas.some(c => !!c.due_date && c.due_date < today && c.status !== 'closed');

    return {
      audit,
      entityName,
      entityCode,
      entityCity,
      auditorName: auditor?.full_name || 'Unassigned',
      findingsCount: findings.length,
      criticalFindingsCount: findings.filter(f => f.severity === 'critical').length,
      capaTotal: capas.length,
      capaClosed,
      capaPending,
      capaAwaitingEvidence,
      hasOverdueCapa,
      submittedAt: audit.completed_at || audit.updated_at,
    };
  });

  items.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return items;
}

export async function fetchCAPAVerificationQueue(params: {
  userId: string;
  userRole: string;
}): Promise<CAPAVerificationQueueItem[]> {
  if (!['super_admin', 'head_of_quality', 'audit_manager'].includes(params.userRole)) return [];

  const { data: capaRows, error: capaErr } = await supabase
    .from('capa')
    .select('*')
    .eq('status', 'pending_verification')
    .order('updated_at', { ascending: false });

  if (capaErr) throw capaErr;

  const actionable = (capaRows ?? []).filter(c => (c.evidence_urls || []).length > 0);
  if (actionable.length === 0) return [];

  const auditIds = Array.from(new Set(actionable.map(c => c.audit_id).filter((id): id is string => !!id)));
  const entityIds = Array.from(new Set(actionable.map(c => c.entity_id)));
  const assignedUserIds = Array.from(new Set(actionable.map(c => c.assigned_to).filter((id): id is string => !!id)));

  // Fetch only necessary data for these specific items
  const [auditRows, branchesRes, bcksRes, suppliersRes, usersRes] = await Promise.all([
    auditIds.length ? supabase.from('audits').select('id,audit_code,entity_type,entity_id,auditor_id').in('id', auditIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('branches').select('id,name,code').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('bcks').select('id,name,code').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    entityIds.length ? supabase.from('suppliers').select('id,name,code').in('id', entityIds) : Promise.resolve({ data: [], error: null }),
    supabase.from('users').select('id,full_name').in('id', Array.from(new Set([...assignedUserIds]))), // We'll add auditor IDs later
  ]);

  if (auditRows.error) throw auditRows.error;

  // Collect auditor IDs from audit results to fetch their names too
  const auditorIds = Array.from(new Set((auditRows.data ?? []).map(a => a.auditor_id).filter((id): id is string => !!id)));
  const finalUsersRes = auditorIds.length 
    ? await supabase.from('users').select('id,full_name').in('id', Array.from(new Set([...assignedUserIds, ...auditorIds])))
    : usersRes;

  const auditMap = new Map<string, any>((auditRows.data ?? []).map(a => [a.id, a]));
  const branchMap = new Map<string, Branch>((branchesRes.data ?? []).map(b => [b.id, b as Branch]));
  const bckMap = new Map<string, BCK>((bcksRes.data ?? []).map(b => [b.id, b as BCK]));
  const supplierMap = new Map<string, Supplier>((suppliersRes.data ?? []).map(s => [s.id, s as Supplier]));
  const userMap = new Map<string, User>((finalUsersRes.data ?? []).map(u => [u.id, u as User]));

  const items: CAPAVerificationQueueItem[] = actionable.map(capaRow => {
    const capa: CAPA = {
      ...capaRow,
      entity_type: capaRow.entity_type as "branch" | "bck" | "supplier",
      assigned_to: capaRow.assigned_to || '',
      status: capaRow.status as CAPAStatus,
      priority: capaRow.priority as CAPAPriority,
      evidence_urls: Array.isArray(capaRow.evidence_urls) ? (capaRow.evidence_urls as string[]) : [],
      sub_tasks: Array.isArray(capaRow.sub_tasks) ? (capaRow.sub_tasks as unknown as SubTask[]) : [],
    };

    const audit = auditMap.get(capa.audit_id);
    const entityType = capa.entity_type;
    const entityId = audit?.entity_id ?? capa.entity_id;

    let entityName = 'Unknown';
    let entityCode = '';
    let entityTypeLabel = '';

    if (entityType === 'branch') {
      const e = branchMap.get(entityId);
      entityName = e?.name || 'Unknown';
      entityCode = e?.code || '';
      entityTypeLabel = 'Branch';
    } else if (entityType === 'bck') {
      const e = bckMap.get(entityId);
      entityName = e?.name || 'Unknown';
      entityCode = e?.code || '';
      entityTypeLabel = 'BCK';
    } else if (entityType === 'supplier') {
      const e = supplierMap.get(entityId);
      entityName = e?.name || 'Unknown';
      entityCode = e?.supplier_code || '';
      entityTypeLabel = 'Supplier';
    }

    const auditorName = audit?.auditor_id ? (userMap.get(audit.auditor_id)?.full_name || 'Unassigned') : 'Unassigned';
    const assignedToName = capa.assigned_to ? (userMap.get(capa.assigned_to)?.full_name || 'Unassigned') : 'Unassigned';

    return {
      capa,
      auditCode: audit?.audit_code || '',
      entityName,
      entityCode,
      entityType: entityTypeLabel,
      auditorName,
      assignedToName,
      evidenceCount: (capa.evidence_urls || []).length,
      submittedAt: capa.updated_at || capa.created_at,
    };
  });

  items.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return items;
}

export interface CAPAActivity {
  id: string;
  capa_id: string;
  user_id: string;
  action: string;
  details?: string;
  created_at: string;
}

export async function fetchCAPAActivitiesByCAPAIds(capaIds: string[]): Promise<Record<string, CAPAActivity[]>> {
  if (capaIds.length === 0) return {};
  
  const { data, error } = await supabase
    .from('capa_activity')
    .select('*')
    .in('capa_id', capaIds)
    .order('created_at', { ascending: true });

  if (error) throw error;
  
  const result: Record<string, CAPAActivity[]> = {};
  capaIds.forEach(id => { result[id] = []; });
  
  (data ?? []).forEach((a: any) => {
    if (result[a.capa_id]) {
      result[a.capa_id].push({
        id: a.id,
        capa_id: a.capa_id,
        user_id: a.user_id,
        action: a.action,
        details: a.details ?? undefined,
        created_at: a.created_at,
      });
    }
  });
  
  return result;
}

export async function fetchCAPAActivitiesByCAPAId(capaId: string): Promise<CAPAActivity[]> {
  const res = await fetchCAPAActivitiesByCAPAIds([capaId]);
  return res[capaId] || [];
}

export async function approveCAPA(capaId: string, verifierId: string): Promise<void> {
  const { data: capa, error: capaErr } = await supabase
    .from('capa')
    .select('id,finding_id,entity_type,entity_id')
    .eq('id', capaId)
    .single();

  if (capaErr) throw capaErr;

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('capa')
    .update({ status: 'closed', updated_at: now })
    .eq('id', capaId);

  if (updateErr) throw updateErr;

  const { error: activityErr } = await supabase
    .from('capa_activity')
    .insert({
      capa_id: capaId,
      user_id: verifierId,
      action: 'approved',
      details: 'CAPA approved',
      created_at: now,
    });

  if (activityErr) throw activityErr;

  if (capa?.finding_id) {
    const { error: findingErr } = await supabase
      .from('findings')
      .update({ status: 'resolved', updated_at: now })
      .eq('id', capa.finding_id);

    if (findingErr) throw findingErr;
  }

  try {
    const entityType = (capa as any)?.entity_type as 'branch' | 'bck' | 'supplier' | undefined;
    const entityId = (capa as any)?.entity_id as string | undefined;
    if (entityType && entityId) {
      await recalculateAndPersistEntityScore(entityType, entityId);
    }
  } catch (e) {
    console.error('Failed to recalculate entity score after CAPA approval', e);
  }
}

export async function rejectCAPA(capaId: string, verifierId: string, reason: string): Promise<void> {
  const { data: capaRow, error: capaErr } = await supabase
    .from('capa')
    .select('id,capa_code,assigned_to')
    .eq('id', capaId)
    .maybeSingle();

  if (capaErr) throw capaErr;

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('capa')
    .update({ status: 'rejected', updated_at: now })
    .eq('id', capaId);

  if (updateErr) throw updateErr;

  const { error: activityErr } = await supabase
    .from('capa_activity')
    .insert({
      capa_id: capaId,
      user_id: verifierId,
      action: 'rejected',
      details: reason,
      created_at: now,
    });

  if (activityErr) throw activityErr;

  try {
    const assignedTo = (capaRow as any)?.assigned_to as string | null | undefined;
    const capaCode = (capaRow as any)?.capa_code as string | undefined;

    if (assignedTo) {
      await insertNotifications([
        {
          user_id: assignedTo,
          type: 'capa_rejected',
          message: `CAPA rejected\n${capaCode || 'A CAPA'} was rejected. Reason: ${reason}`,
          link_to: `/capa/${capaId}`,
        },
      ]);
    }
  } catch (e) {
    console.error('Failed to create rejection notification', e);
  }
}

export async function approveAudit(auditId: string, verifierId: string): Promise<void> {
  const capas = await fetchCAPAsByAuditId(auditId);
  const allClosed = capas.every(c => c.status === 'closed' || c.status === 'approved');

  if (!allClosed) {
    throw new Error('All CAPA must be approved/closed before finalizing the audit.');
  }

  await updateAudit(auditId, { status: 'approved' });

  const now = new Date().toISOString();

  const { error: findingErr } = await supabase
    .from('findings')
    .update({ status: 'resolved', updated_at: now })
    .eq('audit_id', auditId);

  if (findingErr) throw findingErr;

  const { error: activityErr } = await supabase
    .from('capa_activity')
    .insert(
      capas.map(c => ({
        capa_id: c.id,
        user_id: verifierId,
        action: 'audit_finalized',
        details: 'Audit approved and finalized',
        created_at: now,
      }))
    );

  if (activityErr) throw activityErr;

  try {
    const { data: auditRow, error: auditErr } = await supabase
      .from('audits')
      .select('id,audit_code,auditor_id')
      .eq('id', auditId)
      .maybeSingle();

    if (auditErr) throw auditErr;

    const recipients = new Set<string>();
    if ((auditRow as any)?.auditor_id) recipients.add((auditRow as any).auditor_id);
    for (const c of capas) {
      if ((c as any)?.assigned_to) recipients.add((c as any).assigned_to);
    }

    const auditCode = (auditRow as any)?.audit_code as string | undefined;

    await insertNotifications(
      Array.from(recipients).map(uid => ({
        user_id: uid,
        type: 'audit_approved',
        message: `Audit approved\nAudit ${auditCode || ''} has been approved.`,
        link_to: `/audits/${auditId}`,
      }))
    );
  } catch (e) {
    console.error('Failed to create audit approval notifications', e);
  }

  try {
    const { data: auditRow, error: auditErr } = await supabase
      .from('audits')
      .select('entity_type,entity_id')
      .eq('id', auditId)
      .maybeSingle();
    if (auditErr) throw auditErr;
    const entityType = (auditRow as any)?.entity_type as 'branch' | 'bck' | 'supplier' | undefined;
    const entityId = (auditRow as any)?.entity_id as string | undefined;
    if (entityType && entityId) {
      await recalculateAndPersistEntityScore(entityType, entityId);
    }
  } catch (e) {
    console.error('Failed to recalculate entity score after audit approval', e);
  }
}

export async function rejectAudit(auditId: string, _verifierId: string, _reason: string): Promise<void> {
  await updateAudit(auditId, { status: 'rejected' });
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to', 'for',
  'of', 'and', 'or', 'it', 'this', 'that', 'with', 'has', 'had', 'have', 'been',
  'be', 'not', 'no', 'but', 'by', 'from', 'as', 'if', 'so', 'than', 'then'
]);

const tokenize = (text: string): Set<string> => {
  const words = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
  return new Set(words);
};

const calculateWordOverlap = (desc1: string, desc2: string): number => {
  const words1 = tokenize(desc1);
  const words2 = tokenize(desc2);
  if (words1.size === 0 || words2.size === 0) return 0;
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
};

const roundScore = (score: number): number => {
  return Math.round(score * 10) / 10;
};

async function recalculateAndPersistEntityScore(entityType: 'branch' | 'bck' | 'supplier', entityId: string): Promise<number> {
  const now = new Date();
  const ninetyDaysAgoIso = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgoIso = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: approvedAudits, error: auditErr }, { data: recentAudits, error: recentAuditErr }, { data: capaRows, error: capaErr }] = await Promise.all([
    supabase
      .from('audits')
      .select('id,score,updated_at,completed_at')
      .eq('status', 'approved')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('updated_at', ninetyDaysAgoIso),
    supabase
      .from('audits')
      .select('id,updated_at,completed_at')
      .eq('status', 'approved')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .gte('updated_at', sixtyDaysAgoIso),
    supabase
      .from('capa')
      .select('id,status,due_date')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId),
  ]);

  if (auditErr) throw auditErr;
  if (recentAuditErr) throw recentAuditErr;
  if (capaErr) throw capaErr;

  const auditId60d = (recentAudits ?? []).map((a: any) => a.id as string);

  const capaIds = (capaRows ?? []).map((c: any) => c.id as string);
  const [findingsRes, capaActRes, incidentsRes] = await Promise.all([
    auditId60d.length
      ? supabase.from('findings').select('audit_id,description').in('audit_id', auditId60d)
      : Promise.resolve({ data: [], error: null } as any),
    capaIds.length
      ? supabase.from('capa_activity').select('capa_id,action,created_at').in('capa_id', capaIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null } as any),
    entityType === 'branch'
      ? supabase
          .from('incidents')
          .select('id,created_at,status')
          .eq('entity_type', 'branch')
          .eq('entity_id', entityId)
          .gte('created_at', thirtyDaysAgoIso)
          .neq('status', 'closed')
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (findingsRes.error) throw findingsRes.error;
  if (capaActRes.error) throw capaActRes.error;
  if (incidentsRes.error) throw incidentsRes.error;

  const findings = (findingsRes.data ?? []) as Array<{ audit_id: string; description: string }>;
  const capaActs = (capaActRes.data ?? []) as Array<{ capa_id: string; action: string; created_at: string }>;
  const incidents = (incidentsRes.data ?? []) as Array<{ created_at: string; status: string }>;

  const capaActivitiesById = new Map<string, Array<{ action: string; created_at: string }>>();
  for (const a of capaActs) {
    const arr = capaActivitiesById.get(a.capa_id) ?? [];
    arr.push({ action: a.action, created_at: a.created_at });
    capaActivitiesById.set(a.capa_id, arr);
  }

  const approvedAuditsWithScore = (approvedAudits ?? []).filter((a: any) => a.score !== null && a.score !== undefined);
  const avgAuditScore = approvedAuditsWithScore.length > 0
    ? approvedAuditsWithScore.reduce((sum: number, a: any) => sum + Number(a.score ?? 0), 0) / approvedAuditsWithScore.length
    : 0;

  const closedCapas = (capaRows ?? []).filter((c: any) => c.status === 'closed' || c.status === 'approved');
  const onTimeCapas = closedCapas.filter((c: any) => {
    const acts = capaActivitiesById.get(c.id) ?? [];
    const closedAct = acts.find(x => x.action === 'approved' || x.action === 'auto_approved' || x.action === 'audit_finalized');
    if (!closedAct) return true;
    if (!c.due_date) return true;
    return closedAct.created_at <= `${c.due_date}T23:59:59`;
  });

  const capaCompletion = closedCapas.length > 0 ? roundScore((onTimeCapas.length / closedCapas.length) * 100) : 100;

  const verificationPass = closedCapas.length > 0
    ? roundScore(
        (closedCapas.filter((c: any) => {
          const acts = capaActivitiesById.get(c.id) ?? [];
          return acts.filter(a => a.action === 'rejected').length === 0;
        }).length / closedCapas.length) * 100
      )
    : 100;

  let repeatFindings = 100;
  if (entityType === 'branch') {
    const sortedApproved = [...(approvedAudits ?? [])].sort((a: any, b: any) => String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at)));
    const latest = sortedApproved[0];
    if (latest) {
      const latestFindings = findings.filter(f => f.audit_id === latest.id);
      const previousFindings = findings.filter(f => f.audit_id !== latest.id);
      let repeatCount = 0;
      for (const lf of latestFindings) {
        for (const pf of previousFindings) {
          const overlap = calculateWordOverlap(lf.description, pf.description);
          if (overlap >= 0.6) {
            repeatCount++;
            break;
          }
        }
      }
      const repeatPenalty = Math.min(50, repeatCount * 10);
      repeatFindings = roundScore(100 - repeatPenalty);
    }
  }

  const incidentRate = entityType === 'branch' ? roundScore(Math.max(0, 100 - incidents.length * 20)) : 100;

  let score = 0;
  if (entityType === 'branch') {
    score =
      roundScore(avgAuditScore) * 0.40 +
      capaCompletion * 0.25 +
      repeatFindings * 0.15 +
      incidentRate * 0.10 +
      verificationPass * 0.10;
  } else if (entityType === 'bck') {
    const sortedApproved = [...(approvedAudits ?? [])].sort((a: any, b: any) => String(b.completed_at || b.updated_at).localeCompare(String(a.completed_at || a.updated_at)));
    const latest = sortedApproved[0];
    const haccp = roundScore(Number(latest?.score ?? 0));
    const prodPerf = roundScore(avgAuditScore);
    const capaComp = capaCompletion;
    score = haccp * 0.50 + prodPerf * 0.25 + 100 * 0.15 + capaComp * 0.10;
  } else {
    const auditPerf = roundScore(avgAuditScore);
    score = auditPerf * 0.40 + 100 * 0.30 + 100 * 0.20 + 100 * 0.10;
  }

  const finalScore = roundScore(score);
  const updatedAt = new Date().toISOString();

  if (entityType === 'branch') {
    const { error } = await supabase.from('branches').update({ health_score: finalScore, updated_at: updatedAt }).eq('id', entityId);
    if (error) throw error;
  } else if (entityType === 'bck') {
    const { error } = await supabase.from('bcks').update({ health_score: finalScore, updated_at: updatedAt }).eq('id', entityId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('suppliers').update({ quality_score: finalScore, updated_at: updatedAt }).eq('id', entityId);
    if (error) throw error;
  }

  return finalScore;
}

export async function fetchAuditEntityAndAuditorInfo(audit: Audit): Promise<{
  entityName: string;
  entityCode: string;
  entityCity?: string;
  entityTypeLabel: string;
  auditorName: string;
}> {
  const [entity, auditor] = await Promise.all([
    audit.entity_type === 'branch' 
      ? fetchBranchById(audit.entity_id)
      : audit.entity_type === 'bck'
        ? fetchBCKById(audit.entity_id)
        : fetchSupplierById(audit.entity_id),
    audit.auditor_id ? fetchUserById(audit.auditor_id) : Promise.resolve(null),
  ]);

  if (audit.entity_type === 'branch') {
    const e = entity as Branch | null;
    return {
      entityName: e?.name || 'Unknown',
      entityCode: e?.code || '',
      entityCity: e?.city || undefined,
      entityTypeLabel: 'Branch',
      auditorName: auditor?.full_name || 'Unassigned',
    };
  }

  if (audit.entity_type === 'bck') {
    const e = entity as BCK | null;
    return {
      entityName: e?.name || 'Unknown',
      entityCode: e?.code || '',
      entityCity: e?.city || undefined,
      entityTypeLabel: 'BCK',
      auditorName: auditor?.full_name || 'Unassigned',
    };
  }

  const e = entity as Supplier | null;
  return {
    entityName: e?.name || 'Unknown',
    entityCode: e?.supplier_code || '',
    entityCity: e?.city || undefined,
    entityTypeLabel: 'Supplier',
    auditorName: auditor?.full_name || 'Unassigned',
  };
}

export async function signAuditEvidencePaths(paths: string[]): Promise<string[]> {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return [];

  const signed = await Promise.all(unique.map(async p => ({ p, url: await createSignedAuditEvidenceUrl(p) })));
  const map = new Map(signed.map(s => [s.p, s.url] as const));
  return paths.map(p => map.get(p) || p);
}

export async function fetchVerificationDetailData(auditId: string): Promise<{
  audit: Audit;
  findings: Finding[];
  capas: CAPA[];
  auditResultsEvidenceSignedByItemId: Map<string, string[]>;
}> {
  const audit = await (await import('@/lib/auditSupabase')).fetchAuditById(auditId);
  if (!audit) throw new Error('Audit not found');

  const [findings, capas, results] = await Promise.all([
    fetchFindingsByAuditId(auditId),
    fetchCAPAsByAuditId(auditId),
    (await import('@/lib/executionSupabase')).fetchAuditResults(auditId),
  ]);

  const signedEvidenceByItem = new Map<string, string[]>();
  for (const r of results) {
    const signed = await signAuditEvidencePaths(r.evidence_urls || []);
    signedEvidenceByItem.set(r.item_id, signed);
  }

  return {
    audit,
    findings,
    capas,
    auditResultsEvidenceSignedByItemId: signedEvidenceByItem,
  };
}
