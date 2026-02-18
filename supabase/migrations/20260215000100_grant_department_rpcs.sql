-- Grants for department helper RPCs used by the app

GRANT EXECUTE ON FUNCTION public.get_department_user_ids(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_department_member(UUID, TEXT) TO authenticated;
