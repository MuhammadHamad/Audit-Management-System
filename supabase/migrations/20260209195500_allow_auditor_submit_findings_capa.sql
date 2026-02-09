-- Allow auditors to submit findings and CAPA for audits assigned to them

-- Findings: allow INSERT when the audit belongs to the authenticated auditor
CREATE POLICY "findings_insert_auditor" ON public.findings
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = findings.audit_id
        AND a.auditor_id = auth.uid()
    )
  );

-- CAPA: allow INSERT when the audit belongs to the authenticated auditor
CREATE POLICY "capa_insert_auditor" ON public.capa
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = capa.audit_id
        AND a.auditor_id = auth.uid()
    )
  );

-- Storage: allow auditors to upload audit evidence into the audit-evidence bucket
-- Expected object name format: {audit_id}/{item_id}/{uuid}.{ext}
CREATE POLICY "audit_evidence_upload_auditor" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id::text = split_part(name, '/', 1)
        AND a.auditor_id = auth.uid()
    )
  );
