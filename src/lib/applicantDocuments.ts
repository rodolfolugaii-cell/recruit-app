/**
 * applicantDocuments.ts — the passport and visa an applicant may upload.
 *
 * They live in the PRIVATE `applicant-documents` bucket, not the public photo
 * bucket: anyone may upload (the apply form has no login), but only a signed-in
 * recruiter can view, through a signed URL that expires. The applicant row
 * keeps the object path; a URL is made fresh each time one is shown.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * supabase/migrations/20261114000100_passport_visa_uploads.sql
 * ────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./supabase";

export const DOCS_BUCKET = "applicant-documents";

export type DocumentKind = "passport" | "visa";

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  passport: "Passport",
  visa:     "Visa",
};

/** Matches the bucket's own limit — checked first so the applicant hears why. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Upload one document and return its path in the bucket. */
export async function uploadApplicantDocument(file: File, kind: DocumentKind): Promise<string> {
  const ext  = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${kind}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from(DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/** A URL a recruiter's browser can open for the next hour. */
export async function signedDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 60 * 60);
  if (error || !data) throw error ?? new Error("Could not open the document.");
  return data.signedUrl;
}

/** Remove documents for good — logged, never thrown, like the photo clean-up. */
export async function removeApplicantDocuments(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter(Boolean) as string[];
  if (!list.length) return;
  const { error } = await supabase.storage.from(DOCS_BUCKET).remove(list);
  if (error) console.warn("Could not remove some documents:", error.message);
}
