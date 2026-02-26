-- Demo fix: make force_escalate_capa assignee resolution work whether roles are stored
-- in public.users.role or in public.user_roles (via has_role).

CREATE OR REPLACE FUNCTION public.force_escalate_capa(p_capa_id UUID)
RETURNS TABLE (capa_id UUID, new_assigned_to UUID, new_escalation_level INTEGER, new_escalated_to_role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.capa%ROWTYPE;
  v_next_user_id UUID;
  v_region_id UUID;
  v_now TIMESTAMPTZ := now();
  v_today DATE := current_date;
  v_next_level INTEGER;
  v_next_role TEXT;
  v_user_role TEXT;
BEGIN
  SELECT u.role
  INTO v_user_role
  FROM public.users u
  WHERE u.id = auth.uid();

  IF NOT (
    public.is_admin(auth.uid())
    OR v_user_role IN (
      'super_admin',
      'head_of_quality',
      'audit_manager',
      'area_manager',
      'regional_operational_manager',
      'national_operational_manager'
    )
    OR public.has_role(auth.uid(), 'head_of_quality')
    OR public.has_role(auth.uid(), 'audit_manager')
    OR public.has_role(auth.uid(), 'area_manager')
    OR public.has_role(auth.uid(), 'regional_operational_manager')
    OR public.has_role(auth.uid(), 'national_operational_manager')
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT *
  INTO rec
  FROM public.capa c
  WHERE c.id = p_capa_id
  LIMIT 1;

  IF rec.id IS NULL THEN
    RAISE EXCEPTION 'CAPA not found';
  END IF;

  IF rec.status IN ('closed', 'approved', 'expired') THEN
    RAISE EXCEPTION 'CAPA is not eligible for escalation';
  END IF;

  v_next_user_id := NULL;
  v_next_level := COALESCE(rec.escalation_level, 0) + 1;

  IF COALESCE(rec.escalation_level, 0) = 0 THEN
    v_next_role := 'area_manager';
    IF rec.entity_type IN ('branch','bck') THEN
      SELECT ua.user_id
      INTO v_next_user_id
      FROM public.user_assignments ua
      JOIN public.users u ON u.id = ua.user_id
      WHERE (public.has_role(ua.user_id, 'area_manager') OR u.role = 'area_manager')
        AND ua.assigned_type = rec.entity_type
        AND ua.assigned_id = rec.entity_id
      LIMIT 1;
    END IF;

  ELSIF rec.escalation_level = 1 THEN
    v_next_role := 'regional_operational_manager';
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
      JOIN public.users u ON u.id = ua.user_id
      WHERE (public.has_role(ua.user_id, 'regional_operational_manager') OR u.role = 'regional_operational_manager')
        AND ua.assigned_type = 'region'
        AND ua.assigned_id = v_region_id
      LIMIT 1;
    END IF;

  ELSIF rec.escalation_level = 2 THEN
    v_next_role := 'national_operational_manager';

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

  ELSE
    RAISE EXCEPTION 'CAPA is already at the highest escalation level';
  END IF;

  IF v_next_user_id IS NULL THEN
    RAISE EXCEPTION 'No assignee found for next escalation level';
  END IF;

  UPDATE public.capa
  SET status = 'escalated',
      assigned_to = v_next_user_id,
      escalation_level = v_next_level,
      escalation_due_date = v_today + 3,
      escalated_to_user_id = v_next_user_id,
      escalated_to_role = v_next_role,
      updated_at = v_now
  WHERE id = rec.id;

  INSERT INTO public.capa_activity (capa_id, user_id, action, details, created_at)
  VALUES (rec.id, auth.uid(), 'force_escalated', 'Force escalated (demo)', v_now);

  INSERT INTO public.capa_escalation_history (capa_id, from_user_id, to_user_id, from_role, to_role, action, reason, created_at)
  VALUES (rec.id, rec.assigned_to, v_next_user_id, NULL, v_next_role, 'force_escalated', 'Demo force escalation', v_now);

  INSERT INTO public.notifications (user_id, type, message, link_to, read, created_at)
  VALUES (v_next_user_id, 'capa_escalated', 'CAPA escalated\nA CAPA has been escalated to you (demo).', '/capa/' || rec.id::text, false, v_now);

  RETURN QUERY SELECT rec.id, v_next_user_id, v_next_level, v_next_role;
END;
$$;

REVOKE ALL ON FUNCTION public.force_escalate_capa(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_escalate_capa(UUID) TO authenticated;
