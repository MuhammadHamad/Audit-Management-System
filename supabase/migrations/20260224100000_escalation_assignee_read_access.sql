-- Allow escalation assignees (area_manager / regional_operational_manager / national_operational_manager)
-- to read the related entity + audit context for CAPAs assigned to them.
-- This fixes CAPA detail showing Entity: Unknown and Audit: — for escalation manager roles.

-- =====================
-- BRANCHES
-- =====================

DROP POLICY IF EXISTS "branches_select_escalation_assignee" ON public.branches;
CREATE POLICY "branches_select_escalation_assignee" ON public.branches
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'branch'
        AND c.entity_id = branches.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'regional_operational_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'branch'
        AND c.entity_id = branches.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'area_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'branch'
        AND c.entity_id = branches.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'national_operational_manager')
    )
  );

-- =====================
-- BCKS
-- =====================

DROP POLICY IF EXISTS "bcks_select_escalation_assignee" ON public.bcks;
CREATE POLICY "bcks_select_escalation_assignee" ON public.bcks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'bck'
        AND c.entity_id = bcks.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'regional_operational_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'bck'
        AND c.entity_id = bcks.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'area_manager')
    )
    OR EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'bck'
        AND c.entity_id = bcks.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND public.has_role(auth.uid(), 'national_operational_manager')
    )
  );

-- =====================
-- AUDITS
-- =====================

DROP POLICY IF EXISTS "audits_select_escalation_assignee" ON public.audits;
CREATE POLICY "audits_select_escalation_assignee" ON public.audits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.audit_id = audits.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND (
          public.has_role(auth.uid(), 'area_manager')
          OR public.has_role(auth.uid(), 'regional_operational_manager')
          OR public.has_role(auth.uid(), 'national_operational_manager')
        )
    )
  );

-- =====================
-- FINDINGS
-- =====================

DROP POLICY IF EXISTS "findings_select_escalation_assignee" ON public.findings;
CREATE POLICY "findings_select_escalation_assignee" ON public.findings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.finding_id = findings.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND (
          public.has_role(auth.uid(), 'area_manager')
          OR public.has_role(auth.uid(), 'regional_operational_manager')
          OR public.has_role(auth.uid(), 'national_operational_manager')
        )
    )
  );
