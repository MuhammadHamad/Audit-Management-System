-- Allow branch_manager/bck_manager to read auditor profiles for audits they can access
-- and allow them to view audit-evidence storage objects for those audits.

-- USERS: allow reading auditor rows when user is the entity manager for the audit's entity
DROP POLICY IF EXISTS "users_select_audit_entity_manager" ON public.users;
CREATE POLICY "users_select_audit_entity_manager" ON public.users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.auditor_id = users.id
        AND (
          (
            public.has_role(auth.uid(), 'branch_manager')
            AND a.entity_type = 'branch'
            AND EXISTS (
              SELECT 1
              FROM public.branches b
              WHERE b.id = a.entity_id
                AND b.manager_id = auth.uid()
            )
          )
          OR (
            public.has_role(auth.uid(), 'bck_manager')
            AND a.entity_type = 'bck'
            AND EXISTS (
              SELECT 1
              FROM public.bcks bk
              WHERE bk.id = a.entity_id
                AND bk.manager_id = auth.uid()
            )
          )
        )
    )
  );

-- STORAGE: audit-evidence view for entity managers as well
DROP POLICY IF EXISTS "audit_evidence_select_entity_manager" ON storage.objects;
CREATE POLICY "audit_evidence_select_entity_manager" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audit-evidence'
    AND EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id::text = split_part(name, '/', 1)
        AND (
          (
            public.has_role(auth.uid(), 'branch_manager')
            AND a.entity_type = 'branch'
            AND EXISTS (
              SELECT 1
              FROM public.branches b
              WHERE b.id = a.entity_id
                AND b.manager_id = auth.uid()
            )
          )
          OR (
            public.has_role(auth.uid(), 'bck_manager')
            AND a.entity_type = 'bck'
            AND EXISTS (
              SELECT 1
              FROM public.bcks bk
              WHERE bk.id = a.entity_id
                AND bk.manager_id = auth.uid()
            )
          )
          OR public.has_role(auth.uid(), 'audit_manager')
          OR public.has_role(auth.uid(), 'head_of_quality')
        )
    )
  );
