-- Allow staff users to view/update CAPAs when they have an assigned sub-task

-- CAPA: allow SELECT when user is assigned_to OR admin/regional_manager OR has a sub-task assigned
CREATE POLICY "capa_select_staff_subtask" ON public.capa
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(capa.sub_tasks, '[]'::jsonb)) st
      WHERE st->>'assigned_to_user_id' = auth.uid()::text
    )
  );

-- CAPA: allow UPDATE when user had a sub-task assigned on the existing row
CREATE POLICY "capa_update_staff_subtask" ON public.capa
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(capa.sub_tasks, '[]'::jsonb)) st
      WHERE st->>'assigned_to_user_id' = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(capa.sub_tasks, '[]'::jsonb)) st
      WHERE st->>'assigned_to_user_id' = auth.uid()::text
    )
  );

-- CAPA activity: allow staff to view activities for CAPAs they have a sub-task on
CREATE POLICY "capa_activity_select_staff_subtask" ON public.capa_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id = capa_activity.capa_id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.sub_tasks, '[]'::jsonb)) st
          WHERE st->>'assigned_to_user_id' = auth.uid()::text
        )
    )
  );

-- CAPA activity: allow staff to insert activity rows for CAPAs they have a sub-task on
CREATE POLICY "capa_activity_insert_staff_subtask" ON public.capa_activity
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id = capa_activity.capa_id
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.sub_tasks, '[]'::jsonb)) st
          WHERE st->>'assigned_to_user_id' = auth.uid()::text
        )
    )
  );

-- Storage: allow staff to upload/view CAPA evidence when they have a sub-task on the CAPA
-- Expected object name format: {capa_id}/{...}
CREATE POLICY "capa_evidence_upload_staff_subtask" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.sub_tasks, '[]'::jsonb)) st
          WHERE st->>'assigned_to_user_id' = auth.uid()::text
        )
    )
  );

CREATE POLICY "capa_evidence_select_staff_subtask" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(c.sub_tasks, '[]'::jsonb)) st
          WHERE st->>'assigned_to_user_id' = auth.uid()::text
        )
    )
  );
