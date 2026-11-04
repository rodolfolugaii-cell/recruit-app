-- ============================================================================
-- 20261104000100 — employee IDs
--
-- Every helper gets a short ID that a recruiter can read out over the phone or
-- write on a folder: five characters, capital letters and digits, e.g. 4K7Q2.
--
--   Alphabet  23456789ABCDEFGHJKLMNPQRSTUVWXYZ — 32 characters. 0/O and 1/I are
--             left out because they are mistaken for each other when read
--             aloud or handwritten.
--   Space     32^5 ≈ 33.5 million codes, so a clash is rare; when one happens
--             the generator simply draws again, and the unique index is the
--             final guarantee.
--
-- The code is given out by the database on insert, so /apply, the duplicate
-- trigger and anything else that creates a helper all get one without asking.
-- Every helper already in the table — on a board or in the Trash — is given
-- one at the bottom of this file.
--
-- Safe to re-run: existing codes are never changed.
-- ============================================================================

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

-- ── A fresh, unused code ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION new_employee_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  code TEXT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..5 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM applicants WHERE employee_code = code);
  END LOOP;
  RETURN code;
END;
$$;
REVOKE ALL ON FUNCTION new_employee_code() FROM PUBLIC;

-- ── Trigger: every new helper gets one; any code given is kept in capitals ──
-- SECURITY DEFINER because /apply inserts as anon, which cannot read the table
-- the generator checks for clashes.
CREATE OR REPLACE FUNCTION applicants_employee_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code IS NULL OR btrim(NEW.employee_code) = '' THEN
    NEW.employee_code := new_employee_code();
  ELSE
    NEW.employee_code := upper(btrim(NEW.employee_code));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applicants_employee_code ON applicants;
CREATE TRIGGER applicants_employee_code
  BEFORE INSERT OR UPDATE OF employee_code ON applicants
  FOR EACH ROW EXECUTE FUNCTION applicants_employee_code();

-- ── Backfill: one row at a time, so each new code sees the ones before it ───
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM applicants WHERE employee_code IS NULL ORDER BY created_at LOOP
    UPDATE applicants SET employee_code = new_employee_code() WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS applicants_employee_code_idx ON applicants (employee_code);
