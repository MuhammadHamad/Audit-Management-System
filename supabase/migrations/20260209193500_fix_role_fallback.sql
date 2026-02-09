CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = _user_id
      AND role = _role::text
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1),
    (SELECT role::public.app_role FROM public.users WHERE id = _user_id LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'audit_manager')
  )
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = _user_id
      AND role IN ('super_admin', 'audit_manager')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = _user_id
      AND role = 'super_admin'
  )
$$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, u.role::public.app_role
FROM public.users u
WHERE u.role IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;
