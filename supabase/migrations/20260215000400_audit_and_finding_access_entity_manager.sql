-- Allow entity managers (branch_manager / bck_manager) to read audits & findings for their entity
-- This is needed so CAPA detail can show audit_code and finding details for branch managers.

-- =====================
-- AUDITS
-- =====================

DROP POLICY IF EXISTS "audits_select_entity_manager" ON public.audits;
CREATE POLICY "audits_select_entity_manager" ON public.audits
  FOR SELECT TO authenticated
  USING (
    public.get_entity_manager_id(audits.entity_type, audits.entity_id) = auth.uid()
  );

-- =====================
-- FINDINGS
-- =====================

DROP POLICY IF EXISTS "findings_select_entity_manager" ON public.findings;
CREATE POLICY "findings_select_entity_manager" ON public.findings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = findings.audit_id
        AND public.get_entity_manager_id(a.entity_type, a.entity_id) = auth.uid()
    )
  );
