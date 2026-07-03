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

import { PDFDocument, rgb, StandardFonts, LineCapStyle } from "pdf-lib";
import { supabase } from "./supabase";

// ── PDF coordinate constants ──────────────────────────────────────────────────
const PDF_W    = 595.276;
const PDF_H    = 841.89;
const BUCKET   = "pdf-templates";
const TXT_SIZE = 8;   // pt — general text

// ── Types (mirror the ForReviewDashboard interfaces) ─────────────────────────
interface FieldMapping {
  field_id:   string;
  field_type: string;  // 'text' | 'checkbox' | 'date' | 'image' | 'signature'
  page:       number;
  x:          number;
  y:          number;  // from TOP of page (pdfplumber convention)
  w:          number;
  h:          number;
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
    numberOfKids?:      string;
    boysAges?:          string;
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

// ── In-session cache (avoids re-fetching on every export) ─────────────────────
let _mappingsCache: FieldMapping[] | null = null;
const _imgCache = new Map<number, Uint8Array>();

async function fetchMappings(): Promise<FieldMapping[]> {
  if (_mappingsCache) return _mappingsCache;
  const { data, error } = await supabase.from("pdf_field_mappings").select("*");
  if (error) throw new Error(`Could not load field mappings: ${error.message}`);
  if (!data?.length) throw new Error("No field mappings found. Set them up in PDF Mapper first.");
  _mappingsCache = data as FieldMapping[];
  return _mappingsCache;
}

async function fetchPageImage(page: number): Promise<Uint8Array> {
  if (_imgCache.has(page)) return _imgCache.get(page)!;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(`biodata-p${page}.png`);
  const res = await fetch(data.publicUrl);
  if (!res.ok) throw new Error(
    `Page ${page} template image not found (${res.status}). Upload it first in PDF Mapper → 📤 Upload PDF.`
  );
  const bytes = new Uint8Array(await res.arrayBuffer());
  _imgCache.set(page, bytes);
  return bytes;
}

// ── Build field-value dictionary from an applicant record ─────────────────────
// Values: string → drawn as text; true → draws a filled checkbox square; false/undefined → skipped
function buildValues(ap: ApplicantForExport): Record<string, string | boolean> {
  const fd  = ap.form_data ?? {};
  const dob = ap.date_of_birth ? new Date(ap.date_of_birth) : null;
  const age = dob ? String(new Date().getFullYear() - dob.getFullYear()) : "";
  const skills   = fd.skills           ?? [];
  const cooking  = fd.cookingAbilities ?? [];

  const v: Record<string, string | boolean> = {
    // ── Application header ────────────────────────────────────────────────
    application_no:        ap.id.substring(0, 8).toUpperCase(),

    // ── Contract status (checkboxes) ──────────────────────────────────────
    is_firstimer:          fd.contractStatus === "Firstimer" ||
                           fd.contractStatus === "First Timer",
    contract_finished:     fd.contractStatus === "Finished Contract",
    contract_plan_break:   fd.contractStatus === "Plan to Break",
    contract_terminated:   fd.contractStatus === "Terminated" ||
                           fd.contractStatus === "Break of Contract",
    last_working_day:      fd.lastWorkingDay
                             ? new Date(fd.lastWorkingDay).toLocaleDateString("en-GB")
                             : "",

    // ── Personal details ──────────────────────────────────────────────────
    full_name:             ap.full_name    ?? "",
    date_of_birth:         dob ? dob.toLocaleDateString("en-GB") : "",
    nationality:           ap.nationality  ?? "",
    religion:              fd.religion     ?? "",
    age,
    height:                fd.height  ? `${fd.height} cm`  : "",
    weight:                fd.weight  ? `${fd.weight} kg`  : "",
    marital_status:        fd.maritalStatus ?? "",
    kids_boys:             fd.boysAges     ?? "",
    kids_girls:            fd.girlsAges    ?? "",

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

// ── Coordinate conversion ─────────────────────────────────────────────────────
// Our mappings use top-left origin (pdfplumber); pdf-lib uses bottom-left.
// This returns the y-coordinate of the BOTTOM edge of the field zone.
function toLibY(m: FieldMapping): number {
  return PDF_H - m.y - m.h;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function exportBiodataPdf(applicant: ApplicantForExport): Promise<void> {
  // 1. Load all resources in parallel
  const [mappings, p1Bytes, p2Bytes] = await Promise.all([
    fetchMappings(),
    fetchPageImage(1),
    fetchPageImage(2),
  ]);

  // 2. Create the PDF document
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const black  = rgb(0, 0, 0);

  // 3. Add both pages with the template as background
  const [img1, img2] = await Promise.all([
    pdfDoc.embedPng(p1Bytes),
    pdfDoc.embedPng(p2Bytes),
  ]);
  const page1 = pdfDoc.addPage([PDF_W, PDF_H]);
  const page2 = pdfDoc.addPage([PDF_W, PDF_H]);
  page1.drawImage(img1, { x: 0, y: 0, width: PDF_W, height: PDF_H });
  page2.drawImage(img2, { x: 0, y: 0, width: PDF_W, height: PDF_H });
  const pages = [page1, page2];

  // 4. Build the field-value map
  const values = buildValues(applicant);

  // 5. Embed applicant photo if available
  const photoMap = mappings.find(m => m.field_id === "photo");
  if (photoMap && applicant.photo_url) {
    try {
      const res       = await fetch(applicant.photo_url);
      const photoData = new Uint8Array(await res.arrayBuffer());
      const ct        = res.headers.get("content-type") ?? "";
      const photoImg  = ct.includes("png")
        ? await pdfDoc.embedPng(photoData)
        : await pdfDoc.embedJpg(photoData);
      pages[photoMap.page - 1].drawImage(photoImg, {
        x:      photoMap.x,
        y:      toLibY(photoMap),
        width:  photoMap.w,
        height: photoMap.h,
      });
    } catch {
      // Photo failed — leave the box blank, keep going
    }
  }

  // 6. Stamp every mapped field
  for (const m of mappings) {
    if (m.field_id === "photo") continue;

    const value = values[m.field_id];
    if (value === undefined || value === null || value === "" || value === false) continue;

    const page = pages[m.page - 1];
    if (!page) continue;

    const libY = toLibY(m);

    if (m.field_type === "checkbox" && value === true) {
      // Draw a ✓ checkmark centred in the checkbox zone using two line segments
      // The ✓ has a short left-arm going down and a longer right-arm going up
      const sz  = Math.min(9, m.h - 2, m.w - 2);
      const bx  = m.x  + (m.w - sz) / 2;    // left edge of checkmark area
      const by  = libY + (m.h - sz) / 2;    // bottom edge of checkmark area

      // Left arm: from upper-left down to the kink point
      page.drawLine({
        start:     { x: bx,             y: by + sz * 0.50 },
        end:       { x: bx + sz * 0.35, y: by             },
        thickness: 1.4,
        color:     black,
        lineCap:   LineCapStyle.Round,
      });
      // Right arm: from the kink point up to upper-right
      page.drawLine({
        start:     { x: bx + sz * 0.35, y: by             },
        end:       { x: bx + sz,        y: by + sz * 0.80 },
        thickness: 1.4,
        color:     black,
        lineCap:   LineCapStyle.Round,
      });
    } else if (typeof value === "string" && value.trim() !== "") {
      // Truncate text to stay within the field width
      // Rough estimate: each char ≈ font_size × 0.55 wide for Helvetica
      const maxChars = Math.max(1, Math.floor((m.w - 2) / (TXT_SIZE * 0.55)));
      const text     = value.length > maxChars
        ? value.substring(0, maxChars - 1) + "…"
        : value;
      page.drawText(text, {
        x:    m.x + 1,
        y:    libY + 2,   // 2pt padding from the bottom of the field zone
        size: TXT_SIZE,
        font,
        color: black,
      });
    }
  }

  // 7. Save and trigger browser download
  const bytes    = await pdfDoc.save();
  const blob     = new Blob([bytes], { type: "application/pdf" });
  const url      = URL.createObjectURL(blob);
  const link     = document.createElement("a");
  const safeName = (applicant.full_name ?? "Applicant")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  link.href     = url;
  link.download = `${safeName} - Biodata.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
