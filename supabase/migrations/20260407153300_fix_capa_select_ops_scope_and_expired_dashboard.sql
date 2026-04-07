-- Fix: allow ops escalation roles (area/ROM/NOM) to SELECT CAPAs in their scope
-- so their dashboards can correctly show CAPA Overview counts.
--
-- Existing baseline policy (capa_select) only allows:
-- - assigned_to = auth.uid()
-- - admin
-- - regional_manager
--
-- This migration adds a separate SELECT policy that grants visibility to:
-- - Area Manager: CAPAs for branches/BCKs assigned to them
-- - Regional Operational Manager: CAPAs for regions assigned to them OR CAPAs assigned directly to them
-- - National Operational Manager: CAPAs assigned directly to them
--
-- Note: We keep this conservative; it doesn't grant global visibility.

CREATE POLICY "capa_select_ops_scope" ON public.capa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'area_manager')
    AND EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = capa.entity_type
        AND ua.assigned_id = capa.entity_id
    )
  );

CREATE POLICY "capa_select_rom_scope" ON public.capa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'regional_operational_manager')
    AND (
      capa.assigned_to = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        JOIN public.branches b ON b.id = capa.entity_id
        WHERE capa.entity_type = 'branch'
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
          AND ua.assigned_id = b.region_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_assignments ua
        JOIN public.bcks bk ON bk.id = capa.entity_id
        WHERE capa.entity_type = 'bck'
          AND ua.user_id = auth.uid()
          AND ua.assigned_type = 'region'
          AND ua.assigned_id = bk.region_id
      )
    )
  );

CREATE POLICY "capa_select_nom_inbox" ON public.capa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'national_operational_manager')
    AND capa.assigned_to = auth.uid()
  );
