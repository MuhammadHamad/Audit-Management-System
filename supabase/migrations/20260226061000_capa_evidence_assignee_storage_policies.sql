-- Allow CAPA assignees (e.g., escalation roles) to upload/view CAPA evidence in the capa-evidence bucket
-- Expected object name format: {capa_id}/{...}

DROP POLICY IF EXISTS "capa_evidence_upload_assignee" ON storage.objects;
CREATE POLICY "capa_evidence_upload_assignee" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS "capa_evidence_select_assignee" ON storage.objects;
CREATE POLICY "capa_evidence_select_assignee" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'capa-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.capa c
      WHERE c.id::text = split_part(name, '/', 1)
        AND c.assigned_to = auth.uid()
    )
  );
