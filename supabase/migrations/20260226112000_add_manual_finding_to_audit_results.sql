-- Migration to add manual_finding column and related CAPA fields to audit_results table
-- This allows auditors to store custom findings and CAPA overrides during audit execution.

DO $$ 
BEGIN
    -- Add manual_finding column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'audit_results' 
        AND column_name = 'manual_finding'
    ) THEN
        ALTER TABLE public.audit_results ADD COLUMN manual_finding TEXT;
    END IF;

    -- Add capa_priority column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'audit_results' 
        AND column_name = 'capa_priority'
    ) THEN
        ALTER TABLE public.audit_results ADD COLUMN capa_priority TEXT;
    END IF;

    -- Add capa_due_date column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'audit_results' 
        AND column_name = 'capa_due_date'
    ) THEN
        ALTER TABLE public.audit_results ADD COLUMN capa_due_date DATE;
    END IF;

    -- Add evidence_paths column if it doesn't exist (useful for storage cleanup and tracking)
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'audit_results' 
        AND column_name = 'evidence_paths'
    ) THEN
        ALTER TABLE public.audit_results ADD COLUMN evidence_paths TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Refresh the schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
