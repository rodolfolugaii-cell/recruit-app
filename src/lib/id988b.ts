/**
 * id988b.ts — the ID 988B application for employment of a domestic helper.
 *
 * ── The sheets ──────────────────────────────────────────────────────────────
 * Booklet imposition like ID 407, not reading order like ID 988A:
 *
 *   sheet 1  =  form page 4 (left)  |  form page 1 (right)
 *   sheet 2  =  form page 2 (left)  |  form page 3 (right)
 *
 * Form page 4 is the Statement of Purpose — printed matter with nothing to
 * fill in — so no field is declared for it. The scan measures 1222 x 838 pt,
 * the same as ID 988A.
 *
 * ── Whose form this is ──────────────────────────────────────────────────────
 * ID 988A is completed by the helper; this one is completed by the EMPLOYER.
 * That inverts where the values come from: the employer record fills most of
 * it, and the helper contributes little more than her name. It is also why the
 * signature here is the employer's on every page.
 *
 * ── Where these coordinates came from ───────────────────────────────────────
 * The same measuring as ID 988A: the embedded JPEG was decoded, every tick box
 * found by flood-filling the white square inside its border, and the text lines
 * read off magnified grids. Tick boxes are exact; lines are close. Nudge them
 * in PDF Mapper.
 *
 * What the app has never collected — the employer's own date of birth, HKID,
 * travel document, household income, bedroom count, and the names of household
 * members — is left blank for a recruiter to type onto the sheet.
 */

import type { FieldValues } from "./pdfDraw";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";
import type { FieldDef, FormSection } from "./pdfForms";
import { formDate } from "./formDates";
import { splitName, type Id988aApplicant } from "./id988a";

/** Measured from the supplied scan. */
export const ID988B_PAGE_W = 1222;
export const ID988B_PAGE_H = 838;

/** Free text that runs over a run of ruled lines. */
export const ID988B_PARAGRAPHS: string[][] = [
  ["id988b_residential_1",    "id988b_residential_2",    "id988b_residential_3"],
  ["id988b_correspondence_1", "id988b_correspondence_2", "id988b_correspondence_3"],
];

/** A dd / mm / yyyy trio. */
const dateCells = (prefix: string, label: string): FieldDef[] => [
  { id: `${prefix}_dd`,   label: `${label} — dd`,   type: "text", defaultW: 30 },
  { id: `${prefix}_mm`,   label: `${label} — mm`,   type: "text", defaultW: 30 },
  { id: `${prefix}_yyyy`, label: `${label} — yyyy`, type: "text", defaultW: 44 },
];

/** One row of the household-members table on form page 2. */
const memberRow = (n: number): FieldDef[] => [
  { id: `id988b_member${n}_name`,  label: `Household member ${n} — Name`,         type: "text", defaultW: 80  },
  { id: `id988b_member${n}_yob`,   label: `Household member ${n} — Year of birth`, type: "text", defaultW: 80  },
  { id: `id988b_member${n}_rel`,   label: `Household member ${n} — Relationship`,  type: "text", defaultW: 128 },
  { id: `id988b_member${n}_hkid`,  label: `Household member ${n} — HKID`,          type: "text", defaultW: 116 },
  { id: `id988b_member${n}_check`, label: `Household member ${n} — HKID check`,    type: "text", defaultW: 16  },
];

/** One row of the "helpers currently employed" table on form page 2. */
const currentHelperRow = (n: number): FieldDef[] => [
  { id: `id988b_helper${n}_name`,     label: `Current helper ${n} — Name`,     type: "text", defaultW: 160 },
  { id: `id988b_helper${n}_hkid`,     label: `Current helper ${n} — HKID`,     type: "text", defaultW: 92  },
  { id: `id988b_helper${n}_until`,    label: `Current helper ${n} — Until`,    type: "text", defaultW: 122 },
  { id: `id988b_helper${n}_employer`, label: `Current helper ${n} — Employer`, type: "text", defaultW: 84  },
];

export const ID988B_SECTIONS: FormSection[] = [
  {
    title: "Employer & helper (form page 1)", page: 1,
    fields: [
      { id: "id988b_name_chinese", label: "Employer — Name in Chinese",     type: "text", defaultW: 360 },
      { id: "id988b_surname",      label: "Employer — Surname in English",  type: "text", defaultW: 460 },
      { id: "id988b_given_names",  label: "Employer — Given names",         type: "text", defaultW: 460 },
      { id: "id988b_sex_male",     label: "Employer — Sex Male",            type: "checkbox" },
      { id: "id988b_sex_female",   label: "Employer — Sex Female",          type: "checkbox" },
      ...dateCells("id988b_dob", "Employer — Date of birth"),
      { id: "id988b_hkid",        label: "Employer — HKID no.",       type: "text", defaultW: 88 },
      { id: "id988b_hkid_check",  label: "Employer — HKID check",     type: "text", defaultW: 18 },
      { id: "id988b_nationality", label: "Employer — Nationality",    type: "text", defaultW: 68 },
      { id: "id988b_occupation",  label: "Employer — Occupation",     type: "text", defaultW: 88 },
      { id: "id988b_travel_doc_held", label: "Employer — Travel document held", type: "text", defaultW: 170 },
      { id: "id988b_travel_doc_no",   label: "Employer — Travel document no.",  type: "text", defaultW: 155 },

      { id: "id988b_residential_1", label: "Residential address (line 1)", type: "text", defaultW: 240 },
      { id: "id988b_residential_2", label: "Residential address (line 2)", type: "text", defaultW: 240 },
      { id: "id988b_residential_3", label: "Residential address (line 3)", type: "text", defaultW: 240 },
      { id: "id988b_correspondence_1", label: "Correspondence address (line 1)", type: "text", defaultW: 240 },
      { id: "id988b_correspondence_2", label: "Correspondence address (line 2)", type: "text", defaultW: 240 },
      { id: "id988b_correspondence_3", label: "Correspondence address (line 3)", type: "text", defaultW: 240 },

      { id: "id988b_contact_tel", label: "Contact telephone no.", type: "text", defaultW: 190 },
      { id: "id988b_contact_ext", label: "Ext.",                  type: "text", defaultW: 34  },
      { id: "id988b_fax",         label: "Fax no.",               type: "text", defaultW: 180 },
      { id: "id988b_home_tel",    label: "Home telephone no.",    type: "text", defaultW: 190 },
      { id: "id988b_email",       label: "E-mail address",        type: "text", defaultW: 440 },

      { id: "id988b_helper_name",     label: "Name of the Helper",            type: "text", defaultW: 410 },
      { id: "id988b_helper_ref",      label: "Helper's application ref. no.", type: "text", defaultW: 145 },
      { id: "id988b_relationship",    label: "Relationship with the Helper",  type: "text", defaultW: 52  },

      { id: "id988b_emp_first",       label: "First Time Employment",         type: "checkbox" },
      { id: "id988b_emp_renewal",     label: "Contract Renewal, Same Helper", type: "checkbox" },
      { id: "id988b_emp_replacement", label: "Replacement",                   type: "checkbox" },
      { id: "id988b_emp_additional",  label: "Additional",                    type: "checkbox" },

      { id: "id988b_replaced_name",  label: "Helper being replaced — Name",  type: "text", defaultW: 205 },
      { id: "id988b_replaced_hkid",  label: "Helper being replaced — HKID",  type: "text", defaultW: 128 },
      { id: "id988b_replaced_check", label: "Helper being replaced — check", type: "text", defaultW: 18  },
      ...dateCells("id988b_termination", "Date of termination"),

      { id: "id988b_p1_date", label: "P1 Date",      type: "date",      defaultW: 130 },
      { id: "id988b_p1_sig",  label: "P1 Signature", type: "signature", defaultW: 170, defaultH: 26 },
    ],
  },
  {
    title: "Home leave & household (form page 2)", page: 2,
    fields: [
      { id: "id988b_leave_before", label: "Home leave — take before new contract", type: "checkbox" },
      { id: "id988b_leave_defer",  label: "Home leave — defer up to one year",     type: "checkbox" },
      { id: "id988b_leave_reason", label: "Home leave — reason for deferring",     type: "text", defaultW: 240 },

      { id: "id988b_income_yes", label: "Household income — Yes", type: "checkbox" },
      { id: "id988b_income_no",  label: "Household income — No",  type: "checkbox" },
      { id: "id988b_income",     label: "Monthly household income (HK$)", type: "text", defaultW: 120 },
      { id: "id988b_bedrooms",   label: "Number of bedroom(s)",           type: "text", defaultW: 40  },
      { id: "id988b_servant_room_yes", label: "Separate servant room — Yes", type: "checkbox" },
      { id: "id988b_servant_room_no",  label: "Separate servant room — No",  type: "checkbox" },

      ...memberRow(1), ...memberRow(2), ...memberRow(3), ...memberRow(4), ...memberRow(5),
      ...currentHelperRow(1), ...currentHelperRow(2), ...currentHelperRow(3),

      { id: "id988b_p2_date", label: "P2 Date",      type: "date",      defaultW: 80  },
      { id: "id988b_p2_sig",  label: "P2 Signature", type: "signature", defaultW: 120, defaultH: 24 },
    ],
  },
  {
    title: "Declaration & undertaking (form page 3)", page: 2,
    fields: [
      { id: "id988b_place_of_origin", label: "Helper's place of origin", type: "text", defaultW: 122 },
      { id: "id988b_contract_no_zh",  label: "D.H. Contract No. (Chinese line)", type: "text", defaultW: 135 },
      { id: "id988b_contract_no_en",  label: "D.H. Contract No. (English line)", type: "text", defaultW: 95  },
      { id: "id988b_p3_date", label: "P3 Date",      type: "date",      defaultW: 100 },
      { id: "id988b_p3_sig",  label: "P3 Signature", type: "signature", defaultW: 150, defaultH: 24 },
    ],
  },
];

/** Measured starting positions. Tick boxes exact, text lines close. */
export const ID988B_DEFAULT_POSITIONS: Record<string, { page: number; x: number; y: number }> = {
  // ── form page 1 (sheet 1, right half) ──
  id988b_name_chinese: { page: 1, x: 830, y: 172 },
  id988b_surname:      { page: 1, x: 730, y: 192 },
  id988b_given_names:  { page: 1, x: 730, y: 213 },
  id988b_sex_male:     { page: 1, x: 709, y: 242 },
  id988b_sex_female:   { page: 1, x: 760, y: 242 },
  id988b_dob_dd:       { page: 1, x: 878, y: 236 },
  id988b_dob_mm:       { page: 1, x: 915, y: 236 },
  id988b_dob_yyyy:     { page: 1, x: 952, y: 236 },
  id988b_hkid:         { page: 1, x: 800, y: 266 },
  id988b_hkid_check:   { page: 1, x: 900, y: 266 },
  id988b_nationality:  { page: 1, x: 985, y: 266 },
  id988b_occupation:   { page: 1, x: 1105, y: 266 },
  id988b_travel_doc_held: { page: 1, x: 750, y: 300 },
  id988b_travel_doc_no:   { page: 1, x: 1040, y: 300 },

  id988b_residential_1: { page: 1, x: 660, y: 345 },
  id988b_residential_2: { page: 1, x: 660, y: 368 },
  id988b_residential_3: { page: 1, x: 660, y: 391 },
  id988b_correspondence_1: { page: 1, x: 955, y: 345 },
  id988b_correspondence_2: { page: 1, x: 955, y: 368 },
  id988b_correspondence_3: { page: 1, x: 955, y: 391 },

  id988b_contact_tel: { page: 1, x: 750, y: 425 },
  id988b_contact_ext: { page: 1, x: 950, y: 425 },
  id988b_fax:         { page: 1, x: 1010, y: 425 },
  id988b_home_tel:    { page: 1, x: 750, y: 455 },
  id988b_email:       { page: 1, x: 750, y: 484 },

  id988b_helper_name:  { page: 1, x: 780, y: 528 },
  id988b_helper_ref:   { page: 1, x: 830, y: 555 },
  id988b_relationship: { page: 1, x: 1140, y: 555 },

  id988b_emp_first:       { page: 1, x: 679, y: 586 },
  id988b_emp_renewal:     { page: 1, x: 679, y: 602 },
  id988b_emp_replacement: { page: 1, x: 679, y: 621 },
  id988b_emp_additional:  { page: 1, x: 679, y: 694 },

  id988b_replaced_name:  { page: 1, x: 990, y: 620 },
  id988b_replaced_hkid:  { page: 1, x: 990, y: 645 },
  id988b_replaced_check: { page: 1, x: 1135, y: 645 },
  id988b_termination_dd:   { page: 1, x: 995, y: 668 },
  id988b_termination_mm:   { page: 1, x: 1038, y: 668 },
  id988b_termination_yyyy: { page: 1, x: 1085, y: 668 },

  id988b_p1_date: { page: 1, x: 845, y: 762 },
  id988b_p1_sig:  { page: 1, x: 1000, y: 745 },

  // ── form page 2 (sheet 2, left half) ──
  id988b_leave_before: { page: 2, x: 85, y: 100 },
  id988b_leave_defer:  { page: 2, x: 85, y: 125 },
  id988b_leave_reason: { page: 2, x: 330, y: 122 },

  id988b_income_yes: { page: 2, x: 65, y: 263 },
  id988b_income_no:  { page: 2, x: 65, y: 292 },
  id988b_income:     { page: 2, x: 260, y: 274 },
  id988b_bedrooms:   { page: 2, x: 218, y: 318 },
  id988b_servant_room_yes: { page: 2, x: 336, y: 320 },
  id988b_servant_room_no:  { page: 2, x: 405, y: 320 },

  id988b_p2_date: { page: 2, x: 310, y: 782 },
  id988b_p2_sig:  { page: 2, x: 480, y: 765 },

  // ── form page 3 (sheet 2, right half) ──
  id988b_place_of_origin: { page: 2, x: 810, y: 206 },
  id988b_contract_no_zh:  { page: 2, x: 950, y: 302 },
  id988b_contract_no_en:  { page: 2, x: 905, y: 344 },
  id988b_p3_date: { page: 2, x: 690, y: 752 },
  id988b_p3_sig:  { page: 2, x: 880, y: 736 },
};

// The two tables step down evenly; measured header and first-row positions
const MEMBER_COLS: Record<string, number> = {
  name: 140, yob: 225, rel: 310, hkid: 445, check: 570,
};
for (let n = 1; n <= 5; n++) {
  const y = 406 + (n - 1) * 26.5;
  Object.entries(MEMBER_COLS).forEach(([col, x]) => {
    ID988B_DEFAULT_POSITIONS[`id988b_member${n}_${col}`] =
      { page: 2, x, y: parseFloat(y.toFixed(1)) };
  });
}
const HELPER_COLS: Record<string, number> = {
  name: 75, hkid: 250, until: 350, employer: 520,
};
for (let n = 1; n <= 3; n++) {
  const y = 605 + (n - 1) * 27;
  Object.entries(HELPER_COLS).forEach(([col, x]) => {
    ID988B_DEFAULT_POSITIONS[`id988b_helper${n}_${col}`] =
      { page: 2, x, y: parseFloat(y.toFixed(1)) };
  });
}

/** The employer signs every page of their own form. */
export const ID988B_IMAGE_FIELDS: {
  id: string;
  mode: "fill" | "contain";
  source: (c: Contract | null) => string | null | undefined;
}[] = [
  { id: "id988b_p1_sig", mode: "contain", source: c => c?.employer_signature },
  { id: "id988b_p2_sig", mode: "contain", source: c => c?.employer_signature },
  { id: "id988b_p3_sig", mode: "contain", source: c => c?.employer_signature },
];

/**
 * Build the field-value map.
 *
 * The employer record carries most of this. Their own particulars — date of
 * birth, HKID, travel document, household income and the people living with
 * them — have never been asked for anywhere in the app, so those stay blank
 * rather than being invented.
 */
export function buildId988bValues(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
): FieldValues {
  const ed    = employer?.employer_data ?? {};
  const terms = contract?.terms ?? {};
  const name  = splitName(employer?.name);
  const residence = ed.residenceAddress || employer?.address || "";
  const signed = formDate(contract?.employer_signed_at);

  // Clause 2 of the contract says which kind of employment this is
  const clause = terms.clause2;

  return {
    // The employer record holds one name, so it is split the way the form asks
    id988b_surname:     name.surname,
    id988b_given_names: name.given,

    id988b_residential_1:    residence,
    id988b_correspondence_1: employer?.address && employer.address !== residence
      ? employer.address : "",

    id988b_contact_tel: employer?.phone ?? "",
    id988b_email:       employer?.email ?? "",

    id988b_helper_name:  applicant.full_name ?? "",
    id988b_relationship: employer ? "Employer" : "",

    id988b_emp_first:       clause === "A",
    id988b_emp_renewal:     clause === "B",
    id988b_emp_replacement: false,
    id988b_emp_additional:  false,

    // The only household fact the app actually holds
    id988b_servant_room_yes: ed.servantRoom === "Yes",
    id988b_servant_room_no:  ed.servantRoom === "No",

    id988b_place_of_origin: terms.placeOfOrigin ?? applicant.nationality ?? "",
    id988b_contract_no_zh:  terms.contractNo ?? "",
    id988b_contract_no_en:  terms.contractNo ?? "",

    // The employer signs each page on the same day
    id988b_p1_date: signed,
    id988b_p2_date: signed,
    id988b_p3_date: signed,
  };
}

/** What is still missing before this form can be filed. */
export function id988bGaps(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
): string[] {
  const ed = employer?.employer_data ?? {};
  const gaps: string[] = [];
  if (!employer)                    gaps.push("no employer assigned");
  if (!employer?.name)              gaps.push("employer's name");
  if (!(ed.residenceAddress || employer?.address)) gaps.push("residential address");
  if (!employer?.phone)             gaps.push("contact telephone");
  if (!applicant.full_name)         gaps.push("helper's name");
  if (!contract?.terms?.contractNo) gaps.push("D. H. Contract No.");
  if (!ed.servantRoom)              gaps.push("separate servant room");
  if (!contract?.employer_signature) gaps.push("employer's signature");
  // Never captured anywhere in the app — always typed onto the sheet
  gaps.push("employer's HKID, date of birth, household income and members (typed on the sheet)");
  return gaps;
}
