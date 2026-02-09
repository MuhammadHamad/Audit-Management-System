import { User, UserAssignment, Region, Branch, BCK, Supplier, UserRole } from '@/types';
import { supabase } from '@/integrations/supabase/client';

// NOTE: This file provides both sync and async functions for data operations
// Sync functions use cached data for backward compatibility
// Async functions fetch fresh data from Supabase

// Cache for sync operations
let cachedUsers: User[] = [];
let cachedAssignments: UserAssignment[] = [];
let cachedRegions: Region[] = [];
let cachedBranches: Branch[] = [];
let cachedBCKs: BCK[] = [];
let cachedSuppliers: Supplier[] = [];
let cacheInitialized = false;

export const upsertCachedRegion = (region: Region) => {
  const idx = cachedRegions.findIndex(r => r.id === region.id);
  if (idx === -1) cachedRegions = [...cachedRegions, region];
  else cachedRegions = cachedRegions.map(r => r.id === region.id ? region : r);
};

export const removeCachedRegion = (id: string) => {
  cachedRegions = cachedRegions.filter(r => r.id !== id);
};

export const upsertCachedBranch = (branch: Branch) => {
  const idx = cachedBranches.findIndex(b => b.id === branch.id);
  if (idx === -1) cachedBranches = [...cachedBranches, branch];
  else cachedBranches = cachedBranches.map(b => b.id === branch.id ? branch : b);
};

export const removeCachedBranch = (id: string) => {
  cachedBranches = cachedBranches.filter(b => b.id !== id);
};

export const upsertCachedBCK = (bck: BCK) => {
  const idx = cachedBCKs.findIndex(b => b.id === bck.id);
  if (idx === -1) cachedBCKs = [...cachedBCKs, bck];
  else cachedBCKs = cachedBCKs.map(b => b.id === bck.id ? bck : b);
};

export const removeCachedBCK = (id: string) => {
  cachedBCKs = cachedBCKs.filter(b => b.id !== id);
};

export const upsertCachedSupplier = (supplier: Supplier) => {
  const idx = cachedSuppliers.findIndex(s => s.id === supplier.id);
  if (idx === -1) cachedSuppliers = [...cachedSuppliers, supplier];
  else cachedSuppliers = cachedSuppliers.map(s => s.id === supplier.id ? supplier : s);
};

export const removeCachedSupplier = (id: string) => {
  cachedSuppliers = cachedSuppliers.filter(s => s.id !== id);
};

// Initialize cache from Supabase
export const initializeCache = async () => {
  try {
    const [usersRes, assignmentsRes, regionsRes, branchesRes, bcksRes, suppliersRes] = await Promise.all([
      supabase.from('users').select('*').order('full_name'),
      supabase.from('user_assignments').select('*'),
      supabase.from('regions').select('*').order('name'),
      supabase.from('branches').select('*').order('name'),
      supabase.from('bcks').select('*').order('name'),
      supabase.from('suppliers').select('*').order('name'),
    ]);

    if (usersRes.data) {
      cachedUsers = usersRes.data.map(mapUser);
    }
    if (assignmentsRes.data) {
      cachedAssignments = assignmentsRes.data.map(mapAssignment);
    }
    if (regionsRes.data) {
      cachedRegions = regionsRes.data.map(mapRegion);
    }
    if (branchesRes.data) {
      cachedBranches = branchesRes.data.map(mapBranch);
    }
    if (bcksRes.data) {
      cachedBCKs = bcksRes.data.map(mapBCK);
    }
    if (suppliersRes.data) {
      cachedSuppliers = suppliersRes.data.map(mapSupplier);
    }
    cacheInitialized = true;
  } catch (error) {
    console.error('Error initializing cache:', error);
  }
};

// Mapping functions
const mapUser = (u: any): User => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  phone: u.phone || undefined,
  role: u.role as UserRole,
  avatar_url: undefined,
  status: (u.status || 'active') as 'active' | 'inactive',
  created_at: u.created_at || '',
  updated_at: u.updated_at || '',
  last_login_at: u.last_login || undefined,
});

const mapAssignment = (a: any): UserAssignment => ({
  id: a.id,
  user_id: a.user_id || '',
  assigned_type: a.assigned_type as 'region' | 'branch' | 'bck',
  assigned_id: a.assigned_id,
  created_at: a.created_at || '',
});

const mapRegion = (r: any): Region => ({
  id: r.id,
  name: r.name,
  code: r.code,
  description: r.description || undefined,
  manager_id: r.manager_id || undefined,
  status: 'active' as const,
  created_at: r.created_at || '',
  updated_at: r.updated_at || '',
});

const mapBranch = (b: any): Branch => ({
  id: b.id,
  code: b.code,
  name: b.name,
  region_id: b.region_id || '',
  city: b.city,
  address: b.address || undefined,
  manager_id: b.manager_id || undefined,
  phone: b.phone || undefined,
  email: b.email || undefined,
  status: (b.status || 'active') as 'active' | 'inactive' | 'under_renovation' | 'temporarily_closed',
  opening_date: b.opening_date || undefined,
  health_score: b.health_score || 0,
  created_at: b.created_at || '',
  updated_at: b.updated_at || '',
});

const mapSupplier = (s: any): Supplier => ({
  id: s.id,
  supplier_code: s.code,
  name: s.name,
  type: s.type as Supplier['type'],
  category: s.category || undefined,
  contact_name: s.contact_name || undefined,
  contact_phone: s.contact_phone || undefined,
  contact_email: s.contact_email || undefined,
  address: s.address || undefined,
  city: s.city || undefined,
  registration_number: s.registration_number || undefined,
  certifications: Array.isArray(s.certifications) ? (s.certifications as any[]) : [],
  contract_start: s.contract_start || undefined,
  contract_end: s.contract_end || undefined,
  status: (s.status || 'active') as Supplier['status'],
  risk_level: (s.risk_level || 'medium') as Supplier['risk_level'],
  supplies_to: (s.supplies_to as any) || { bcks: [], branches: [] },
  quality_score: typeof s.quality_score === 'number' ? s.quality_score : Number(s.quality_score ?? 0),
  last_audit_date: undefined,
  created_at: s.created_at || '',
  updated_at: s.updated_at || '',
});

const mapBCK = (b: any): BCK => ({
  id: b.id,
  code: b.code,
  name: b.name,
  region_id: b.region_id || '',
  city: b.city,
  address: b.address || undefined,
  manager_id: b.manager_id || undefined,
  phone: b.phone || undefined,
  email: b.email || undefined,
  status: (b.status || 'active') as 'active' | 'inactive' | 'under_maintenance',
  production_capacity: b.production_capacity?.toString(),
  supplies_branches: Array.isArray(b.supplies_branches) ? b.supplies_branches as string[] : [],
  certifications: Array.isArray(b.certifications) ? b.certifications as { name: string; expiry_date: string; document_url?: string }[] : [],
  health_score: b.health_score || 0,
  created_at: b.created_at || '',
  updated_at: b.updated_at || '',
});

// ============= SYNC FUNCTIONS (use cached data) =============

// Users
export const getUsers = (): User[] => cachedUsers;

export const getUsersByRole = (role: UserRole): User[] => {
  return cachedUsers.filter(u => u.role === role);
};

export const getUserById = (id: string): User | undefined => {
  return cachedUsers.find(u => u.id === id);
};

export const getUserByEmail = (email: string): User | undefined => {
  return cachedUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
};

// User Assignments
export const getUserAssignments = (): UserAssignment[] => cachedAssignments;

export const getAssignmentsForUser = (userId: string): UserAssignment[] => {
  return cachedAssignments.filter(a => a.user_id === userId);
};

// Regions
export const getRegions = (): Region[] => cachedRegions;

export const getRegionById = (id: string): Region | undefined => {
  return cachedRegions.find(r => r.id === id);
};

export const getRegionByCode = (code: string): Region | undefined => {
  return cachedRegions.find(r => r.code.toUpperCase() === code.toUpperCase());
};

export const getBranchCountByRegion = (regionId: string): number => {
  return cachedBranches.filter(b => b.region_id === regionId).length;
};

export const getBCKCountByRegion = (regionId: string): number => {
  return cachedBCKs.filter(b => b.region_id === regionId).length;
};

// Branches
export const getBranches = (): Branch[] => cachedBranches;

export const getBranchById = (id: string): Branch | undefined => {
  return cachedBranches.find(b => b.id === id);
};

export const getBranchByCode = (code: string): Branch | undefined => {
  return cachedBranches.find(b => b.code === code);
};

// BCKs
export const getBCKs = (): BCK[] => cachedBCKs;

export const getBCKById = (id: string): BCK | undefined => {
  return cachedBCKs.find(b => b.id === id);
};

export const getBCKByCode = (code: string): BCK | undefined => {
  return cachedBCKs.find(b => b.code === code);
};

// Suppliers
export const getSuppliers = (): Supplier[] => cachedSuppliers;

export const getSupplierById = (id: string): Supplier | undefined => {
  return cachedSuppliers.find(s => s.id === id);
};

export const getSupplierByCode = (code: string): Supplier | undefined => {
  return cachedSuppliers.find(s => s.supplier_code.toUpperCase() === code.toUpperCase());
};

// ============= ASYNC FUNCTIONS (fetch from Supabase) =============

export const fetchUsers = async (): Promise<User[]> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('full_name');
  
  if (error) {
    console.error('Error fetching users:', error);
    return cachedUsers;
  }
  
  cachedUsers = data.map(mapUser);
  return cachedUsers;
};

export const fetchUserAssignments = async (): Promise<UserAssignment[]> => {
  const { data, error } = await supabase
    .from('user_assignments')
    .select('*');
  
  if (error) {
    console.error('Error fetching assignments:', error);
    return cachedAssignments;
  }
  
  cachedAssignments = data.map(mapAssignment);
  return cachedAssignments;
};

export const fetchRegions = async (): Promise<Region[]> => {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('Error fetching regions:', error);
    return cachedRegions;
  }
  
  cachedRegions = data.map(mapRegion);
  return cachedRegions;
};

export const fetchBranches = async (): Promise<Branch[]> => {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('Error fetching branches:', error);
    return cachedBranches;
  }
  
  cachedBranches = data.map(mapBranch);
  return cachedBranches;
};

export const fetchBCKs = async (): Promise<BCK[]> => {
  const { data, error } = await supabase
    .from('bcks')
    .select('*')
    .order('name');
  
  if (error) {
    console.error('Error fetching BCKs:', error);
    return cachedBCKs;
  }
  
  cachedBCKs = data.map(mapBCK);
  return cachedBCKs;
};

export const fetchSuppliers = async (): Promise<Supplier[]> => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching suppliers:', error);
    return cachedSuppliers;
  }

  cachedSuppliers = (data ?? []).map(mapSupplier);
  return cachedSuppliers;
};

// ============= MUTATION FUNCTIONS =============

// NOTE: User creation should be done through Supabase Auth
// This function only creates the user record in the users table
export const createUser = async (user: {
  id?: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
}): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role: user.role,
      status: 'active',
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating user record:', error);
    return null;
  }
  
  const newUser = mapUser(data);
  cachedUsers = [...cachedUsers, newUser];
  
  // Also create the user role entry
  await supabase
    .from('user_roles')
    .insert({
      user_id: data.id,
      role: user.role,
    });
  
  return newUser;
};

export const updateUser = async (id: string, updates: Partial<User>): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .update({
      full_name: updates.full_name,
      phone: updates.phone,
      status: updates.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  
  if (error || !data) {
    console.error('Error updating user:', error);
    return null;
  }
  
  const updatedUser = mapUser(data);
  cachedUsers = cachedUsers.map(u => u.id === id ? updatedUser : u);
  return updatedUser;
};

export const deleteUser = async (id: string): Promise<boolean> => {
  const user = getUserById(id);
  if (!user || user.last_login_at) return false;
  
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error('Error deleting user:', error);
    return false;
  }
  
  cachedUsers = cachedUsers.filter(u => u.id !== id);
  cachedAssignments = cachedAssignments.filter(a => a.user_id !== id);
  return true;
};

export const createAssignment = async (assignment: Omit<UserAssignment, 'id' | 'created_at'>): Promise<UserAssignment | null> => {
  const { data, error } = await supabase
    .from('user_assignments')
    .insert({
      user_id: assignment.user_id,
      assigned_type: assignment.assigned_type,
      assigned_id: assignment.assigned_id,
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating assignment:', error);
    return null;
  }
  
  const newAssignment = mapAssignment(data);
  cachedAssignments = [...cachedAssignments, newAssignment];
  return newAssignment;
};

export const deleteAssignmentsForUser = async (userId: string): Promise<void> => {
  const { error } = await supabase
    .from('user_assignments')
    .delete()
    .eq('user_id', userId);
  
  if (error) {
    console.error('Error deleting assignments:', error);
  }
  
  cachedAssignments = cachedAssignments.filter(a => a.user_id !== userId);
};

// NOTE: Password reset is handled by Supabase Auth, not here
// Use supabase.auth.resetPasswordForEmail() instead

// Import users helper - now creates users through the database
// Note: This does NOT create Supabase Auth users - those must be created separately
export const importUsers = async (
  users: Array<{
    full_name: string;
    email: string;
    phone?: string;
    role: UserRole;
    assigned_to_type?: 'region' | 'branch' | 'bck';
    assigned_to_code?: string;
  }>
): Promise<{ success: number; failed: number }> => {
  let success = 0;
  let failed = 0;

  for (const userData of users) {
    try {
      // Check for duplicate email
      if (getUserByEmail(userData.email)) {
        failed++;
        continue;
      }

      const user = await createUser({
        email: userData.email,
        full_name: userData.full_name,
        phone: userData.phone,
        role: userData.role,
      });

      if (!user) {
        failed++;
        continue;
      }

      // Create assignment if specified
      if (userData.assigned_to_type && userData.assigned_to_code) {
        let assignedId: string | undefined;
        
        if (userData.assigned_to_type === 'region') {
          const region = getRegions().find(r => r.code === userData.assigned_to_code);
          assignedId = region?.id;
        } else if (userData.assigned_to_type === 'branch') {
          const branch = getBranchByCode(userData.assigned_to_code);
          assignedId = branch?.id;
        } else if (userData.assigned_to_type === 'bck') {
          const bck = getBCKByCode(userData.assigned_to_code);
          assignedId = bck?.id;
        }

        if (assignedId) {
          await createAssignment({
            user_id: user.id,
            assigned_type: userData.assigned_to_type,
            assigned_id: assignedId,
          });
        }
      }

      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};

// Refresh all caches
export const refreshCache = async () => {
  await initializeCache();
};
