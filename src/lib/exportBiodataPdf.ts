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

import { PDFDocument, rgb, StandardFonts, LineCapStyle, PDFFont } from "pdf-lib";
import { supabase } from "./supabase";

// ── PDF coordinate constants ──────────────────────────────────────────────────
const PDF_W    = 595.276;
const PDF_H    = 841.89;
const BUCKET   = "pdf-templates";
const TXT_SIZE = 8;   // pt — fallback text size when nothing is configured

// ── Checkbox geometry ─────────────────────────────────────────────────────────
// PDF Mapper draws every checkbox marker as a fixed CHECKBOX_SIZE square
// anchored at (x, y) — whatever w/h the row happens to store. These constants
// are shared with the mapper so the preview and the print agree exactly.
export const CHECKBOX_SIZE = 12;   // pt — the marker square in PDF Mapper
export const TICK_SIZE     = 9;    // pt — overall span of the drawn ✓
export const TICK_WEIGHT   = 1.4;  // pt — stroke thickness
// Arm proportions, relative to TICK_SIZE, measured from the vertex
export const TICK_LEFT_DX  = 0.35;
export const TICK_LEFT_DY  = 0.50;
export const TICK_RIGHT_DX = 0.65;
export const TICK_RIGHT_DY = 0.80;

// Row in pdf_field_mappings that stores global settings (not a real field).
// Its font_size is the default applied to any field without its own size.
const SETTINGS_ROW_ID = "__settings__";

// ── Types (mirror the ForReviewDashboard interfaces) ─────────────────────────
interface FieldMapping {
  field_id:   string;
  field_type: string;  // 'text' | 'checkbox' | 'date' | 'image' | 'signature'
  page:       number;
  x:          number;
  y:          number;  // from TOP of page (pdfplumber convention)
  w:          number;
  h:          number;
  font_size?: number | null;  // pt — null/absent = use the global default
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
let _defaultTxtSize = TXT_SIZE;
const _imgCache = new Map<number, Uint8Array>();

/**
 * Drop the cached mappings / template images so the next export re-fetches.
 * Called by PDF Mapper after saving, so size and position changes show up
 * immediately without a page reload.
 */
export function resetBiodataPdfCache(): void {
  _mappingsCache  = null;
  _defaultTxtSize = TXT_SIZE;
  _imgCache.clear();
}

async function fetchMappings(): Promise<FieldMapping[]> {
  if (_mappingsCache) return _mappingsCache;
  const { data, error } = await supabase.from("pdf_field_mappings").select("*");
  if (error) throw new Error(`Could not load field mappings: ${error.message}`);
  if (!data?.length) throw new Error("No field mappings found. Set them up in PDF Mapper first.");

  const rows = data as FieldMapping[];

  // Pull the global default text size out of the settings row, then drop it —
  // it is not a real field and must never be stamped onto the page.
  const settings  = rows.find(r => r.field_id === SETTINGS_ROW_ID);
  _defaultTxtSize = settings?.font_size && settings.font_size > 0
    ? settings.font_size
    : TXT_SIZE;

  _mappingsCache = rows.filter(r => r.field_id !== SETTINGS_ROW_ID);
  if (!_mappingsCache.length) throw new Error("No field mappings found. Set them up in PDF Mapper first.");
  return _mappingsCache;
}

// Per-field size, falling back to the global default
function sizeFor(m: FieldMapping): number {
  return m.font_size && m.font_size > 0 ? m.font_size : _defaultTxtSize;
}

/**
 * Shrink `text` with a trailing ellipsis until it fits `maxW` at `size`.
 * Uses real Helvetica glyph widths rather than a character-count estimate,
 * so truncation stays correct at any font size.
 */
function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  if (maxW <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
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
    // The apply form stores "First-Timer (No HK Experience)"; older rows used
    // "Firstimer" / "First Timer". Matching on the prefix covers all three —
    // the previous exact-equality check never ticked this box at all.
    is_firstimer:          /^first[-\s]?timer/i.test(fd.contractStatus ?? ""),
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

  // 5b. Embed the signature, scaled to FIT its box rather than stretched.
  // The pad exports a transparent PNG cropped to the ink, so preserving the
  // aspect ratio is what keeps handwriting from looking squashed.
  const sigMap = mappings.find(m => m.field_id === "signature");
  if (sigMap && applicant.signature_url) {
    try {
      const res     = await fetch(applicant.signature_url);
      const sigData = new Uint8Array(await res.arrayBuffer());
      const sigImg  = await pdfDoc.embedPng(sigData);

      const scale = Math.min(sigMap.w / sigImg.width, sigMap.h / sigImg.height);
      const w     = sigImg.width  * scale;
      const h     = sigImg.height * scale;

      pages[sigMap.page - 1].drawImage(sigImg, {
        x:      sigMap.x + (sigMap.w - w) / 2,   // centred in the mapped box
        y:      toLibY(sigMap) + (sigMap.h - h) / 2,
        width:  w,
        height: h,
      });
    } catch {
      // Signature failed or the applicant predates the feature — leave it blank
    }
  }

  // 6. Stamp every mapped field
  for (const m of mappings) {
    if (m.field_id === "photo" || m.field_id === "signature") continue;

    const value = values[m.field_id];
    if (value === undefined || value === null || value === "" || value === false) continue;

    const page = pages[m.page - 1];
    if (!page) continue;

    const libY = toLibY(m);

    if (m.field_type === "checkbox" && value === true) {
      // The VERTEX of the ✓ — where the two strokes meet — lands exactly on the
      // centre of the square drawn in PDF Mapper. Previously the tick's bounding
      // box was centred instead, which pushed the point down-left of the target.
      //
      // The centre is derived from CHECKBOX_SIZE, not m.w/m.h, because the mapper
      // renders checkboxes at that fixed size whatever the row stores. Rows that
      // kept text-shaped defaults (w = 100, h = 14) would otherwise put the tick
      // tens of points away from where the recruiter clicked.
      const cx = m.x + CHECKBOX_SIZE / 2;
      const cy = PDF_H - (m.y + CHECKBOX_SIZE / 2);   // top-left origin → pdf-lib

      // Short arm: down from upper-left into the vertex
      page.drawLine({
        start:     { x: cx - TICK_SIZE * TICK_LEFT_DX, y: cy + TICK_SIZE * TICK_LEFT_DY },
        end:       { x: cx,                            y: cy },
        thickness: TICK_WEIGHT,
        color:     black,
        lineCap:   LineCapStyle.Round,
      });
      // Long arm: up from the vertex to the upper-right
      page.drawLine({
        start:     { x: cx,                             y: cy },
        end:       { x: cx + TICK_SIZE * TICK_RIGHT_DX, y: cy + TICK_SIZE * TICK_RIGHT_DY },
        thickness: TICK_WEIGHT,
        color:     black,
        lineCap:   LineCapStyle.Round,
      });
    } else if (typeof value === "string" && value.trim() !== "") {
      // Per-field size (falls back to the global default set in PDF Mapper)
      const size = sizeFor(m);
      const text = fitText(value, font, size, m.w - 2);
      page.drawText(text, {
        x:    m.x + 1,
        y:    libY + 2,   // 2pt padding from the bottom of the field zone
        size,
        font,
        color: black,
      });
    }
  }

  // 7. Save and trigger browser download
  const bytes    = await pdfDoc.save();
  // TypeScript strict-mode fix: cast buffer — pdf-lib never returns SharedArrayBuffer
  const blob     = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
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