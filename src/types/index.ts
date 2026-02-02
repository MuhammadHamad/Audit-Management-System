export type UserRole = 
  | 'super_admin' 
  | 'audit_manager' 
  | 'regional_manager' 
  | 'auditor' 
  | 'branch_manager' 
  | 'bck_manager' 
  | 'staff';

export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  avatar_url?: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface Region {
  id: string;
  name: string;
  code: string;
  description?: string;
  manager_id?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export type BranchStatus = 'active' | 'inactive' | 'under_renovation' | 'temporarily_closed';

export interface Branch {
  id: string;
  code: string;
  name: string;
  region_id: string;
  address?: string;
  city?: string;
  gps_lat?: number;
  gps_lng?: number;
  manager_id?: string;
  phone?: string;
  email?: string;
  status: BranchStatus;
  opening_date?: string;
  health_score: number;
  last_audit_date?: string;
  created_at: string;
  updated_at: string;
}

export type BCKStatus = 'active' | 'inactive' | 'under_maintenance';

export interface Certification {
  name: string;
  expiry_date: string;
  document_url?: string;
}

export interface BCK {
  id: string;
  code: string;
  name: string;
  region_id: string;
  address?: string;
  city?: string;
  gps_lat?: number;
  gps_lng?: number;
  manager_id?: string;
  phone?: string;
  email?: string;
  status: BCKStatus;
  production_capacity?: string;
  supplies_branches: string[];
  certifications: Certification[];
  health_score: number;
  last_audit_date?: string;
  created_at: string;
  updated_at: string;
}

export type SupplierType = 'food' | 'packaging' | 'equipment' | 'service';
export type SupplierStatus = 'active' | 'inactive' | 'under_review' | 'suspended' | 'blacklisted';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface Supplier {
  id: string;
  supplier_code: string;
  name: string;
  type: SupplierType;
  category?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  registration_number?: string;
  certifications: Certification[];
  contract_start?: string;
  contract_end?: string;
  status: SupplierStatus;
  risk_level: RiskLevel;
  supplies_to: {
    bcks: string[];
    branches: string[];
  };
  quality_score: number;
  last_audit_date?: string;
  created_at: string;
  updated_at: string;
}

export type AssignedType = 'region' | 'branch' | 'bck' | 'supplier';

export interface UserAssignment {
  id: string;
  user_id: string;
  assigned_type: AssignedType;
  assigned_id: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  link_to?: string;
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  module: string;
  record_id?: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export type EntityType = 'branch' | 'bck' | 'supplier' | 'region';

export interface HealthScore {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  score: number;
  components: Record<string, number>;
  calculated_at: string;
}
