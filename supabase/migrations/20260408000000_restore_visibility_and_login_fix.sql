-- Restore data visibility under RLS (branches/audits/CAPA/findings/results) and stabilize login.

-- =====================
-- USERS (login stability)
-- =====================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND cmd = 'SELECT'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users;', r.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_select_admin" ON public.users;
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS "users_insert_own" ON public.users;
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_email text;
  v_full_name text;
  v_existing public.users;
  v_inserted public.users;
BEGIN
  v_id := auth.uid();
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_existing FROM public.users WHERE id = v_id;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  v_email := nullif(auth.jwt() ->> 'email', '');
  v_full_name := nullif((auth.jwt() -> 'user_metadata' ->> 'full_name'), '');

  IF v_full_name IS NULL THEN
    v_full_name := COALESCE(v_email, 'User');
  END IF;
  IF v_email IS NULL THEN
    v_email := v_id::text;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, status)
  VALUES (v_id, v_email, v_full_name, 'staff', 'active')
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.users.email),
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name)
  RETURNING * INTO v_inserted;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- =====================
-- BRANCHES / BCKS (needed for manager-scoped EXISTS checks)
-- =====================
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR manager_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = 'branch'
        AND ua.assigned_id = branches.id
    )
  );

DROP POLICY IF EXISTS "bcks_select" ON public.bcks;
CREATE POLICY "bcks_select" ON public.bcks
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR manager_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = 'bck'
        AND ua.assigned_id = bcks.id
    )
  );

-- =====================
-- AUDITS / FINDINGS / RESULTS / CAPA (manager-scoped, no cross-branch leakage)
-- =====================
DROP POLICY IF EXISTS "audits_select" ON public.audits;
CREATE POLICY "audits_select" ON public.audits
  FOR SELECT TO authenticated
  USING (
    auditor_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND audits.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        WHERE b.id = audits.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND audits.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        WHERE bk.id = audits.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = audits.entity_type
        AND ua.assigned_id = audits.entity_id
    )
  );

DROP POLICY IF EXISTS "findings_select" ON public.findings;
CREATE POLICY "findings_select" ON public.findings
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = findings.audit_id
        AND a.auditor_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.branches b ON b.id = a.entity_id
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'branch'
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.bcks bk ON bk.id = a.entity_id
        WHERE a.id = findings.audit_id
          AND a.entity_type = 'bck'
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      JOIN public.user_assignments ua
        ON ua.assigned_type = a.entity_type
       AND ua.assigned_id = a.entity_id
      WHERE a.id = findings.audit_id
        AND ua.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "audit_results_select" ON public.audit_results;
CREATE POLICY "audit_results_select" ON public.audit_results
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      WHERE a.id = audit_results.audit_id
        AND a.auditor_id = auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.branches b ON b.id = a.entity_id
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'branch'
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.audits a
        JOIN public.bcks bk ON bk.id = a.entity_id
        WHERE a.id = audit_results.audit_id
          AND a.entity_type = 'bck'
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.audits a
      JOIN public.user_assignments ua
        ON ua.assigned_type = a.entity_type
       AND ua.assigned_id = a.entity_id
      WHERE a.id = audit_results.audit_id
        AND ua.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "capa_select" ON public.capa;
CREATE POLICY "capa_select" ON public.capa
  FOR SELECT TO authenticated
  USING (
    assigned_to = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'regional_manager'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'branch_manager'::public.app_role)
      AND capa.entity_type = 'branch'
      AND EXISTS (
        SELECT 1
        FROM public.branches b
        WHERE b.id = capa.entity_id
          AND b.manager_id = auth.uid()
      )
    )
    OR (
      public.has_role(auth.uid(), 'bck_manager'::public.app_role)
      AND capa.entity_type = 'bck'
      AND EXISTS (
        SELECT 1
        FROM public.bcks bk
        WHERE bk.id = capa.entity_id
          AND bk.manager_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid()
        AND ua.assigned_type = capa.entity_type
        AND ua.assigned_id = capa.entity_id
    )
  );
