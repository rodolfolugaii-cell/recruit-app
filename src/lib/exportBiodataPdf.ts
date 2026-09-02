/**
 * exportBiodataPdf.ts  —  src/lib/exportBiodataPdf.ts
 *
 * Generates a filled Castillo Del Rey biodata PDF for a given applicant.
 * Uses field mappings from the Supabase `pdf_field_mappings` table and
 * the page images from the `pdf-templates` Storage bucket.
 *
 * ── Prerequisite ────────────────────────────────────────────────────────────
 *   npm install pdf-lib
 * ────────────────────────────────────────────────────────────────────────────
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { kidsOf } from "./kids";
import { ageFrom, formDate } from "./formDates";
import {
  downloadPdf, drawImageField, flowParagraphs, safeFilename, stampFields,
  type FieldValues,
} from "./pdfDraw";
import { fetchAllMappings, fetchTemplateImage, mappingsForForm, resetPdfTemplateCache } from "./pdfTemplates";
import { formFieldIds, getForm, templateImageName } from "./pdfForms";

// PDF Mapper draws its checkbox markers at these sizes; re-exported so it can
// keep importing them from here rather than knowing about pdfDraw.
export {
  CHECKBOX_SIZE, TICK_SIZE, TICK_WEIGHT,
  TICK_LEFT_DX, TICK_LEFT_DY, TICK_RIGHT_DX, TICK_RIGHT_DY,
} from "./pdfDraw";

const BIODATA = getForm("biodata");

/**
 * Drop the cached mappings / template images so the next export re-fetches.
 * Called by PDF Mapper after saving, so size and position changes show up
 * immediately without a page reload.
 */
export function resetBiodataPdfCache(): void {
  resetPdfTemplateCache();
}

export interface WEEntry {
  yearsOfEmployment:   string;
  dateFrom:            string;
  dateTo:              string;
  location:            string;
  flatSize:            string;
  contractStatus:      string;
  terminatedReason:    string;
  breakReason:         string;
  householdChores:     string[];
  jobDuties:           string;
  coHelpers:           string;
  employerNationality: string;
  familyMembers:       string;
}

export interface ApplicantForExport {
  id:            string;
  created_at:    string;
  full_name:     string;
  date_of_birth: string;
  nationality:   string;
  gender:        string;
  mobile:        string;
  photo_url:     string;
  signature_url?: string | null;
  signed_at?:     string | null;
  form_data: {
    placeOfBirth?:      string;
    currentLocation?:   string;
    height?:            string;
    weight?:            string;
    maritalStatus?:     string;
    education?:         string;
    religion?:          string;
    contractStatus?:    string;
    lastWorkingDay?:    string;
    numberOfKids?:      string;   // total; derived from the two counts on new rows
    boysCount?:         string;
    boysAges?:          string;
    girlsCount?:        string;
    girlsAges?:         string;
    familyMembersCount?: string;
    educationCourse?:   string;
    totalYearsHK?:      string;
    numberOfEmployers?: string;
    languages?: {
      english?:   string;
      cantonese?: string;
      mandarin?:  string;
    };
    specialSkills?:    string;
    skills?:           string[];
    cookingAbilities?: string[];
    preferences?: {
      sundayOff?:              boolean;
      flexibleDayOff?:         boolean;
      willingWithOtherHelper?: boolean;
      willingStayIn?:          boolean;
    };
    otherExperience?: { country?: string; yearsOfEmployment?: string; jobDuties?: string }[];
    workExperience?: WEEntry[];
  };
}

/**
 * First given name only — the Name field on the biodata prints just the first
 * name, never the surname.
 *
 *   "Maria Santos Cruz"  → "Maria"
 *   "Cruz, Maria Santos" → "Maria"   (comma means surname was written first)
 *
 * Only the PDF's Name field is shortened; the dashboard, the biodata modal and
 * the download filename all keep the full name.
 */
function firstNameOf(fullName: string | null | undefined): string {
  const n = (fullName ?? "").trim();
  if (!n) return "";
  // "Surname, Given Names" — take what follows the comma
  const afterComma = n.includes(",") ? (n.split(",")[1] ?? "").trim() : "";
  return (afterComma || n).split(/\s+/)[0] ?? "";
}

// ── Build field-value dictionary from an applicant record ─────────────────────
// Values: string → drawn as text; true → draws a filled checkbox square; false/undefined → skipped
function buildValues(ap: ApplicantForExport): Record<string, string | boolean> {
  const fd  = ap.form_data ?? {};
  const age = ageFrom(ap.date_of_birth);
  const skills   = fd.skills           ?? [];
  const cooking  = fd.cookingAbilities ?? [];
  const kids     = kidsOf(fd);

  const v: Record<string, string | boolean> = {
    // ── Application header ────────────────────────────────────────────────
    application_no:        ap.id.substring(0, 8).toUpperCase(),

    // ── Contract status (checkboxes) ──────────────────────────────────────
    // The apply form stores "First-Timer (No HK Experience)"; older rows used
    // "Firstimer" / "First Timer". Matching on the prefix covers all three —
    // the previous exact-equality check never ticked this box at all.
    is_firstimer:          /^first[-\s]?timer/i.test(fd.contractStatus ?? ""),
    contract_finished:     fd.contractStatus === "Finished Contract",
    contract_plan_break:   fd.contractStatus === "Plan to Break",
    contract_terminated:   fd.contractStatus === "Terminated" ||
                           fd.contractStatus === "Break of Contract",
    last_working_day:      formDate(fd.lastWorkingDay),

    // ── Personal details ──────────────────────────────────────────────────
    full_name:             firstNameOf(ap.full_name),   // first name only on the form
    date_of_birth:         formDate(ap.date_of_birth),
    nationality:           ap.nationality  ?? "",
    religion:              fd.religion     ?? "",
    age,
    height:                fd.height  ? `${fd.height} cm`  : "",
    weight:                fd.weight  ? `${fd.weight} kg`  : "",
    marital_status:        fd.maritalStatus ?? "",
    // Four blanks on the form: a count and an age list per gender. The count
    // falls back to how many ages were listed on rows that predate the split.
    kids_boys_count:       kids.boys,
    kids_boys_ages:        kids.boysAges,
    kids_girls_count:      kids.girls,
    kids_girls_ages:       kids.girlsAges,

    // ── Spoken language (checkboxes) ──────────────────────────────────────
    english_basic:         fd.languages?.english   === "Basic",
    english_good:          fd.languages?.english   === "Good",
    cantonese_basic:       fd.languages?.cantonese === "Basic",
    cantonese_good:        fd.languages?.cantonese === "Good",
    mandarin_basic:        fd.languages?.mandarin  === "Basic",
    mandarin_good:         fd.languages?.mandarin  === "Good",

    // ── Education (checkboxes) ────────────────────────────────────────────
    edu_high_school:       fd.education === "High School Graduate",
    edu_vocational:        fd.education === "Vocational Course",
    edu_college_undergrad: fd.education === "College Undergraduate",
    edu_college_grad:      fd.education === "College Graduate",
    course_name:           fd.educationCourse    ?? "",
    total_yrs_hk:          fd.totalYearsHK       ?? "",
    how_many_employers:    fd.numberOfEmployers  ?? "",

    // ── Other country experience A ────────────────────────────────────────
    country_a_name:        fd.otherExperience?.[0]?.country           ?? "",
    country_a_yrs:         fd.otherExperience?.[0]?.yearsOfEmployment ?? "",
    country_a_duties_1:    fd.otherExperience?.[0]?.jobDuties         ?? "",

    // ── Other country experience B ────────────────────────────────────────
    country_b_name:        fd.otherExperience?.[1]?.country           ?? "",
    country_b_yrs:         fd.otherExperience?.[1]?.yearsOfEmployment ?? "",
    country_b_duties_1:    fd.otherExperience?.[1]?.jobDuties         ?? "",

    // ── My Skills (checkboxes) ────────────────────────────────────────────
    skill_household_chores: skills.includes("Household Chores"),
    skill_cooking:          skills.includes("Cooking"),
    skill_child_care:       skills.includes("Child Care"),
    skill_newborn_care:     skills.includes("New Born Care"),
    skill_special_child:    skills.includes("Special Child Care"),
    skill_elderly_care:     skills.includes("Elderly Care"),
    skill_disabled_care:    skills.includes("Disabled Person Care"),
    skill_pet_care:         skills.includes("Pet Care"),
    skill_driving:          skills.includes("Driving"),
    skill_car_washing:      skills.includes("Car Washing"),
    skill_plant_care:       skills.includes("Plant Care"),
    skill_kids_tutorial:    skills.includes("Kids Tutorial"),
    skill_nursing_aide:     skills.includes("Nursing Aide"),

    // ── Cooking abilities (checkboxes) ────────────────────────────────────
    cook_western:           cooking.includes("Western Food"),
    cook_asian:             cooking.includes("Asian Food"),
    cook_mediterranean:     cooking.includes("Mediterranean Food"),
    cook_baking:            cooking.includes("Baking"),
    cook_recipe_book:       cooking.includes("Can follow Recipe and Cook Book"),

    // ── Preferences (checkboxes) ──────────────────────────────────────────
    pref_sunday_off:        fd.preferences?.sundayOff              ?? false,
    pref_flexible_day:      fd.preferences?.flexibleDayOff         ?? false,
    willing_stay_in:        fd.preferences?.willingStayIn          ?? false,
    willing_other_helper:   fd.preferences?.willingWithOtherHelper ?? false,
  };

  // ── Work experience entries ───────────────────────────────────────────────
  // workExperience[0] → cwe_* (current HK exp, page 1)
  // workExperience[1] → we1_* (page 2), [2] → we2_*, [3] → we3_*
  const weList = fd.workExperience ?? [];

  const mapWE = (prefix: string, we: WEEntry | undefined) => {
    const chores = we?.householdChores ?? [];
    const isCwe  = prefix === "cwe";
    // Job-duties field prefix: jd_* for cwe, we{N}_jd_* for others
    const jd = isCwe ? "jd" : `${prefix}_jd`;

    // Text fields
    v[`${prefix}_yrs`]                  = we?.yearsOfEmployment   ?? "";
    v[`${prefix}_date_from`]            = we?.dateFrom             ?? "";
    v[`${prefix}_date_to`]              = we?.dateTo               ?? "";
    v[`${prefix}_location`]             = we?.location             ?? "";
    v[`${prefix}_flat_size`]            = we?.flatSize             ?? "";
    v[`${prefix}_family_members`]       = we?.familyMembers        ?? "";
    v[`${prefix}_terminated_reason`]    = we?.terminatedReason     ?? "";
    v[`${prefix}_break_reason`]         = we?.breakReason          ?? "";
    v[`${prefix}_employer_nationality`] = we?.employerNationality  ?? "";

    // co_helper field has different suffix for cwe vs we{N}
    if (isCwe) {
      v["cwe_co_helper_count"] = we?.coHelpers ?? "";
    } else {
      v[`${prefix}_co_helper`] = we?.coHelpers ?? "";
    }

    // Contract status checkboxes
    v[`${prefix}_contract_finished`] = we?.contractStatus === "Finished Contract";
    v[`${prefix}_plan_break`]        = we?.contractStatus === "Plan to Break";

    // Household chores / job duty checkboxes
    // cwe uses jd_<full> names; we1/2/3 use we{N}_jd_<short> names
    v[`${jd}_household_chores`]                                = chores.length > 0;
    v[`${jd}_cooking`]                                         = chores.includes("Cooking");
    v[`${jd}_child_care`]                                      = chores.includes("Child Care");
    v[isCwe ? "jd_newborn_care"    : `${jd}_newborn`]          = chores.includes("New Born Care");
    v[isCwe ? "jd_special_child"   : `${jd}_special_child`]    = chores.includes("Special Child Care");
    v[isCwe ? "jd_elderly_care"    : `${jd}_elderly`]          = chores.includes("Elderly Care");
    v[isCwe ? "jd_disabled_care"   : `${jd}_disabled`]         = chores.includes("Disabled Person Care");
    v[isCwe ? "jd_pet_care"        : `${jd}_pet`]              = chores.includes("Pet Care");
    v[isCwe ? "jd_driving"         : `${jd}_driving`]          = chores.includes("Driving");
    v[isCwe ? "jd_car_washing"     : `${jd}_car_wash`]         = chores.includes("Car Washing");
    v[isCwe ? "jd_plant_gardening" : `${jd}_plant`]            =
      chores.includes("Plant Care / Gardening") || chores.includes("Plant Care/Gardening");

    // Free-text job duties
    v[isCwe ? "jd_others_text" : `${jd}_others`] = we?.jobDuties ?? "";
  };

  mapWE("cwe", weList[0]);
  mapWE("we1", weList[1]);
  mapWE("we2", weList[2]);
  mapWE("we3", weList[3]);

  return v;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportBiodataPdf(applicant: ApplicantForExport): Promise<void> {
  // 1. Load positions and both template pages together
  const [{ rows, defaultSize }, ...images] = await Promise.all([
    fetchAllMappings(),
    ...Array.from({ length: BIODATA.pages }, (_, i) =>
      fetchTemplateImage(templateImageName(BIODATA, i + 1), BIODATA.label)),
  ]);

  const mappings = mappingsForForm(rows, formFieldIds(BIODATA));
  if (!mappings.length) {
    throw new Error("No biodata field mappings found. Set them up in PDF Mapper first.");
  }

  // 2. One page per template image, the image as its background
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages  = await Promise.all(images.map(async (bytes) => {
    const img  = await pdfDoc.embedPng(bytes);
    const page = pdfDoc.addPage([BIODATA.width, BIODATA.height]);
    page.drawImage(img, { x: 0, y: 0, width: BIODATA.width, height: BIODATA.height });
    return page;
  }));

  // 3. Values, then spread the long free-text answers over their ruled lines
  const values: FieldValues = buildValues(applicant);
  const sizeOverrides = new Map<string, number>();
  flowParagraphs(values, mappings, font, BIODATA.paragraphs, defaultSize, sizeOverrides);

  // 4. Photo fills its box; the signature is scaled to fit so handwriting keeps
  //    its shape. Both are skipped silently when absent.
  const imageJobs: Promise<void>[] = [];
  const place = (fieldId: string, url: string | null | undefined, mode: "fill" | "contain") => {
    const m = mappings.find(x => x.field_id === fieldId);
    if (!m || !url) return;
    const page = pages[m.page - 1];
    if (page) imageJobs.push(drawImageField(pdfDoc, page, m, url, BIODATA.height, mode));
  };
  place("photo",     applicant.photo_url,     "fill");
  place("signature", applicant.signature_url, "contain");
  await Promise.all(imageJobs);

  // 5. Stamp the rest and hand it over
  stampFields({
    pages, mappings, values, font,
    pageHeight: BIODATA.height, defaultSize, sizeOverrides,
    keepUnitFields: new Set(BIODATA.unitFields ?? []),
  });
  downloadPdf(await pdfDoc.save(), safeFilename(applicant.full_name, "Biodata"));
}
