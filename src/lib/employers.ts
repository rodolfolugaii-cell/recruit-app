/**
 * employers.ts — the households that helpers get placed with.
 *
 * An employer is a first-class record: it owns the residence, the household
 * make-up and the accommodation it provides, and an applicant is assigned to one
 * when she is placed. That split matters for the ID 407 contract:
 *
 *   employer_data (here)          the residence — address, flat size, who lives
 *                                 there, the servant room, the facilities. Same
 *                                 for every helper this employer takes on.
 *
 *   applicants.contract_data      the placement — wages, commencement, duties,
 *                                 witnesses, signature dates. Different for each
 *                                 helper, even under the same employer.
 *
 * Nothing here comes from the apply form. Every field on ID 407 outside the
 * helper's own name, place of origin and signature has to be entered by a
 * recruiter, so this module is the other half of that contract.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * supabase/migrations/20260818000300_employers.sql — see supabase/README.md.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./supabase";

/** Banners and logos share the applicant photo bucket — no extra bucket or policy to set up. */
export const EMPLOYER_BUCKET = "applicant-photos";

export const EMPLOYER_STATUSES = ["Active", "Prospect", "Inactive"] as const;

/** sq ft vs sq m — ID 407 prints "square feet/square metres*" and you delete one. */
export const AREA_UNITS = ["sq ft", "sq m"] as const;

/** Schedule 3B facilities, in the order the form lists them (a)–(h). */
export const FACILITY_FIELDS = [
  { key: "light",        label: "Light and water supply" },
  { key: "toilet",       label: "Toilet and bathing facilities" },
  { key: "bed",          label: "Bed" },
  { key: "blankets",     label: "Blankets or quilt" },
  { key: "pillows",      label: "Pillows" },
  { key: "wardrobe",     label: "Wardrobe" },
  { key: "refrigerator", label: "Refrigerator" },
  { key: "desk",         label: "Desk" },
] as const;

export type FacilityKey = (typeof FACILITY_FIELDS)[number]["key"];

/** ID 407 Schedule items 2 and 3 — everything that describes the residence. */
export interface EmployerData {
  /** Clause 3 — where the Helper works and resides. Falls back to `address`. */
  residenceAddress?: string;

  // 2A — approximate size of flat/house
  flatSize?:     string;
  flatSizeUnit?: string;

  // 2B — persons in the household served on a regular basis
  adults?:          string;
  minors5to18?:     string;
  minorsUnder5?:    string;
  expectingBabies?: string;
  constantCare?:    string;   // persons requiring constant care, excluding infants
  helpersEmployed?: string;   // helpers currently employed to serve the household

  // 3A — accommodation
  servantRoom?:        string;   // "Yes" | "No"
  servantRoomSize?:    string;
  servantRoomUnit?:    string;
  shareRoomChildren?:  string;   // number of children she would share with
  shareRoomAges?:      string;   // their ages, comma separated
  partitionSize?:      string;
  partitionUnit?:      string;
  sleepOthers?:        string;   // free text, prints over 3 ruled lines

  // 3B — facilities provided
  facilities?:     Partial<Record<FacilityKey, string>>;   // "Yes" | "No"
  otherFacilities?: string;
}

export interface Employer {
  id:             string;
  created_at:     string;
  name:           string;
  banner_url:     string | null;
  logo_url:       string | null;
  contact_person: string | null;
  phone:          string | null;
  email:          string | null;
  address:        string | null;
  status:         string | null;
  employer_data:  EmployerData | null;
}

/** A blank employer, used as the starting draft in the add form. */
export function emptyEmployer(): Omit<Employer, "id" | "created_at"> {
  return {
    name: "", banner_url: null, logo_url: null, contact_person: null,
    phone: null, email: null, address: null, status: "Active",
    employer_data: {
      flatSizeUnit: "sq ft", servantRoomUnit: "sq ft", partitionUnit: "sq ft",
      servantRoom: "", facilities: {},
    },
  };
}

/**
 * The table is created by hand (see the header), so a missing table is a normal
 * first-run state rather than a bug. This turns Postgres' relation-not-found
 * into the SQL the recruiter needs, matching how PdfMapper reports the same.
 */
export function employerSetupHint(message: string): string | null {
  if (!/employers/i.test(message)) return null;
  if (/does not exist|schema cache|relation/i.test(message)) {
    return "The `employers` table has not been created yet. Ask your administrator to run the migrations in supabase/migrations/ (see supabase/README.md).";
  }
  return null;
}

export async function fetchEmployers(): Promise<Employer[]> {
  const { data, error } = await supabase
    .from("employers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(employerSetupHint(error.message) ?? error.message);
  return (data ?? []) as Employer[];
}

/** Upload a banner or logo and return its public URL. */
/** Insert a new employer and hand back the saved row. */
export async function createEmployer(
  employer: Omit<Employer, "id" | "created_at">,
): Promise<Employer> {
  const { data, error } = await supabase
    .from("employers")
    .insert(employer)
    .select()
    .single();
  if (error) throw new Error(employerSetupHint(error.message) ?? error.message);
  return data as Employer;
}

export async function uploadEmployerImage(file: File, kind: "banner" | "logo"): Promise<string> {
  const ext  = file.name.split(".").pop() ?? "png";
  const path = `employers/${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from(EMPLOYER_BUCKET).upload(path, file);
  if (error) throw error;
  return supabase.storage.from(EMPLOYER_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Initials for the placeholder tile shown when an employer has no logo. */
export function employerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "??";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * A stable colour per employer, so the same household always reads the same on
 * a card. Hashing the name keeps it consistent without storing a colour.
 */
export function employerTint(name: string): { bg: string; text: string; ring: string } {
  const TINTS = [
    { bg: "bg-blue-100",    text: "text-blue-700",    ring: "ring-blue-200"    },
    { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-200" },
    { bg: "bg-amber-100",   text: "text-amber-700",   ring: "ring-amber-200"   },
    { bg: "bg-violet-100",  text: "text-violet-700",  ring: "ring-violet-200"  },
    { bg: "bg-rose-100",    text: "text-rose-700",    ring: "ring-rose-200"    },
    { bg: "bg-cyan-100",    text: "text-cyan-700",    ring: "ring-cyan-200"    },
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}
