import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Branch, BCK, Region, Supplier, User } from '@/types';
import {
  upsertCachedRegion,
  removeCachedRegion,
  upsertCachedBranch,
  removeCachedBranch,
  upsertCachedBCK,
  removeCachedBCK,
  upsertCachedSupplier,
  removeCachedSupplier,
} from '@/lib/userStorage';

const mapRegion = (r: any): Region => ({
  id: r.id,
  name: r.name,
  code: r.code,
  description: r.description ?? undefined,
  manager_id: r.manager_id ?? undefined,
  status: 'active',
  created_at: r.created_at ?? '',
  updated_at: r.updated_at ?? '',
});

const mapBranch = (b: any): Branch => ({
  id: b.id,
  code: b.code,
  name: b.name,
  region_id: b.region_id ?? '',
  address: b.address ?? undefined,
  city: b.city ?? undefined,
  gps_lat: undefined,
  gps_lng: undefined,
  manager_id: b.manager_id ?? undefined,
  phone: b.phone ?? undefined,
  email: b.email ?? undefined,
  status: (b.status ?? 'active') as Branch['status'],
  opening_date: b.opening_date ?? undefined,
  health_score: typeof b.health_score === 'number' ? b.health_score : Number(b.health_score ?? 0),
  last_audit_date: undefined,
  created_at: b.created_at ?? '',
  updated_at: b.updated_at ?? '',
});

const mapBCK = (b: any): BCK => ({
  id: b.id,
  code: b.code,
  name: b.name,
  region_id: b.region_id ?? '',
  address: b.address ?? undefined,
  city: b.city ?? undefined,
  gps_lat: undefined,
  gps_lng: undefined,
  manager_id: b.manager_id ?? undefined,
  phone: b.phone ?? undefined,
  email: b.email ?? undefined,
  status: (b.status ?? 'active') as BCK['status'],
  production_capacity: b.production_capacity != null ? String(b.production_capacity) : undefined,
  supplies_branches: Array.isArray(b.supplies_branches) ? (b.supplies_branches as string[]) : [],
  certifications: Array.isArray(b.certifications) ? (b.certifications as any[]) : [],
  health_score: typeof b.health_score === 'number' ? b.health_score : Number(b.health_score ?? 0),
  last_audit_date: undefined,
  created_at: b.created_at ?? '',
  updated_at: b.updated_at ?? '',
});

const mapSupplier = (s: any): Supplier => ({
  id: s.id,
  supplier_code: s.code,
  name: s.name,
  type: s.type as Supplier['type'],
  category: s.category ?? undefined,
  contact_name: s.contact_name ?? undefined,
  contact_phone: s.contact_phone ?? undefined,
  contact_email: s.contact_email ?? undefined,
  address: s.address ?? undefined,
  city: s.city ?? undefined,
  registration_number: s.registration_number ?? undefined,
  certifications: Array.isArray(s.certifications) ? (s.certifications as any[]) : [],
  contract_start: s.contract_start ?? undefined,
  contract_end: s.contract_end ?? undefined,
  status: (s.status ?? 'active') as Supplier['status'],
  risk_level: s.risk_level as Supplier['risk_level'],
  supplies_to: (s.supplies_to as any) ?? { bcks: [], branches: [] },
  quality_score: typeof s.quality_score === 'number' ? s.quality_score : Number(s.quality_score ?? 0),
  last_audit_date: undefined,
  created_at: s.created_at ?? '',
  updated_at: s.updated_at ?? '',
});

export async function fetchRegions(): Promise<Region[]> {
  const { data, error } = await supabase.from('regions').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapRegion);
}

export async function fetchRegionByCode(code: string): Promise<Region | null> {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data ? mapRegion(data) : null;
}

export async function createRegion(values: {
  name: string;
  code: string;
  description?: string;
  manager_id?: string;
}): Promise<Region> {
  const { data, error } = await supabase
    .from('regions')
    .insert({
      name: values.name,
      code: values.code.toUpperCase(),
      description: values.description ?? null,
      manager_id: values.manager_id ?? null,
    })
    .select('*')
    .single();

  if (error) throw error;
  const region = mapRegion(data);
  upsertCachedRegion(region);
  return region;
}

export async function updateRegion(
  id: string,
  updates: {
    name?: string;
    description?: string;
    manager_id?: string;
  }
): Promise<Region> {
  const { data, error } = await supabase
    .from('regions')
    .update({
      name: updates.name,
      description: updates.description ?? null,
      manager_id: updates.manager_id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapRegion(data);
}

export async function deleteRegion(id: string): Promise<void> {
  // Unassign dependent entities first to avoid foreign key violations
  const [branchesRes, bcksRes] = await Promise.all([
    supabase.from('branches').update({ region_id: null, updated_at: new Date().toISOString() }).eq('region_id', id),
    supabase.from('bcks').update({ region_id: null, updated_at: new Date().toISOString() }).eq('region_id', id),
  ]);

  if (branchesRes.error) throw branchesRes.error;
  if (bcksRes.error) throw bcksRes.error;

  const { error } = await supabase.from('regions').delete().eq('id', id);
  if (error) throw error;

  removeCachedRegion(id);
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase.from('branches').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapBranch);
}

export async function fetchBranchByCode(code: string): Promise<Branch | null> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data ? mapBranch(data) : null;
}

export async function createBranch(values: {
  code: string;
  name: string;
  region_id: string;
  city: string;
  address?: string;
  manager_id?: string;
  phone?: string;
  email?: string;
  status: Branch['status'];
  opening_date?: string;
}): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .insert({
      code: values.code.toUpperCase(),
      name: values.name,
      region_id: values.region_id,
      city: values.city,
      address: values.address ?? null,
      manager_id: values.manager_id ?? null,
      phone: values.phone ?? null,
      email: values.email ?? null,
      status: values.status,
      opening_date: values.opening_date ?? null,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  const branch = mapBranch(data);
  upsertCachedBranch(branch);
  return branch;
}

export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .update({
      name: updates.name,
      region_id: updates.region_id,
      city: updates.city,
      address: updates.address ?? null,
      manager_id: updates.manager_id ?? null,
      phone: updates.phone ?? null,
      email: updates.email ?? null,
      status: updates.status,
      opening_date: updates.opening_date ?? null,
      health_score: updates.health_score,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  const branch = mapBranch(data);
  upsertCachedBranch(branch);
  return branch;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from('branches').delete().eq('id', id);
  if (error) throw error;

  removeCachedBranch(id);
}

export async function fetchBCKs(): Promise<BCK[]> {
  const { data, error } = await supabase.from('bcks').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapBCK);
}

export async function fetchBCKByCode(code: string): Promise<BCK | null> {
  const { data, error } = await supabase
    .from('bcks')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data ? mapBCK(data) : null;
}

export async function createBCK(values: {
  code: string;
  name: string;
  region_id: string;
  city: string;
  address?: string;
  manager_id?: string;
  phone?: string;
  email?: string;
  production_capacity?: string;
  supplies_branches: string[];
  certifications: Array<{ name: string; expiry_date: string; document_url?: string }>;
  status: BCK['status'];
}): Promise<BCK> {
  const { data, error } = await supabase
    .from('bcks')
    .insert({
      code: values.code.toUpperCase(),
      name: values.name,
      region_id: values.region_id,
      city: values.city,
      address: values.address ?? null,
      manager_id: values.manager_id ?? null,
      phone: values.phone ?? null,
      email: values.email ?? null,
      production_capacity: values.production_capacity ? Number(values.production_capacity) : null,
      supplies_branches: values.supplies_branches as unknown as Json,
      certifications: values.certifications as unknown as Json,
      status: values.status,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  const bck = mapBCK(data);
  upsertCachedBCK(bck);
  return bck;
}

export async function updateBCK(id: string, updates: Partial<BCK>): Promise<BCK> {
  const { data, error } = await supabase
    .from('bcks')
    .update({
      name: updates.name,
      region_id: updates.region_id,
      city: updates.city,
      address: updates.address ?? null,
      manager_id: updates.manager_id ?? null,
      phone: updates.phone ?? null,
      email: updates.email ?? null,
      production_capacity: updates.production_capacity ? Number(updates.production_capacity) : null,
      supplies_branches: updates.supplies_branches as unknown as Json,
      certifications: updates.certifications as unknown as Json,
      status: updates.status,
      health_score: updates.health_score,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  const bck = mapBCK(data);
  upsertCachedBCK(bck);
  return bck;
}

export async function deleteBCK(id: string): Promise<void> {
  const { error } = await supabase.from('bcks').delete().eq('id', id);
  if (error) throw error;

  removeCachedBCK(id);
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if (error) throw error;
  return (data ?? []).map(mapSupplier);
}

export async function fetchSupplierByCode(code: string): Promise<Supplier | null> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw error;
  return data ? mapSupplier(data) : null;
}

export async function createSupplier(values: {
  supplier_code: string;
  name: string;
  type: Supplier['type'];
  category?: string;
  risk_level: Supplier['risk_level'];
  contact_name: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  registration_number?: string;
  contract_start?: string;
  contract_end?: string;
  supplies_to: { bcks: string[]; branches: string[] };
  certifications: Array<{ name: string; expiry_date: string; document_url?: string }>;
  status: Supplier['status'];
}): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      code: values.supplier_code.toUpperCase(),
      name: values.name,
      type: values.type,
      category: values.category ?? null,
      risk_level: values.risk_level,
      contact_name: values.contact_name,
      contact_phone: values.contact_phone ?? null,
      contact_email: values.contact_email ?? null,
      address: values.address ?? null,
      city: values.city ?? null,
      registration_number: values.registration_number ?? null,
      contract_start: values.contract_start ?? null,
      contract_end: values.contract_end ?? null,
      supplies_to: values.supplies_to as unknown as Json,
      certifications: values.certifications as unknown as Json,
      status: values.status,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  const supplier = mapSupplier(data);
  upsertCachedSupplier(supplier);
  return supplier;
}

export async function updateSupplier(id: string, updates: Partial<Supplier>): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: updates.name,
      type: updates.type,
      category: updates.category ?? null,
      risk_level: updates.risk_level,
      contact_name: updates.contact_name ?? null,
      contact_phone: updates.contact_phone ?? null,
      contact_email: updates.contact_email ?? null,
      address: updates.address ?? null,
      city: updates.city ?? null,
      registration_number: updates.registration_number ?? null,
      contract_start: updates.contract_start ?? null,
      contract_end: updates.contract_end ?? null,
      supplies_to: updates.supplies_to as unknown as Json,
      certifications: updates.certifications as unknown as Json,
      status: updates.status,
      quality_score: updates.quality_score,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  const supplier = mapSupplier(data);
  upsertCachedSupplier(supplier);
  return supplier;
}

export async function deleteSupplier(id: string): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw error;

  removeCachedSupplier(id);
}

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('*').order('full_name');
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    phone: u.phone ?? undefined,
    role: u.role as User['role'],
    avatar_url: undefined,
    status: (u.status ?? 'active') as User['status'],
    created_at: u.created_at ?? '',
    updated_at: u.updated_at ?? '',
    last_login_at: u.last_login ?? undefined,
  }));
}
