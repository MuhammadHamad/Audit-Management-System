-- SECURITY DEFINER RPC: Resolve entity manager_id for audit submission / CAPA routing

CREATE OR REPLACE FUNCTION public.get_entity_manager_id(_entity_type TEXT, _entity_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _entity_type = 'branch' THEN (
      SELECT b.manager_id
      FROM public.branches b
      WHERE b.id = _entity_id
    )
    WHEN _entity_type = 'bck' THEN (
      SELECT b.manager_id
      FROM public.bcks b
      WHERE b.id = _entity_id
    )
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.get_entity_manager_id(TEXT, UUID) TO authenticated;
