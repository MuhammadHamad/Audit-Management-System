import { User, Region, Branch, BCK, Supplier, UserAssignment, Notification } from '@/types';

// Generate UUIDs
const generateId = () => crypto.randomUUID();

// Timestamp helpers
const now = new Date().toISOString();

// Region IDs
const rydRegionId = generateId();
const wstRegionId = generateId();
const estRegionId = generateId();

// Branch IDs
const branch1Id = generateId();
const branch2Id = generateId();

// BCK ID
const bckId = generateId();

// User IDs
const superAdminId = generateId();
const auditManagerId = generateId();
const regionalManagerId = generateId();
const auditorId = generateId();
const branchManagerId = generateId();

// Seed Users (for reference data only - authentication is handled by Supabase Auth)
export const seedUsers: User[] = [
  {
    id: superAdminId,
    email: 'admin@burgerizzr.sa',
    full_name: 'System Administrator',
    role: 'super_admin',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: auditManagerId,
    email: 'auditmanager@burgerizzr.sa',
    full_name: 'Audit Manager',
    role: 'audit_manager',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: regionalManagerId,
    email: 'regionalmgr@burgerizzr.sa',
    full_name: 'Regional Manager',
    role: 'regional_manager',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: auditorId,
    email: 'auditor1@burgerizzr.sa',
    full_name: 'Ahmed Auditor',
    role: 'auditor',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: branchManagerId,
    email: 'branchmgr@burgerizzr.sa',
    full_name: 'Branch Manager',
    role: 'branch_manager',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
];

// Seed Regions
export const seedRegions: Region[] = [
  {
    id: rydRegionId,
    name: 'Riyadh Region',
    code: 'RYD',
    description: 'Central Saudi Arabia',
    manager_id: regionalManagerId,
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: wstRegionId,
    name: 'Western Region',
    code: 'WST',
    description: 'Jeddah, Mecca, Medina',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
  {
    id: estRegionId,
    name: 'Eastern Province',
    code: 'EST',
    description: 'Dammam, Khobar, Dhahran',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
];

// Seed Branches
export const seedBranches: Branch[] = [
  {
    id: branch1Id,
    code: 'RYD-001',
    name: 'King Fahd Road Branch',
    region_id: rydRegionId,
    city: 'Riyadh',
    manager_id: branchManagerId,
    status: 'active',
    health_score: 78,
    created_at: now,
    updated_at: now,
  },
  {
    id: branch2Id,
    code: 'RYD-002',
    name: 'Olaya Street Branch',
    region_id: rydRegionId,
    city: 'Riyadh',
    status: 'active',
    health_score: 64,
    created_at: now,
    updated_at: now,
  },
];

// Seed BCKs
export const seedBCKs: BCK[] = [
  {
    id: bckId,
    code: 'BCK-RYD-01',
    name: 'Riyadh Central Kitchen',
    region_id: rydRegionId,
    city: 'Riyadh',
    status: 'active',
    health_score: 82,
    supplies_branches: [branch1Id, branch2Id],
    certifications: [
      { name: 'ISO 22000', expiry_date: '2027-06-15' },
      { name: 'HACCP', expiry_date: '2026-12-31' },
    ],
    created_at: now,
    updated_at: now,
  },
];

// Seed Suppliers
export const seedSuppliers: Supplier[] = [
  {
    id: generateId(),
    supplier_code: 'SUP-001',
    name: 'Al-Watania Poultry',
    type: 'food',
    status: 'active',
    risk_level: 'high',
    quality_score: 88,
    certifications: [
      { name: 'Halal Certified', expiry_date: '2027-01-31' },
      { name: 'SFDA Approved', expiry_date: '2026-09-30' },
    ],
    supplies_to: { bcks: [bckId], branches: [] },
    created_at: now,
    updated_at: now,
  },
  {
    id: generateId(),
    supplier_code: 'SUP-002',
    name: 'Golden Packaging Co',
    type: 'packaging',
    status: 'active',
    risk_level: 'medium',
    quality_score: 75,
    certifications: [
      { name: 'ISO 9001', expiry_date: '2026-06-30' },
    ],
    supplies_to: { bcks: [bckId], branches: [] },
    created_at: now,
    updated_at: now,
  },
];

// Seed User Assignments
export const seedUserAssignments: UserAssignment[] = [
  {
    id: generateId(),
    user_id: regionalManagerId,
    assigned_type: 'region',
    assigned_id: rydRegionId,
    created_at: now,
  },
  {
    id: generateId(),
    user_id: branchManagerId,
    assigned_type: 'branch',
    assigned_id: branch1Id,
    created_at: now,
  },
];

// Seed Notifications
export const seedNotifications: Notification[] = [
  {
    id: generateId(),
    user_id: superAdminId,
    type: 'general',
    title: 'Welcome to Burgerizzr QMS',
    message: 'Your quality management platform is ready to use.',
    read: false,
    created_at: now,
  },
  {
    id: generateId(),
    user_id: superAdminId,
    type: 'audit_submitted',
    title: 'Audit Due Soon',
    message: 'King Fahd Road Branch audit is due in 3 days.',
    link_to: '/audits',
    read: false,
    created_at: now,
  },
  {
    id: generateId(),
    user_id: branchManagerId,
    type: 'capa_assigned',
    title: 'New CAPA Assigned',
    message: 'New CAPA assigned to you for King Fahd Road Branch. Due in 7 days.',
    link_to: '/capa',
    read: false,
    created_at: now,
  },
];

// NOTE: User credentials are now managed by Supabase Auth
// Do NOT store passwords in client-side code
// Users must be created through Supabase Auth dashboard or admin API
