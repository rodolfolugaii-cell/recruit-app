-- ============================================================================
-- 20261114000300 — a repeat NAME or a repeat MOBILE is a duplicate
--
-- 20261031000100 treated an application as a repeat only when BOTH the name
-- and the mobile matched an earlier one. Now either is enough:
--
--   same name, different mobile    -> duplicate
--   same mobile, different name    -> duplicate
--   same name and same mobile      -> duplicate (as before)
--
-- "Same" still means what applicant_name_key / applicant_mobile_key say
-- (case and spacing ignored for names; last 8 digits for mobiles), and only
-- applications NOT in the Trash count.
--
-- What changes
-- ------------
--   check_application_conflict  NEW. /apply asks it on leaving step 1. It
--       answers only yes/no for the name and for the mobile — never whose
--       application it is or anything in it — and the form will not go on
--       when either is yes.
--   applicants_trash_duplicate  the insert trigger now trashes a repeat on
--       name OR mobile, so an application that slips past the form check
--       still lands in the Trash.
--   update_my_application  refuses an edit that would change the name or
--       mobile to one another live application already uses.
--
-- What does NOT change
-- --------------------
--   find_my_application / applicant_original still need BOTH to match. That
--   is the "edit your earlier application" pop-up, which pre-fills the form
--   with the earlier answers — matching on the name alone would show a
--   stranger's details to anyone who typed a common name.
--
-- Existing applications are NOT re-checked: two already on the board that
-- share only a name or only a mobile both stay where they are. To see them:
--
--   SELECT 'name' AS shared, full_name, mobile, created_at FROM applicants a
--    WHERE status IS DISTINCT FROM 'Deleted' AND applicant_name_key(full_name) <> ''
--      AND EXISTS (SELECT 1 FROM applicants b WHERE b.id <> a.id
--                    AND b.status IS DISTINCT FROM 'Deleted'
--                    AND applicant_name_key(b.full_name) = applicant_name_key(a.full_name))
--   UNION ALL
--   SELECT 'mobile', full_name, mobile, created_at FROM applicants a
--    WHERE status IS DISTINCT FROM 'Deleted' AND applicant_mobile_key(mobile) <> ''
--      AND EXISTS (SELECT 1 FROM applicants b WHERE b.id <> a.id
--                    AND b.status IS DISTINCT FROM 'Deleted'
--                    AND applicant_mobile_key(b.mobile) = applicant_mobile_key(a.mobile))
--   ORDER BY 1, 3, 4;
--
-- Needs 20261031000100 and 20261114000100 first. Safe to re-run.
-- ============================================================================

-- The name lookup is served by applicants_identity_idx (name key first); this
-- one serves the mobile lookup on its own.
CREATE INDEX IF NOT EXISTS applicants_mobile_key_idx
  ON applicants (applicant_mobile_key(mobile));

-- ── The earliest live application sharing the name OR the mobile ────────────
-- p_exclude leaves one application out — the one being edited.
CREATE OR REPLACE FUNCTION applicant_first_match(p_name TEXT, p_mobile TEXT, p_exclude UUID DEFAULT NULL)
RETURNS applicants
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM applicants
   WHERE status IS DISTINCT FROM 'Deleted'
     AND (p_exclude IS NULL OR id <> p_exclude)
     AND (   (applicant_name_key(p_name)     <> '' AND applicant_name_key(full_name) = applicant_name_key(p_name))
          OR (applicant_mobile_key(p_mobile) <> '' AND applicant_mobile_key(mobile)  = applicant_mobile_key(p_mobile)))
   ORDER BY created_at, id
   LIMIT 1;
$$;
REVOKE ALL ON FUNCTION applicant_first_match(TEXT, TEXT, UUID) FROM PUBLIC;

-- ── What /apply asks: is this name taken? is this mobile taken? ─────────────
CREATE OR REPLACE FUNCTION check_application_conflict(p_name TEXT, p_mobile TEXT, p_exclude UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'name', applicant_name_key(p_name) <> '' AND EXISTS (
              SELECT 1 FROM applicants
               WHERE status IS DISTINCT FROM 'Deleted'
                 AND (p_exclude IS NULL OR id <> p_exclude)
                 AND applicant_name_key(full_name) = applicant_name_key(p_name)),
    'mobile', applicant_mobile_key(p_mobile) <> '' AND EXISTS (
              SELECT 1 FROM applicants
               WHERE status IS DISTINCT FROM 'Deleted'
                 AND (p_exclude IS NULL OR id <> p_exclude)
                 AND applicant_mobile_key(mobile) = applicant_mobile_key(p_mobile))
  );
$$;
REVOKE ALL ON FUNCTION check_application_conflict(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_application_conflict(TEXT, TEXT, UUID) TO anon, authenticated;

-- ── Trigger: a repeat name OR mobile goes straight to the Trash ─────────────
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

  orig := applicant_first_match(NEW.full_name, NEW.mobile);
  IF orig.id IS NOT NULL THEN
    NEW.status       := 'Deleted';
    NEW.deleted_at   := NOW();
    NEW.deleted_from := 'New';
    NEW.duplicate_of := orig.id;
  END IF;
  RETURN NEW;
END;
$$;
-- The trigger itself (applicants_trash_duplicate, BEFORE INSERT) is unchanged
-- and already points at this function.

-- ── update_my_application: as in 20261114000100, plus the clash check ───────
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
  orig  applicants%ROWTYPE;
  clash applicants%ROWTYPE;
BEGIN
  orig := applicant_original(p_lookup_name, p_lookup_mobile);
  IF orig.id IS NULL OR orig.id <> p_id THEN
    RAISE EXCEPTION 'Your previous application could not be found.';
  END IF;

  clash := applicant_first_match(
             COALESCE(NULLIF(btrim(p_row->>'full_name'), ''), orig.full_name),
             NULLIF(p_row->>'mobile', ''),
             p_id);
  IF clash.id IS NOT NULL THEN
    RAISE EXCEPTION 'Another application already uses this name or mobile number.';
  END IF;

  UPDATE applicants SET
    full_name     = COALESCE(NULLIF(btrim(p_row->>'full_name'), ''), full_name),
    date_of_birth = NULLIF(p_row->>'date_of_birth', '')::DATE,
    nationality   = NULLIF(p_row->>'nationality', ''),
    gender        = NULLIF(p_row->>'gender', ''),
    mobile        = NULLIF(p_row->>'mobile', ''),
    photo_url     = COALESCE(NULLIF(p_row->>'photo_url', ''), photo_url),
    signature_url = COALESCE(NULLIF(p_row->>'signature_url', ''), signature_url),
    passport_path = COALESCE(NULLIF(p_row->>'passport_path', ''), passport_path),
    visa_path     = COALESCE(NULLIF(p_row->>'visa_path', ''), visa_path),
    signed_at     = NOW(),
    form_data     = COALESCE(form_data, '{}'::jsonb) || COALESCE(p_row->'form_data', '{}'::jsonb)
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION update_my_application(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_my_application(UUID, TEXT, TEXT, JSONB) TO anon, authenticated;
