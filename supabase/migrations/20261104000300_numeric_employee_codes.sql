-- ============================================================================
-- 20261104000300 — employee IDs become numbers only
--
-- 20261104000100 gave every helper a five-character ID of letters and digits
-- (e.g. 4K7Q2). IDs are now five DIGITS, e.g. 43400:
--
--   Range   10000–99999. Never starting with 0, so the ID survives being typed
--           into a spreadsheet or a phone keypad without losing a digit.
--   Space   90,000 IDs. A clash simply draws again, and the unique index from
--           0100 remains the final guarantee.
--
-- This file replaces the generator (so every new helper gets a numeric ID) and
-- then gives every existing helper whose ID is not already five digits a new
-- one — helpers in the Trash included. An ID that is already numeric is kept.
--
-- Safe to re-run: the second run finds nothing left to convert.
-- ============================================================================

CREATE OR REPLACE FUNCTION new_employee_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  code TEXT;
BEGIN
  LOOP
    code := (10000 + floor(random() * 90000))::INT::TEXT;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM applicants WHERE employee_code = code);
  END LOOP;
  RETURN code;
END;
$$;
REVOKE ALL ON FUNCTION new_employee_code() FROM PUBLIC;

-- ── Convert: one row at a time, so each new ID sees the ones before it ──────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM applicants
     WHERE employee_code IS NULL OR employee_code !~ '^[1-9][0-9]{4}$'
     ORDER BY created_at
  LOOP
    UPDATE applicants SET employee_code = new_employee_code() WHERE id = r.id;
  END LOOP;
END;
$$;
