import { supabase } from '@/integrations/supabase/client';
import type { Incident, IncidentSeverity, IncidentStatus, IncidentEntityType } from './incidentStorage';

// ============= INCIDENTS =============

export async function fetchIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapIncident);
}

export async function fetchIncidentById(id: string): Promise<Incident | null> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  
  if (error) throw error;
  return data ? mapIncident(data) : null;
}

export async function fetchIncidentsBySeverity(severity: IncidentSeverity): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('severity', severity)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapIncident);
}

export async function fetchIncidentsByStatus(status: IncidentStatus): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapIncident);
}

export async function fetchIncidentsByEntityId(entityId: string): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('*')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return (data ?? []).map(mapIncident);
}

const mapIncident = (row: any): Incident => ({
  id: row.id,
  incident_code: row.incident_code,
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  type: row.type,
  category: row.category,
  severity: row.severity,
  title: row.title,
  description: row.description,
  evidence_urls: Array.isArray(row.evidence_urls) ? row.evidence_urls : [],
  assigned_to: row.assigned_to ?? undefined,
  status: row.status,
  resolution_notes: row.resolution_notes ?? undefined,
  investigation_notes: row.investigation_notes ?? undefined,
  related_audit_id: row.related_audit_id ?? undefined,
  created_by: row.created_by,
  created_at: row.created_at,
  updated_at: row.updated_at,
});
