-- Allow entity managers (branch_manager / bck_manager) to access CAPAs for their entity
-- Uses SECURITY DEFINER RPC get_entity_manager_id(entity_type, entity_id) to avoid RLS limitations.

-- =====================
-- CAPA
-- =====================

DROP POLICY IF EXISTS "capa_select_entity_manager" ON public.capa;
CREATE POLICY "capa_select_entity_manager" ON public.capa
  FOR SELECT TO authenticated
  USING (
    public.get_entity_manager_id(capa.entity_type, capa.entity_id) = auth.uid()
  );

DROP POLICY IF EXISTS "capa_update_entity_manager" ON public.capa;
CREATE POLICY "capa_update_entity_manager" ON public.capa
  FOR UPDATE TO authenticated
  USING (
    public.get_entity_manager_id(capa.entity_type, capa.entity_id) = auth.uid()
  )
  WITH CHECK (
    public.get_entity_manager_id(capa.entity_type, capa.entity_id) = auth.uid()
  );

-- =====================
-- CAPA ACTIVITY
-- =====================

DROP POLICY IF EXISTS "capa_activity_select_entity_manager" ON public.capa_activity;
CREATE POLICY "capa_activity_select_entity_manager" ON public.capa_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id = capa_activity.capa_id
        AND public.get_entity_manager_id(c.entity_type, c.entity_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS "capa_activity_insert_entity_manager" ON public.capa_activity;
CREATE POLICY "capa_activity_insert_entity_manager" ON public.capa_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id = capa_activity.capa_id
        AND public.get_entity_manager_id(c.entity_type, c.entity_id) = auth.uid()
    )
  );

-- =====================
-- STORAGE: capa-evidence
-- =====================
-- Expected object name format: {capa_id}/{...}

DROP POLICY IF EXISTS "capa_evidence_upload_entity_manager" ON storage.objects;
CREATE POLICY "capa_evidence_upload_entity_manager" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND public.get_entity_manager_id(c.entity_type, c.entity_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS "capa_evidence_select_entity_manager" ON storage.objects;
CREATE POLICY "capa_evidence_select_entity_manager" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND public.get_entity_manager_id(c.entity_type, c.entity_id) = auth.uid()
    )
  );
