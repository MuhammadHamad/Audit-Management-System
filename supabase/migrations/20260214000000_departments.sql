-- ============================================
-- DEPARTMENTS + MEMBERSHIP
-- Flexible schema: role_in_dept can be extended
-- (e.g. 'head', 'member', 'auditor', 'executor')
-- without touching app_role enum.
-- ============================================

-- 1) Departments table
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,          -- e.g. 'maintenance', 'quality'
  name TEXT NOT NULL,                  -- display name
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- 2) Department members (many-to-many users <-> departments)
CREATE TABLE IF NOT EXISTS public.department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_in_dept TEXT NOT NULL DEFAULT 'member',  -- 'head', 'member', extensible later
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (department_id, user_id)
);

ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;

-- 3) Add department_id to capa for routing (nullable; populated by post-audit logic)
ALTER TABLE public.capa
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id);

-- 4) Indexes
CREATE INDEX IF NOT EXISTS idx_department_members_dept ON public.department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_department_members_user ON public.department_members(user_id);
CREATE INDEX IF NOT EXISTS idx_capa_department ON public.capa(department_id);

-- 5) Seed the two departments
INSERT INTO public.departments (slug, name, description)
VALUES
  ('maintenance', 'Maintenance', 'Handles maintenance-related corrective actions (equipment, facilities, etc.)'),
  ('quality', 'Quality', 'Handles quality-related corrective actions (food safety, hygiene, expired items, cleanliness, etc.)')
ON CONFLICT (slug) DO NOTHING;

-- 6) RLS policies for departments (read: all authenticated; write: admins only)
CREATE POLICY "departments_select" ON public.departments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "departments_modify_admin" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 7) RLS policies for department_members
--    Select: admins see all; members see their own department memberships
CREATE POLICY "dept_members_select" ON public.department_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

--    Modify: admins only
CREATE POLICY "dept_members_modify_admin" ON public.department_members
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 8) Helper: check if a user belongs to a department (by slug)
CREATE OR REPLACE FUNCTION public.is_department_member(_user_id UUID, _dept_slug TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.department_members dm
    JOIN public.departments d ON d.id = dm.department_id
    WHERE dm.user_id = _user_id
      AND d.slug = _dept_slug
  )
$$;

-- 9) Helper: get department members by slug (returns user_ids)
CREATE OR REPLACE FUNCTION public.get_department_user_ids(_dept_slug TEXT)
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
$$;

-- 10) Allow department members to view CAPAs routed to their department
CREATE POLICY "capa_select_dept_member" ON public.capa
  FOR SELECT TO authenticated
  USING (
    department_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.department_members dm
      WHERE dm.department_id = capa.department_id
        AND dm.user_id = auth.uid()
    )
  );
