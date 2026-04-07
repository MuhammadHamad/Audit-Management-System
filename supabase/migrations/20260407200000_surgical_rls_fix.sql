-- SURGICAL FIX: Remove only conflicting SELECT policies
-- Keep existing INSERT/UPDATE/DELETE policies, only fix SELECT visibility

-- Drop conflicting SELECT policies on CAPA (keep INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "capa_select" ON public.capa;
DROP POLICY IF EXISTS "capa_select_dept_member" ON public.capa;
DROP POLICY IF EXISTS "capa_select_entity_manager" ON public.capa;
DROP POLICY IF EXISTS "capa_select_staff_subtask" ON public.capa;

-- Create single comprehensive CAPA SELECT policy
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    -- Direct assignment
    assigned_to = auth.uid()
    -- Admin and management roles
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    -- Entity managers
    OR public.get_entity_manager_id(entity_type, entity_id) = auth.uid()
    -- User assignments
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = entity_type
        AND ua.assigned_id = entity_id
    )
    -- Department members
    OR EXISTS (
      SELECT 1
      FROM public.department_members dm
      WHERE dm.user_id = auth.uid()
        AND dm.department_id = department_id
    )
    -- Branch managers via branches.manager_id
    OR (
      public.has_role(auth.uid(), 'branch_manager')
      AND entity_type = 'branch'
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = entity_id AND b.manager_id = auth.uid()
      )
    )
    -- BCK managers via bcks.manager_id
    OR (
      public.has_role(auth.uid(), 'bck_manager')
      AND entity_type = 'bck'
      AND EXISTS (
        SELECT 1 FROM public.bcks bk
        WHERE bk.id = entity_id AND bk.manager_id = auth.uid()
      )
    )
    -- ROM can see CAPAs in their region
    OR (
      public.has_role(auth.uid(), 'regional_operational_manager')
      AND entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        JOIN public.user_assignments ua ON ua.assigned_id = b.region_id
        WHERE b.id = entity_id
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
      )
    )
    OR (
      public.has_role(auth.uid(), 'regional_operational_manager')
      AND entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        JOIN public.user_assignments ua ON ua.assigned_id = bk.region_id
        WHERE bk.id = entity_id
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
      )
    )
    -- Area managers via assignments
    OR (
      public.has_role(auth.uid(), 'area_manager')
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = entity_type
          AND ua.assigned_id = entity_id
      )
    )
    -- NOM with direct assignment
    OR (
      public.has_role(auth.uid(), 'national_operational_manager')
      AND assigned_to = auth.uid()
    )
  );

-- Drop conflicting SELECT policies on audits (keep INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "audits_select" ON public.audits;

-- Create single comprehensive audits SELECT policy
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    -- Auditors see their own audits
    auditor_id = auth.uid()
    -- Admin and management roles
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    -- Entity managers
    OR public.get_entity_manager_id(entity_type, entity_id) = auth.uid()
    -- User assignments
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = entity_type
        AND ua.assigned_id = entity_id
    )
    -- Branch managers via branches.manager_id
    OR (
      public.has_role(auth.uid(), 'branch_manager')
      AND entity_type = 'branch'
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = entity_id AND b.manager_id = auth.uid()
      )
    )
    -- BCK managers via bcks.manager_id
    OR (
      public.has_role(auth.uid(), 'bck_manager')
      AND entity_type = 'bck'
      AND EXISTS (
        SELECT 1 FROM public.bcks bk
        WHERE bk.id = entity_id AND bk.manager_id = auth.uid()
      )
    )
    -- Ops managers via assignments
    OR (
      (public.has_role(auth.uid(), 'area_manager') 
       OR public.has_role(auth.uid(), 'regional_operational_manager') 
       OR public.has_role(auth.uid(), 'national_operational_manager'))
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = entity_type
          AND ua.assigned_id = entity_id
      )
    )
  );

-- Drop conflicting SELECT policies on findings (keep INSERT/UPDATE/DELETE)
DROP POLICY IF EXISTS "findings_select" ON public.findings;

-- Create single comprehensive findings SELECT policy
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    -- Admin and management roles
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    -- Auditors see findings from their audits
    OR EXISTS (
      SELECT 1 FROM public.audits 
      WHERE id = audit_id 
      AND auditor_id = auth.uid()
    )
    -- Entity managers
    OR EXISTS (
      SELECT 1 FROM public.audits a
      WHERE a.id = audit_id
      AND public.get_entity_manager_id(a.entity_type, a.entity_id) = auth.uid()
    )
    -- User assignments
    OR EXISTS (
      SELECT 1 FROM public.audits a
      JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
      WHERE a.id = audit_id
      AND ua.user_id = auth.uid()
    )
    -- Branch managers via branches.manager_id
    OR (
      public.has_role(auth.uid(), 'branch_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_id
          AND a.entity_type = 'branch'
          AND EXISTS (SELECT 1 FROM public.branches b WHERE b.id = a.entity_id AND b.manager_id = auth.uid())
      )
    )
    -- BCK managers via bcks.manager_id
    OR (
      public.has_role(auth.uid(), 'bck_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_id
          AND a.entity_type = 'bck'
          AND EXISTS (SELECT 1 FROM public.bcks bk WHERE bk.id = a.entity_id AND bk.manager_id = auth.uid())
      )
    )
    -- Ops managers via assignments
    OR (
      (public.has_role(auth.uid(), 'area_manager') 
       OR public.has_role(auth.uid(), 'regional_operational_manager') 
       OR public.has_role(auth.uid(), 'national_operational_manager'))
      AND EXISTS (
        SELECT 1 FROM public.audits a
        JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
        WHERE a.id = audit_id
        AND ua.user_id = auth.uid()
      )
    )
  );
