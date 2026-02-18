ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'super_admin',
    'head_of_quality',
    'audit_manager',
    'regional_manager',
    'auditor',
    'branch_manager',
    'bck_manager',
    'staff',
    'area_manager',
    'regional_operational_manager',
    'national_operational_manager'
  ));

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
      AND role IN ('super_admin', 'audit_manager', 'head_of_quality')
  )
  OR EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = _user_id
      AND role IN ('super_admin', 'audit_manager', 'head_of_quality')
  )
$$;

CREATE OR REPLACE FUNCTION public.create_user_with_auth(
  _email TEXT,
  _password TEXT,
  _full_name TEXT,
  _phone TEXT DEFAULT NULL,
  _role TEXT DEFAULT 'staff',
  _status TEXT DEFAULT 'active'
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  user_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user_id UUID;
  existing_public_user_id UUID;
BEGIN
  IF _role NOT IN (
    'super_admin','head_of_quality','audit_manager','regional_manager','auditor','branch_manager','bck_manager','staff',
    'area_manager','regional_operational_manager','national_operational_manager'
  ) THEN
    RETURN QUERY SELECT false, 'Invalid role: ' || _role, NULL::UUID;
    RETURN;
  END IF;

  IF _status NOT IN ('active','inactive') THEN
    RETURN QUERY SELECT false, 'Invalid status: ' || _status, NULL::UUID;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = _email) THEN
    RETURN QUERY SELECT false, 'A user with this email already exists in Auth', NULL::UUID;
    RETURN;
  END IF;

  SELECT id INTO existing_public_user_id FROM public.users WHERE email = _email;
  IF existing_public_user_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'A user with this email already exists in public.users', NULL::UUID;
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    _email,
    crypt(_password, gen_salt('bf')),
    now(),
    now(),
    now()
  ) RETURNING id INTO auth_user_id;

  INSERT INTO public.users (
    id,
    email,
    full_name,
    phone,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    auth_user_id,
    _email,
    _full_name,
    _phone,
    _role,
    _status,
    now(),
    now()
  );

  RETURN QUERY SELECT true, 'User created successfully', auth_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_with_auth(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
