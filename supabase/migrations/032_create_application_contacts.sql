-- Recruiter / networking contact log, scoped to an application.
-- Stores people encountered during the job search (recruiters, referrers,
-- hiring managers) with their contact details and free-form notes.

CREATE TABLE IF NOT EXISTS public.application_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  linkedin_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_application_contacts_application_id
  ON public.application_contacts(application_id);

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE public.application_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own application contacts" ON public.application_contacts;
DROP POLICY IF EXISTS "Users can create contacts for their own applications" ON public.application_contacts;
DROP POLICY IF EXISTS "Users can update their own application contacts" ON public.application_contacts;
DROP POLICY IF EXISTS "Users can delete their own application contacts" ON public.application_contacts;

CREATE POLICY "Users can view their own application contacts"
ON public.application_contacts
FOR SELECT
TO public
USING (auth.uid() = user_id);

CREATE POLICY "Users can create contacts for their own applications"
ON public.application_contacts
FOR INSERT
TO public
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.applications
    WHERE applications.id = application_contacts.application_id
    AND applications.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own application contacts"
ON public.application_contacts
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own application contacts"
ON public.application_contacts
FOR DELETE
TO public
USING (auth.uid() = user_id);

-- ============================================================================
-- updated_at trigger (fixed search_path per project security convention)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_application_contacts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_contacts_updated_at ON public.application_contacts;
CREATE TRIGGER trg_application_contacts_updated_at
  BEFORE UPDATE ON public.application_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_application_contacts_updated_at();
