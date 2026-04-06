-- Allow auditors to read branch rows for branches that they are auditing
-- Fixes UI showing "Unknown Branch" when entity lookup relies on cached branches list.

DROP POLICY IF EXISTS "branches_select" ON public.branches;

CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR manager_id = auth.uid()
    OR has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = 'branch'
        AND ua.assigned_id = branches.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.auditor_id = auth.uid()
        AND a.entity_type = 'branch'
        AND a.entity_id = branches.id
    )
  );
