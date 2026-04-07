-- FINAL COMPREHENSIVE RLS FIX
-- This migration consolidates all RLS policies into single, non-conflicting policies
-- It removes all previous policies and creates clean, comprehensive ones

-- First, drop ALL existing SELECT policies to avoid conflicts
DROP POLICY IF EXISTS "audits_select" ON public.audits;
DROP POLICY IF EXISTS "audits_select_entity_manager" ON public.audits;
DROP POLICY IF EXISTS "audits_select_escalation_assignee" ON public.audits;

DROP POLICY IF EXISTS "branches_select" ON public.branches;
DROP POLICY IF EXISTS "branches_select_escalation_assignee" ON public.branches;

DROP POLICY IF EXISTS "findings_select" ON public.findings;
DROP POLICY IF EXISTS "findings_select_entity_manager" ON public.findings;
DROP POLICY IF EXISTS "findings_select_escalation_assignee" ON public.findings;

DROP POLICY IF EXISTS "capa_select" ON public.capa;
DROP POLICY IF EXISTS "capa_select_ops_scope" ON public.capa;
DROP POLICY IF EXISTS "capa_select_rom_scope" ON public.capa;
DROP POLICY IF EXISTS "capa_select_nom_inbox" ON public.capa;

DROP POLICY IF EXISTS "audit_results_select" ON public.audit_results;

-- Now create single, comprehensive policies for each table

-- AUDITS: Single comprehensive policy
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    -- Auditors can see their own audits
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR (
      -- Branch managers can see audits for their branches
      public.has_role(auth.uid(), 'branch_manager')
      AND audits.entity_type = 'branch'
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = audits.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      -- BCK managers can see audits for their BCKs
      public.has_role(auth.uid(), 'bck_manager')
      AND audits.entity_type = 'bck'
      AND EXISTS (
        SELECT 1 FROM public.bcks bk
        WHERE bk.id = audits.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
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
      -- Ops managers can see audits for entities in their scope
      (public.has_role(auth.uid(), 'area_manager') OR public.has_role(auth.uid(), 'regional_operational_manager') OR public.has_role(auth.uid(), 'national_operational_manager'))
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = audits.entity_type
          AND ua.assigned_id = audits.entity_id
      )
    )
  );

-- BRANCHES: Single comprehensive policy
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR manager_id = auth.uid()
    OR public.get_entity_manager_id('branch', branches.id) = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = 'branch'
        AND ua.assigned_id = branches.id
    )
    OR EXISTS (
      -- Auditors can see branches they are auditing
      SELECT 1
      FROM public.audits a
      WHERE a.entity_type = 'branch'
        AND a.entity_id = branches.id
        AND a.auditor_id = auth.uid()
    )
  );

-- FINDINGS: Single comprehensive policy
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR EXISTS (
      -- Auditors can see findings from their audits
      SELECT 1 FROM public.audits 
      WHERE id = findings.audit_id 
      AND auditor_id = auth.uid()
    )
    OR (
      -- Branch managers can see findings for their branches
      public.has_role(auth.uid(), 'branch_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'branch'
          AND EXISTS (SELECT 1 FROM public.branches b WHERE b.id = a.entity_id AND b.manager_id = auth.uid())
      )
    )
    OR (
      -- BCK managers can see findings for their BCKs
      public.has_role(auth.uid(), 'bck_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'bck'
          AND EXISTS (SELECT 1 FROM public.bcks bk WHERE bk.id = a.entity_id AND bk.manager_id = auth.uid())
      )
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
      -- Ops managers can see findings for entities in their scope
      (public.has_role(auth.uid(), 'area_manager') OR public.has_role(auth.uid(), 'regional_operational_manager') OR public.has_role(auth.uid(), 'national_operational_manager'))
      AND EXISTS (
        SELECT 1 FROM public.audits a
        JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
        WHERE a.id = findings.audit_id
        AND ua.user_id = auth.uid()
      )
    )
  );

-- CAPA: Single comprehensive policy
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR (
      -- Entity managers can see CAPAs for their entities
      public.get_entity_manager_id(capa.entity_type, capa.entity_id) = auth.uid()
    )
    OR (
      -- Users with assignments can see CAPAs for their entities
      EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = capa.entity_type
          AND ua.assigned_id = capa.entity_id
      )
    )
    OR (
      -- Branch managers can see CAPAs for their branches
      public.has_role(auth.uid(), 'branch_manager')
      AND capa.entity_type = 'branch'
      AND EXISTS (
        SELECT 1 FROM public.branches b
        WHERE b.id = capa.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      -- BCK managers can see CAPAs for their BCKs
      public.has_role(auth.uid(), 'bck_manager')
      AND capa.entity_type = 'bck'
      AND EXISTS (
        SELECT 1 FROM public.bcks bk
        WHERE bk.id = capa.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
    OR (
      -- Department members can see CAPAs assigned to their department
      EXISTS (
        SELECT 1
        FROM public.department_members dm
        WHERE dm.user_id = auth.uid()
          AND dm.department_id = capa.department_id
      )
    )
    OR (
      -- ROM can see CAPAs for branches in their region
      public.has_role(auth.uid(), 'regional_operational_manager')
      AND capa.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        JOIN public.user_assignments ua ON ua.assigned_id = b.region_id
        WHERE b.id = capa.entity_id
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
      )
    )
    OR (
      -- ROM can see CAPAs for BCKs in their region
      public.has_role(auth.uid(), 'regional_operational_manager')
      AND capa.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        JOIN public.user_assignments ua ON ua.assigned_id = bk.region_id
        WHERE bk.id = capa.entity_id
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
      )
    )
    OR (
      -- Area managers can see CAPAs for their assigned entities
      public.has_role(auth.uid(), 'area_manager')
      AND EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        WHERE ua.user_id = auth.uid()
          AND ua.assigned_type = capa.entity_type
          AND ua.assigned_id = capa.entity_id
      )
    )
    OR (
      -- NOM can see CAPAs assigned to them
      public.has_role(auth.uid(), 'national_operational_manager')
      AND capa.assigned_to = auth.uid()
    )
  );

-- AUDIT RESULTS: Single comprehensive policy
CREATE POLICY "audit_results_select" ON public.audit_results
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
    OR public.has_role(auth.uid(), 'branch_manager')
    OR public.has_role(auth.uid(), 'bck_manager')
    OR EXISTS (
      -- Auditors can see results from their audits
      SELECT 1 FROM public.audits 
      WHERE id = audit_results.audit_id 
      AND auditor_id = auth.uid()
    )
    OR (
      -- Branch managers can see results for their branches
      public.has_role(auth.uid(), 'branch_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'branch'
          AND EXISTS (SELECT 1 FROM public.branches b WHERE b.id = a.entity_id AND b.manager_id = auth.uid())
      )
    )
    OR (
      -- BCK managers can see results for their BCKs
      public.has_role(auth.uid(), 'bck_manager')
      AND EXISTS (
        SELECT 1 FROM public.audits a
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'bck'
          AND EXISTS (SELECT 1 FROM public.bcks bk WHERE bk.id = a.entity_id AND bk.manager_id = auth.uid())
      )
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
      -- Ops managers can see results for entities in their scope
      (public.has_role(auth.uid(), 'area_manager') OR public.has_role(auth.uid(), 'regional_operational_manager') OR public.has_role(auth.uid(), 'national_operational_manager'))
      AND EXISTS (
        SELECT 1 FROM public.audits a
        JOIN public.user_assignments ua ON ua.assigned_type = a.entity_type AND ua.assigned_id = a.entity_id
        WHERE a.id = audit_results.audit_id
        AND ua.user_id = auth.uid()
      )
    )
  );
