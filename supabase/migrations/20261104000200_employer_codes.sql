-- ============================================================================
-- 20261104000200 — employer IDs
--
-- Unlike the helpers' IDs (20261104000100), an employer's ID is NOT generated:
-- employers already carry an ID of their own, so it is typed in on the
-- employer form and can be changed there at any time. It is optional.
--
--   - stored trimmed and in CAPITALS, whatever was typed;
--   - a blank entry is stored as NULL, so "no ID yet" never clashes;
--   - unique among employers that are not in the Trash, so two live employers
--     can never share an ID, but a trashed one does not block re-using it.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE employers
  ADD COLUMN IF NOT EXISTS employer_code TEXT,
  -- From 20261031000300; repeated so the index below works whatever the order
  ADD COLUMN IF NOT EXISTS deleted_at    TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION employers_tidy_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.employer_code := NULLIF(upper(btrim(COALESCE(NEW.employer_code, ''))), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employers_tidy_code ON employers;
CREATE TRIGGER employers_tidy_code
  BEFORE INSERT OR UPDATE OF employer_code ON employers
  FOR EACH ROW EXECUTE FUNCTION employers_tidy_code();

CREATE UNIQUE INDEX IF NOT EXISTS employers_employer_code_idx
  ON employers (employer_code)
  WHERE employer_code IS NOT NULL AND deleted_at IS NULL;
