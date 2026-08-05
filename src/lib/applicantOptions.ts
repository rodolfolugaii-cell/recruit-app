/**
 * applicantOptions.ts — the canonical option strings for applicant data.
 *
 * These values are matched EXACTLY by exportBiodataPdf's buildValues() to
 * decide which checkboxes to tick on the biodata form. If the apply form and
 * the recruiter edit form ever drift apart on a string, the PDF silently stops
 * ticking that box — so both import from here rather than declaring their own.
 */

export const SKILL_OPTIONS = [
  "Cooking", "Child Care", "New Born Care", "Special Child Care",
  "Elderly Care", "Disabled Person Care", "Pet Care", "Driving",
  "Car Washing", "Plant Care", "Kids Tutorial", "Nursing Aide",
];

export const COOKING_OPTIONS = [
  "Western Food", "Asian Food", "Mediterranean Food",
  "Baking", "Can follow Recipe and Cook Book",
];

export const HOUSEHOLD_CHORES = [
  "Cooking", "Child Care", "New Born Care", "Special Child Care",
  "Elderly Care", "Disabled Person Care", "Pet Care",
  "Driving", "Car Washing", "Plant Care / Gardening",
];

export const EDUCATION_OPTIONS = [
  "High School Graduate", "College Undergraduate",
  "College Graduate", "Vocational Course",
];

/** Overall contract status (page-1 header checkboxes) */
export const CONTRACT_STATUS_OPTIONS = [
  "First-Timer (No HK Experience)", "Finished Contract",
  "Plan to Break", "Terminated", "Break of Contract",
];

/** Per-work-experience contract status — a shorter list than the header one */
export const WE_CONTRACT_STATUS_OPTIONS = [
  "Finished Contract", "Plan to Break", "Terminated", "Break",
];

export const LANG_LEVELS      = ["Basic", "Good"];
export const NATIONALITY_OPTIONS = ["Filipino", "Indonesian"];
export const GENDER_OPTIONS   = ["Female", "Male"];
export const LOCATION_OPTIONS = ["Hong Kong", "Philippines", "Indonesia", "Others"];
export const MARITAL_OPTIONS  = ["Single", "Married", "Separated", "Divorced", "Widowed"];
export const RELIGION_OPTIONS = ["Catholic", "Christian", "Moslem", "Buddhist", "Hindu", "Islam", "Others"];
