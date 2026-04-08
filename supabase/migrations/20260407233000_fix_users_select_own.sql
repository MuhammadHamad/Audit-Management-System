-- Fix login regression: ensure authenticated users can always read their own profile row.

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
  );

-- Keep an explicit admin policy as well (safe if redundant with existing policies).
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'head_of_quality'::public.app_role)
    OR public.has_role(auth.uid(), 'audit_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );
