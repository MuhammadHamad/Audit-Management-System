-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE ENTITY TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin','audit_manager','regional_manager','auditor','branch_manager','bck_manager','staff')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Regions table
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region_id UUID REFERENCES regions(id),
  city TEXT NOT NULL,
  address TEXT,
  manager_id UUID REFERENCES users(id),
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','under_renovation','temporarily_closed')),
  opening_date DATE,
  health_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- BCKs (Central Kitchens) table
CREATE TABLE IF NOT EXISTS bcks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  region_id UUID REFERENCES regions(id),
  city TEXT NOT NULL,
  address TEXT,
  manager_id UUID REFERENCES users(id),
  phone TEXT,
  email TEXT,
  production_capacity NUMERIC,
  supplies_branches JSONB DEFAULT '[]',
  certifications JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive')),
  health_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('food','packaging','equipment','service')),
  category TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address TEXT,
  city TEXT,
  registration_number TEXT,
  contract_start DATE,
  contract_end DATE,
  supplies_to JSONB DEFAULT '{"bcks":[],"branches":[]}',
  certifications JSONB DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','inactive','under_review','suspended','blacklisted')),
  quality_score NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User assignments table
CREATE TABLE IF NOT EXISTS user_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_type TEXT NOT NULL CHECK (assigned_type IN ('region','branch','bck')),
  assigned_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, assigned_type)
);

-- ============================================
-- AUDIT PROGRAM TABLES
-- ============================================

-- Audit templates table
CREATE TABLE IF NOT EXISTS audit_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  checklist_json JSONB NOT NULL,
  scoring_config JSONB NOT NULL,
  languages JSONB DEFAULT '["en"]',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit plans table
CREATE TABLE IF NOT EXISTS audit_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  template_id UUID REFERENCES audit_templates(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  recurrence_pattern JSONB,
  scope JSONB,
  assignment_strategy TEXT CHECK (assignment_strategy IN ('auto_round_robin','assign_specific','manual')),
  assigned_auditor_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','draft')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audits table
CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_code TEXT UNIQUE NOT NULL,
  plan_id UUID REFERENCES audit_plans(id),
  template_id UUID REFERENCES audit_templates(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  entity_id UUID NOT NULL,
  auditor_id UUID REFERENCES users(id),
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','submitted','pending_verification','approved','rejected','overdue','cancelled')),
  score NUMERIC,
  pass_fail TEXT CHECK (pass_fail IN ('pass','fail')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit results table
CREATE TABLE IF NOT EXISTS audit_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  response JSONB NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  points_earned NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(audit_id, item_id)
);

-- ============================================
-- QUALITY MANAGEMENT TABLES
-- ============================================

-- Findings table
CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  finding_code TEXT UNIQUE NOT NULL,
  audit_id UUID REFERENCES audits(id),
  item_id TEXT NOT NULL,
  section_name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CAPA table
CREATE TABLE IF NOT EXISTS capa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capa_code TEXT UNIQUE NOT NULL,
  finding_id UUID REFERENCES findings(id),
  audit_id UUID REFERENCES audits(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  entity_id UUID NOT NULL,
  description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  due_date DATE NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_verification','approved','rejected','escalated','closed')),
  priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','critical')),
  evidence_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  sub_tasks JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CAPA activity table
CREATE TABLE IF NOT EXISTS capa_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capa_id UUID REFERENCES capa(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_code TEXT UNIQUE NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  entity_id UUID NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  assigned_to UUID REFERENCES users(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open','under_investigation','resolved','closed')),
  resolution_notes TEXT,
  related_audit_id UUID REFERENCES audits(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Health scores table
CREATE TABLE IF NOT EXISTS health_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('branch','bck','supplier')),
  entity_id UUID NOT NULL,
  score NUMERIC NOT NULL,
  components JSONB NOT NULL,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- ============================================
-- SYSTEM TABLES
-- ============================================

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  link_to TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE INDEX IF NOT EXISTS idx_branches_region ON branches(region_id);
CREATE INDEX IF NOT EXISTS idx_branches_manager ON branches(manager_id);
CREATE INDEX IF NOT EXISTS idx_branches_code ON branches(code);
CREATE INDEX IF NOT EXISTS idx_branches_health_score ON branches(health_score);

CREATE INDEX IF NOT EXISTS idx_bcks_region ON bcks(region_id);
CREATE INDEX IF NOT EXISTS idx_bcks_manager ON bcks(manager_id);
CREATE INDEX IF NOT EXISTS idx_bcks_health_score ON bcks(health_score);

CREATE INDEX IF NOT EXISTS idx_suppliers_quality_score ON suppliers(quality_score);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON suppliers(status);

CREATE INDEX IF NOT EXISTS idx_user_assignments_user ON user_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_type ON user_assignments(assigned_type, assigned_id);

CREATE INDEX IF NOT EXISTS idx_audit_templates_entity_type ON audit_templates(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_templates_status ON audit_templates(status);

CREATE INDEX IF NOT EXISTS idx_audits_entity ON audits(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_scheduled ON audits(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_audits_auditor ON audits(auditor_id);
CREATE INDEX IF NOT EXISTS idx_audits_code ON audits(audit_code);
CREATE INDEX IF NOT EXISTS idx_audits_completed ON audits(completed_at);

CREATE INDEX IF NOT EXISTS idx_audit_results_audit ON audit_results(audit_id);

CREATE INDEX IF NOT EXISTS idx_findings_audit ON findings(audit_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_status ON findings(status);

CREATE INDEX IF NOT EXISTS idx_capa_assigned ON capa(assigned_to);
CREATE INDEX IF NOT EXISTS idx_capa_status ON capa(status);
CREATE INDEX IF NOT EXISTS idx_capa_due_date ON capa(due_date);
CREATE INDEX IF NOT EXISTS idx_capa_entity ON capa(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_capa_priority ON capa(priority);

CREATE INDEX IF NOT EXISTS idx_capa_activity_capa ON capa_activity(capa_id);

CREATE INDEX IF NOT EXISTS idx_incidents_entity ON incidents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_assigned ON incidents(assigned_to);

CREATE INDEX IF NOT EXISTS idx_health_scores_entity ON health_scores(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bcks ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE capa ENABLE ROW LEVEL SECURITY;
ALTER TABLE capa_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all tables
CREATE POLICY "Allow authenticated access" ON users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON regions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON branches FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON bcks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON user_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON audit_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON audit_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON audits FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON audit_results FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON findings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON capa FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON capa_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON incidents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON health_scores FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated access" ON audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- STORAGE BUCKETS
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audit-evidence', 'audit-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('capa-evidence', 'capa-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for audit-evidence bucket
CREATE POLICY "Authenticated users can upload audit evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'audit-evidence');

CREATE POLICY "Authenticated users can view audit evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audit-evidence');

CREATE POLICY "Authenticated users can update audit evidence"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'audit-evidence');

CREATE POLICY "Authenticated users can delete audit evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'audit-evidence');

-- Storage policies for capa-evidence bucket
CREATE POLICY "Authenticated users can upload capa evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'capa-evidence');

CREATE POLICY "Authenticated users can view capa evidence"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'capa-evidence');

CREATE POLICY "Authenticated users can update capa evidence"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'capa-evidence');

CREATE POLICY "Authenticated users can delete capa evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'capa-evidence');

-- ============================================
-- SEED DATA
-- ============================================

INSERT INTO regions (name, code, description) VALUES
  ('Riyadh Region', 'RYD', 'Central Saudi Arabia'),
  ('Western Region', 'WST', 'Jeddah, Mecca, Medina'),
  ('Eastern Province', 'EST', 'Dammam, Khobar, Dhahran')
ON CONFLICT (code) DO NOTHING;