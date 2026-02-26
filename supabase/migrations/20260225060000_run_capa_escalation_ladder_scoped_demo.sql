-- Demo behavior change: scope "Run Escalation" by the caller's role so that
-- escalation managers only escalate CAPAs currently assigned to them.
--
-- Desired demo behavior:
-- - Area Manager: only escalates their own level=1 CAPAs to ROM
-- - Regional Operational Manager: only escalates their own level=2 CAPAs to NOM
-- - Admin/HoQ/Audit Manager: can run globally (simulates scheduler)
--
-- Keeps the same function signature used by the frontend.

CREATE OR REPLACE FUNCTION public.run_capa_escalation_ladder(p_force BOOLEAN DEFAULT false)
RETURNS TABLE (escalated_count INTEGER, expired_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  v_next_user_id UUID;
  v_region_id UUID;
  v_now TIMESTAMPTZ := now();
  v_today DATE := current_date;
  v_escalated INTEGER := 0;
  v_expired INTEGER := 0;
  v_user_role TEXT;
  v_is_admin_like BOOLEAN := false;
  v_is_area_manager BOOLEAN := false;
  v_is_rom BOOLEAN := false;
BEGIN
  SELECT u.role
  INTO v_user_role
  FROM public.users u
  WHERE u.id = auth.uid();

  v_is_admin_like :=
    public.is_admin(auth.uid())
    OR v_user_role IN ('super_admin', 'head_of_quality', 'audit_manager')
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'audit_manager');

  v_is_area_manager :=
    v_user_role = 'area_manager'
    OR public.has_role(auth.uid(), 'area_manager');

  v_is_rom :=
    v_user_role = 'regional_operational_manager'
    OR public.has_role(auth.uid(), 'regional_operational_manager');

  IF NOT (v_is_admin_like OR v_is_area_manager OR v_is_rom) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR rec IN
    SELECT c.*
    FROM public.capa c
    WHERE c.status NOT IN ('closed','approved','expired')
      AND (
        p_force
        OR (
          (COALESCE(c.escalation_level, 0) = 0 AND c.due_date < v_today)
          OR (COALESCE(c.escalation_level, 0) > 0 AND c.escalation_due_date IS NOT NULL AND c.escalation_due_date < v_today)
        )
      )
      AND (
        v_is_admin_like
        OR (v_is_area_manager AND c.assigned_to = auth.uid() AND COALESCE(c.escalation_level, 0) = 1)
        OR (v_is_rom AND c.assigned_to = auth.uid() AND COALESCE(c.escalation_level, 0) = 2)
      )
  LOOP
    v_next_user_id := NULL;

    IF COALESCE(rec.escalation_level, 0) = 0 THEN
      -- Only admin-like users should ever run level 0 -> level 1 in this demo function.
      IF NOT v_is_admin_like THEN
        CONTINUE;
      END IF;

      IF rec.entity_type IN ('branch','bck') THEN
        SELECT ua.user_id
        INTO v_next_user_id
        FROM public.user_assignments ua
        WHERE public.has_role(ua.user_id, 'area_manager')
          AND ua.assigned_type = rec.entity_type
          AND ua.assigned_id = rec.entity_id
        LIMIT 1;
      END IF;

      IF v_next_user_id IS NULL AND p_force THEN
        SELECT x.user_id
        INTO v_next_user_id
        FROM (
          SELECT u.id AS user_id, u.created_at
          FROM public.users u
          WHERE u.role = 'area_manager'
          UNION
          SELECT ur.user_id, ur.created_at
          FROM public.user_roles ur
          WHERE ur.role = 'area_manager'
        ) x
        ORDER BY x.created_at
        LIMIT 1;
      END IF;

      IF v_next_user_id IS NOT NULL THEN
        UPDATE public.capa
        SET status = 'escalated',
            assigned_to = v_next_user_id,
            escalation_level = 1,
            escalation_due_date = v_today + 3,
            escalated_to_user_id = v_next_user_id,
            escalated_to_role = 'area_manager',
            updated_at = v_now
        WHERE id = rec.id;

        v_escalated := v_escalated + 1;
      END IF;

    ELSIF rec.escalation_level = 1 THEN
      -- Level 1 -> 2 (Area Manager -> ROM)
      IF rec.entity_type = 'branch' THEN
        SELECT b.region_id INTO v_region_id FROM public.branches b WHERE b.id = rec.entity_id;
      ELSIF rec.entity_type = 'bck' THEN
        SELECT b.region_id INTO v_region_id FROM public.bcks b WHERE b.id = rec.entity_id;
      ELSE
        v_region_id := NULL;
      END IF;

      IF v_region_id IS NOT NULL THEN
        SELECT ua.user_id
        INTO v_next_user_id
        FROM public.user_assignments ua
        WHERE public.has_role(ua.user_id, 'regional_operational_manager')
          AND ua.assigned_type = 'region'
          AND ua.assigned_id = v_region_id
        LIMIT 1;
      END IF;

      IF v_next_user_id IS NULL AND p_force THEN
        SELECT x.user_id
        INTO v_next_user_id
        FROM (
          SELECT u.id AS user_id, u.created_at
          FROM public.users u
          WHERE u.role = 'regional_operational_manager'
          UNION
          SELECT ur.user_id, ur.created_at
          FROM public.user_roles ur
          WHERE ur.role = 'regional_operational_manager'
        ) x
        ORDER BY x.created_at
        LIMIT 1;
      END IF;

      IF v_next_user_id IS NOT NULL THEN
        UPDATE public.capa
        SET status = 'escalated',
            assigned_to = v_next_user_id,
            escalation_level = 2,
            escalation_due_date = v_today + 3,
            escalated_to_user_id = v_next_user_id,
            escalated_to_role = 'regional_operational_manager',
            updated_at = v_now
        WHERE id = rec.id;

        v_escalated := v_escalated + 1;
      END IF;

    ELSIF rec.escalation_level = 2 THEN
      -- Level 2 -> 3 (ROM -> NOM)
      SELECT x.user_id
      INTO v_next_user_id
      FROM (
        SELECT u.id AS user_id, u.created_at
        FROM public.users u
        WHERE u.role = 'national_operational_manager'
        UNION
        SELECT ur.user_id, ur.created_at
        FROM public.user_roles ur
        WHERE ur.role = 'national_operational_manager'
      ) x
      ORDER BY x.created_at
      LIMIT 1;

      IF v_next_user_id IS NOT NULL THEN
        UPDATE public.capa
        SET status = 'escalated',
            assigned_to = v_next_user_id,
            escalation_level = 3,
            escalation_due_date = v_today + 3,
            escalated_to_user_id = v_next_user_id,
            escalated_to_role = 'national_operational_manager',
            updated_at = v_now
        WHERE id = rec.id;

        v_escalated := v_escalated + 1;
      END IF;

    ELSE
      -- Level >= 3: expire (admin-like only)
      IF NOT v_is_admin_like THEN
        CONTINUE;
      END IF;

      UPDATE public.capa
      SET status = 'expired',
          expired_at = v_now,
          expired_reason = 'Expired after escalation to NOM',
          updated_at = v_now
      WHERE id = rec.id;

      v_expired := v_expired + 1;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_escalated, v_expired;
END;
$$;

REVOKE ALL ON FUNCTION public.run_capa_escalation_ladder(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_capa_escalation_ladder(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_capa_escalation_ladder() TO authenticated;
