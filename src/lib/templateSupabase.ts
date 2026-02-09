import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type {
  AuditTemplate,
  ChecklistJson,
  EntityType,
  ScoringConfig,
  TemplateStatus,
} from '@/lib/templateStorage';

const mapTemplate = (row: any): AuditTemplate => ({
  id: row.id,
  name: row.name,
  code: row.code,
  type: row.type ?? undefined,
  entity_type: row.entity_type as EntityType,
  version: row.version ?? 1,
  status: (row.status ?? 'draft') as TemplateStatus,
  checklist_json: row.checklist_json as ChecklistJson,
  scoring_config: row.scoring_config as ScoringConfig,
  languages: Array.isArray(row.languages) ? (row.languages as string[]) : (row.languages as any) ?? undefined,
  created_by: row.created_by ?? 'system',
  created_at: row.created_at ?? '',
  updated_at: row.updated_at ?? '',
});

export async function fetchTemplates(): Promise<AuditTemplate[]> {
  const { data, error } = await supabase.from('audit_templates').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

export async function fetchTemplateById(id: string): Promise<AuditTemplate | null> {
  const { data, error } = await supabase
    .from('audit_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTemplate(data) : null;
}

export async function fetchTemplateByCode(code: string): Promise<AuditTemplate | null> {
  const { data, error } = await supabase
    .from('audit_templates')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data ? mapTemplate(data) : null;
}

export async function createTemplate(values: {
  name: string;
  code: string;
  entity_type: EntityType;
  checklist_json: ChecklistJson;
  scoring_config: ScoringConfig;
  status: TemplateStatus;
  version: number;
  created_by?: string | null;
}): Promise<AuditTemplate> {
  const { data, error } = await supabase
    .from('audit_templates')
    .insert({
      name: values.name,
      code: values.code.toUpperCase(),
      type: 'checklist',
      entity_type: values.entity_type,
      version: values.version,
      status: values.status,
      checklist_json: values.checklist_json as unknown as Json,
      scoring_config: values.scoring_config as unknown as Json,
      languages: ['en'] as unknown as Json,
      created_by: values.created_by ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapTemplate(data);
}

export async function updateTemplate(
  id: string,
  updates: Partial<Pick<AuditTemplate, 'name' | 'code' | 'entity_type' | 'version' | 'status' | 'checklist_json' | 'scoring_config' | 'languages'>>
): Promise<AuditTemplate> {
  const { data, error } = await supabase
    .from('audit_templates')
    .update({
      name: updates.name,
      code: updates.code ? updates.code.toUpperCase() : undefined,
      entity_type: updates.entity_type,
      version: updates.version,
      status: updates.status,
      checklist_json: updates.checklist_json as unknown as Json,
      scoring_config: updates.scoring_config as unknown as Json,
      languages: updates.languages as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapTemplate(data);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('audit_templates').delete().eq('id', id);
  if (error) throw error;
}

export async function archiveTemplate(id: string): Promise<AuditTemplate> {
  return updateTemplate(id, { status: 'archived' });
}

export async function activateTemplate(id: string): Promise<AuditTemplate> {
  return updateTemplate(id, { status: 'active' });
}

export async function duplicateTemplate(id: string): Promise<AuditTemplate> {
  const existing = await fetchTemplateById(id);
  if (!existing) throw new Error('Template not found');

  const code = `${existing.code}-COPY-${Date.now().toString(36)}`.toUpperCase();

  return createTemplate({
    name: `${existing.name} (Copy)`,
    code,
    entity_type: existing.entity_type,
    status: 'draft',
    version: 1,
    checklist_json: existing.checklist_json,
    scoring_config: existing.scoring_config,
    created_by: null,
  });
}
