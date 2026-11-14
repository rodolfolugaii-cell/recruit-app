-- ============================================================================
-- 20261114000100 — passport and visa uploads
--
-- /apply now offers an OPTIONAL upload of the applicant's passport and visa,
-- one image each. Recruiters see them as thumbnails at the end of the profile
-- pop-up.
--
-- Why a separate, PRIVATE bucket
-- ------------------------------
-- Everything else (photos, signatures, employer banners) sits in the public
-- `applicant-photos` bucket, where anyone holding a URL can open the file.
-- Passports and visas are identity documents, so they go in
-- `applicant-documents`, which is not public:
--
--   anon + staff   may UPLOAD (the apply form runs without a login)
--   staff only     may VIEW (through short-lived signed URLs) and DELETE
--
-- Nobody can list or read the bucket without signing in — not even the
-- applicant who uploaded the file.
--
-- The row stores the object PATH, not a URL: a signed URL expires, the path
-- does not.
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS passport_path TEXT,
  ADD COLUMN IF NOT EXISTS visa_path     TEXT;

-- ── The bucket: private, images only, 10 MB per file ────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('applicant-documents', 'applicant-documents', false, 10485760, ARRAY['image/*'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Who may do what, in that bucket only ────────────────────────────────────
DROP POLICY IF EXISTS applicant_documents_upload ON storage.objects;
CREATE POLICY applicant_documents_upload ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'applicant-documents');

DROP POLICY IF EXISTS applicant_documents_staff_read ON storage.objects;
CREATE POLICY applicant_documents_staff_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'applicant-documents');

DROP POLICY IF EXISTS applicant_documents_staff_delete ON storage.objects;
CREATE POLICY applicant_documents_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'applicant-documents');

-- ============================================================================
-- The two /apply functions from 20261031000100, taught about the documents.
--
-- find_my_application only says WHETHER each document is on file — the path is
-- of no use to an anonymous visitor, who cannot read the bucket anyway.
-- update_my_application keeps the existing document unless a new one was
-- uploaded with the edit.
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
    'form_data',     r.form_data,
    'has_passport',  r.passport_path IS NOT NULL,
    'has_visa',      r.visa_path IS NOT NULL
  );
END;
$$;

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
    passport_path = COALESCE(NULLIF(p_row->>'passport_path', ''), passport_path),
    visa_path     = COALESCE(NULLIF(p_row->>'visa_path', ''), visa_path),
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
