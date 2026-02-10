-- Allow auditors to view (SELECT) audit evidence they uploaded for audits assigned to them
-- Required for createSignedUrl() and for rendering persisted evidence after reload

CREATE POLICY "audit_evidence_select_auditor" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id::text = split_part(name, '/', 1)
        AND a.auditor_id = auth.uid()
    )
  );
