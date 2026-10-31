-- ============================================================================
-- 20261031000200 — applicant names in capitals
--
-- Every helper's name is stored, shown and exported in CAPITAL letters, the way
-- the government forms ask for it. The apply and edit forms already upper-case
-- as you type; this trigger makes it true for every other way a row can be
-- written too (the edit-my-application function, the dashboard, SQL by hand).
--
-- Safe to re-run. The one-time update at the bottom only touches names that
-- are not already in capitals.
-- ============================================================================

CREATE OR REPLACE FUNCTION applicants_upper_name()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name := upper(btrim(NEW.full_name));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applicants_upper_name ON applicants;
CREATE TRIGGER applicants_upper_name
  BEFORE INSERT OR UPDATE OF full_name ON applicants
  FOR EACH ROW EXECUTE FUNCTION applicants_upper_name();

-- Existing rows
UPDATE applicants
   SET full_name = upper(btrim(full_name))
 WHERE full_name IS DISTINCT FROM upper(btrim(full_name));
