-- ============================================================================
-- contracts.sql — ID 407 employment contracts and the public signing links.
--
-- Run this once in the Supabase SQL Editor. It is safe to re-run.
--
-- THE POINT OF THIS FILE
-- ----------------------
-- /contract/<token> is a public page and the app talks to Supabase with the
-- anon key from the browser. If anon could read `contracts` directly, then any
-- policy permissive enough to fetch one row by token would also allow
--
--     select * from contracts;
--
-- returning every employer's name, address and wage figure. The token is a
-- filter the client chooses, not a permission.
--
-- So anon is given NO access to the table. The only way in is the two
-- SECURITY DEFINER functions at the bottom, each of which takes a token and
-- touches exactly the one row it matches. Recruiters are authenticated and
-- query the table normally.
-- ============================================================================

CREATE TABLE IF NOT EXISTS contracts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ,

  applicant_id   UUID NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
  employer_id    UUID          REFERENCES employers(id)  ON DELETE SET NULL,

  status         TEXT  NOT NULL DEFAULT 'Draft',
  terms          JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- One token per party. A forwarded employer link therefore cannot be used to
  -- sign as the helper, and revoking one side does not disturb the other.
  employer_token UUID NOT NULL DEFAULT gen_random_uuid(),
  helper_token   UUID NOT NULL DEFAULT gen_random_uuid(),

  employer_name      TEXT,
  employer_signature TEXT,
  employer_signed_at TIMESTAMPTZ,
  helper_name        TEXT,
  helper_signature   TEXT,
  helper_signed_at   TIMESTAMPTZ,

  -- Both witnesses are agency staff, signed from the dashboard rather than by link
  employer_witness_name      TEXT,
  employer_witness_signature TEXT,
  helper_witness_name        TEXT,
  helper_witness_signature   TEXT
);

-- Token lookup is the hot path for the public page, and must stay unique
CREATE UNIQUE INDEX IF NOT EXISTS contracts_employer_token_idx ON contracts (employer_token);
CREATE UNIQUE INDEX IF NOT EXISTS contracts_helper_token_idx   ON contracts (helper_token);
CREATE INDEX        IF NOT EXISTS contracts_applicant_idx      ON contracts (applicant_id);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Recruiters (signed in) get full access. anon gets no policy at all, which
-- under RLS means no rows — deliberately.
DROP POLICY IF EXISTS contracts_staff ON contracts;
CREATE POLICY contracts_staff ON contracts
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ============================================================================
-- contract_by_token — what a signing link is allowed to see.
--
-- Returns only the fields the signing page renders. Notably it does NOT return
-- the other party's token, the row id, or anything about other contracts.
-- An unknown token returns NULL rather than raising, so the page can show a
-- plain "link not valid" instead of an error.
-- ============================================================================
CREATE OR REPLACE FUNCTION contract_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      contracts%ROWTYPE;
  ap     applicants%ROWTYPE;
  em     employers%ROWTYPE;
  party  TEXT;
BEGIN
  SELECT * INTO r FROM contracts
   WHERE employer_token = p_token OR helper_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  party := CASE WHEN r.employer_token = p_token THEN 'employer' ELSE 'helper' END;

  SELECT * INTO ap FROM applicants WHERE id = r.applicant_id;
  SELECT * INTO em FROM employers  WHERE id = r.employer_id;

  RETURN jsonb_build_object(
    'party',            party,
    'status',           r.status,
    'terms',            r.terms,
    'signed',           CASE WHEN party = 'employer'
                             THEN r.employer_signed_at IS NOT NULL
                             ELSE r.helper_signed_at   IS NOT NULL END,
    'helper_name',      ap.full_name,
    'helper_photo',     ap.photo_url,
    'helper_origin',    ap.nationality,
    'employer_name',    em.name,
    'employer_address', COALESCE(em.employer_data->>'residenceAddress', em.address)
  );
END;
$$;

-- ============================================================================
-- sign_contract — record one party's signature.
--
-- Refuses a second signature from the same party, so a re-submitted or replayed
-- form cannot overwrite what was already agreed. The contract only reaches
-- 'Signed' once both sides are in.
-- ============================================================================
CREATE OR REPLACE FUNCTION sign_contract(p_token UUID, p_name TEXT, p_signature TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r contracts%ROWTYPE;
BEGIN
  IF COALESCE(TRIM(p_name), '') = '' OR COALESCE(TRIM(p_signature), '') = '' THEN
    RAISE EXCEPTION 'A name and a signature are both required.';
  END IF;

  SELECT * INTO r FROM contracts
   WHERE employer_token = p_token OR helper_token = p_token
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This signing link is not valid.';
  END IF;

  IF r.employer_token = p_token THEN
    IF r.employer_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This contract has already been signed by the employer.';
    END IF;
    UPDATE contracts SET
      employer_name      = p_name,
      employer_signature = p_signature,
      employer_signed_at = NOW(),
      updated_at         = NOW(),
      status = CASE WHEN helper_signed_at IS NOT NULL THEN 'Signed' ELSE 'Partly Signed' END
     WHERE id = r.id;
  ELSE
    IF r.helper_signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This contract has already been signed by the helper.';
    END IF;
    UPDATE contracts SET
      helper_name      = p_name,
      helper_signature = p_signature,
      helper_signed_at = NOW(),
      updated_at       = NOW(),
      status = CASE WHEN employer_signed_at IS NOT NULL THEN 'Signed' ELSE 'Partly Signed' END
     WHERE id = r.id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Only these two entry points are exposed to the public page.
REVOKE ALL ON FUNCTION contract_by_token(UUID)            FROM PUBLIC;
REVOKE ALL ON FUNCTION sign_contract(UUID, TEXT, TEXT)    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contract_by_token(UUID)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sign_contract(UUID, TEXT, TEXT) TO anon, authenticated;
