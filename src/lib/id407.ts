/**
 * id407.ts — the ID 407 employment contract as a mappable form.
 *
 * ── The sheets ──────────────────────────────────────────────────────────────
 * ID 407 is printed as a booklet: one A3 sheet folded to A4, so each PDF page
 * carries two form pages side by side.
 *
 *   sheet 1  =  form page 4 (left)  |  form page 1 (right)
 *   sheet 2  =  form page 2 (left)  |  form page 3 (right)
 *
 * The mapper works on the sheets as supplied, so `page: 1` here means sheet 1
 * and fields from form pages 4 and 1 both live on it. Section titles name the
 * form page, because that is what a recruiter is looking at on paper.
 *
 * ── Where the values come from ──────────────────────────────────────────────
 * Almost none of this is on the apply form. Only the helper's name, her place
 * of origin and her signature come from her own record; everything else is the
 * employer's residence (employers.employer_data) or the placement terms
 * (contracts.terms). See supabase/README.md.
 *
 * Traps worth remembering, because the field names look alike: Schedule 2B is
 * the EMPLOYER's household, not the helper's `familyMembersCount`; Schedule 2A
 * is the EMPLOYER's flat, not the `flatSize` of a job she used to have.
 */

import type { FieldValues } from "./pdfDraw";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";
import { FACILITY_FIELDS } from "./employers";
import { DUTY_FIELDS } from "./contracts";
import type { FieldDef, FormSection } from "./pdfForms";
import { formDate } from "./formDates";

/**
 * One folded booklet sheet, measured from the supplied scan rather than assumed.
 *
 * Close to A3 landscape but not equal to it — 1225 x 841 against A3's
 * 1190.55 x 841.89. Using A3 would squeeze the template about 3% horizontally,
 * so every box would drift further out the further right it sat.
 */
export const ID407_PAGE_W = 1225;
export const ID407_PAGE_H = 841;

/** Text that flows over a run of ruled lines. See flowParagraphs(). */
export const ID407_PARAGRAPHS: string[][] = [
  ["id407_origin_1",          "id407_origin_2",          "id407_origin_3"],
  ["id407_residence_1",       "id407_residence_2"],
  ["id407_duty_others_1",     "id407_duty_others_2", "id407_duty_others_3", "id407_duty_others_4"],
  ["id407_sleep_others_1",    "id407_sleep_others_2",    "id407_sleep_others_3"],
  ["id407_other_facilities_1","id407_other_facilities_2","id407_other_facilities_3"],
];

/** A measurement's unit is printed as "square feet/square metres*" with one to
 *  be deleted, so each unit gets its own mark rather than being text. */
const areaUnitFields = (prefix: string, label: string): FieldDef[] => [
  { id: `${prefix}_sqft`, label: `${label} — mark "square feet"`,  type: "checkbox" },
  { id: `${prefix}_sqm`,  label: `${label} — mark "square metres"`, type: "checkbox" },
];

export const ID407_SECTIONS: FormSection[] = [
  {
    title: "Duties & signing (form page 4)", page: 1,
    fields: [
      { id: "id407_duty_household",     label: "Duty 1 — Household chores",  type: "checkbox" },
      { id: "id407_duty_cooking",       label: "Duty 2 — Cooking",           type: "checkbox" },
      { id: "id407_duty_aged",          label: "Duty 3 — Aged persons",      type: "checkbox" },
      { id: "id407_duty_aged_required",     label: "Duty 3 — mark \"required\"",     type: "checkbox" },
      { id: "id407_duty_aged_not_required", label: "Duty 3 — mark \"not required\"", type: "checkbox" },
      { id: "id407_duty_babysitting",   label: "Duty 4 — Baby-sitting",      type: "checkbox" },
      { id: "id407_duty_childminding",  label: "Duty 5 — Child-minding",     type: "checkbox" },
      { id: "id407_duty_others_1",      label: "Duty 6 — Others (line 1)",   type: "text", defaultW: 300 },
      { id: "id407_duty_others_2",      label: "Duty 6 — Others (line 2)",   type: "text", defaultW: 300 },
      { id: "id407_duty_others_3",      label: "Duty 6 — Others (line 3)",   type: "text", defaultW: 300 },
      { id: "id407_duty_others_4",      label: "Duty 6 — Others (line 4)",   type: "text", defaultW: 300 },
      { id: "id407_p4_employer_name",   label: "P4 Employer's name",         type: "text",      defaultW: 130 },
      { id: "id407_p4_employer_sig",    label: "P4 Employer's signature",    type: "signature", defaultW: 130, defaultH: 34 },
      { id: "id407_p4_employer_date",   label: "P4 Employer's date",         type: "date",      defaultW: 70  },
      { id: "id407_p4_helper_name",     label: "P4 Helper's name",           type: "text",      defaultW: 130 },
      { id: "id407_p4_helper_sig",      label: "P4 Helper's signature",      type: "signature", defaultW: 130, defaultH: 34 },
      { id: "id407_p4_helper_date",     label: "P4 Helper's date",           type: "date",      defaultW: 70  },
    ],
  },
  {
    title: "Contract (form page 1)", page: 1,
    fields: [
      { id: "id407_contract_no",       label: "D. H. Contract No.",          type: "text", defaultW: 110 },
      { id: "id407_employer_name",     label: "Employer's name",             type: "text", defaultW: 210 },
      { id: "id407_helper_name",       label: "Helper's name",               type: "text", defaultW: 200 },
      { id: "id407_contract_date",     label: "Date contract is made",       type: "date", defaultW: 120 },
      { id: "id407_origin_1",          label: "Cl.1 Place of origin (line 1)", type: "text", defaultW: 150 },
      { id: "id407_origin_2",          label: "Cl.1 Place of origin (line 2)", type: "text", defaultW: 260 },
      { id: "id407_origin_3",          label: "Cl.1 Place of origin (line 3)", type: "text", defaultW: 260 },
      { id: "id407_clause_2a",         label: "Cl.2A — mark if used",        type: "checkbox" },
      { id: "id407_clause_2b",         label: "Cl.2B — mark if used",        type: "checkbox" },
      { id: "id407_clause_2c",         label: "Cl.2C — mark if used",        type: "checkbox" },
      { id: "id407_clause_2b_date",    label: "Cl.2B commencing on",         type: "date", defaultW: 120 },
      { id: "id407_clause_2b_prev_no", label: "Cl.2B previous contract no.", type: "text", defaultW: 90  },
      { id: "id407_residence_1",       label: "Cl.3 Residence (line 1)",     type: "text", defaultW: 170 },
      { id: "id407_residence_2",       label: "Cl.3 Residence (line 2)",     type: "text", defaultW: 280 },
      { id: "id407_wages",             label: "Cl.5(a) Monthly wages",       type: "text", defaultW: 90  },
      { id: "id407_food_allowance",    label: "Cl.5(b) Food allowance",      type: "text", defaultW: 60  },
      { id: "id407_other_fees",        label: "Cl.8(vi) Other fees",         type: "text", defaultW: 230 },
    ],
  },
  {
    title: "Execution (form page 2)", page: 2,
    fields: [
      { id: "id407_sig_employer",          label: "Signed by the Employer",     type: "signature", defaultW: 150, defaultH: 34 },
      { id: "id407_witness_employer_name", label: "Employer's witness — name",  type: "text",      defaultW: 140 },
      { id: "id407_witness_employer_sig",  label: "Employer's witness — sign",  type: "signature", defaultW: 150, defaultH: 34 },
      { id: "id407_sig_helper",            label: "Signed by the Helper",       type: "signature", defaultW: 150, defaultH: 34 },
      { id: "id407_witness_helper_name",   label: "Helper's witness — name",    type: "text",      defaultW: 140 },
      { id: "id407_witness_helper_sig",    label: "Helper's witness — sign",    type: "signature", defaultW: 150, defaultH: 34 },
    ],
  },
  {
    title: "Schedule 2 — residence & household (form page 3)", page: 2,
    fields: [
      { id: "id407_flat_size", label: "2A Flat / house size", type: "text", defaultW: 55 },
      ...areaUnitFields("id407_flat_unit", "2A Flat size"),
      { id: "id407_adults",           label: "2B Adults",                 type: "text", defaultW: 30 },
      { id: "id407_minors_5_18",      label: "2B Minors aged 5–18",       type: "text", defaultW: 30 },
      { id: "id407_minors_under_5",   label: "2B Minors below 5",         type: "text", defaultW: 30 },
      { id: "id407_expecting",        label: "2B Expecting babies",       type: "text", defaultW: 30 },
      { id: "id407_constant_care",    label: "2B Requiring constant care",type: "text", defaultW: 30 },
      { id: "id407_helpers_employed", label: "2B Helpers employed now",   type: "text", defaultW: 30 },
    ],
  },
  {
    title: "Schedule 3A — accommodation (form page 3)", page: 2,
    fields: [
      { id: "id407_servant_room_yes",  label: "3A Servant room — Yes", type: "checkbox" },
      { id: "id407_servant_room_no",   label: "3A Servant room — No",  type: "checkbox" },
      { id: "id407_servant_room_size", label: "3A Servant room size",  type: "text", defaultW: 55 },
      ...areaUnitFields("id407_servant_room_unit", "3A Room size"),
      { id: "id407_share_room",     label: "3A Share a room — mark",  type: "checkbox" },
      { id: "id407_share_children", label: "3A Shares with (number)", type: "text", defaultW: 40 },
      { id: "id407_share_ages",     label: "3A Children aged",        type: "text", defaultW: 70 },
      { id: "id407_partition",      label: "3A Partitioned area — mark", type: "checkbox" },
      { id: "id407_partition_size", label: "3A Partition size",       type: "text", defaultW: 45 },
      ...areaUnitFields("id407_partition_unit", "3A Partition size"),
      { id: "id407_sleep_others",   label: "3A Others — mark",           type: "checkbox" },
      { id: "id407_sleep_others_1", label: "3A Others describe (line 1)", type: "text", defaultW: 210 },
      { id: "id407_sleep_others_2", label: "3A Others describe (line 2)", type: "text", defaultW: 250 },
      { id: "id407_sleep_others_3", label: "3A Others describe (line 3)", type: "text", defaultW: 250 },
    ],
  },
  {
    title: "Schedule 3B — facilities (form page 3)", page: 2,
    fields: [
      ...FACILITY_FIELDS.flatMap((f, i): FieldDef[] => {
        const letter = "abcdefgh"[i];
        return [
          { id: `id407_fac_${f.key}_yes`, label: `(${letter}) ${f.label} — Yes`, type: "checkbox" },
          { id: `id407_fac_${f.key}_no`,  label: `(${letter}) ${f.label} — No`,  type: "checkbox" },
        ];
      }),
      { id: "id407_other_facilities_1", label: "(i) Other facilities (line 1)", type: "text", defaultW: 250 },
      { id: "id407_other_facilities_2", label: "(i) Other facilities (line 2)", type: "text", defaultW: 250 },
      { id: "id407_other_facilities_3", label: "(i) Other facilities (line 3)", type: "text", defaultW: 250 },
    ],
  },
];

/** Signature and photo fields, which are drawn from a URL rather than stamped as text. */
export const ID407_IMAGE_FIELDS: { id: string; source: (c: Contract) => string | null }[] = [
  { id: "id407_sig_employer",         source: c => c.employer_signature },
  { id: "id407_sig_helper",           source: c => c.helper_signature },
  { id: "id407_p4_employer_sig",      source: c => c.employer_signature },
  { id: "id407_p4_helper_sig",        source: c => c.helper_signature },
  { id: "id407_witness_employer_sig", source: c => c.employer_witness_signature },
  { id: "id407_witness_helper_sig",   source: c => c.helper_witness_signature },
];

/** The applicant fields ID 407 actually uses. Kept minimal on purpose — see the
 *  header for why almost nothing else on her record belongs on this form. */
export interface ContractApplicant {
  full_name:     string;
  nationality:   string | null;
  signature_url?: string | null;
}

/**
 * Build the field-value map for one contract.
 *
 * Anything absent stays absent: an unmapped or unanswered field is skipped by
 * the stamp loop rather than printed blank, so a half-filled contract prints
 * exactly what is known and nothing invented.
 */
export function buildId407Values(
  applicant: ContractApplicant,
  employer: Employer | null,
  contract: Contract,
): FieldValues {
  const t  = contract.terms ?? {};
  const ed = employer?.employer_data ?? {};
  const fac = ed.facilities ?? {};

  // "sq ft" | "sq m" -> which of the printed pair to mark
  const unit = (u?: string) => ({
    sqft: !u || u === "sq ft",
    sqm:  u === "sq m",
  });
  const flatU = unit(ed.flatSizeUnit);
  const roomU = unit(ed.servantRoomUnit);
  const partU = unit(ed.partitionUnit);

  const v: FieldValues = {
    // ── Contract, form page 1 ────────────────────────────────────────────────
    id407_contract_no:   t.contractNo ?? "",
    id407_employer_name: employer?.name ?? "",
    id407_helper_name:   applicant.full_name ?? "",
    id407_contract_date: formDate(t.contractDate),
    // The whole place of origin goes on the first line and flowParagraphs
    // spreads it over however many of the three are mapped.
    id407_origin_1:      t.placeOfOrigin ?? "",

    id407_clause_2a: t.clause2 === "A",
    id407_clause_2b: t.clause2 === "B",
    id407_clause_2c: t.clause2 === "C",
    id407_clause_2b_date:    t.clause2 === "B" ? formDate(t.clause2bCommenceDate) : "",
    id407_clause_2b_prev_no: t.clause2 === "B" ? (t.clause2bPreviousNo ?? "")   : "",

    id407_residence_1: ed.residenceAddress || employer?.address || "",

    id407_wages: t.wages ?? "",
    // 5(b) is the allowance paid only when food is NOT provided free
    id407_food_allowance: t.foodArrangement === "allowance" ? (t.foodAllowance ?? "") : "",
    id407_other_fees:     t.otherFees ?? "",

    // ── Duties, form page 4 ──────────────────────────────────────────────────
    id407_duty_household:    !!t.duties?.householdChores,
    id407_duty_cooking:      !!t.duties?.cooking,
    id407_duty_aged:         !!t.duties?.agedPersons,
    id407_duty_aged_required:     t.duties?.agedPersons === true && t.agedPersonsCare === "required",
    id407_duty_aged_not_required: t.duties?.agedPersons === true && t.agedPersonsCare === "not required",
    id407_duty_babysitting:  !!t.duties?.babySitting,
    id407_duty_childminding: !!t.duties?.childMinding,
    id407_duty_others_1:     t.dutiesOthers ?? "",

    // ── Names beside the page 4 signatures ───────────────────────────────────
    // The signed name is what the party actually typed on their signing link;
    // it falls back to the record only if they have not signed yet.
    id407_p4_employer_name: contract.employer_name ?? employer?.name ?? "",
    id407_p4_employer_date: formDate(contract.employer_signed_at),
    id407_p4_helper_name:   contract.helper_name ?? applicant.full_name ?? "",
    id407_p4_helper_date:   formDate(contract.helper_signed_at),

    // ── Witnesses, form page 2 ───────────────────────────────────────────────
    id407_witness_employer_name: contract.employer_witness_name ?? "",
    id407_witness_helper_name:   contract.helper_witness_name   ?? "",

    // ── Schedule 2, form page 3 ──────────────────────────────────────────────
    id407_flat_size:      ed.flatSize ?? "",
    id407_flat_unit_sqft: !!ed.flatSize && flatU.sqft,
    id407_flat_unit_sqm:  !!ed.flatSize && flatU.sqm,

    id407_adults:           ed.adults          ?? "",
    id407_minors_5_18:      ed.minors5to18     ?? "",
    id407_minors_under_5:   ed.minorsUnder5    ?? "",
    id407_expecting:        ed.expectingBabies ?? "",
    id407_constant_care:    ed.constantCare    ?? "",
    id407_helpers_employed: ed.helpersEmployed ?? "",

    // ── Schedule 3A ──────────────────────────────────────────────────────────
    id407_servant_room_yes: ed.servantRoom === "Yes",
    id407_servant_room_no:  ed.servantRoom === "No",
    id407_servant_room_size:      ed.servantRoom === "Yes" ? (ed.servantRoomSize ?? "") : "",
    id407_servant_room_unit_sqft: ed.servantRoom === "Yes" && !!ed.servantRoomSize && roomU.sqft,
    id407_servant_room_unit_sqm:  ed.servantRoom === "Yes" && !!ed.servantRoomSize && roomU.sqm,

    // The three sleeping arrangements only apply when there is no servant room
    id407_share_room:     ed.servantRoom === "No" && !!ed.shareRoomChildren,
    id407_share_children: ed.servantRoom === "No" ? (ed.shareRoomChildren ?? "") : "",
    id407_share_ages:     ed.servantRoom === "No" ? (ed.shareRoomAges     ?? "") : "",

    id407_partition:           ed.servantRoom === "No" && !!ed.partitionSize,
    id407_partition_size:      ed.servantRoom === "No" ? (ed.partitionSize ?? "") : "",
    id407_partition_unit_sqft: ed.servantRoom === "No" && !!ed.partitionSize && partU.sqft,
    id407_partition_unit_sqm:  ed.servantRoom === "No" && !!ed.partitionSize && partU.sqm,

    id407_sleep_others:   ed.servantRoom === "No" && !!ed.sleepOthers,
    id407_sleep_others_1: ed.servantRoom === "No" ? (ed.sleepOthers ?? "") : "",

    // ── Schedule 3B ──────────────────────────────────────────────────────────
    id407_other_facilities_1: ed.otherFacilities ?? "",
  };

  // Facilities (a)–(h): one mark per answer, neither when unanswered
  FACILITY_FIELDS.forEach(f => {
    v[`id407_fac_${f.key}_yes`] = fac[f.key] === "Yes";
    v[`id407_fac_${f.key}_no`]  = fac[f.key] === "No";
  });

  return v;
}

/**
 * What is still missing before this contract can be printed properly.
 * Shown next to the export button, so a half-ready contract says so rather than
 * quietly producing a form with gaps.
 */
export function id407Gaps(
  employer: Employer | null,
  contract: Contract,
): string[] {
  const t   = contract.terms ?? {};
  const ed  = employer?.employer_data ?? {};
  const fac = ed.facilities ?? {};
  const gaps: string[] = [];

  if (!employer)                     gaps.push("no employer assigned");
  if (!t.contractNo)                 gaps.push("D. H. Contract No.");
  if (!t.clause2)                    gaps.push("commencement clause");
  if (!t.wages)                      gaps.push("monthly wages");
  if (!t.foodArrangement)            gaps.push("food arrangement");
  if (!DUTY_FIELDS.some(d => t.duties?.[d.key])) gaps.push("domestic duties");
  if (!ed.flatSize)                  gaps.push("flat size");
  if (!ed.adults)                    gaps.push("household numbers");
  if (!ed.servantRoom)               gaps.push("accommodation");
  if (FACILITY_FIELDS.some(f => !fac[f.key])) gaps.push("facilities");
  if (!contract.employer_signed_at)  gaps.push("employer's signature");
  if (!contract.helper_signed_at)    gaps.push("helper's signature");

  return gaps;
}
