ALTER TABLE public.audit_results
ADD COLUMN IF NOT EXISTS manual_finding text;
