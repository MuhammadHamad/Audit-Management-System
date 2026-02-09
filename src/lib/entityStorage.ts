import { Region, Branch, BCK, Supplier, User } from '@/types';
import {
  getRegions,
  getRegionById,
  getRegionByCode,
  getBranches,
  getBranchById,
  getBranchByCode,
  getBCKs,
  getBCKById,
  getBCKByCode,
  getSuppliers,
  getSupplierById,
  getSupplierByCode,
  getUsers,
  getUserById,
  getUsersByRole,
  getUserByEmail,
  upsertCachedBranch,
  upsertCachedBCK,
  upsertCachedSupplier,
} from './userStorage';

import {
  createRegion as createRegionSupabase,
  updateRegion as updateRegionSupabase,
  deleteRegion as deleteRegionSupabase,
  createBranch as createBranchSupabase,
  updateBranch as updateBranchSupabase,
  deleteBranch as deleteBranchSupabase,
  createBCK as createBCKSupabase,
  updateBCK as updateBCKSupabase,
  deleteBCK as deleteBCKSupabase,
  createSupplier as createSupplierSupabase,
  updateSupplier as updateSupplierSupabase,
  deleteSupplier as deleteSupplierSupabase,
} from './entitySupabase';

// ============= REGIONS =============
export {
  getRegions,
  getRegionById,
  getRegionByCode,
  getBranchCountByRegion,
  getBCKCountByRegion,
} from './userStorage';

export const createRegion = async (
  region: Omit<Region, 'id' | 'created_at' | 'updated_at'>
): Promise<Region> => {
  return createRegionSupabase({
    name: region.name,
    code: region.code,
    description: region.description,
    manager_id: region.manager_id,
  });
};

export const updateRegion = async (id: string, updates: Partial<Region>): Promise<Region> => {
  return updateRegionSupabase(id, {
    name: updates.name,
    description: updates.description,
    manager_id: updates.manager_id,
  });
};

export const deleteRegion = async (id: string): Promise<void> => {
  await deleteRegionSupabase(id);
};

// ============= BRANCHES =============
export { getBranches, getBranchById, getBranchByCode };

export const createBranch = async (
  branch: Omit<Branch, 'id' | 'created_at' | 'updated_at' | 'health_score'>
): Promise<Branch> => {
  return createBranchSupabase({
    code: branch.code,
    name: branch.name,
    region_id: branch.region_id,
    city: branch.city ?? '',
    address: branch.address,
    manager_id: branch.manager_id,
    phone: branch.phone,
    email: branch.email,
    status: branch.status,
    opening_date: branch.opening_date,
  });
};

export const updateBranch = async (id: string, updates: Partial<Branch>): Promise<Branch> => {
  return updateBranchSupabase(id, updates);
};

export const updateBranchSync = (id: string, updates: Partial<Branch>): Branch | null => {
  const existing = getBranchById(id);
  if (!existing) return null;

  const updated: Branch = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  upsertCachedBranch(updated);
  void updateBranchSupabase(id, updates)
    .then((fresh) => {
      upsertCachedBranch(fresh);
    })
    .catch((e) => {
      console.error('Failed to update branch:', e);
    });

  return updated;
};

export const deleteBranch = async (id: string): Promise<void> => {
  await deleteBranchSupabase(id);
};

// ============= BCKs =============
export { getBCKs, getBCKById, getBCKByCode };

export const createBCK = async (
  bck: Omit<BCK, 'id' | 'created_at' | 'updated_at' | 'health_score'>
): Promise<BCK> => {
  return createBCKSupabase({
    code: bck.code,
    name: bck.name,
    region_id: bck.region_id,
    city: bck.city ?? '',
    address: bck.address,
    manager_id: bck.manager_id,
    phone: bck.phone,
    email: bck.email,
    status: bck.status,
    production_capacity: bck.production_capacity,
    supplies_branches: bck.supplies_branches,
    certifications: bck.certifications,
  });
};

export const updateBCK = async (id: string, updates: Partial<BCK>): Promise<BCK> => {
  return updateBCKSupabase(id, updates);
};

export const updateBCKSync = (id: string, updates: Partial<BCK>): BCK | null => {
  const existing = getBCKById(id);
  if (!existing) return null;

  const updated: BCK = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  upsertCachedBCK(updated);
  void updateBCKSupabase(id, updates)
    .then((fresh) => {
      upsertCachedBCK(fresh);
    })
    .catch((e) => {
      console.error('Failed to update BCK:', e);
    });

  return updated;
};

export const deleteBCK = async (id: string): Promise<void> => {
  await deleteBCKSupabase(id);
};

// ============= SUPPLIERS =============
export { getSuppliers, getSupplierById, getSupplierByCode };

export const createSupplier = async (
  supplier: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'quality_score'>
): Promise<Supplier> => {
  return createSupplierSupabase({
    supplier_code: supplier.supplier_code,
    name: supplier.name,
    type: supplier.type,
    category: supplier.category,
    risk_level: supplier.risk_level,
    contact_name: supplier.contact_name,
    contact_phone: supplier.contact_phone,
    contact_email: supplier.contact_email,
    address: supplier.address,
    city: supplier.city,
    registration_number: supplier.registration_number,
    contract_start: supplier.contract_start,
    contract_end: supplier.contract_end,
    supplies_to: supplier.supplies_to,
    certifications: supplier.certifications,
    status: supplier.status,
  });
};

export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<Supplier> => {
  return updateSupplierSupabase(id, updates);
};

export const updateSupplierSync = (id: string, updates: Partial<Supplier>): Supplier | null => {
  const existing = getSupplierById(id);
  if (!existing) return null;

  const updated: Supplier = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  upsertCachedSupplier(updated);
  void updateSupplierSupabase(id, updates)
    .then((fresh) => {
      upsertCachedSupplier(fresh);
    })
    .catch((e) => {
      console.error('Failed to update supplier:', e);
    });

  return updated;
};

export const deleteSupplier = async (id: string): Promise<void> => {
  await deleteSupplierSupabase(id);
};

// ============= USERS (read-only helpers) =============
export { getUsers, getUserById, getUsersByRole, getUserByEmail };
