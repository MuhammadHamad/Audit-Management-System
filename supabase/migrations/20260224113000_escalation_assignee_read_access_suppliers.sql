-- Allow escalation assignees (area_manager / regional_operational_manager / national_operational_manager)
-- to read supplier entity context for CAPAs assigned to them.
-- This fixes CAPA detail showing Entity: Unknown for supplier CAPAs for escalation manager roles.

-- =====================
-- SUPPLIERS
-- =====================

DROP POLICY IF EXISTS "suppliers_select_escalation_assignee" ON public.suppliers;
CREATE POLICY "suppliers_select_escalation_assignee" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.entity_type = 'supplier'
        AND c.entity_id = suppliers.id
        AND c.assigned_to = auth.uid()
        AND c.status NOT IN ('closed', 'approved', 'expired')
        AND (
          public.has_role(auth.uid(), 'area_manager')
          OR public.has_role(auth.uid(), 'regional_operational_manager')
          OR public.has_role(auth.uid(), 'national_operational_manager')
        )
    )
  );
