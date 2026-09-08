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

Both come from **Settings → API**. On Vercel, set the same two under
**Settings → Environment Variables**, ticked for **Preview** as well as
Production — a preview build reads the Preview values and fails without them.
