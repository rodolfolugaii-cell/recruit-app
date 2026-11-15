# Supabase setup

Every SQL statement this app needs, in one place. Before this folder existed the
DDL was scattered through comment blocks in `PdfMapper.tsx`, `TrashDashboard.tsx`,
`TrashZone.tsx` and `lib/employers.ts`, which meant no single answer to "what does
a fresh database need?".

## Running them

Open **Supabase → SQL Editor**, paste each file's contents, run them **in filename
order**. Later files reference tables from earlier ones, so the order matters.

| File | What it adds |
|---|---|
| `20260818000100_applicants.sql` | `applicants` — the helper's record, plus the signature and soft-delete columns added later |
| `20260818000200_pdf_field_mappings.sql` | `pdf_field_mappings` — where each biodata field is stamped, plus per-field `font_size` |
| `20260818000300_employers.sql` | `employers`, and `applicants.employer_id` / `contract_data` for the assignment |
| `20260818000400_contracts.sql` | `contracts`, its RLS policy, and the two signing-link functions |
| `20260905000100_contract_field_edits.sql` | per-contract box moves and typed corrections for the ID 407 export |
| `20260908000100_applicant_documents.sql` | `applicants.documents` — the six required copies, ticked off per helper |
| `20260912000100_field_alignment.sql` | `pdf_field_mappings.align` — left or centred text, per mapped box |
| `20261031000100_applicant_duplicates.sql` | auto-trash of repeat applications (same name + mobile), the two `/apply` functions for editing an earlier application, and a one-time cleanup of existing duplicates |
| `20261031000200_uppercase_names.sql` | applicant names kept in CAPITALS by a trigger, and existing names converted |
| `20261031000300_employer_trash.sql` | `employers.deleted_at` — deleting an employer moves it to the Trash instead of erasing it |
| `20261104000100_employee_codes.sql` | `applicants.employee_code` — a unique 5-character ID given to every helper on insert, and to every existing helper |
| `20261104000200_employer_codes.sql` | `employers.employer_code` — the employer's own ID, typed on the employer form; kept in capitals and unique among employers not in the Trash |
| `20261104000300_numeric_employee_codes.sql` | employee IDs become five digits (10000–99999, e.g. `43400`); converts every existing lettered ID |
| `20261114000100_passport_visa_uploads.sql` | optional passport + visa uploads from `/apply`: `applicants.passport_path` / `visa_path`, the **private** `applicant-documents` bucket and its policies, and the two `/apply` functions updated to match |
| `20261114000200_admin_role.sql` | makes the **first admin** — put your sign-in email in it before running. Every later admin or recruiter is created on the Users page |
| `20261114000300_duplicate_name_or_mobile.sql` | a repeat **name or** a repeat **mobile** now counts as a duplicate (before, both had to match): `/apply` stops on either, the insert trigger trashes either, and an edit can't take another application's name or mobile. Existing applications are not re-checked |

**They are safe to re-run and safe on the live database.** Every table is
`CREATE TABLE IF NOT EXISTS`, every later column is a separate
`ADD COLUMN IF NOT EXISTS`, and nothing drops or retypes an existing object. If a
table is already there, its file is a no-op.

Note that `0100` and `0200` reconstruct tables that were originally created by
hand in the dashboard — they are written from what the code reads and writes. On
your existing database they will do nothing; they exist so a fresh environment
(a staging project, a new developer) can be brought up from zero.

If you later adopt the Supabase CLI, this is already the layout it expects:
`supabase db push` will apply them in the same order.

## Storage buckets — dashboard, not SQL

Two buckets are needed, both **public**:

| Bucket | Holds |
|---|---|
| `applicant-photos` | applicant photos, all signatures (applicant, employer, helper, witnesses), employer banners and logos |
| `pdf-templates` | the rendered biodata page images, `biodata-p1.png` and `biodata-p2.png` |

Create them under **Storage → New bucket** with **Public** switched on.

The one exception is `applicant-documents` (passports and visas), which is
**private** and *is* created by `20261114000100_passport_visa_uploads.sql`,
together with its own policies. Those policies only name that new bucket, so
they cannot clash with the ones on the two public buckets.

These are deliberately not scripted. Bucket policies live in `storage.objects`,
and generating policies here risks conflicting with the working ones you already
have — a broken policy would stop `/apply` uploading photos, which is worse than
a manual step. The one requirement is that **anonymous inserts are allowed on
`applicant-photos`**, since `/apply` and both signing links upload without a
login. That already works today.

Everything reuses `applicant-photos` rather than adding buckets per feature, so
there is no new policy to get wrong each time.

## Security note on `0400`

`/contract/<token>` is public and the app reaches Supabase with the **anon key
from the browser**. Any row-level policy loose enough for that page to read a
contract by token would equally allow `select * from contracts` — every
employer's name, address and wage figure. The token is a filter the client
chooses, not a permission.

So anon is given **no access to `contracts` at all**. The only way in is the two
`SECURITY DEFINER` functions in `0400`, each taking a token and touching exactly
the one row it matches. Recruiters are authenticated and query the table
normally. If you change that policy, re-read the header of `0400` first.

## Environment

The app also needs `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Both come from **Settings → API**.

The Users page (admins only) also needs the **service role** key, on the server
only:

```
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

It is the `service_role` key under **Settings → API**. Never give it a
`NEXT_PUBLIC_` prefix — that would ship it to every browser, and it can do
anything to the project. Only `src/app/api/users/route.ts` reads it, and only
after checking the caller is a signed-in admin. On Vercel, set the same two under
**Settings → Environment Variables**, ticked for **Preview** as well as
Production — a preview build reads the Preview values and fails without them.
