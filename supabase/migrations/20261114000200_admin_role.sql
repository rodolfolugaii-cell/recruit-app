-- ============================================================================
-- 20261114000200 — the first admin
--
-- Portal logins now have a role, Admin or Recruiter, kept in the login's
-- app_metadata (see src/lib/roles.ts). Admins get the Users page, where they
-- create and manage every other login; a login with no role is a Recruiter.
--
-- Only the server can set a role, so the very first admin has to be made here.
-- Put YOUR sign-in email in place of the placeholder below and run this file
-- once. Every admin after that is made from the Users page.
--
-- No table or column is added: Supabase already has app_metadata on every
-- login. Safe to re-run; with the placeholder left in, it changes nothing.
-- ============================================================================

UPDATE auth.users
   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
 WHERE lower(email) = lower('YOUR-EMAIL@example.com');

-- Check it worked — your email should be listed with role "admin":
SELECT email, raw_app_meta_data->>'role' AS role
  FROM auth.users
 ORDER BY created_at;
