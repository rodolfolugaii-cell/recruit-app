/**
 * helperDocuments.ts — the paperwork each helper has to hand in.
 *
 * Six copies are required before a placement can proceed. The agency chases
 * them one at a time over days or weeks, so what matters is knowing at a glance
 * which are in and which are still outstanding.
 *
 * Each ticked document stores the ISO time it was ticked rather than `true`.
 * One field then answers both questions a recruiter asks — is it in, and how
 * long has it been sitting there — and an untouched document is simply absent.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * supabase/migrations/20260908000100_applicant_documents.sql
 * ────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./supabase";

/**
 * In the order the agency collects them. `key` is what lands in the database,
 * so renaming one would orphan every tick already recorded against it — add a
 * new key instead.
 */
export const HELPER_DOCUMENTS = [
  { key: "hkid",              label: "HKID",             full: "Copy of HKID" },
  { key: "passport",          label: "Passport",         full: "Copy of Passport" },
  { key: "visa_a4",           label: "A4 Visa",          full: "Copy of A4 size Visa" },
  { key: "visa_endorsement",  label: "Endorsement",      full: "Copy of Endorsement Visa" },
  { key: "old_contract",      label: "Old Contract",     full: "Copy of Old Contract" },
  { key: "id407e",            label: "ID407E",           full: "Copy of ID407E" },
] as const;

export type DocumentKey = (typeof HELPER_DOCUMENTS)[number]["key"];

/** Ticked documents, each holding the moment it was ticked. */
export type DocumentRecord = Partial<Record<DocumentKey, string>>;

export const TOTAL_DOCUMENTS = HELPER_DOCUMENTS.length;

/** How many of the six are in. */
export function documentsDone(docs: DocumentRecord | null | undefined): number {
  if (!docs) return 0;
  return HELPER_DOCUMENTS.filter(d => !!docs[d.key]).length;
}

export function allDocumentsIn(docs: DocumentRecord | null | undefined): boolean {
  return documentsDone(docs) === TOTAL_DOCUMENTS;
}

/**
 * The record with one document flipped.
 *
 * Un-ticking deletes the key rather than storing `false`, so the shape stays
 * "these are the ones we have" and a document that was never asked about reads
 * the same as one that was ticked and undone.
 */
export function toggleDocument(
  docs: DocumentRecord | null | undefined,
  key: DocumentKey,
): DocumentRecord {
  const next: DocumentRecord = { ...(docs ?? {}) };
  if (next[key]) delete next[key];
  else next[key] = new Date().toISOString();
  return next;
}

/**
 * The column is added by hand like the rest of the schema, so a missing one is
 * a normal first-run state rather than a bug.
 */
export function documentsSetupHint(message: string): string | null {
  if (/documents/i.test(message) && /column|does not exist|schema cache/i.test(message)) {
    return "Document tracking needs a one-time database update — run the migrations in supabase/migrations/.";
  }
  return null;
}

/** Persist the whole record for one applicant. */
export async function saveDocuments(
  applicantId: string,
  docs: DocumentRecord,
): Promise<void> {
  const { error } = await supabase
    .from("applicants")
    .update({ documents: docs })
    .eq("id", applicantId);
  if (error) throw new Error(documentsSetupHint(error.message) ?? error.message);
}
