-- Add archive support for applications.
-- Archived applications (typically rejected or withdrawn) are hidden from the
-- active pipeline but remain accessible under a dedicated Archive tab.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the active pipeline only ever queries non-archived rows.
CREATE INDEX IF NOT EXISTS idx_applications_archived
  ON public.applications(user_id)
  WHERE archived = false;
