-- Fix EXPOSED_SENSITIVE_DATA errors by restricting SELECT policies

-- 1. bcks: Only admins and assigned bck_managers can see BCK data
DROP POLICY IF EXISTS "bcks_select" ON public.bcks;
CREATE POLICY "bcks_select" ON public.bcks
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) 
    OR manager_id = auth.uid()
    OR has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid() 
        AND ua.assigned_type = 'bck' 
        AND ua.assigned_id = bcks.id
    )
  );

-- 2. branches: Only admins, assigned branch_managers, and regional_managers can see branches
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR manager_id = auth.uid()
    OR has_role(auth.uid(), 'regional_manager')
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid() 
        AND ua.assigned_type = 'branch' 
        AND ua.assigned_id = branches.id
    )
  );

-- 3. suppliers: Only admins and regional_managers can see supplier data
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'regional_manager')
  );

-- 4. users: Restrict to own record, admins, or regional managers seeing only their region's users
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_admin(auth.uid())
    -- Regional managers can only see users assigned to entities in their regions
    OR (
      has_role(auth.uid(), 'regional_manager') 
      AND (
        -- Users who manage branches in regional manager's regions
        EXISTS (
          SELECT 1 FROM public.branches b
          JOIN public.regions r ON b.region_id = r.id
          WHERE r.manager_id = auth.uid() AND b.manager_id = users.id
        )
        -- Users who manage BCKs in regional manager's regions
        OR EXISTS (
          SELECT 1 FROM public.bcks bck
          JOIN public.regions r ON bck.region_id = r.id
          WHERE r.manager_id = auth.uid() AND bck.manager_id = users.id
        )
        -- Users assigned to entities in regional manager's regions
        OR EXISTS (
          SELECT 1 FROM public.user_assignments ua
          JOIN public.branches b ON ua.assigned_id = b.id AND ua.assigned_type = 'branch'
          JOIN public.regions r ON b.region_id = r.id
          WHERE r.manager_id = auth.uid() AND ua.user_id = users.id
        )
      )
    )
  );