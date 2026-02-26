-- Demo-only: allow escalation managers to run the escalation ladder from UI
-- (area_manager / regional_operational_manager)
-- NOTE: In production, you may want to restrict this back to admins only.

CREATE OR REPLACE FUNCTION public.run_capa_escalation_ladder()
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
BEGIN
  IF NOT (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR rec IN
    SELECT c.*
    FROM public.capa c
    WHERE c.status NOT IN ('closed','approved','expired')
      AND (
        (COALESCE(c.escalation_level, 0) = 0 AND c.due_date < v_today)
        OR (COALESCE(c.escalation_level, 0) > 0 AND c.escalation_due_date IS NOT NULL AND c.escalation_due_date < v_today)
      )
  LOOP
    v_next_user_id := NULL;

    IF COALESCE(rec.escalation_level, 0) = 0 THEN
      IF rec.entity_type IN ('branch','bck') THEN
        SELECT ua.user_id
        INTO v_next_user_id
        FROM public.user_assignments ua
        WHERE public.has_role(ua.user_id, 'area_manager')
          AND ua.assigned_type = rec.entity_type
          AND ua.assigned_id = rec.entity_id
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

        INSERT INTO public.capa_activity (capa_id, user_id, action, details, created_at)
        VALUES (rec.id, COALESCE(rec.assigned_to, auth.uid()), 'auto_escalated', 'Auto-escalated to Area Manager (3-day SLA)', v_now);

        INSERT INTO public.capa_escalation_history (capa_id, from_user_id, to_user_id, from_role, to_role, action, reason, created_at)
        VALUES (rec.id, rec.assigned_to, v_next_user_id, NULL, 'area_manager', 'escalated', 'Overdue at Branch/BCK manager stage', v_now);

        INSERT INTO public.notifications (user_id, type, message, link_to, read, created_at)
        VALUES (v_next_user_id, 'capa_escalated', 'CAPA escalated\nA CAPA has been escalated to you. You have 3 days to complete it.', '/capa/' || rec.id::text, false, v_now);

        v_escalated := v_escalated + 1;
      END IF;

    ELSIF rec.escalation_level = 1 THEN
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

        INSERT INTO public.capa_activity (capa_id, user_id, action, details, created_at)
        VALUES (rec.id, COALESCE(rec.assigned_to, auth.uid()), 'auto_escalated', 'Auto-escalated to Regional Operational Manager (3-day SLA)', v_now);

        INSERT INTO public.capa_escalation_history (capa_id, from_user_id, to_user_id, from_role, to_role, action, reason, created_at)
        VALUES (rec.id, rec.assigned_to, v_next_user_id, NULL, 'regional_operational_manager', 'escalated', 'Overdue at Area Manager stage', v_now);

        INSERT INTO public.notifications (user_id, type, message, link_to, read, created_at)
        VALUES (v_next_user_id, 'capa_escalated', 'CAPA escalated\nA CAPA has been escalated to you. You have 3 days to complete it.', '/capa/' || rec.id::text, false, v_now);

        v_escalated := v_escalated + 1;
      END IF;

    ELSIF rec.escalation_level = 2 THEN
      SELECT user_id
      INTO v_next_user_id
      FROM (
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role = 'national_operational_manager'
        ORDER BY ur.created_at
        LIMIT 1
      ) x;

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

        INSERT INTO public.capa_activity (capa_id, user_id, action, details, created_at)
        VALUES (rec.id, COALESCE(rec.assigned_to, auth.uid()), 'auto_escalated', 'Auto-escalated to National Operational Manager (3-day SLA)', v_now);

        INSERT INTO public.capa_escalation_history (capa_id, from_user_id, to_user_id, from_role, to_role, action, reason, created_at)
        VALUES (rec.id, rec.assigned_to, v_next_user_id, NULL, 'national_operational_manager', 'escalated', 'Overdue at Regional Operational Manager stage', v_now);

        INSERT INTO public.notifications (user_id, type, message, link_to, read, created_at)
        VALUES (v_next_user_id, 'capa_escalated', 'CAPA escalated\nA CAPA has been escalated to you. You have 3 days to complete it.', '/capa/' || rec.id::text, false, v_now);

        v_escalated := v_escalated + 1;
      END IF;

    ELSE
      UPDATE public.capa
      SET status = 'expired',
          expired_at = v_now,
          expired_reason = 'Expired after escalation to NOM',
          updated_at = v_now
      WHERE id = rec.id;

      INSERT INTO public.capa_activity (capa_id, user_id, action, details, created_at)
      VALUES (rec.id, COALESCE(rec.assigned_to, auth.uid()), 'expired', 'Auto-expired after NOM did not act within 3 days', v_now);

      INSERT INTO public.capa_escalation_history (capa_id, from_user_id, to_user_id, from_role, to_role, action, reason, created_at)
      VALUES (rec.id, rec.assigned_to, rec.assigned_to, NULL, 'national_operational_manager', 'expired', 'Overdue at NOM stage', v_now);

      INSERT INTO public.notifications (user_id, type, message, link_to, read, created_at)
      SELECT DISTINCT x.user_id, 'capa_expired', 'CAPA expired\nA CAPA has expired after reaching NOM without action.', '/capa/' || rec.id::text, false, v_now
      FROM (
        SELECT u.id AS user_id
        FROM public.users u
        WHERE u.role = 'super_admin'
        UNION
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role = 'super_admin'
      ) x;

      v_expired := v_expired + 1;
    END IF;

  END LOOP;

  RETURN QUERY SELECT v_escalated, v_expired;
END;
$$;
