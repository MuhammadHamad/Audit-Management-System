-- Secure notifications inserts via RPC and tighten RLS

-- 1) Allow direct inserts only for the current user
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;

CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2) Security definer RPC for system-generated notifications
CREATE OR REPLACE FUNCTION public.insert_notifications(_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, message, link_to, read)
  SELECT
    (r->>'user_id')::uuid,
    r->>'type',
    r->>'message',
    NULLIF(r->>'link_to', ''),
    false
  FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) AS r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_notifications(jsonb) TO authenticated;
