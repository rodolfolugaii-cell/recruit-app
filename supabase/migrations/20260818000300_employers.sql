-- ============================================================================
-- 0300 — employers, and assigning a helper to one
--
-- An employer is the household a helper gets placed with. It owns the residence
-- and everything about it, because those answers are the same for every helper
-- that household takes on:
--
--   employer_data          ID 407 Clause 3 and Schedule items 2 and 3 —
--                          address, flat size, who lives there, the servant
--                          room, the eight facilities.
--
--   contracts.terms        the placement — wages, commencement, duties,
--                          witnesses. Different for each helper even under the
--                          same employer, so it lives in 0400 instead.
--
-- None of this can come from /apply. Every ID 407 field outside the helper's own
-- name, place of origin and signature is entered by a recruiter.
-- ============================================================================

CREATE TABLE IF NOT EXISTS employers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name           TEXT NOT NULL,
  banner_url     TEXT,
  logo_url       TEXT,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  status         TEXT DEFAULT 'Active',   -- Active | Prospect | Inactive

  employer_data  JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ── Assignment ──────────────────────────────────────────────────────────────
-- ON DELETE SET NULL rather than CASCADE: removing an employer must never take
-- the helpers' records with it, only leave them unassigned.
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS employer_id   UUID REFERENCES employers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_data JSONB;

-- The Employers page counts assigned helpers per employer
CREATE INDEX IF NOT EXISTS applicants_employer_id_idx ON applicants (employer_id);
