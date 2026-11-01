-- ============================================================================
-- 20261031000300 — employers in the Trash
--
-- Deleting an employer on the Employers page is now a SOFT delete, like the
-- helpers: deleted_at is set and the row stays, listed under Employers on the
-- Trash page where it can be restored or erased for good.
--
-- The helpers' employer_id is deliberately left pointing at a trashed
-- employer, so Restore brings the whole branch back. Until then the app treats
-- them as unassigned. Erasing the employer from the Trash clears the link
-- through the existing ON DELETE SET NULL (see 0300) — helpers are never
-- deleted with it.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- The Trash page lists trashed employers newest first
CREATE INDEX IF NOT EXISTS employers_deleted_at_idx ON employers (deleted_at);
