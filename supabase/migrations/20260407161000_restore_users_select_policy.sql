-- Restore users_select policy to prevent login failures.
--
-- Login flow requires selecting the current user's row from public.users.
-- If users_select is missing or too restrictive, AuthContext will treat the
-- user as "not found" and sign them out.

DROP POLICY IF EXISTS "users_select" ON public.users;

CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin(auth.uid())
  );
