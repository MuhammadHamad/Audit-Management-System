-- Fix Regional Operations Manager CAPA visibility
-- The current ROM policy is too restrictive - it only shows CAPAs directly assigned
-- or for entities with specific region assignments. ROM should see ALL CAPAs in their region.

-- Drop the restrictive ROM policy
DROP POLICY IF EXISTS "capa_select_rom_scope" ON public.capa;

-- Create a more comprehensive ROM policy
CREATE POLICY "capa_select_rom_scope" ON public.capa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'regional_operational_manager')
    AND (
      -- ROM can see CAPAs directly assigned to them
      capa.assigned_to = auth.uid()
      OR (
        -- ROM can see ALL CAPAs for branches in their assigned regions
        capa.entity_type = 'branch'
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
        -- ROM can see ALL CAPAs for BCKs in their assigned regions
        capa.entity_type = 'bck'
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
        -- ROM can see CAPAs escalated to them (not directly assigned)
        capa.escalated_to_role = 'regional_operational_manager'
      )
    )
  );

-- Also ensure the base capa_select policy includes regional_operational_manager
-- This might be missing from the original policy
DROP POLICY IF EXISTS "capa_select" ON public.capa;

CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'regional_manager')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
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
