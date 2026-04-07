-- Remove conflicting RLS policies that are preventing audit visibility
-- Multiple permissive SELECT policies can cause unexpected behavior

-- Drop the old conflicting SELECT policies on audits
DROP POLICY IF EXISTS "audits_select_entity_manager" ON public.audits;
DROP POLICY IF EXISTS "audits_select_escalation_assignee" ON public.audits;

-- Drop conflicting policies on other tables too
DROP POLICY IF EXISTS "findings_select_entity_manager" ON public.findings;
DROP POLICY IF EXISTS "findings_select_escalation_assignee" ON public.findings;
DROP POLICY IF EXISTS "branches_select_escalation_assignee" ON public.branches;
DROP POLICY IF EXISTS "bcks_select_escalation_assignee" ON public.bcks;

-- Ensure RLS is enabled on all core tables
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capa ENABLE ROW LEVEL SECURITY;

-- Verify the main policies are working
-- The audits_select policy from the previous migration should now work without conflicts
