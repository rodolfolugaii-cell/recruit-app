-- ============================================================================
-- 0500 — required documents per helper
--
-- Six copies have to be collected before a placement can proceed: HKID,
-- Passport, A4 Visa, Endorsement Visa, Old Contract and ID407E. Recruiters tick
-- them off on the For Review board as they arrive.
--
-- One JSONB column rather than six booleans or a child table:
--
--   { "hkid": "2026-09-08T02:11:00Z", "passport": "2026-09-09T08:40:00Z" }
--
-- The value is when it was ticked, so the same field answers both "is it in?"
-- and "how long has it been sitting there?". A document never handed in is
-- simply absent, which is also what un-ticking restores.
--
-- Adding a seventh document later is a change to HELPER_DOCUMENTS in
-- src/lib/helperDocuments.ts and no migration at all.
-- ============================================================================

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The board shows outstanding paperwork first, so it filters on this often
CREATE INDEX IF NOT EXISTS applicants_documents_idx ON applicants USING GIN (documents);
