-- ============================================================================
-- contract_field_edits.sql — hand corrections to one contract's printed sheet.
--
-- Run this once in the Supabase SQL Editor. It is safe to re-run.
--
-- THE POINT OF THIS FILE
-- ----------------------
-- The ID 407 export fills its boxes from three records (applicant, employer,
-- contract) and positions them from `pdf_field_mappings`. That is right almost
-- always, and wrong in the particular: a name the Immigration officer wants
-- spelled as on the passport, a box that fouls a printed rule on one contract
-- because the value ran long.
--
-- Editing the source records to fix a printed sheet would be worse than the
-- problem — `terms` is what both parties signed, and moving the shared mapping
-- to suit one contract moves it for every other. So both kinds of correction
-- are recorded here, per contract, as a thin layer on top:
--
--   field_overrides   field_id -> the text (or tick) to print instead
--   field_positions   field_id -> { x, y } in PDF points, top-left origin
--
-- Absent key means "use the computed value / the shared mapping", so clearing
-- an edit restores the automatic behaviour rather than printing blank. Neither
-- column is read by the signing functions: a correction to the paper form
-- cannot alter what /contract/<token> shows either party.
-- ============================================================================

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS field_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS field_positions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN contracts.field_overrides IS
  'Per-contract text/tick overrides for the ID 407 export, keyed by field_id. Absent key = use the computed value.';

COMMENT ON COLUMN contracts.field_positions IS
  'Per-contract box positions for the ID 407 export, keyed by field_id, as {x, y} in PDF points with a top-left origin. Absent key = use pdf_field_mappings.';
