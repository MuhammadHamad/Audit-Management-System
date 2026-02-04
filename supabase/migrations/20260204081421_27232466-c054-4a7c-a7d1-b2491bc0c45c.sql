-- Fix regional manager scope: restrict to their assigned regions only

-- 1. bcks: Regional managers can only see BCKs in their managed regions
DROP POLICY IF EXISTS "bcks_select" ON public.bcks;
CREATE POLICY "bcks_select" ON public.bcks
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid()) 
    OR manager_id = auth.uid()
    -- Regional managers only see BCKs in regions they manage
    OR EXISTS (
      SELECT 1 FROM public.regions r
      WHERE r.id = bcks.region_id AND r.manager_id = auth.uid()
    )
    -- Users assigned to this specific BCK
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid() 
        AND ua.assigned_type = 'bck' 
        AND ua.assigned_id = bcks.id
    )
  );

-- 2. branches: Regional managers only see branches in their managed regions
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR manager_id = auth.uid()
    -- Regional managers only see branches in regions they manage
    OR EXISTS (
      SELECT 1 FROM public.regions r
      WHERE r.id = branches.region_id AND r.manager_id = auth.uid()
    )
    -- Users assigned to this specific branch
    OR EXISTS (
      SELECT 1 FROM public.user_assignments ua
      WHERE ua.user_id = auth.uid() 
        AND ua.assigned_type = 'branch' 
        AND ua.assigned_id = branches.id
    )
  );

-- 3. suppliers: Only admins can see all suppliers; regional managers see suppliers that supply to their entities
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    -- Regional managers see suppliers that supply to branches/bcks in their regions
    OR (
      has_role(auth.uid(), 'regional_manager') 
      AND (
        -- Suppliers that supply to branches in manager's regions
        EXISTS (
          SELECT 1 FROM public.branches b
          JOIN public.regions r ON b.region_id = r.id
          WHERE r.manager_id = auth.uid()
            AND suppliers.supplies_to->'branches' ? b.id::text
        )
        -- Suppliers that supply to BCKs in manager's regions
        OR EXISTS (
          SELECT 1 FROM public.bcks bck
          JOIN public.regions r ON bck.region_id = r.id
          WHERE r.manager_id = auth.uid()
            AND suppliers.supplies_to->'bcks' ? bck.id::text
        )
      )
    )
  );

-- 4. users: Tighter scope for regional managers
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    -- Users can always see their own record
    id = auth.uid()
    -- Admins can see all users
    OR is_admin(auth.uid())
    -- Regional managers can only see users in their managed regions
    OR (
      has_role(auth.uid(), 'regional_manager') 
      AND EXISTS (
        SELECT 1 FROM public.regions r WHERE r.manager_id = auth.uid()
      )
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
        -- Users assigned to branches in regional manager's regions
        OR EXISTS (
          SELECT 1 FROM public.user_assignments ua
          JOIN public.branches b ON ua.assigned_id = b.id AND ua.assigned_type = 'branch'
          JOIN public.regions r ON b.region_id = r.id
          WHERE r.manager_id = auth.uid() AND ua.user_id = users.id
        )
        -- Users assigned to BCKs in regional manager's regions
        OR EXISTS (
          SELECT 1 FROM public.user_assignments ua
          JOIN public.bcks bck ON ua.assigned_id = bck.id AND ua.assigned_type = 'bck'
          JOIN public.regions r ON bck.region_id = r.id
          WHERE r.manager_id = auth.uid() AND ua.user_id = users.id
        )
      )
    )
  );