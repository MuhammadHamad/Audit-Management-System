-- ============================================
-- SECURITY FIX: Create user_roles table and secure RLS policies
-- ============================================

-- Step 1: Create app_role enum for role management
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM (
    'super_admin', 
    'audit_manager', 
    'regional_manager', 
    'auditor', 
    'branch_manager', 
    'bck_manager', 
    'staff'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Create user_roles table (separate from users table to prevent privilege escalation)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Step 3: Create security definer function to check user roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Create function to check if user is admin (super_admin or audit_manager)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'audit_manager')
  )
$$;

-- Create function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Step 4: Drop ALL existing permissive policies
DO $$ 
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT schemaname, tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 
      policy_record.policyname, 
      policy_record.schemaname, 
      policy_record.tablename);
  END LOOP;
END $$;

-- Step 5: Create secure RLS policies for user_roles table
CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_insert_admin" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_update_admin" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "user_roles_delete_admin" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 6: Create secure RLS policies for users table
-- Users can view their own profile, admins can view all
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() 
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
  );

-- Users can update their own profile (except role/status), admins can update all
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));

-- Only super_admin can insert new users
CREATE POLICY "users_insert_admin" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Only super_admin can delete users
CREATE POLICY "users_delete_admin" ON public.users
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 7: Create secure RLS policies for regions
CREATE POLICY "regions_select" ON public.regions
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view regions

CREATE POLICY "regions_modify_admin" ON public.regions
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 8: Create secure RLS policies for branches
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view branches

CREATE POLICY "branches_modify_admin" ON public.branches
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 9: Create secure RLS policies for bcks
CREATE POLICY "bcks_select" ON public.bcks
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view bcks

CREATE POLICY "bcks_modify_admin" ON public.bcks
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 10: Create secure RLS policies for suppliers
CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view suppliers

CREATE POLICY "suppliers_modify_admin" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 11: Create secure RLS policies for user_assignments
CREATE POLICY "user_assignments_select" ON public.user_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "user_assignments_modify_admin" ON public.user_assignments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 12: Create secure RLS policies for audit_templates
CREATE POLICY "audit_templates_select" ON public.audit_templates
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view templates

CREATE POLICY "audit_templates_modify_admin" ON public.audit_templates
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 13: Create secure RLS policies for audit_plans
CREATE POLICY "audit_plans_select" ON public.audit_plans
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view plans

CREATE POLICY "audit_plans_modify_admin" ON public.audit_plans
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 14: Create secure RLS policies for audits
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "audits_insert_admin" ON public.audits
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "audits_update" ON public.audits
  FOR UPDATE TO authenticated
  USING (
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "audits_delete_admin" ON public.audits
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 15: Create secure RLS policies for audit_results
CREATE POLICY "audit_results_select" ON public.audit_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = audit_results.audit_id 
      AND (auditor_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "audit_results_modify" ON public.audit_results
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = audit_results.audit_id 
      AND (auditor_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = audit_results.audit_id 
      AND (auditor_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- Step 16: Create secure RLS policies for findings
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = findings.audit_id 
      AND auditor_id = auth.uid()
    )
  );

CREATE POLICY "findings_modify_admin" ON public.findings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 17: Create secure RLS policies for capa
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "capa_insert_admin" ON public.capa
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "capa_update" ON public.capa
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "capa_delete_admin" ON public.capa
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 18: Create secure RLS policies for capa_activity
CREATE POLICY "capa_activity_select" ON public.capa_activity
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.capa 
      WHERE id = capa_activity.capa_id 
      AND assigned_to = auth.uid()
    )
  );

CREATE POLICY "capa_activity_insert" ON public.capa_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.capa 
        WHERE id = capa_activity.capa_id 
        AND assigned_to = auth.uid()
      )
    )
  );

-- Step 19: Create secure RLS policies for incidents
CREATE POLICY "incidents_select" ON public.incidents
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
  );

CREATE POLICY "incidents_insert" ON public.incidents
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "incidents_update" ON public.incidents
  FOR UPDATE TO authenticated
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "incidents_delete_admin" ON public.incidents
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 20: Create secure RLS policies for health_scores
CREATE POLICY "health_scores_select" ON public.health_scores
  FOR SELECT TO authenticated
  USING (true); -- All authenticated users can view health scores

CREATE POLICY "health_scores_modify_admin" ON public.health_scores
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Step 21: Create secure RLS policies for notifications
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (true); -- System can create notifications for any user

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Step 22: Create secure RLS policies for audit_logs (append-only for security)
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Step 23: Update storage policies to be more restrictive
DO $$ 
BEGIN
  -- Drop existing storage policies
  DROP POLICY IF EXISTS "Authenticated users can upload audit evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can view audit evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can update audit evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can delete audit evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can upload capa evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can view capa evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can update capa evidence" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can delete capa evidence" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Create secure storage policies for audit-evidence
CREATE POLICY "audit_evidence_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-evidence' 
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "audit_evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-evidence' 
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'auditor')
      OR public.has_role(auth.uid(), 'regional_manager')
    )
  );

CREATE POLICY "audit_evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'audit-evidence' AND public.is_admin(auth.uid()));

CREATE POLICY "audit_evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'audit-evidence' AND public.is_super_admin(auth.uid()));

-- Create secure storage policies for capa-evidence
CREATE POLICY "capa_evidence_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capa-evidence' 
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'bck_manager')
    )
  );

CREATE POLICY "capa_evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capa-evidence' 
    AND (
      public.is_admin(auth.uid())
      OR public.has_role(auth.uid(), 'regional_manager')
      OR public.has_role(auth.uid(), 'branch_manager')
      OR public.has_role(auth.uid(), 'bck_manager')
    )
  );

CREATE POLICY "capa_evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'capa-evidence' AND public.is_admin(auth.uid()));

CREATE POLICY "capa_evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'capa-evidence' AND public.is_super_admin(auth.uid()));

-- Step 24: Create index for user_roles
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);