-- Allow audit managers/admins to delete audits that are safe to remove (scheduled or cancelled)

CREATE POLICY "audits_delete_admin_safe" ON public.audits
  FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND status IN ('scheduled', 'cancelled')
  );
