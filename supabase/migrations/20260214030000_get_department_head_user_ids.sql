CREATE OR REPLACE FUNCTION public.get_department_head_user_ids(_dept_slug TEXT)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dm.user_id
  FROM public.department_members dm
  JOIN public.departments d ON d.id = dm.department_id
  WHERE d.slug = _dept_slug
    AND dm.role_in_dept = 'head'
$$;

GRANT EXECUTE ON FUNCTION public.get_department_head_user_ids(TEXT) TO authenticated;
