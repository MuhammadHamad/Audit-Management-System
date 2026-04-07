-- Fix Branch Manager audit visibility
-- Branch managers should see all audits for their branches, not just rely on entity manager assignments

-- Drop and recreate the audits_select policy to explicitly include branch managers
DROP POLICY IF EXISTS "audits_select" ON public.audits;

CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    -- Auditors can see their own audits
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR (
      -- Entity managers can see audits for their entities
      public.get_entity_manager_id(audits.entity_type, audits.entity_id) = auth.uid()
    )
    OR (
      -- Users with user_assignments can see audits for their assigned entities
      EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = audits.entity_type
          AND ua.assigned_id = audits.entity_id
      )
    )
    OR (
      -- Branch managers can see audits for their branches (via user_assignments)
      public.has_role(auth.uid(), 'branch_manager')
      AND audits.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = 'branch'
          AND ua.assigned_id = audits.entity_id
      )
    )
    OR (
      -- BCK managers can see audits for their BCKs
      public.has_role(auth.uid(), 'bck_manager')
      AND audits.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = 'bck'
          AND ua.assigned_id = audits.entity_id
      )
    )
  );

-- Also fix findings visibility for branch managers
DROP POLICY IF EXISTS "findings_select" ON public.findings;
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR EXISTS (
      -- Auditors can see findings from their audits
      SELECT 1 FROM public.audits 
      WHERE id = findings.audit_id 
      AND auditor_id = auth.uid()
    )
    OR (
      -- Entity managers can see findings for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = findings.audit_id
        AND public.get_entity_manager_id(a.entity_type, a.entity_id) = auth.uid()
      )
    )
    OR (
      -- Users with assignments can see findings for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
        WHERE a.id = findings.audit_id
        AND ua.user_id = auth.uid()
      )
    )
    OR (
      -- Branch/BCK managers can see findings for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = findings.audit_id
        AND (
          (a.entity_type = 'branch' AND public.has_role(auth.uid(), 'branch_manager'))
          OR (a.entity_type = 'bck' AND public.has_role(auth.uid(), 'bck_manager'))
        )
        AND EXISTS (
          SELECT 1 FROM public.user_assignments ua
          WHERE ua.user_id = auth.uid()
            AND ua.assigned_type = a.entity_type
            AND ua.assigned_id = a.entity_id
        )
      )
    )
  );

-- Also fix audit_results visibility for branch managers
DROP POLICY IF EXISTS "audit_results_select" ON public.audit_results;
CREATE POLICY "audit_results_select" ON public.audit_results
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR EXISTS (
      -- Auditors can see results from their audits
      SELECT 1 FROM public.audits 
      WHERE id = audit_results.audit_id 
      AND auditor_id = auth.uid()
    )
    OR (
      -- Entity managers can see results for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_results.audit_id
        AND public.get_entity_manager_id(a.entity_type, a.entity_id) = auth.uid()
      )
    )
    OR (
      -- Users with assignments can see results for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
        WHERE a.id = audit_results.audit_id
        AND ua.user_id = auth.uid()
      )
    )
    OR (
      -- Branch/BCK managers can see results for their entities
      EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_results.audit_id
        AND (
          (a.entity_type = 'branch' AND public.has_role(auth.uid(), 'branch_manager'))
          OR (a.entity_type = 'bck' AND public.has_role(auth.uid(), 'bck_manager'))
        )
        AND EXISTS (
          SELECT 1 FROM public.user_assignments ua
          WHERE ua.user_id = auth.uid()
            AND ua.assigned_type = a.entity_type
            AND ua.assigned_id = a.entity_id
        )
      )
    )
  );
