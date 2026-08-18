-- ============================================================================
-- 0100 — applicants
--
-- The helper's own record: what /apply submits, plus everything added since.
--
-- The original table was created by hand in the Supabase dashboard, so this
-- file reconstructs it from what the code actually reads and writes. It is
-- written to be safe on a database that already has the table: CREATE TABLE IF
-- NOT EXISTS leaves an existing one untouched, and every column added later is
-- a separate ADD COLUMN IF NOT EXISTS. Nothing here drops or retypes anything.
-- ============================================================================

CREATE TABLE IF NOT EXISTS applicants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  full_name     TEXT NOT NULL,
  date_of_birth DATE,
  nationality   TEXT,
  gender        TEXT,
  mobile        TEXT,
  photo_url     TEXT,

  -- The bulk of the biodata: education, languages, skills, preferences, kids,
  -- other-country experience and up to four HK contracts. Kept as one blob so
  -- the apply form can grow without a migration per question.
  form_data     JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- NULL / 'New' -> Candidates board, 'For Review' -> review board,
  -- 'Deleted' -> Trash. See src/components/TrashZone.tsx.
  status        TEXT
);

-- ── Applicant signature (added with the signature pad) ──────────────────────
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_at     TIMESTAMPTZ;

-- ── Soft delete (added with the Trash page) ─────────────────────────────────
-- Deleting sets status = 'Deleted' rather than removing the row, so a mis-drop
-- is recoverable. deleted_from remembers which board to restore to.
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_from TEXT;

-- Both boards filter on status, and Trash orders by deleted_at
CREATE INDEX IF NOT EXISTS applicants_status_idx     ON applicants (status);
CREATE INDEX IF NOT EXISTS applicants_created_at_idx ON applicants (created_at DESC);
