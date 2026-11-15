/**
 * nameParts.ts — an applicant's name as separate parts.
 *
 * /apply asks for First, Middle and Last name plus an optional Suffix, so the
 * team can tell which word is the surname. The parts are saved in form_data
 * (firstName / middleName / lastName / suffix), and full_name is built from
 * them as "FIRST MIDDLE LAST SUFFIX", so every card, PDF and duplicate check
 * that reads full_name keeps working unchanged.
 *
 * Applications sent before the split have no parts saved, only full_name.
 * Nothing guesses the split for them — the recruiter can fill the parts in from
 * the Edit form.
 */

export interface NameParts {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
}

export const EMPTY_NAME: NameParts = { firstName: "", middleName: "", lastName: "", suffix: "" };

export const SUFFIX_OPTIONS = ["JR.", "SR.", "II", "III", "IV", "V"] as const;

/** Capitals, single spaces, no spaces at the ends. */
export const tidyNamePart = (s: string | null | undefined) =>
  (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/** "FIRST MIDDLE LAST SUFFIX", skipping any part left blank. */
export function composeFullName(p: Partial<NameParts>): string {
  return [p.firstName, p.middleName, p.lastName, p.suffix].map(tidyNamePart).filter(Boolean).join(" ");
}

/** The tidied parts, ready to go into form_data. */
export function tidyNameParts(p: Partial<NameParts>): NameParts {
  return {
    firstName:  tidyNamePart(p.firstName),
    middleName: tidyNamePart(p.middleName),
    lastName:   tidyNamePart(p.lastName),
    suffix:     tidyNamePart(p.suffix),
  };
}

/** The parts saved in an application's form_data, or null if it predates the split. */
export function namePartsOf(formData: unknown): NameParts | null {
  const fd = formData && typeof formData === "object" ? (formData as Record<string, unknown>) : {};
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const parts = { firstName: s(fd.firstName), middleName: s(fd.middleName), lastName: s(fd.lastName), suffix: s(fd.suffix) };
  return parts.firstName || parts.lastName ? parts : null;
}
