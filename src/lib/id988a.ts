/**
 * id988a.ts — the ID 988A visa / extension-of-stay application, as a mappable form.
 *
 * ── The sheets ──────────────────────────────────────────────────────────────
 * Two A3 sheets, each carrying two A4 form pages side by side. Unlike ID 407
 * this one is in reading order rather than booklet imposition:
 *
 *   sheet 1  =  form page 1 (left)  |  form page 2 (right)
 *   sheet 2  =  form page 3 (left)  |  form page 4 (right)
 *
 * The scan measures 1222 x 838 pt. Section titles name the form page, because
 * that is what a recruiter is looking at on paper.
 *
 * ── Where these coordinates came from ───────────────────────────────────────
 * The supplied PDF is a flat scan with no text layer, so nothing could be read
 * off it directly. Instead the embedded JPEG was decoded and measured: every
 * tick box was found by flood-filling the white squares inside their borders,
 * which is why the checkbox positions are exact. The text lines were read off
 * the detected rules and a magnified grid, so they are close but not surveyed —
 * expect to nudge them in PDF Mapper, which is what it is for.
 *
 * ── Where the values come from ──────────────────────────────────────────────
 * More of this form is answerable from the helper's own record than ID 407 was,
 * because it is about her rather than the household. What the apply form never
 * asks for — her home address, travel document, HKID number — is left blank for
 * a recruiter to type straight onto the sheet.
 */

import type { FieldValues } from "./pdfDraw";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";
import type { FieldDef, FormSection } from "./pdfForms";
import { formDate } from "./formDates";

/** Measured from the supplied scan, not assumed. */
export const ID988A_PAGE_W = 1222;
export const ID988A_PAGE_H = 838;

/** Free text that runs over a run of ruled lines. */
export const ID988A_PARAGRAPHS: string[][] = [
  ["id988a_present_address_1",  "id988a_present_address_2",  "id988a_present_address_3"],
  ["id988a_domicile_address_1", "id988a_domicile_address_2", "id988a_domicile_address_3"],
  ["id988a_employer_address_1", "id988a_employer_address_2"],
  ["id988a_names_used_1",       "id988a_names_used_2"],
  ["id988a_refused_details_1",  "id988a_refused_details_2"],
  ["id988a_convicted_details_1","id988a_convicted_details_2"],
];

/** A dd / mm / yyyy trio, which this form uses in five places. */
const dateCells = (prefix: string, label: string): FieldDef[] => [
  { id: `${prefix}_dd`,   label: `${label} — dd`,   type: "text", defaultW: 28 },
  { id: `${prefix}_mm`,   label: `${label} — mm`,   type: "text", defaultW: 28 },
  { id: `${prefix}_yyyy`, label: `${label} — yyyy`, type: "text", defaultW: 42 },
];

/** One row of the working-experience table on form page 2. */
const experienceRow = (n: number): FieldDef[] => [
  { id: `id988a_exp${n}_employer`, label: `Experience ${n} — Employer`, type: "text", defaultW: 135 },
  { id: `id988a_exp${n}_address`,  label: `Experience ${n} — Address`,  type: "text", defaultW: 205 },
  { id: `id988a_exp${n}_from`,     label: `Experience ${n} — From`,     type: "text", defaultW: 82  },
  { id: `id988a_exp${n}_to`,       label: `Experience ${n} — To`,       type: "text", defaultW: 78  },
];

export const ID988A_SECTIONS: FormSection[] = [
  {
    title: "Application type & particulars (form page 1)", page: 1,
    fields: [
      // Measured: the four type boxes sit in one column at x 478
      { id: "id988a_type_entry",        label: "1(a) Entry visa",                     type: "checkbox" },
      { id: "id988a_type_renew_leave",  label: "1(b)(i) Renewal — taking home leave", type: "checkbox" },
      { id: "id988a_type_renew_defer",  label: "1(b)(ii) Renewal — deferring leave",  type: "checkbox" },
      { id: "id988a_type_extension",    label: "1(c) Extension of stay",              type: "checkbox" },

      { id: "id988a_surname",        label: "Surname in English",     type: "text", defaultW: 368 },
      { id: "id988a_given_names",    label: "Given names in English", type: "text", defaultW: 368 },
      { id: "id988a_maiden_surname", label: "Maiden surname",         type: "text", defaultW: 42  },
      { id: "id988a_name_chinese",   label: "Name in Chinese",        type: "text", defaultW: 140 },
      { id: "id988a_alias",          label: "Alias (if any)",         type: "text", defaultW: 450 },

      { id: "id988a_sex_male",   label: "Sex — Male",   type: "checkbox" },
      { id: "id988a_sex_female", label: "Sex — Female", type: "checkbox" },
      ...dateCells("id988a_dob", "Date of birth"),
      { id: "id988a_place_of_birth", label: "Place of birth", type: "text", defaultW: 58 },

      { id: "id988a_marital_single",    label: "Marital — Bachelor/Spinster", type: "checkbox" },
      { id: "id988a_marital_married",   label: "Marital — Married",           type: "checkbox" },
      { id: "id988a_marital_divorced",  label: "Marital — Divorced",          type: "checkbox" },
      { id: "id988a_marital_separated", label: "Marital — Separated",         type: "checkbox" },
      { id: "id988a_marital_widowed",   label: "Marital — Widowed",           type: "checkbox" },

      { id: "id988a_hkid_yes",    label: "HKID — Yes",         type: "checkbox" },
      { id: "id988a_hkid_no",     label: "HKID — No",          type: "checkbox" },
      { id: "id988a_hkid_number", label: "HKID number",        type: "text", defaultW: 105 },
      { id: "id988a_hkid_check",  label: "HKID check digit",   type: "text", defaultW: 16  },
      { id: "id988a_nationality", label: "Nationality",        type: "text", defaultW: 42  },
      { id: "id988a_occupation",  label: "Occupation",         type: "text", defaultW: 42  },

      { id: "id988a_travel_doc_type", label: "Travel document type", type: "text", defaultW: 60  },
      { id: "id988a_travel_doc_no",   label: "Travel document no.",  type: "text", defaultW: 240 },
      { id: "id988a_place_of_issue",  label: "Place of issue",       type: "text", defaultW: 42  },
      ...dateCells("id988a_issue",  "Date of issue"),
      ...dateCells("id988a_expiry", "Date of expiry"),

      { id: "id988a_p1_date", label: "P1 Date",      type: "date",      defaultW: 120 },
      { id: "id988a_p1_sig",  label: "P1 Signature", type: "signature", defaultW: 160, defaultH: 26 },
    ],
  },
  {
    title: "Contact & experience (form page 2)", page: 1,
    fields: [
      { id: "id988a_photo", label: "Photograph", type: "image", defaultW: 100, defaultH: 125 },

      { id: "id988a_present_address_1", label: "Present address (line 1)", type: "text", defaultW: 190 },
      { id: "id988a_present_address_2", label: "Present address (line 2)", type: "text", defaultW: 190 },
      { id: "id988a_present_address_3", label: "Present address (line 3)", type: "text", defaultW: 190 },
      { id: "id988a_domicile_address_1", label: "Domicile address (line 1)", type: "text", defaultW: 190 },
      { id: "id988a_domicile_address_2", label: "Domicile address (line 2)", type: "text", defaultW: 190 },
      { id: "id988a_domicile_address_3", label: "Domicile address (line 3)", type: "text", defaultW: 190 },

      { id: "id988a_contact_tel", label: "Contact telephone no.", type: "text", defaultW: 260 },
      { id: "id988a_contact_ext", label: "Ext.",                  type: "text", defaultW: 30  },
      { id: "id988a_fax",         label: "Fax no.",               type: "text", defaultW: 80  },
      { id: "id988a_email",       label: "E-mail address",        type: "text", defaultW: 470 },

      { id: "id988a_employer_name",      label: "Current employer — name",           type: "text", defaultW: 390 },
      { id: "id988a_employer_address_1", label: "Current employer — address (line 1)", type: "text", defaultW: 390 },
      { id: "id988a_employer_address_2", label: "Current employer — address (line 2)", type: "text", defaultW: 390 },

      ...experienceRow(1), ...experienceRow(2), ...experienceRow(3),
      ...experienceRow(4), ...experienceRow(5),

      { id: "id988a_total_years",  label: "Total experience — years",  type: "text", defaultW: 30 },
      { id: "id988a_total_months", label: "Total experience — months", type: "text", defaultW: 30 },

      { id: "id988a_p2_date", label: "P2 Date",      type: "date",      defaultW: 130 },
      { id: "id988a_p2_sig",  label: "P2 Signature", type: "signature", defaultW: 160, defaultH: 26 },
    ],
  },
  {
    title: "Extension & declaration (form page 3)", page: 2,
    fields: [
      { id: "id988a_status_employment", label: "4(a) Current status — Employment", type: "checkbox" },
      { id: "id988a_status_others",     label: "4(a) Current status — Others",     type: "checkbox" },
      { id: "id988a_status_others_text", label: "4(a) Others — specify",           type: "text", defaultW: 180 },
      ...dateCells("id988a_permitted", "Permitted to remain until"),

      { id: "id988a_purpose_defer",    label: "4(b) Deferring home leave",        type: "checkbox" },
      { id: "id988a_defer_until_zh",   label: "4(b) Extend until (Chinese line)", type: "text", defaultW: 160 },
      { id: "id988a_defer_until_en",   label: "4(b) Extend until (English line)", type: "text", defaultW: 160 },
      { id: "id988a_purpose_complete", label: "4(b) Completing the contract",     type: "checkbox" },
      { id: "id988a_complete_until_zh", label: "4(b) Complete until (Chinese)",   type: "text", defaultW: 155 },
      { id: "id988a_complete_until_en", label: "4(b) Complete until (English)",   type: "text", defaultW: 150 },

      { id: "id988a_decl_name_same",      label: "5(i)(a) Name not changed",   type: "checkbox" },
      { id: "id988a_decl_name_used",      label: "5(i)(a) Name(s) used before",type: "checkbox" },
      { id: "id988a_names_used_1",        label: "Names used before (line 1)", type: "text", defaultW: 440 },
      { id: "id988a_names_used_2",        label: "Names used before (line 2)", type: "text", defaultW: 440 },
      { id: "id988a_decl_never_refused",  label: "5(b) Never refused",         type: "checkbox" },
      { id: "id988a_decl_was_refused",    label: "5(b) Previously refused",    type: "checkbox" },
      { id: "id988a_refused_details_1",   label: "Refusal details (line 1)",   type: "text", defaultW: 440 },
      { id: "id988a_refused_details_2",   label: "Refusal details (line 2)",   type: "text", defaultW: 440 },
      { id: "id988a_decl_never_convicted", label: "5(c) Never convicted",      type: "checkbox" },
      { id: "id988a_decl_was_convicted",  label: "5(c) Previously convicted",  type: "checkbox" },
      { id: "id988a_convicted_details_1", label: "Conviction details (line 1)", type: "text", defaultW: 440 },
      { id: "id988a_convicted_details_2", label: "Conviction details (line 2)", type: "text", defaultW: 440 },

      { id: "id988a_p3_date", label: "P3 Date",      type: "date",      defaultW: 120 },
      { id: "id988a_p3_sig",  label: "P3 Signature", type: "signature", defaultW: 160, defaultH: 26 },
    ],
  },
  {
    title: "Undertaking (form page 4)", page: 2,
    fields: [
      { id: "id988a_contract_no_zh", label: "D.H. Contract No. (Chinese line)", type: "text", defaultW: 140 },
      { id: "id988a_contract_no_en", label: "D.H. Contract No. (English line)", type: "text", defaultW: 130 },
      { id: "id988a_p4_date", label: "P4 Date",      type: "date",      defaultW: 130 },
      { id: "id988a_p4_sig",  label: "P4 Signature", type: "signature", defaultW: 170, defaultH: 24 },
    ],
  },
];

/**
 * The starting position for every field, measured off the scan.
 *
 * Kept apart from the section list so the two concerns stay readable: the
 * sections say what the form asks, this says where it asks it. PDF Mapper seeds
 * an unplaced field from here and the recruiter adjusts from there.
 */
export const ID988A_DEFAULT_POSITIONS: Record<string, { page: number; x: number; y: number }> = {
  // ── form page 1 (sheet 1, left) ──
  id988a_type_entry:       { page: 1, x: 479, y: 254 },
  id988a_type_renew_leave: { page: 1, x: 478, y: 318 },
  id988a_type_renew_defer: { page: 1, x: 478, y: 352 },
  id988a_type_extension:   { page: 1, x: 478, y: 386 },

  id988a_surname:        { page: 1, x: 232, y: 443 },
  id988a_given_names:    { page: 1, x: 232, y: 473 },
  id988a_maiden_surname: { page: 1, x: 291, y: 506 },
  id988a_name_chinese:   { page: 1, x: 458, y: 506 },
  id988a_alias:          { page: 1, x: 150, y: 536 },

  id988a_sex_male:       { page: 1, x:  91, y: 565 },
  id988a_sex_female:     { page: 1, x: 164, y: 565 },
  id988a_dob_dd:         { page: 1, x: 340, y: 558 },
  id988a_dob_mm:         { page: 1, x: 385, y: 558 },
  id988a_dob_yyyy:       { page: 1, x: 425, y: 558 },
  id988a_place_of_birth: { page: 1, x: 545, y: 566 },

  id988a_marital_single:    { page: 1, x: 133, y: 594 },
  id988a_marital_married:   { page: 1, x: 231, y: 594 },
  id988a_marital_divorced:  { page: 1, x: 307, y: 594 },
  id988a_marital_separated: { page: 1, x: 392, y: 594 },
  id988a_marital_widowed:   { page: 1, x: 488, y: 594 },

  id988a_hkid_yes:    { page: 1, x: 175, y: 617 },
  id988a_hkid_no:     { page: 1, x: 175, y: 636 },
  id988a_hkid_number: { page: 1, x: 242, y: 622 },
  id988a_hkid_check:  { page: 1, x: 355, y: 622 },
  id988a_nationality: { page: 1, x: 452, y: 636 },
  id988a_occupation:  { page: 1, x: 560, y: 636 },

  id988a_travel_doc_type: { page: 1, x: 200, y: 668 },
  id988a_travel_doc_no:   { page: 1, x: 360, y: 664 },
  id988a_place_of_issue:  { page: 1, x: 150, y: 696 },
  id988a_issue_dd:        { page: 1, x: 280, y: 693 },
  id988a_issue_mm:        { page: 1, x: 318, y: 693 },
  id988a_issue_yyyy:      { page: 1, x: 356, y: 693 },
  id988a_expiry_dd:       { page: 1, x: 470, y: 693 },
  id988a_expiry_mm:       { page: 1, x: 508, y: 693 },
  id988a_expiry_yyyy:     { page: 1, x: 546, y: 693 },

  id988a_p1_date: { page: 1, x: 200, y: 762 },
  id988a_p1_sig:  { page: 1, x: 430, y: 745 },

  // ── form page 2 (sheet 1, right) ──
  id988a_photo: { page: 1, x: 1075, y: 80 },

  id988a_present_address_1: { page: 1, x: 815, y:  95 },
  id988a_present_address_2: { page: 1, x: 815, y: 122 },
  id988a_present_address_3: { page: 1, x: 815, y: 149 },
  id988a_domicile_address_1:{ page: 1, x: 815, y: 202 },
  id988a_domicile_address_2:{ page: 1, x: 815, y: 220 },
  id988a_domicile_address_3:{ page: 1, x: 815, y: 238 },

  id988a_contact_tel: { page: 1, x:  718, y: 262 },
  id988a_contact_ext: { page: 1, x: 1000, y: 262 },
  id988a_fax:         { page: 1, x: 1115, y: 262 },
  id988a_email:       { page: 1, x:  718, y: 292 },

  id988a_employer_name:      { page: 1, x: 800, y: 330 },
  id988a_employer_address_1: { page: 1, x: 800, y: 362 },
  id988a_employer_address_2: { page: 1, x: 800, y: 378 },

  id988a_exp1_employer: { page: 1, x: 665, y: 505 },
  id988a_exp1_address:  { page: 1, x: 810, y: 505 },
  id988a_exp1_from:     { page: 1, x: 1025, y: 505 },
  id988a_exp1_to:       { page: 1, x: 1115, y: 505 },
  id988a_exp2_employer: { page: 1, x: 665, y: 539 },
  id988a_exp2_address:  { page: 1, x: 810, y: 539 },
  id988a_exp2_from:     { page: 1, x: 1025, y: 539 },
  id988a_exp2_to:       { page: 1, x: 1115, y: 539 },
  id988a_exp3_employer: { page: 1, x: 665, y: 573 },
  id988a_exp3_address:  { page: 1, x: 810, y: 573 },
  id988a_exp3_from:     { page: 1, x: 1025, y: 573 },
  id988a_exp3_to:       { page: 1, x: 1115, y: 573 },
  id988a_exp4_employer: { page: 1, x: 665, y: 607 },
  id988a_exp4_address:  { page: 1, x: 810, y: 607 },
  id988a_exp4_from:     { page: 1, x: 1025, y: 607 },
  id988a_exp4_to:       { page: 1, x: 1115, y: 607 },
  id988a_exp5_employer: { page: 1, x: 665, y: 641 },
  id988a_exp5_address:  { page: 1, x: 810, y: 641 },
  id988a_exp5_from:     { page: 1, x: 1025, y: 641 },
  id988a_exp5_to:       { page: 1, x: 1115, y: 641 },

  id988a_total_years:  { page: 1, x: 815, y: 686 },
  id988a_total_months: { page: 1, x: 925, y: 686 },
  id988a_p2_date:      { page: 1, x: 845, y: 765 },
  id988a_p2_sig:       { page: 1, x: 1000, y: 748 },

  // ── form page 3 (sheet 2, left) ──
  id988a_status_employment:  { page: 2, x:  81, y:  98 },
  id988a_status_others:      { page: 2, x:  81, y: 132 },
  id988a_status_others_text: { page: 2, x: 150, y: 142 },
  id988a_permitted_dd:       { page: 2, x: 530, y: 132 },
  id988a_permitted_mm:       { page: 2, x: 562, y: 132 },
  id988a_permitted_yyyy:     { page: 2, x: 594, y: 132 },

  id988a_purpose_defer:     { page: 2, x:  62, y: 172 },
  id988a_defer_until_zh:    { page: 2, x: 428, y: 205 },
  id988a_defer_until_en:    { page: 2, x: 342, y: 253 },
  id988a_purpose_complete:  { page: 2, x:  62, y: 282 },
  id988a_complete_until_zh: { page: 2, x: 420, y: 307 },
  id988a_complete_until_en: { page: 2, x: 300, y: 333 },

  id988a_decl_name_same:       { page: 2, x:  91, y: 405 },
  id988a_decl_name_used:       { page: 2, x:  91, y: 430 },
  id988a_names_used_1:         { page: 2, x: 150, y: 452 },
  id988a_names_used_2:         { page: 2, x: 150, y: 468 },
  id988a_decl_never_refused:   { page: 2, x:  91, y: 473 },
  id988a_decl_was_refused:     { page: 2, x:  91, y: 506 },
  id988a_refused_details_1:    { page: 2, x: 150, y: 545 },
  id988a_refused_details_2:    { page: 2, x: 150, y: 562 },
  id988a_decl_never_convicted: { page: 2, x:  91, y: 584 },
  id988a_decl_was_convicted:   { page: 2, x:  91, y: 609 },
  id988a_convicted_details_1:  { page: 2, x: 150, y: 640 },
  id988a_convicted_details_2:  { page: 2, x: 150, y: 656 },

  id988a_p3_date: { page: 2, x: 200, y: 758 },
  id988a_p3_sig:  { page: 2, x: 430, y: 742 },

  // ── form page 4 (sheet 2, right) ──
  id988a_contract_no_zh: { page: 2, x: 705, y: 143 },
  id988a_contract_no_en: { page: 2, x: 720, y: 203 },
  id988a_p4_date:        { page: 2, x: 690, y: 793 },
  id988a_p4_sig:         { page: 2, x: 940, y: 772 },
};

/** Signatures and the photograph, drawn from a URL rather than stamped as text. */
export const ID988A_IMAGE_FIELDS: {
  id: string;
  mode: "fill" | "contain";
  source: (a: Id988aApplicant, c: Contract) => string | null | undefined;
}[] = [
  { id: "id988a_photo",  mode: "fill",    source: a => a.photo_url },
  { id: "id988a_p1_sig", mode: "contain", source: a => a.signature_url },
  { id: "id988a_p2_sig", mode: "contain", source: a => a.signature_url },
  { id: "id988a_p3_sig", mode: "contain", source: a => a.signature_url },
  { id: "id988a_p4_sig", mode: "contain", source: a => a.signature_url },
];

/** The helper's record, as much of it as this form asks about. */
export interface Id988aApplicant {
  full_name:      string;
  date_of_birth?: string | null;
  nationality?:   string | null;
  gender?:        string | null;
  mobile?:        string | null;
  photo_url?:     string | null;
  signature_url?: string | null;
  form_data?: {
    placeOfBirth?:    string;
    currentLocation?: string;
    maritalStatus?:   string;
    totalYearsHK?:    string;
    workExperience?: {
      location?: string; dateFrom?: string; dateTo?: string;
    }[];
    otherExperience?: { country?: string; yearsOfEmployment?: string }[];
  } | null;
}

/**
 * Surname and given names, as the form asks for them separately.
 *
 *   "Cruz, Maria Santos" → Cruz / Maria Santos     (a comma names the surname)
 *   "Maria Santos Cruz"  → Cruz / Maria Santos     (otherwise it trails)
 *
 * A single word is treated as the surname, since that is the one field the form
 * will not accept as blank.
 */
export function splitName(full: string | null | undefined): { surname: string; given: string } {
  const n = (full ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { surname: "", given: "" };

  if (n.includes(",")) {
    const [sur, ...rest] = n.split(",");
    return { surname: sur.trim(), given: rest.join(",").trim() };
  }
  const parts = n.split(" ");
  if (parts.length === 1) return { surname: parts[0], given: "" };
  return { surname: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

/** dd / mm / yyyy split out of a stored date, for the boxed date cells. */
function dateParts(value?: string | null): { dd: string; mm: string; yyyy: string } {
  const printed = formDate(value);           // dd/mm/yyyy, or ""
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(printed);
  return m ? { dd: m[1], mm: m[2], yyyy: m[3] } : { dd: "", mm: "", yyyy: "" };
}

/** mm/yy, the format the working-experience table asks for. */
function monthYear(value?: string | null): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const slash = /^(\d{1,2})\/(\d{2,4})$/.exec(v);
  if (slash) return `${slash[1].padStart(2, "0")}/${slash[2].slice(-2)}`;
  const iso = /^(\d{4})-(\d{2})/.exec(v);
  return iso ? `${iso[2]}/${iso[1].slice(-2)}` : v;
}

/**
 * Build the field-value map for one application.
 *
 * Anything absent stays absent: an unanswered field is skipped rather than
 * printed blank, so a half-filled form prints what is known and nothing else.
 */
export function buildId988aValues(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
): FieldValues {
  const fd    = applicant.form_data ?? {};
  const terms = contract?.terms ?? {};
  const name  = splitName(applicant.full_name);
  const dob   = dateParts(applicant.date_of_birth);
  const marital = (fd.maritalStatus ?? "").toLowerCase();

  // Clause 2 of the contract says which kind of application this is: 2A is a
  // helper arriving from abroad, 2B a renewal with the same employer, 2C a
  // permission already granted. A recruiter can re-tick it on the sheet.
  const clause = terms.clause2;

  const ed = employer?.employer_data ?? {};
  const employerAddress = ed.residenceAddress || employer?.address || "";

  // The table wants every posting in order; HK contracts first, then abroad.
  const hk = (fd.workExperience ?? []).filter(w => w?.location || w?.dateFrom);
  const abroad = (fd.otherExperience ?? []).filter(e => e?.country);
  const rows = [
    ...hk.map(w => ({ employer: "", address: w.location ?? "",
                      from: monthYear(w.dateFrom), to: monthYear(w.dateTo) })),
    ...abroad.map(e => ({ employer: "", address: e.country ?? "",
                          from: "", to: e.yearsOfEmployment ? `${e.yearsOfEmployment} yr` : "" })),
  ].slice(0, 5);

  const v: FieldValues = {
    id988a_type_entry:       clause === "A",
    id988a_type_renew_leave: clause === "B",
    id988a_type_renew_defer: false,
    id988a_type_extension:   clause === "C",

    id988a_surname:     name.surname,
    id988a_given_names: name.given,
    id988a_nationality: applicant.nationality ?? "",
    id988a_occupation:  applicant.full_name ? "Domestic Helper" : "",

    id988a_sex_male:   applicant.gender === "Male",
    id988a_sex_female: applicant.gender === "Female",
    id988a_dob_dd:     dob.dd,
    id988a_dob_mm:     dob.mm,
    id988a_dob_yyyy:   dob.yyyy,
    id988a_place_of_birth: fd.placeOfBirth ?? "",

    id988a_marital_single:    marital === "single",
    id988a_marital_married:   marital === "married",
    id988a_marital_divorced:  marital === "divorced",
    id988a_marital_separated: marital === "separated",
    id988a_marital_widowed:   marital === "widowed",

    // Present address is the employer's residence only once she is placed —
    // before that the apply form has never asked where she lives.
    id988a_present_address_1: employerAddress || fd.currentLocation || "",

    id988a_contact_tel: applicant.mobile ?? "",

    id988a_employer_name:      employer?.name ?? "",
    id988a_employer_address_1: employerAddress,

    id988a_total_years: fd.totalYearsHK ?? "",

    id988a_contract_no_zh: terms.contractNo ?? "",
    id988a_contract_no_en: terms.contractNo ?? "",

    // The same day on all four pages; the helper signs each one
    id988a_p1_date: formDate(contract?.helper_signed_at),
    id988a_p2_date: formDate(contract?.helper_signed_at),
    id988a_p3_date: formDate(contract?.helper_signed_at),
    id988a_p4_date: formDate(contract?.helper_signed_at),
  };

  rows.forEach((r, i) => {
    const n = i + 1;
    v[`id988a_exp${n}_employer`] = r.employer;
    v[`id988a_exp${n}_address`]  = r.address;
    v[`id988a_exp${n}_from`]     = r.from;
    v[`id988a_exp${n}_to`]       = r.to;
  });

  return v;
}

/**
 * What is still missing before this form can be filed.
 *
 * Reported rather than enforced, the same as ID 407 — a recruiter often wants
 * the sheet on paper before it is complete.
 */
export function id988aGaps(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
): string[] {
  const fd = applicant.form_data ?? {};
  const gaps: string[] = [];
  if (!splitName(applicant.full_name).surname) gaps.push("helper's name");
  if (!applicant.date_of_birth)   gaps.push("date of birth");
  if (!applicant.nationality)     gaps.push("nationality");
  if (!applicant.gender)          gaps.push("sex");
  if (!fd.placeOfBirth)           gaps.push("place of birth");
  if (!fd.maritalStatus)          gaps.push("marital status");
  if (!employer)                  gaps.push("no employer assigned");
  if (!contract?.terms?.contractNo) gaps.push("D. H. Contract No.");
  if (!applicant.photo_url)       gaps.push("photograph");
  if (!applicant.signature_url)   gaps.push("helper's signature");
  // Never captured by the apply form — always typed onto the sheet
  gaps.push("travel document, HKID and home address (typed on the sheet)");
  return gaps;
}
