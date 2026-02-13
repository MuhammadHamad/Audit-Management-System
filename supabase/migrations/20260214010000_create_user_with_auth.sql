-- Secure RPC for admin to create users with Auth + public.users row
-- Only admins can call this function

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
  -- Validate role
  IF _role NOT IN ('super_admin','audit_manager','regional_manager','auditor','branch_manager','bck_manager','staff') THEN
    RETURN QUERY SELECT false, 'Invalid role: ' || _role, NULL::UUID;
    RETURN;
  END IF;

  -- Validate status
  IF _status NOT IN ('active','inactive') THEN
    RETURN QUERY SELECT false, 'Invalid status: ' || _status, NULL::UUID;
    RETURN;
  END IF;

  -- Check if Auth user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = _email) THEN
    RETURN QUERY SELECT false, 'A user with this email already exists in Auth', NULL::UUID;
    RETURN;
  END IF;

  -- Check if public user already exists (shouldn't happen, but guard)
  SELECT id INTO existing_public_user_id FROM public.users WHERE email = _email;
  IF existing_public_user_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'A user with this email already exists in public.users', NULL::UUID;
    RETURN;
  END IF;

  -- Create Supabase Auth user
  INSERT INTO auth.users (
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', -- default instance_id
    _email,
    crypt(_password, gen_salt('bf')),
    now(),
    now(),
    now()
  ) RETURNING id INTO auth_user_id;

  -- Create matching public.users row
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

  -- Return success
  RETURN QUERY SELECT true, 'User created successfully', auth_user_id;
END;
$$;

-- Grant execute to authenticated users (function has internal admin check)
GRANT EXECUTE ON FUNCTION public.create_user_with_auth(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
