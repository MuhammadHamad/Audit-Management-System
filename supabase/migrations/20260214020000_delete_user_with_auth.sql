-- Cleanup FK references to a user before deletion.
-- Nullifies all nullable FK columns pointing to the user
-- and deletes owned rows (notifications, assignments, memberships, roles).
-- The actual user row deletion + Auth deletion is handled client-side via admin API.
-- Each statement is wrapped in BEGIN/EXCEPTION so missing tables/columns don't abort.

DROP FUNCTION IF EXISTS public.delete_user_with_auth(UUID);
DROP FUNCTION IF EXISTS public.cleanup_user_references(UUID);

CREATE OR REPLACE FUNCTION public.cleanup_user_references(
  _user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can call this
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can perform this action';
  END IF;

  -- Prevent self-deletion
  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  -- Nullify FK references (each wrapped so missing table/column won't abort)
  BEGIN UPDATE public.regions         SET manager_id = NULL          WHERE manager_id = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.branches        SET manager_id = NULL          WHERE manager_id = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.bcks            SET manager_id = NULL          WHERE manager_id = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audit_plans     SET assigned_auditor_id = NULL WHERE assigned_auditor_id = _user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audit_plans     SET created_by = NULL          WHERE created_by = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audits          SET auditor_id = NULL          WHERE auditor_id = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audits          SET created_by = NULL          WHERE created_by = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audit_templates SET created_by = NULL          WHERE created_by = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.capa            SET assigned_to = NULL         WHERE assigned_to = _user_id;         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.capa_activity   SET user_id = NULL             WHERE user_id = _user_id;             EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.findings        SET assigned_to = NULL         WHERE assigned_to = _user_id;         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.findings        SET created_by = NULL          WHERE created_by = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.incidents       SET assigned_to = NULL         WHERE assigned_to = _user_id;         EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.incidents       SET created_by = NULL          WHERE created_by = _user_id;          EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN UPDATE public.audit_logs      SET user_id = NULL             WHERE user_id = _user_id;             EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Delete owned rows (each wrapped)
  BEGIN DELETE FROM public.notifications      WHERE user_id = _user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_assignments   WHERE user_id = _user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.department_members WHERE user_id = _user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM public.user_roles         WHERE user_id = _user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_user_references(UUID) TO authenticated;
