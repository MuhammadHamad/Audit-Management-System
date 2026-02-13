import { supabase } from '@/integrations/supabase/client';
import type { Audit } from '@/lib/auditStorage';
import type { CAPA, Finding } from '@/lib/auditExecutionStorage';
import { fetchAuditsByStatus, updateAudit } from '@/lib/auditSupabase';
import { createSignedAuditEvidenceUrl, fetchCAPAsByAuditId, fetchFindingsByAuditId } from '@/lib/executionSupabase';
import { fetchBCKs, fetchBranches, fetchSuppliers, fetchUsers } from '@/lib/entitySupabase';
import { insertNotifications } from '@/lib/notificationsSupabase';

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
  hasOverdueCapa: boolean;
  submittedAt: string;
}

export async function fetchVerificationQueue(params: {
  userId: string;
  userRole: string;
}): Promise<VerificationQueueItem[]> {
  const [auditsAll, branches, bcks, suppliers, users] = await Promise.all([
    fetchAuditsByStatus('pending_verification'),
    fetchBranches(),
    fetchBCKs(),
    fetchSuppliers(),
    fetchUsers(),
  ]);

  let audits = auditsAll;

  if (params.userRole === 'regional_manager') {
    const { data, error } = await supabase
      .from('user_assignments')
      .select('*')
      .eq('user_id', params.userId);

    if (error) throw error;

    const regionIds = (data ?? [])
      .filter(a => a.assigned_type === 'region')
      .map(a => a.assigned_id);

    const branchIds = branches.filter(b => regionIds.includes(b.region_id)).map(b => b.id);
    const bckIds = bcks.filter(b => regionIds.includes(b.region_id)).map(b => b.id);

    audits = audits.filter(a =>
      (a.entity_type === 'branch' && branchIds.includes(a.entity_id)) ||
      (a.entity_type === 'bck' && bckIds.includes(a.entity_id))
    );
  } else if (!['super_admin', 'audit_manager'].includes(params.userRole)) {
    return [];
  }

  const auditIds = audits.map(a => a.id);
  const today = new Date().toISOString().split('T')[0];

  const [findingsRes, capasRes] = await Promise.all([
    auditIds.length
      ? supabase.from('findings').select('audit_id,severity').in('audit_id', auditIds)
      : Promise.resolve({ data: [], error: null } as any),
    auditIds.length
      ? supabase.from('capa').select('audit_id,status,due_date').in('audit_id', auditIds)
      : Promise.resolve({ data: [], error: null } as any),
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

  const branchMap = new Map(branches.map(b => [b.id, b] as const));
  const bckMap = new Map(bcks.map(b => [b.id, b] as const));
  const supplierMap = new Map(suppliers.map(s => [s.id, s] as const));
  const userMap = new Map(users.map(u => [u.id, u] as const));

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
      hasOverdueCapa,
      submittedAt: audit.completed_at || audit.updated_at,
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

export async function fetchCAPAActivitiesByCAPAId(capaId: string): Promise<CAPAActivity[]> {
  const { data, error } = await supabase
    .from('capa_activity')
    .select('*')
    .eq('capa_id', capaId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    id: a.id,
    capa_id: a.capa_id,
    user_id: a.user_id,
    action: a.action,
    details: a.details ?? undefined,
    created_at: a.created_at,
  }));
}

export async function approveCAPA(capaId: string, verifierId: string): Promise<void> {
  const { data: capa, error: capaErr } = await supabase
    .from('capa')
    .select('id,finding_id')
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
}

export async function rejectAudit(auditId: string, _verifierId: string, _reason: string): Promise<void> {
  await updateAudit(auditId, { status: 'rejected' });
}

export async function fetchAuditEntityAndAuditorInfo(audit: Audit): Promise<{
  entityName: string;
  entityCode: string;
  entityCity?: string;
  entityTypeLabel: string;
  auditorName: string;
}> {
  const [branches, bcks, suppliers, users] = await Promise.all([
    fetchBranches(),
    fetchBCKs(),
    fetchSuppliers(),
    fetchUsers(),
  ]);

  const userMap = new Map(users.map(u => [u.id, u] as const));

  if (audit.entity_type === 'branch') {
    const e = branches.find(b => b.id === audit.entity_id);
    return {
      entityName: e?.name || 'Unknown',
      entityCode: e?.code || '',
      entityCity: e?.city || undefined,
      entityTypeLabel: 'Branch',
      auditorName: (audit.auditor_id && userMap.get(audit.auditor_id)?.full_name) || 'Unassigned',
    };
  }

  if (audit.entity_type === 'bck') {
    const e = bcks.find(b => b.id === audit.entity_id);
    return {
      entityName: e?.name || 'Unknown',
      entityCode: e?.code || '',
      entityCity: e?.city || undefined,
      entityTypeLabel: 'BCK',
      auditorName: (audit.auditor_id && userMap.get(audit.auditor_id)?.full_name) || 'Unassigned',
    };
  }

  const e = suppliers.find(s => s.id === audit.entity_id);
  return {
    entityName: e?.name || 'Unknown',
    entityCode: e?.supplier_code || '',
    entityCity: e?.city || undefined,
    entityTypeLabel: 'Supplier',
    auditorName: (audit.auditor_id && userMap.get(audit.auditor_id)?.full_name) || 'Unassigned',
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
