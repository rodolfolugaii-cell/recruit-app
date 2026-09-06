/**
 * id407Employer.ts — reading an employer profile back off the ID 407 sheet.
 *
 * buildId407Values() goes one way: an employer record becomes boxes on a form.
 * This goes the other, so a recruiter sitting in front of the contract can type
 * the household details straight onto the sheet and have the employer created
 * from them, rather than leaving to fill the same facts into a different form
 * and coming back.
 *
 * Only the boxes that genuinely describe the employer are listed. Wages, dates
 * and duties are contract terms — they belong to the agreement rather than to
 * the household, and are set on the Contracts page.
 *
 * The two must stay in step: a field added to the Schedule 2/3 part of
 * buildId407Values() wants adding here too, or it will fill on export and be
 * uncapturable on the way in.
 */

import {
  FACILITY_FIELDS,
  type Employer, type EmployerData, type FacilityKey,
} from "./employers";

/** Sheet boxes the recruiter types into, in reading order. */
export const EMPLOYER_TEXT_FIELDS: string[] = [
  "id407_employer_name",
  "id407_residence_1", "id407_residence_2",
  "id407_flat_size",
  "id407_adults", "id407_minors_5_18", "id407_minors_under_5",
  "id407_expecting", "id407_constant_care", "id407_helpers_employed",
  "id407_servant_room_size",
  "id407_share_children", "id407_share_ages",
  "id407_partition_size",
  "id407_sleep_others_1", "id407_sleep_others_2", "id407_sleep_others_3",
  "id407_other_facilities_1", "id407_other_facilities_2", "id407_other_facilities_3",
];

/** Marks the recruiter ticks. Each pair is one answer, not two. */
export const EMPLOYER_CHECK_FIELDS: string[] = [
  "id407_flat_unit_sqft", "id407_flat_unit_sqm",
  "id407_servant_room_yes", "id407_servant_room_no",
  "id407_servant_room_unit_sqft", "id407_servant_room_unit_sqm",
  "id407_partition_unit_sqft", "id407_partition_unit_sqm",
  ...FACILITY_FIELDS.flatMap(f => [`id407_fac_${f.key}_yes`, `id407_fac_${f.key}_no`]),
];

/**
 * Ticking one of a pair clears the other, so the sheet can never say both
 * "square feet" and "square metres", or that a servant room is provided and
 * is not. Returns the ids to switch off alongside the one switched on.
 */
export const EXCLUSIVE_PAIRS: string[][] = [
  ["id407_flat_unit_sqft", "id407_flat_unit_sqm"],
  ["id407_servant_room_yes", "id407_servant_room_no"],
  ["id407_servant_room_unit_sqft", "id407_servant_room_unit_sqm"],
  ["id407_partition_unit_sqft", "id407_partition_unit_sqm"],
  ...FACILITY_FIELDS.map(f => [`id407_fac_${f.key}_yes`, `id407_fac_${f.key}_no`]),
];

export const EMPLOYER_FIELD_SET = new Set([
  ...EMPLOYER_TEXT_FIELDS, ...EMPLOYER_CHECK_FIELDS,
]);

/** The other half of a tick pair, so ticking one can clear it. */
export function partnerOf(id: string): string | null {
  const pair = EXCLUSIVE_PAIRS.find(p => p.includes(id));
  if (!pair) return null;
  return pair.find(x => x !== id) ?? null;
}

export type SheetDraft = Record<string, string | boolean>;

const str = (d: SheetDraft, id: string): string => {
  const v = d[id];
  return typeof v === "string" ? v.trim() : "";
};
const on = (d: SheetDraft, id: string): boolean => d[id] === true;

/** Ruled lines that carry one answer between them, joined back into one value. */
const joined = (d: SheetDraft, ...ids: string[]): string =>
  ids.map(id => str(d, id)).filter(Boolean).join(" ");

/** "sq ft" unless the metric box was the one ticked. */
const unit = (d: SheetDraft, sqm: string): string => (on(d, sqm) ? "sq m" : "sq ft");

/** One of a Yes/No pair, or "" when neither has been answered yet. */
const yesNo = (d: SheetDraft, yes: string, no: string): string =>
  on(d, yes) ? "Yes" : on(d, no) ? "No" : "";

/**
 * Turn what was typed on the sheet into an employer record.
 *
 * Blank stays blank rather than being invented: a household detail nobody
 * filled in is unknown, and guessing it here would print a confident wrong
 * answer on a signed contract.
 */
export function employerFromSheet(
  draft: SheetDraft,
): Omit<Employer, "id" | "created_at"> {
  const facilities: Partial<Record<FacilityKey, string>> = {};
  for (const f of FACILITY_FIELDS) {
    const answer = yesNo(draft, `id407_fac_${f.key}_yes`, `id407_fac_${f.key}_no`);
    if (answer) facilities[f.key] = answer;
  }

  const residence = joined(draft, "id407_residence_1", "id407_residence_2");

  const employer_data: EmployerData = {
    residenceAddress: residence,

    flatSize:     str(draft, "id407_flat_size"),
    flatSizeUnit: unit(draft, "id407_flat_unit_sqm"),

    adults:          str(draft, "id407_adults"),
    minors5to18:     str(draft, "id407_minors_5_18"),
    minorsUnder5:    str(draft, "id407_minors_under_5"),
    expectingBabies: str(draft, "id407_expecting"),
    constantCare:    str(draft, "id407_constant_care"),
    helpersEmployed: str(draft, "id407_helpers_employed"),

    servantRoom:     yesNo(draft, "id407_servant_room_yes", "id407_servant_room_no"),
    servantRoomSize: str(draft, "id407_servant_room_size"),
    servantRoomUnit: unit(draft, "id407_servant_room_unit_sqm"),

    shareRoomChildren: str(draft, "id407_share_children"),
    shareRoomAges:     str(draft, "id407_share_ages"),

    partitionSize: str(draft, "id407_partition_size"),
    partitionUnit: unit(draft, "id407_partition_unit_sqm"),

    sleepOthers: joined(draft,
      "id407_sleep_others_1", "id407_sleep_others_2", "id407_sleep_others_3"),

    facilities,
    otherFacilities: joined(draft,
      "id407_other_facilities_1", "id407_other_facilities_2", "id407_other_facilities_3"),
  };

  return {
    name:           str(draft, "id407_employer_name"),
    banner_url:     null,
    logo_url:       null,
    contact_person: null,
    phone:          null,
    email:          null,
    address:        residence || null,
    status:         "Active",
    employer_data,
  };
}

/**
 * What still has to be filled before the employer can be saved.
 *
 * Only the name is genuinely required — it is NOT NULL on the table and is the
 * one thing the employer is findable by afterwards. Everything else can be
 * completed later on the Employers page, and blocking on it would stop a
 * recruiter recording what they do know.
 */
export function employerSheetGaps(draft: SheetDraft): string[] {
  const gaps: string[] = [];
  if (!str(draft, "id407_employer_name")) gaps.push("Employer’s name");
  return gaps;
}
