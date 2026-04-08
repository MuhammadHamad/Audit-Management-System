-- Fix cross-branch data leakage for branch_manager by scoping SELECT policies to the entity they manage.

-- AUDITS
DROP POLICY IF EXISTS "audits_select" ON public.audits;
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND audits.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        WHERE b.id = audits.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND audits.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        WHERE bk.id = audits.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = audits.entity_type
        AND ua.assigned_id = audits.entity_id
    )
  );

-- FINDINGS
DROP POLICY IF EXISTS "findings_select" ON public.findings;
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = findings.audit_id
        AND a.auditor_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.branches b ON b.id = a.entity_id
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'branch'
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.bcks bk ON bk.id = a.entity_id
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'bck'
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      JOIN public.user_assignments ua
        ON ua.assigned_type = a.entity_type
       AND ua.assigned_id = a.entity_id
      WHERE a.id = findings.audit_id
        AND ua.user_id = auth.uid()
    )
  );

-- AUDIT RESULTS
DROP POLICY IF EXISTS "audit_results_select" ON public.audit_results;
CREATE POLICY "audit_results_select" ON public.audit_results
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_operational_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'area_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'national_operational_manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = audit_results.audit_id
        AND a.auditor_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.branches b ON b.id = a.entity_id
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'branch'
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.bcks bk ON bk.id = a.entity_id
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'bck'
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = audit_results.audit_id
        AND public.get_entity_manager_id(a.entity_type, a.entity_id) = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      JOIN public.user_assignments ua
        ON ua.assigned_type = a.entity_type
       AND ua.assigned_id = a.entity_id
      WHERE a.id = audit_results.audit_id
        AND ua.user_id = auth.uid()
    )
    OR (
      (
        public.has_role(auth.uid(), 'area_manager'::public.app_role)
        OR public.has_role(auth.uid(), 'regional_operational_manager'::public.app_role)
        OR public.has_role(auth.uid(), 'national_operational_manager'::public.app_role)
      )
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.user_assignments ua
          ON ua.assigned_type = a.entity_type
         AND ua.assigned_id = a.entity_id
        WHERE a.id = audit_results.audit_id
          AND ua.user_id = auth.uid()
      )
    )
  );

-- CAPA
DROP POLICY IF EXISTS "capa_select" ON public.capa;
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND capa.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        WHERE b.id = capa.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND capa.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        WHERE bk.id = capa.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = capa.entity_type
        AND ua.assigned_id = capa.entity_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.department_members dm
      WHERE dm.user_id = auth.uid()
        AND dm.department_id = capa.department_id
    )
  );
