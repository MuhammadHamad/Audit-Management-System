import { Region, Branch, BCK, Supplier, User } from '@/types';
import { seedRegions, seedBranches, seedBCKs, seedSuppliers } from '@/data/seedData';

const REGIONS_KEY = 'burgerizzr_regions';
const BRANCHES_KEY = 'burgerizzr_branches';
const BCKS_KEY = 'burgerizzr_bcks';
const SUPPLIERS_KEY = 'burgerizzr_suppliers';
const USERS_KEY = 'burgerizzr_users';

// Initialize storage with seed data if empty
export const initializeEntityStorage = () => {
  if (!localStorage.getItem(REGIONS_KEY)) {
    localStorage.setItem(REGIONS_KEY, JSON.stringify(seedRegions));
  }
  if (!localStorage.getItem(BRANCHES_KEY)) {
    localStorage.setItem(BRANCHES_KEY, JSON.stringify(seedBranches));
  }
  if (!localStorage.getItem(BCKS_KEY)) {
    localStorage.setItem(BCKS_KEY, JSON.stringify(seedBCKs));
  }
  if (!localStorage.getItem(SUPPLIERS_KEY)) {
    localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(seedSuppliers));
  }
};

// ============= REGIONS =============
export const getRegions = (): Region[] => {
  initializeEntityStorage();
  return JSON.parse(localStorage.getItem(REGIONS_KEY) || '[]');
};

export const getRegionById = (id: string): Region | undefined => {
  return getRegions().find(r => r.id === id);
};

export const getRegionByCode = (code: string): Region | undefined => {
  return getRegions().find(r => r.code.toUpperCase() === code.toUpperCase());
};

export const createRegion = (region: Omit<Region, 'id' | 'created_at' | 'updated_at'>): Region => {
  const regions = getRegions();
  const newRegion: Region = {
    ...region,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  regions.push(newRegion);
  localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
  return newRegion;
};

export const updateRegion = (id: string, updates: Partial<Region>): Region | null => {
  const regions = getRegions();
  const index = regions.findIndex(r => r.id === id);
  if (index === -1) return null;

  regions[index] = {
    ...regions[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
  return regions[index];
};

export const deleteRegion = (id: string): { success: boolean; error?: string } => {
  const branches = getBranches().filter(b => b.region_id === id);
  const bcks = getBCKs().filter(b => b.region_id === id);

  if (branches.length > 0 || bcks.length > 0) {
    return {
      success: false,
      error: `Cannot delete region. It contains ${branches.length} branches and ${bcks.length} BCKs. Reassign them first.`,
    };
  }

  const regions = getRegions().filter(r => r.id !== id);
  localStorage.setItem(REGIONS_KEY, JSON.stringify(regions));
  return { success: true };
};

export const getBranchCountByRegion = (regionId: string): number => {
  return getBranches().filter(b => b.region_id === regionId).length;
};

export const getBCKCountByRegion = (regionId: string): number => {
  return getBCKs().filter(b => b.region_id === regionId).length;
};

// ============= BRANCHES =============
export const getBranches = (): Branch[] => {
  initializeEntityStorage();
  return JSON.parse(localStorage.getItem(BRANCHES_KEY) || '[]');
};

export const getBranchById = (id: string): Branch | undefined => {
  return getBranches().find(b => b.id === id);
};

export const getBranchByCode = (code: string): Branch | undefined => {
  return getBranches().find(b => b.code.toUpperCase() === code.toUpperCase());
};

export const createBranch = (branch: Omit<Branch, 'id' | 'created_at' | 'updated_at' | 'health_score'>): Branch => {
  const branches = getBranches();
  const newBranch: Branch = {
    ...branch,
    id: crypto.randomUUID(),
    health_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  branches.push(newBranch);
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
  return newBranch;
};

export const updateBranch = (id: string, updates: Partial<Branch>): Branch | null => {
  const branches = getBranches();
  const index = branches.findIndex(b => b.id === id);
  if (index === -1) return null;

  branches[index] = {
    ...branches[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
  return branches[index];
};

export const deleteBranch = (id: string): { success: boolean; error?: string } => {
  const branch = getBranchById(id);
  if (!branch) return { success: false, error: 'Branch not found' };

  // Check for audits (simulated - no real audits table yet)
  if (branch.last_audit_date) {
    return {
      success: false,
      error: 'Cannot delete. This branch has audit history. Deactivate it instead.',
    };
  }

  const branches = getBranches().filter(b => b.id !== id);
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
  return { success: true };
};

// ============= BCKs =============
export const getBCKs = (): BCK[] => {
  initializeEntityStorage();
  return JSON.parse(localStorage.getItem(BCKS_KEY) || '[]');
};

export const getBCKById = (id: string): BCK | undefined => {
  return getBCKs().find(b => b.id === id);
};

export const getBCKByCode = (code: string): BCK | undefined => {
  return getBCKs().find(b => b.code.toUpperCase() === code.toUpperCase());
};

export const createBCK = (bck: Omit<BCK, 'id' | 'created_at' | 'updated_at' | 'health_score'>): BCK => {
  const bcks = getBCKs();
  const newBCK: BCK = {
    ...bck,
    id: crypto.randomUUID(),
    health_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  bcks.push(newBCK);
  localStorage.setItem(BCKS_KEY, JSON.stringify(bcks));
  return newBCK;
};

export const updateBCK = (id: string, updates: Partial<BCK>): BCK | null => {
  const bcks = getBCKs();
  const index = bcks.findIndex(b => b.id === id);
  if (index === -1) return null;

  bcks[index] = {
    ...bcks[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(BCKS_KEY, JSON.stringify(bcks));
  return bcks[index];
};

export const deleteBCK = (id: string): { success: boolean; error?: string } => {
  const bck = getBCKById(id);
  if (!bck) return { success: false, error: 'BCK not found' };

  if (bck.last_audit_date) {
    return {
      success: false,
      error: 'Cannot delete. This BCK has audit history. Deactivate it instead.',
    };
  }

  const bcks = getBCKs().filter(b => b.id !== id);
  localStorage.setItem(BCKS_KEY, JSON.stringify(bcks));
  return { success: true };
};

// ============= SUPPLIERS =============
export const getSuppliers = (): Supplier[] => {
  initializeEntityStorage();
  return JSON.parse(localStorage.getItem(SUPPLIERS_KEY) || '[]');
};

export const getSupplierById = (id: string): Supplier | undefined => {
  return getSuppliers().find(s => s.id === id);
};

export const getSupplierByCode = (code: string): Supplier | undefined => {
  return getSuppliers().find(s => s.supplier_code.toUpperCase() === code.toUpperCase());
};

export const createSupplier = (supplier: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'quality_score'>): Supplier => {
  const suppliers = getSuppliers();
  const newSupplier: Supplier = {
    ...supplier,
    id: crypto.randomUUID(),
    quality_score: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  suppliers.push(newSupplier);
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
  return newSupplier;
};

export const updateSupplier = (id: string, updates: Partial<Supplier>): Supplier | null => {
  const suppliers = getSuppliers();
  const index = suppliers.findIndex(s => s.id === id);
  if (index === -1) return null;

  suppliers[index] = {
    ...suppliers[index],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
  return suppliers[index];
};

export const deleteSupplier = (id: string): { success: boolean; error?: string } => {
  const supplier = getSupplierById(id);
  if (!supplier) return { success: false, error: 'Supplier not found' };

  if (supplier.last_audit_date) {
    return {
      success: false,
      error: 'Cannot delete. This supplier has audit history. Deactivate it instead.',
    };
  }

  const suppliers = getSuppliers().filter(s => s.id !== id);
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
  return { success: true };
};

// ============= USERS (read-only helpers) =============
export const getUsers = (): User[] => {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
};

export const getUserById = (id: string): User | undefined => {
  return getUsers().find(u => u.id === id);
};

export const getUsersByRole = (role: User['role']): User[] => {
  return getUsers().filter(u => u.role === role && u.status === 'active');
};

export const getUserByEmail = (email: string): User | undefined => {
  return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
};

// ============= IMPORT HELPERS =============
export const importRegions = (
  data: Array<{
    name: string;
    code: string;
    description?: string;
    manager_email?: string;
  }>
): { success: number; failed: number } => {
  let success = 0;
  let failed = 0;

  for (const row of data) {
    try {
      if (getRegionByCode(row.code)) {
        failed++;
        continue;
      }

      let managerId: string | undefined;
      if (row.manager_email) {
        const manager = getUserByEmail(row.manager_email);
        if (manager?.role === 'regional_manager') {
          managerId = manager.id;
        }
      }

      createRegion({
        name: row.name,
        code: row.code.toUpperCase(),
        description: row.description,
        manager_id: managerId,
        status: 'active',
      });
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};

export const importBranches = (
  data: Array<{
    code: string;
    name: string;
    region_code: string;
    city?: string;
    address?: string;
    manager_email?: string;
    phone?: string;
    status?: string;
  }>
): { success: number; failed: number } => {
  let success = 0;
  let failed = 0;

  for (const row of data) {
    try {
      if (getBranchByCode(row.code)) {
        failed++;
        continue;
      }

      const region = getRegionByCode(row.region_code);
      if (!region) {
        failed++;
        continue;
      }

      let managerId: string | undefined;
      if (row.manager_email) {
        const manager = getUserByEmail(row.manager_email);
        if (manager?.role === 'branch_manager') {
          managerId = manager.id;
        }
      }

      createBranch({
        code: row.code.toUpperCase(),
        name: row.name,
        region_id: region.id,
        city: row.city,
        address: row.address,
        manager_id: managerId,
        phone: row.phone,
        status: (row.status as Branch['status']) || 'active',
      });
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};

export const importBCKs = (
  data: Array<{
    code: string;
    name: string;
    region_code: string;
    city?: string;
    address?: string;
    manager_email?: string;
    production_capacity?: string;
    status?: string;
  }>
): { success: number; failed: number } => {
  let success = 0;
  let failed = 0;

  for (const row of data) {
    try {
      if (getBCKByCode(row.code)) {
        failed++;
        continue;
      }

      const region = getRegionByCode(row.region_code);
      if (!region) {
        failed++;
        continue;
      }

      let managerId: string | undefined;
      if (row.manager_email) {
        const manager = getUserByEmail(row.manager_email);
        if (manager?.role === 'bck_manager') {
          managerId = manager.id;
        }
      }

      createBCK({
        code: row.code.toUpperCase(),
        name: row.name,
        region_id: region.id,
        city: row.city,
        address: row.address,
        manager_id: managerId,
        production_capacity: row.production_capacity,
        status: (row.status as BCK['status']) || 'active',
        supplies_branches: [],
        certifications: [],
      });
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};

export const importSuppliers = (
  data: Array<{
    supplier_code: string;
    name: string;
    type: string;
    category?: string;
    risk_level?: string;
    contact_name?: string;
    contact_phone?: string;
    contact_email?: string;
    city?: string;
    status?: string;
  }>
): { success: number; failed: number } => {
  let success = 0;
  let failed = 0;

  for (const row of data) {
    try {
      if (getSupplierByCode(row.supplier_code)) {
        failed++;
        continue;
      }

      createSupplier({
        supplier_code: row.supplier_code.toUpperCase(),
        name: row.name,
        type: (row.type as Supplier['type']) || 'food',
        category: row.category,
        risk_level: (row.risk_level as Supplier['risk_level']) || 'medium',
        contact_name: row.contact_name,
        contact_phone: row.contact_phone,
        contact_email: row.contact_email,
        city: row.city,
        status: (row.status as Supplier['status']) || 'active',
        certifications: [],
        supplies_to: { bcks: [], branches: [] },
      });
      success++;
    } catch {
      failed++;
    }
  }

  return { success, failed };
};
