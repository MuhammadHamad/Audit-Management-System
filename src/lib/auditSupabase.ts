import { supabase } from '@/integrations/supabase/client';
import type { Audit, AuditPlan, AuditStatus } from './auditStorage';

// ============= AUDIT PLANS =============

type CreateAuditPlanInput = Omit<AuditPlan, 'id' | 'created_at' | 'updated_at'>;
type CreateAuditInput = Omit<Audit, 'id' | 'audit_code' | 'created_at' | 'updated_at'>;

export async function fetchAuditPlans(): Promise<AuditPlan[]> {
  const { data, error } = await supabase
    .from('audit_plans')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapAuditPlan);
}

export async function createAuditPlan(values: CreateAuditPlanInput): Promise<AuditPlan> {
  const { data, error } = await supabase
    .from('audit_plans')
    .insert({
      name: values.name,
      description: values.description ?? null,
      template_id: values.template_id,
      entity_type: values.entity_type,
      recurrence_pattern: values.recurrence_pattern as any,
      scope: values.scope as any,
      assignment_strategy: values.assignment_strategy,
      assigned_auditor_id: values.assigned_auditor_id ?? null,
      status: values.status,
      created_by: values.created_by,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapAuditPlan(data);
}

export async function updateAuditPlan(id: string, updates: Partial<AuditPlan>): Promise<AuditPlan> {
  const { data, error } = await supabase
    .from('audit_plans')
    .update({
      name: updates.name,
      description: updates.description ?? null,
      template_id: updates.template_id,
      entity_type: updates.entity_type,
      recurrence_pattern: updates.recurrence_pattern as any,
      scope: updates.scope as any,
      assignment_strategy: updates.assignment_strategy,
      assigned_auditor_id: updates.assigned_auditor_id ?? null,
      status: updates.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapAuditPlan(data);
}

export async function deleteAuditPlan(id: string): Promise<void> {
  const { data: plan, error: planErr } = await supabase
    .from('audit_plans')
    .select('id,status')
    .eq('id', id)
    .maybeSingle();
  if (planErr) throw planErr;
  if (!plan) return;

  if (plan.status === 'active') {
    throw new Error('Cannot delete an active plan. Pause it first.');
  }

  // Detach audits first to avoid FK violations (we keep already generated audits)
  const { error: detachError } = await supabase
    .from('audits')
    .update({ plan_id: null, updated_at: new Date().toISOString() })
    .eq('plan_id', id);
  if (detachError) throw detachError;

  const { error } = await supabase.from('audit_plans').delete().eq('id', id);
  if (error) throw error;
}

export async function createAuditPlanAndGenerateAudits(
  values: CreateAuditPlanInput,
  options?: { horizonDays?: number }
): Promise<{ plan: AuditPlan; generatedAudits: number }> {
  const horizonDays = options?.horizonDays ?? 30;
  // Validate generation inputs before creating the plan to avoid creating orphan plans.
  const dates = getScheduledDatesForHorizon(values.recurrence_pattern, horizonDays);
  if (values.status === 'active' && dates.length === 0) {
    throw new Error('No audits were scheduled because the plan has no dates within the scheduling horizon.');
  }

  const entityIds =
    values.status === 'active'
      ? await getEntityIdsForPlan({ entity_type: values.entity_type, scope: values.scope })
      : [];

  if (values.status === 'active' && entityIds.length === 0) {
    throw new Error(
      `No audits were scheduled because no entities matched the plan scope (entity type: ${values.entity_type}). ` +
        `Create at least one ${values.entity_type} (or check your access permissions), then try again.`
    );
  }

  const auditorIds = await getAuditorIdsForPlan({
    assignment_strategy: values.assignment_strategy,
    assigned_auditor_id: values.assigned_auditor_id,
  });

  const plan = await createAuditPlan(values);

  if (plan.status !== 'active') {
    return { plan, generatedAudits: 0 };
  }

  const auditsToCreate: CreateAuditInput[] = [];
  let rr = 0;

  for (const date of dates) {
    for (const entityId of entityIds) {
      let auditorId: string | undefined;

      if (plan.assignment_strategy === 'assign_specific') {
        auditorId = plan.assigned_auditor_id;
      } else if (plan.assignment_strategy === 'auto_round_robin' && auditorIds.length > 0) {
        auditorId = auditorIds[rr % auditorIds.length];
        rr++;
      }

      auditsToCreate.push({
        plan_id: plan.id,
        template_id: plan.template_id,
        entity_type: plan.entity_type,
        entity_id: entityId,
        auditor_id: auditorId,
        scheduled_date: date,
        status: 'scheduled',
        created_by: plan.created_by,
      });
    }
  }

  if (auditsToCreate.length === 0) {
    return { plan, generatedAudits: 0 };
  }

  await createAuditsBulk(auditsToCreate);
  return { plan, generatedAudits: auditsToCreate.length };
}

const mapAuditPlan = (row: any): AuditPlan => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  template_id: row.template_id,
  entity_type: row.entity_type,
  recurrence_pattern: row.recurrence_pattern,
  scope: row.scope,
  assignment_strategy: row.assignment_strategy,
  assigned_auditor_id: row.assigned_auditor_id ?? undefined,
  status: row.status,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const generateAuditCode = (): string => {
  const y = new Date().getFullYear();
  return `AUD-${y}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
};

const createAuditsBulk = async (audits: CreateAuditInput[]): Promise<void> => {
  const rows = audits.map(a => ({
    audit_code: generateAuditCode(),
    plan_id: a.plan_id ?? null,
    template_id: a.template_id,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    auditor_id: a.auditor_id ?? null,
    scheduled_date: a.scheduled_date,
    started_at: a.started_at ?? null,
    completed_at: a.completed_at ?? null,
    status: a.status,
    score: a.score ?? null,
    pass_fail: a.pass_fail ?? null,
    created_by: a.created_by,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from('audits').insert(rows);
  if (error) throw error;
};

const getEntityIdsForPlan = async (plan: Pick<AuditPlan, 'entity_type' | 'scope'>): Promise<string[]> => {
  if (plan.scope.type === 'specific') return plan.scope.entity_ids ?? [];

  if (plan.entity_type === 'branch') {
    const { data, error } = await supabase
      .from('branches')
      .select('id')
      // Treat NULL status as active (older seeded rows may have status null)
      .or('status.is.null,status.neq.inactive');
    if (error) throw error;
    return (data ?? []).map(r => r.id);
  }

  if (plan.entity_type === 'bck') {
    const { data, error } = await supabase
      .from('bcks')
      .select('id')
      // Treat NULL status as active (older seeded rows may have status null)
      .or('status.is.null,status.neq.inactive');
    if (error) throw error;
    return (data ?? []).map(r => r.id);
  }

  const { data, error } = await supabase
    .from('suppliers')
    .select('id')
    // Treat NULL status as active (older seeded rows may have status null)
    .or('status.is.null,status.not.in.(inactive,blacklisted)');
  if (error) throw error;
  return (data ?? []).map(r => r.id);
};

const getAuditorIdsForPlan = async (
  plan: Pick<AuditPlan, 'assignment_strategy' | 'assigned_auditor_id'>
): Promise<string[]> => {
  if (plan.assignment_strategy === 'assign_specific' && plan.assigned_auditor_id) {
    return [plan.assigned_auditor_id];
  }

  if (plan.assignment_strategy !== 'auto_round_robin') return [];

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'auditor')
    .eq('status', 'active')
    .order('full_name');

  if (error) throw error;
  return (data ?? []).map(r => r.id);
};

const getScheduledDatesForHorizon = (pattern: any, horizonDays: number): string[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  if (pattern?.type === 'one_time' && pattern.scheduled_date) {
    const d = new Date(pattern.scheduled_date);
    if (d < today || d > end) return [];
    return [pattern.scheduled_date];
  }

  if (pattern?.type !== 'recurring' || !pattern.start_date) return [];

  const startDate = new Date(pattern.start_date);
  const hardEnd = pattern.end_date ? new Date(pattern.end_date) : end;
  const effectiveEnd = hardEnd < end ? hardEnd : end;
  const cursor = new Date(Math.max(startDate.getTime(), today.getTime()));
  const dates: string[] = [];

  while (cursor <= effectiveEnd) {
    if (shouldIncludeDate(cursor, pattern)) {
      dates.push(cursor.toISOString().split('T')[0]);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
};

const shouldIncludeDate = (date: Date, pattern: any): boolean => {
  if (pattern.frequency === 'daily') return true;

  if (pattern.frequency === 'weekly' && Array.isArray(pattern.days_of_week)) {
    return pattern.days_of_week.includes(date.getDay());
  }

  if (pattern.frequency === 'monthly' && typeof pattern.day_of_month === 'number') {
    return date.getDate() === pattern.day_of_month;
  }

  return false;
};

// ============= AUDITS =============

export async function fetchAudits(): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .order('scheduled_date', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapAudit);
}

export async function createAudit(values: CreateAuditInput): Promise<Audit> {
  const { data, error } = await supabase
    .from('audits')
    .insert({
      audit_code: generateAuditCode(),
      plan_id: values.plan_id ?? null,
      template_id: values.template_id,
      entity_type: values.entity_type,
      entity_id: values.entity_id,
      auditor_id: values.auditor_id ?? null,
      scheduled_date: values.scheduled_date,
      started_at: values.started_at ?? null,
      completed_at: values.completed_at ?? null,
      status: values.status,
      score: values.score ?? null,
      pass_fail: values.pass_fail ?? null,
      created_by: values.created_by,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapAudit(data);
}

export async function updateAudit(id: string, updates: Partial<Audit>): Promise<Audit> {
  const { data, error } = await supabase
    .from('audits')
    .update({
      auditor_id: updates.auditor_id ?? null,
      scheduled_date: updates.scheduled_date,
      started_at: updates.started_at ?? null,
      completed_at: updates.completed_at ?? null,
      status: updates.status,
      score: updates.score ?? null,
      pass_fail: updates.pass_fail ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapAudit(data);
}

export async function deleteAudit(id: string): Promise<void> {
  const { error } = await supabase.from('audits').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAuditById(id: string): Promise<Audit | null> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error) throw error;
  return data ? mapAudit(data) : null;
}

export async function fetchAuditsByStatus(status: AuditStatus): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('status', status)
    .order('scheduled_date', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapAudit);
}

export async function fetchAuditsByEntityId(entityId: string): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('entity_id', entityId)
    .order('scheduled_date', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapAudit);
}

export async function fetchAuditsByAuditorId(auditorId: string): Promise<Audit[]> {
  const { data, error } = await supabase
    .from('audits')
    .select('*')
    .eq('auditor_id', auditorId)
    .order('scheduled_date', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapAudit);
}

const mapAudit = (row: any): Audit => ({
  id: row.id,
  audit_code: row.audit_code,
  plan_id: row.plan_id ?? undefined,
  template_id: row.template_id,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  auditor_id: row.auditor_id ?? undefined,
  scheduled_date: row.scheduled_date,
  started_at: row.started_at ?? undefined,
  completed_at: row.completed_at ?? undefined,
  status: row.status,
  score: row.score ?? undefined,
  pass_fail: row.pass_fail ?? undefined,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
