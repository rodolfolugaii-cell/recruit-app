/**
 * pdfForms.ts — the forms PDF Mapper can position fields on.
 *
 * There are two: the agency's own biodata, and ID 407, the Immigration
 * Department employment contract. They differ in page count, page size and
 * field set, so each is declared here and the mapper works from whichever is
 * selected.
 *
 * Field ids are globally unique across forms, because `pdf_field_mappings` keys
 * on field_id alone. Biodata ids are bare for historical reasons; every ID 407
 * id carries an `id407_` prefix. A form's own ids are what filters the mapping
 * table when exporting, so nothing bleeds between forms.
 */

import { ID407_PAGE_H, ID407_PAGE_W, ID407_PARAGRAPHS, ID407_SECTIONS } from "./id407";

export type FieldType = "text" | "checkbox" | "date" | "image" | "signature";

export interface FieldDef {
  id:        string;
  label:     string;
  type:      FieldType;
  defaultW?: number;
  defaultH?: number;
}

export interface FormSection {
  title:  string;
  page:   number;
  fields: FieldDef[];
}

export interface FormDef {
  /** Stable key, also the Storage filename prefix for the page images. */
  id:     string;
  label:  string;
  /** How many pages the template has. For ID 407 a "page" is a folded sheet. */
  pages:  number;
  width:  number;
  height: number;
  sections: FormSection[];
  /** Ordered runs of line-boxes that one answer flows across. */
  paragraphs: string[][];
  /** Field ids the form used to have, mapped to what replaced them. */
  retired: Record<string, string>;
  /**
   * Fields whose value ends in a unit that must survive truncation. A Height box
   * printing "5.1 …" instead of "5.1 CM" loses the only part that says what the
   * number means.
   */
  unitFields?: string[];
  /** Shown under the form picker. */
  note?: string;
}

/** A4 portrait — the biodata. */
const A4_W = 595.276;
const A4_H = 841.89;

/**
 * Biodata answers that flow over a run of ruled lines.
 *
 * "Duties (line 1)" is the short blank beside the printed label and "(line 2)"
 * the full-width one under it. Adding a further line id here and placing that
 * box in PDF Mapper is all it takes to give a field more room.
 */
const BIODATA_PARAGRAPHS: string[][] = [
  ["country_a_duties_1", "country_a_duties_2"],
  ["country_b_duties_1", "country_b_duties_2"],
];

// ── Biodata field sections ─────────────────────────────────────────────────────────────
const BIODATA_SECTIONS: FormSection[] = [
  {
    title: "Application Info", page: 1,
    fields: [
      { id: "application_no",      label: "Application No.",           type: "text",    defaultW: 220 },
      { id: "photo",               label: "Photo",                     type: "image",   defaultW: 100, defaultH: 100 },
      { id: "is_firstimer",        label: "First-timer",              type: "checkbox" },
      { id: "contract_finished",   label: "Finished Contract",        type: "checkbox" },
      { id: "contract_plan_break", label: "Plan to Break",            type: "checkbox" },
      { id: "contract_terminated", label: "Terminated / Break",       type: "checkbox" },
      { id: "last_working_day",    label: "Last Working Day",         type: "text",    defaultW: 66  },
      { id: "signature",           label: "Applicant Signature",      type: "signature", defaultW: 130, defaultH: 34 },
    ],
  },
  {
    title: "Personal Details", page: 1,
    fields: [
      { id: "full_name",      label: "Full Name",      type: "text", defaultW: 128 },
      { id: "date_of_birth",  label: "Date of Birth",  type: "date", defaultW: 68  },
      { id: "nationality",    label: "Nationality",    type: "text", defaultW: 100 },
      { id: "religion",       label: "Religion",       type: "text", defaultW: 108 },
      { id: "age",            label: "Age",            type: "text", defaultW: 45  },
      { id: "height",         label: "Height",         type: "text", defaultW: 36  },
      { id: "weight",         label: "Weight",         type: "text", defaultW: 36  },
      { id: "marital_status", label: "Marital Status", type: "text", defaultW: 84  },
      // The form has four blanks — "Boy/s: __ Age/s: __" over "Girl/s: __ Age/s: __".
      // A count box holds one or two digits; an age box holds a list like "15, 3, 4".
      { id: "kids_boys_count",  label: "Kids – Boy/s (no.)",  type: "text", defaultW: 20 },
      { id: "kids_boys_ages",   label: "Kids – Boy/s Age/s",  type: "text", defaultW: 52 },
      { id: "kids_girls_count", label: "Kids – Girl/s (no.)", type: "text", defaultW: 20 },
      { id: "kids_girls_ages",  label: "Kids – Girl/s Age/s", type: "text", defaultW: 52 },
    ],
  },
  {
    title: "Spoken Language", page: 1,
    fields: [
      { id: "english_basic",   label: "English – Basic",   type: "checkbox" },
      { id: "english_good",    label: "English – Good",    type: "checkbox" },
      { id: "cantonese_basic", label: "Cantonese – Basic", type: "checkbox" },
      { id: "cantonese_good",  label: "Cantonese – Good",  type: "checkbox" },
      { id: "mandarin_basic",  label: "Mandarin – Basic",  type: "checkbox" },
      { id: "mandarin_good",   label: "Mandarin – Good",   type: "checkbox" },
    ],
  },
  {
    title: "Education", page: 1,
    fields: [
      { id: "edu_high_school",       label: "High School Graduate", type: "checkbox" },
      { id: "edu_vocational",        label: "Vocational Course",    type: "checkbox" },
      { id: "edu_college_undergrad", label: "College Undergrad",    type: "checkbox" },
      { id: "edu_college_grad",      label: "College Graduate",     type: "checkbox" },
      { id: "course_name",           label: "Course Name",          type: "text", defaultW: 100 },
      { id: "total_yrs_hk",          label: "Total Years in HK",    type: "text", defaultW: 90  },
      { id: "how_many_employers",    label: "How Many Employers",   type: "text", defaultW: 100 },
    ],
  },
  {
    title: "Other Country Exp.", page: 1,
    fields: [
      { id: "country_a_name",     label: "Country A – Employer",        type: "text", defaultW: 226 },
      { id: "country_a_yrs",      label: "Country A – Years",           type: "text", defaultW: 78  },
      { id: "country_a_duties_1", label: "Country A – Duties (line 1)", type: "text", defaultW: 120 },
      { id: "country_a_duties_2", label: "Country A – Duties (line 2)", type: "text", defaultW: 227 },
      { id: "country_b_name",     label: "Country B – Employer",        type: "text", defaultW: 225 },
      { id: "country_b_yrs",      label: "Country B – Years",           type: "text", defaultW: 78  },
      { id: "country_b_duties_1", label: "Country B – Duties (line 1)", type: "text", defaultW: 120 },
      { id: "country_b_duties_2", label: "Country B – Duties (line 2)", type: "text", defaultW: 227 },
    ],
  },
  {
    title: "My Skills", page: 1,
    fields: [
      { id: "skill_household_chores", label: "Household Chores",    type: "checkbox" },
      { id: "skill_cooking",          label: "Cooking",             type: "checkbox" },
      { id: "skill_child_care",       label: "Child Care",          type: "checkbox" },
      { id: "skill_newborn_care",     label: "New Born Care",       type: "checkbox" },
      { id: "skill_special_child",    label: "Special Child Care",  type: "checkbox" },
      { id: "skill_elderly_care",     label: "Elderly Care",        type: "checkbox" },
      { id: "skill_disabled_care",    label: "Disabled Person",     type: "checkbox" },
      { id: "skill_pet_care",         label: "Pet Care",            type: "checkbox" },
      { id: "skill_driving",          label: "Driving",             type: "checkbox" },
      { id: "skill_car_washing",      label: "Car Washing",         type: "checkbox" },
      { id: "skill_plant_care",       label: "Plant Care",          type: "checkbox" },
      { id: "skill_kids_tutorial",    label: "Kids Tutorial",       type: "checkbox" },
      { id: "skill_nursing_aide",     label: "Nursing Aide",        type: "checkbox" },
      { id: "pref_sunday_off",        label: "Sunday Off",          type: "checkbox" },
      { id: "pref_flexible_day",      label: "Flexible Day Off",    type: "checkbox" },
      { id: "willing_stay_in",        label: "Stay-in Employer",    type: "checkbox" },
      { id: "willing_other_helper",   label: "Other Helper",        type: "checkbox" },
    ],
  },
  {
    title: "Cooking Abilities", page: 1,
    fields: [
      { id: "cook_western",       label: "Western Food",             type: "checkbox" },
      { id: "cook_asian",         label: "Asian Food",               type: "checkbox" },
      { id: "cook_mediterranean", label: "Mediterranean Food",       type: "checkbox" },
      { id: "cook_baking",        label: "Baking",                   type: "checkbox" },
      { id: "cook_recipe_book",   label: "Follow Recipe / Cook Book",type: "checkbox" },
    ],
  },
  {
    title: "Current Working Exp. (HK)", page: 1,
    fields: [
      { id: "cwe_yrs",                  label: "Years of Employment",  type: "text",    defaultW: 47  },
      { id: "cwe_date_from",            label: "Date From (mm/yyyy)",  type: "date",    defaultW: 53  },
      { id: "cwe_date_to",              label: "Date To (mm/yyyy)",    type: "date",    defaultW: 48  },
      { id: "cwe_location",             label: "Location",             type: "text",    defaultW: 132 },
      { id: "cwe_flat_size",            label: "Flat / House Size",    type: "text",    defaultW: 49  },
      { id: "cwe_contract_finished",    label: "Finished Contract",    type: "checkbox" },
      { id: "cwe_plan_break",           label: "Plan to Break",        type: "checkbox" },
      { id: "cwe_family_members",       label: "Family Members",       type: "text",    defaultW: 32  },
      { id: "cwe_terminated_reason",    label: "Terminated Reason",    type: "text",    defaultW: 120 },
      { id: "cwe_co_helper_count",      label: "No. of Co-helper",     type: "text",    defaultW: 33  },
      { id: "cwe_break_reason",         label: "Break Reason",         type: "text",    defaultW: 195 },
      { id: "cwe_employer_nationality", label: "Employer Nationality", type: "text",    defaultW: 142 },
      { id: "jd_household_chores",      label: "JD: Household Chores",type: "checkbox" },
      { id: "jd_cooking",               label: "JD: Cooking",         type: "checkbox" },
      { id: "jd_child_care",            label: "JD: Child Care",      type: "checkbox" },
      { id: "jd_newborn_care",          label: "JD: New Born Care",   type: "checkbox" },
      { id: "jd_special_child",         label: "JD: Special Child",   type: "checkbox" },
      { id: "jd_elderly_care",          label: "JD: Elderly Care",    type: "checkbox" },
      { id: "jd_disabled_care",         label: "JD: Disabled Care",   type: "checkbox" },
      { id: "jd_pet_care",              label: "JD: Pet Care",        type: "checkbox" },
      { id: "jd_driving",               label: "JD: Driving",         type: "checkbox" },
      { id: "jd_car_washing",           label: "JD: Car Washing",     type: "checkbox" },
      { id: "jd_plant_gardening",       label: "JD: Plant / Gardening",type:"checkbox" },
      { id: "jd_others_text",           label: "JD: Others (text)",   type: "text",    defaultW: 80  },
    ],
  },
];

// Auto-generate WE 1/2/3 for page 2
const WE_TEMPLATE: FieldDef[] = [
  { id:"we{N}_yrs",               label:"WE{N}: Years",               type:"text",    defaultW:48  },
  { id:"we{N}_date_from",         label:"WE{N}: Date From",           type:"date",    defaultW:52  },
  { id:"we{N}_date_to",           label:"WE{N}: Date To",             type:"date",    defaultW:48  },
  { id:"we{N}_location",          label:"WE{N}: Location",            type:"text",    defaultW:131 },
  { id:"we{N}_flat_size",         label:"WE{N}: Flat Size",           type:"text",    defaultW:49  },
  { id:"we{N}_contract_finished", label:"WE{N}: Finished Contract",   type:"checkbox" },
  { id:"we{N}_plan_break",        label:"WE{N}: Plan to Break",       type:"checkbox" },
  { id:"we{N}_family_members",    label:"WE{N}: Family Members",      type:"text",    defaultW:32  },
  { id:"we{N}_terminated_reason", label:"WE{N}: Terminated Reason",   type:"text",    defaultW:120 },
  { id:"we{N}_co_helper",         label:"WE{N}: Co-helper Count",     type:"text",    defaultW:33  },
  { id:"we{N}_break_reason",      label:"WE{N}: Break Reason",        type:"text",    defaultW:195 },
  { id:"we{N}_employer_nat",      label:"WE{N}: Employer Nationality",type:"text",    defaultW:142 },
  { id:"we{N}_jd_household",      label:"WE{N} JD: Household Chores",type:"checkbox" },
  { id:"we{N}_jd_cooking",        label:"WE{N} JD: Cooking",         type:"checkbox" },
  { id:"we{N}_jd_child_care",     label:"WE{N} JD: Child Care",      type:"checkbox" },
  { id:"we{N}_jd_newborn",        label:"WE{N} JD: New Born Care",   type:"checkbox" },
  { id:"we{N}_jd_special_child",  label:"WE{N} JD: Special Child",   type:"checkbox" },
  { id:"we{N}_jd_elderly",        label:"WE{N} JD: Elderly Care",    type:"checkbox" },
  { id:"we{N}_jd_disabled",       label:"WE{N} JD: Disabled Care",   type:"checkbox" },
  { id:"we{N}_jd_pet",            label:"WE{N} JD: Pet Care",        type:"checkbox" },
  { id:"we{N}_jd_driving",        label:"WE{N} JD: Driving",         type:"checkbox" },
  { id:"we{N}_jd_car_wash",       label:"WE{N} JD: Car Washing",     type:"checkbox" },
  { id:"we{N}_jd_plant",          label:"WE{N} JD: Plant Care",      type:"checkbox" },
  { id:"we{N}_jd_others",         label:"WE{N} JD: Others",          type:"text",    defaultW:76  },
];
for (let n = 1; n <= 3; n++) {
  BIODATA_SECTIONS.push({
    title: `Work Experience ${n} (Page 2)`, page: 2,
    fields: WE_TEMPLATE.map(f => ({
      ...f,
      id:    f.id.replace(/{N}/g, String(n)),
      label: f.label.replace(/{N}/g, String(n)),
    })),
  });
}

// ── Retired field ids ─────────────────────────────────────────────────────────
// Boy/s and Girl/s used to be a single box each, and it received the AGES even
// though it sat on the count blank. Both are now a count box plus an age box, so
// the old id maps onto the count — same blank, same position. Only the position
// carries over: w/h are reset to the narrow count default, since the mapper sets
// a box's size from defaultW when it is first placed and offers no way to shrink
// one afterwards. The two new Age/s boxes still have to be placed by hand.
//
// The retired rows stay in pdf_field_mappings, unread — no section declares them
// and buildValues() no longer supplies a value, so the export skips them.
export const BIODATA_RETIRED_IDS: Record<string, string> = {
  kids_boys:  "kids_boys_count",
  kids_girls: "kids_girls_count",
};


export const FORMS: FormDef[] = [
  {
    id: "biodata",
    label: "Biodata",
    pages: 2,
    width: A4_W,
    height: A4_H,
    sections: BIODATA_SECTIONS,
    paragraphs: BIODATA_PARAGRAPHS,
    retired: BIODATA_RETIRED_IDS,
    unitFields: ["height", "weight"],
    note: "The agency's own applicant biodata, filled from the apply form.",
  },
  {
    id: "id407",
    label: "ID 407 Contract",
    pages: 2,
    width: ID407_PAGE_W,
    height: ID407_PAGE_H,
    sections: ID407_SECTIONS,
    paragraphs: ID407_PARAGRAPHS,
    retired: {},
    note: "Booklet imposition: sheet 1 is form pages 4 | 1, sheet 2 is pages 2 | 3. Fields are listed in reading order, left column first.",
  },
];

export const DEFAULT_FORM_ID = "biodata";

export function getForm(id: string): FormDef {
  return FORMS.find(f => f.id === id) ?? FORMS[0];
}

/** Every field of a form, by id. */
export function fieldLookup(form: FormDef): Record<string, FieldDef & { sectionPage: number }> {
  const out: Record<string, FieldDef & { sectionPage: number }> = {};
  form.sections.forEach(sec =>
    sec.fields.forEach(f => { out[f.id] = { ...f, sectionPage: sec.page }; })
  );
  return out;
}

/** Box size a field gets when it is first placed. */
export function getDefaultDims(form: FormDef, id: string): { w: number; h: number } {
  const d = fieldLookup(form)[id];
  return {
    w: d?.defaultW ?? (d?.type === "checkbox" ? 12 : 100),
    h: d?.defaultH ?? (d?.type === "checkbox" ? 12 : d?.type === "image" ? 100 : 14),
  };
}

/** The set of ids belonging to a form — used to filter the shared mapping table. */
export function formFieldIds(form: FormDef): Set<string> {
  return new Set(form.sections.flatMap(s => s.fields.map(f => f.id)));
}

/** Storage object name for one page of a form's template. */
export function templateImageName(form: FormDef, page: number): string {
  return `${form.id === "biodata" ? "biodata" : form.id}-p${page}.png`;
}
