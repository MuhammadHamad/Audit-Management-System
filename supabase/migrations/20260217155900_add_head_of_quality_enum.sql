DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE 'head_of_quality';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
