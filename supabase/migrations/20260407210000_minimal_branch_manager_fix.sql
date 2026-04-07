-- MINIMAL BRANCH MANAGER FIX
-- Simple, direct policies to ensure branch managers can see their data

-- Drop all existing SELECT policies to avoid conflicts
DROP POLICY IF EXISTS "capa_select" ON public.capa;
DROP POLICY IF EXISTS "capa_select_dept_member" ON public.capa;
DROP POLICY IF EXISTS "capa_select_entity_manager" ON public.capa;
DROP POLICY IF EXISTS "capa_select_staff_subtask" ON public.capa;

DROP POLICY IF EXISTS "audits_select" ON public.audits;

DROP POLICY IF EXISTS "findings_select" ON public.findings;

-- Simple CAPA policy - focus on basic visibility
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    -- Direct assignment
    assigned_to = auth.uid()
    -- Admin roles
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_manager')
    -- Branch managers - simple approach
    OR public.has_role(auth.uid(), 'branch_manager')
    -- Anyone assigned to the entity
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = entity_type
        AND ua.assigned_id = entity_id
    )
  );

-- Simple audits policy
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    -- Auditors see their own audits
    auditor_id = auth.uid()
    -- Admin roles
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_manager')
    -- Branch managers - simple approach
    OR public.has_role(auth.uid(), 'branch_manager')
    -- Anyone assigned to the entity
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = entity_type
        AND ua.assigned_id = entity_id
    )
  );

-- Simple findings policy
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    -- Admin roles
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_manager')
    -- Auditors see findings from their audits
    OR EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = audit_id 
      AND auditor_id = auth.uid()
    )
    -- Branch managers - simple approach
    OR public.has_role(auth.uid(), 'branch_manager')
    -- Anyone assigned to the entity
    OR EXISTS (
      SELECT 1 FROM public.audits a
      JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
      WHERE a.id = audit_id
      AND ua.user_id = auth.uid()
    )
  );
