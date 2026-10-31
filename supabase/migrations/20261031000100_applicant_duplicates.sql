-- ============================================================================
-- 20261031000100 — duplicate applications
--
-- One person, one application. The FIRST submission for a given full name +
-- mobile number is the one that counts; any later submission with the same
-- pair lands straight in the Trash, pointing back at the original through
-- duplicate_of.
--
-- What "the same" means
-- ---------------------
--   name    case-insensitive, surrounding spaces trimmed, inner runs of
--           whitespace collapsed:  "  Maria  Santos " = "maria santos"
--   mobile  digits only, compared on the LAST 8 digits, so the same phone typed
--           as "+852 9123 4567", "91234567" or "852-9123-4567" matches, and so
--           does "+63 917 123 4567" against "0917 123 4567".
--
-- The trigger and the two /apply functions all go through applicant_name_key /
-- applicant_mobile_key, so they can never disagree about what a duplicate is.
--
-- Why SECURITY DEFINER
-- --------------------
-- /apply runs with the anon key and must not be able to read the applicants
-- table. The duplicate check and the "edit my application" flow therefore go
-- through functions that touch only the one row matching BOTH name and mobile,
-- the same pattern as the contract signing links in 0400.
--
-- Safe to re-run. The cleanup at the bottom only trashes rows that are still
-- live duplicates, so a second run finds nothing to do.
-- ============================================================================

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES applicants(id) ON DELETE SET NULL;

-- ── Matching keys ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION applicant_name_key(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION applicant_mobile_key(p_mobile TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT right(regexp_replace(COALESCE(p_mobile, ''), '\D', '', 'g'), 8);
$$;

CREATE INDEX IF NOT EXISTS applicants_identity_idx
  ON applicants (applicant_name_key(full_name), applicant_mobile_key(mobile));

-- ── The earliest live application for a name + mobile ───────────────────────
-- "Live" = anything not already in the Trash. A person whose application was
-- deleted by a recruiter can therefore apply afresh.
CREATE OR REPLACE FUNCTION applicant_original(p_name TEXT, p_mobile TEXT)
RETURNS applicants
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM applicants
   WHERE applicant_name_key(p_name)     <> ''
     AND applicant_mobile_key(p_mobile) <> ''
     AND applicant_name_key(full_name)  = applicant_name_key(p_name)
     AND applicant_mobile_key(mobile)   = applicant_mobile_key(p_mobile)
     AND status IS DISTINCT FROM 'Deleted'
   ORDER BY created_at, id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION applicant_original(TEXT, TEXT) FROM PUBLIC;

-- ── Trigger: a repeat submission goes straight to the Trash ─────────────────
-- deleted_from = 'New' so Restore puts it on the Candidates board, where every
-- fresh submission would have landed anyway.
CREATE OR REPLACE FUNCTION applicants_trash_duplicate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orig applicants%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM 'Deleted' THEN
    RETURN NEW;
  END IF;

  orig := applicant_original(NEW.full_name, NEW.mobile);
  IF orig.id IS NOT NULL THEN
    NEW.status       := 'Deleted';
    NEW.deleted_at   := NOW();
    NEW.deleted_from := 'New';
    NEW.duplicate_of := orig.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applicants_trash_duplicate ON applicants;
CREATE TRIGGER applicants_trash_duplicate
  BEFORE INSERT ON applicants
  FOR EACH ROW EXECUTE FUNCTION applicants_trash_duplicate();

-- ============================================================================
-- find_my_application — what /apply sees when a name + mobile is already on file.
--
-- Returns the fields the form needs to pre-fill itself, or NULL when there is
-- no match. Never returns the signature (they sign again), the status, or
-- anything about the employer or contract.
-- ============================================================================
CREATE OR REPLACE FUNCTION find_my_application(p_name TEXT, p_mobile TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r applicants%ROWTYPE;
BEGIN
  r := applicant_original(p_name, p_mobile);
  IF r.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',            r.id,
    'full_name',     r.full_name,
    'date_of_birth', r.date_of_birth,
    'nationality',   r.nationality,
    'gender',        r.gender,
    'mobile',        r.mobile,
    'photo_url',     r.photo_url,
    'form_data',     r.form_data
  );
END;
$$;

-- ============================================================================
-- update_my_application — save an edit over the original application.
--
-- p_id must be the row find_my_application returned AND still match the name +
-- mobile the applicant looked it up with, so an id on its own is useless.
-- Only the applicant's own fields are written; status, employer and contract
-- are left alone. form_data is MERGED, so any key a recruiter added that the
-- apply form does not know about survives the edit.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_my_application(
  p_id            UUID,
  p_lookup_name   TEXT,
  p_lookup_mobile TEXT,
  p_row           JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  orig applicants%ROWTYPE;
BEGIN
  orig := applicant_original(p_lookup_name, p_lookup_mobile);
  IF orig.id IS NULL OR orig.id <> p_id THEN
    RAISE EXCEPTION 'Your previous application could not be found.';
  END IF;

  UPDATE applicants SET
    full_name     = COALESCE(NULLIF(btrim(p_row->>'full_name'), ''), full_name),
    date_of_birth = NULLIF(p_row->>'date_of_birth', '')::DATE,
    nationality   = NULLIF(p_row->>'nationality', ''),
    gender        = NULLIF(p_row->>'gender', ''),
    mobile        = NULLIF(p_row->>'mobile', ''),
    photo_url     = COALESCE(NULLIF(p_row->>'photo_url', ''), photo_url),
    signature_url = COALESCE(NULLIF(p_row->>'signature_url', ''), signature_url),
    signed_at     = NOW(),
    form_data     = COALESCE(form_data, '{}'::jsonb) || COALESCE(p_row->'form_data', '{}'::jsonb)
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION find_my_application(TEXT, TEXT)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION update_my_application(UUID, TEXT, TEXT, JSONB)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION find_my_application(TEXT, TEXT)                TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_my_application(UUID, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ============================================================================
-- One-time cleanup — trash the duplicates already in the table.
--
-- For every name + mobile with more than one live application, the earliest is
-- kept and the rest go to the Trash with duplicate_of set. Each remembers the
-- board it was on, so Restore still works.
--
-- To see what this will touch BEFORE running the file, run this on its own:
--
--   SELECT created_at, full_name, mobile, board, has_employer, has_contract,
--          CASE WHEN rn = 1 THEN 'KEEP' ELSE 'TRASH' END AS action
--     FROM (
--       SELECT a.created_at, a.full_name, a.mobile,
--              COALESCE(a.status, 'New')                                       AS board,
--              a.employer_id IS NOT NULL                                       AS has_employer,
--              EXISTS (SELECT 1 FROM contracts c WHERE c.applicant_id = a.id) AS has_contract,
--              row_number() OVER w                                             AS rn,
--              count(*)     OVER (PARTITION BY applicant_name_key(a.full_name),
--                                              applicant_mobile_key(a.mobile)) AS n,
--              applicant_name_key(a.full_name)                                 AS name_key
--         FROM applicants a
--        WHERE a.status IS DISTINCT FROM 'Deleted'
--          AND applicant_name_key(a.full_name) <> ''
--          AND applicant_mobile_key(a.mobile)  <> ''
--       WINDOW w AS (PARTITION BY applicant_name_key(a.full_name), applicant_mobile_key(a.mobile)
--                    ORDER BY a.created_at, a.id)
--     ) d
--    WHERE n > 1
--    ORDER BY name_key, created_at;
--
-- This file creates applicant_name_key / applicant_mobile_key above, so run the
-- preview after the CREATE FUNCTION statements, or run the whole file only
-- once you are happy with what the preview shows.
-- ============================================================================
WITH ranked AS (
  SELECT id,
         status,
         first_value(id) OVER w AS keeper,
         row_number()    OVER w AS rn
    FROM applicants
   WHERE status IS DISTINCT FROM 'Deleted'
     AND applicant_name_key(full_name) <> ''
     AND applicant_mobile_key(mobile)  <> ''
  WINDOW w AS (PARTITION BY applicant_name_key(full_name), applicant_mobile_key(mobile)
               ORDER BY created_at, id)
)
UPDATE applicants a SET
  status       = 'Deleted',
  deleted_at   = NOW(),
  deleted_from = CASE WHEN r.status = 'For Review' THEN 'For Review' ELSE 'New' END,
  duplicate_of = r.keeper
  FROM ranked r
 WHERE a.id = r.id
   AND r.rn > 1;
