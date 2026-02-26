-- Fix: "infinite recursion detected in policy for relation capa" during auditor submission.
-- Cause: capa_insert_auditor RLS policy queries public.audits, and an audits SELECT policy
-- (audits_select_escalation_assignee) queries public.capa, creating a policy recursion loop.
--
-- Solution: use a SECURITY DEFINER helper to validate audit ownership so the auditor INSERT
-- policies do not rely on audits RLS evaluation.

CREATE OR REPLACE FUNCTION public.is_auditor_for_audit(_audit_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.audits a
    WHERE a.id = _audit_id
      AND a.auditor_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_auditor_for_audit(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_auditor_for_audit(UUID, UUID) TO authenticated;

-- Recreate auditor insert policies to use helper (prevents recursion)

DROP POLICY IF EXISTS "findings_insert_auditor" ON public.findings;
CREATE POLICY "findings_insert_auditor" ON public.findings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_auditor_for_audit(findings.audit_id, auth.uid())
  );

DROP POLICY IF EXISTS "capa_insert_auditor" ON public.capa;
CREATE POLICY "capa_insert_auditor" ON public.capa
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_auditor_for_audit(capa.audit_id, auth.uid())
  );

-- Storage: allow auditors to upload audit evidence into the audit-evidence bucket
-- Expected object name format: {audit_id}/{item_id}/{uuid}.{ext}
DROP POLICY IF EXISTS "audit_evidence_upload_auditor" ON storage.objects;
CREATE POLICY "audit_evidence_upload_auditor" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'audit-evidence'
    AND public.is_auditor_for_audit(split_part(name, '/', 1)::uuid, auth.uid())
  );
