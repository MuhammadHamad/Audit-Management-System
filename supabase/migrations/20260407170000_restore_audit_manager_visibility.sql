-- Restore audit visibility for audit managers and head of quality
-- This migration adds policies to allow audit managers and head of quality to see all audits

-- Drop existing restrictive audits_select policy
DROP POLICY IF EXISTS "audits_select" ON public.audits;

-- Create comprehensive audits_select policy that allows:
-- 1. Auditors to see their own audits
-- 2. Admins to see all audits
-- 3. Regional managers to see audits in their region
-- 4. Audit managers and head of quality to see all audits
-- 5. Users assigned to entities (branches/bcks) to see audits for their entities
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    -- Auditors can see their own audits
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
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
  );

-- Also fix branches visibility if needed
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
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

-- Fix findings visibility as well
DROP POLICY IF EXISTS "findings_select" ON public.findings;
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
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
  );

-- Ensure CAPA visibility includes audit managers and head of quality
DROP POLICY IF EXISTS "capa_select" ON public.capa;
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
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
      -- Department members can see CAPAs assigned to their department
      EXISTS (
        SELECT 1
        FROM public.department_members dm
        WHERE dm.user_id = auth.uid()
          AND dm.department_id = capa.department_id
      )
    )
  );
