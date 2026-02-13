import { supabase } from '@/integrations/supabase/client';

// Cast needed until Supabase types are regenerated after migration
const db = supabase as any;

// ── Types ──────────────────────────────────────────────────────────

export interface Department {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface DepartmentMember {
  id: string;
  department_id: string;
  user_id: string;
  role_in_dept: string; // 'head' | 'member' | extensible
  created_at: string;
}

// ── Departments CRUD ───────────────────────────────────────────────

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await db
    .from('departments')
    .select('*')
    .order('name');

  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function fetchDepartmentBySlug(slug: string): Promise<Department | null> {
  const { data, error } = await db
    .from('departments')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return (data as Department) ?? null;
}

// ── Department Members ─────────────────────────────────────────────

export async function fetchDepartmentMembers(departmentId: string): Promise<DepartmentMember[]> {
  const { data, error } = await db
    .from('department_members')
    .select('*')
    .eq('department_id', departmentId)
    .order('created_at');

  if (error) throw error;
  return (data ?? []) as DepartmentMember[];
}

export async function fetchDepartmentMembersBySlug(slug: string): Promise<DepartmentMember[]> {
  const dept = await fetchDepartmentBySlug(slug);
  if (!dept) return [];
  return fetchDepartmentMembers(dept.id);
}

export async function addDepartmentMember(
  departmentId: string,
  userId: string,
  roleInDept: string = 'member',
): Promise<void> {
  const { error } = await db.from('department_members').insert({
    department_id: departmentId,
    user_id: userId,
    role_in_dept: roleInDept,
  });

  if (error) throw error;
}

export async function removeDepartmentMember(
  departmentId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from('department_members')
    .delete()
    .eq('department_id', departmentId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateMemberRole(
  departmentId: string,
  userId: string,
  roleInDept: string,
): Promise<void> {
  const { error } = await db
    .from('department_members')
    .update({ role_in_dept: roleInDept })
    .eq('department_id', departmentId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ── Helpers for notification routing ───────────────────────────────

/** Get user IDs of all members in a department (by slug). */
export async function fetchDepartmentUserIds(slug: string): Promise<string[]> {
  const members = await fetchDepartmentMembersBySlug(slug);
  return members.map(m => m.user_id);
}

/** Get user IDs of department heads only (by slug). */
export async function fetchDepartmentHeadIds(slug: string): Promise<string[]> {
  const members = await fetchDepartmentMembersBySlug(slug);
  return members.filter(m => m.role_in_dept === 'head').map(m => m.user_id);
}

/** Get the department ID by slug (cached-friendly). */
export async function getDepartmentId(slug: string): Promise<string | null> {
  const dept = await fetchDepartmentBySlug(slug);
  return dept?.id ?? null;
}
