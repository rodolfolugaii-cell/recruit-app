/**
 * contracts.ts — one ID 407 employment contract, and the links that get it signed.
 *
 * A contract joins a helper to an employer for one placement. The agency fills
 * the terms; each party then signs through their own link, with no login:
 *
 *   /contract/<employer_token>   the employer reviews and signs
 *   /contract/<helper_token>     the helper reviews and signs
 *
 * Two tokens rather than one, so a link only ever unlocks the panel belonging to
 * the party it was sent to — forwarding the employer's link cannot let someone
 * sign as the helper.
 *
 * ── Why the RPCs ────────────────────────────────────────────────────────────
 * The signing page is public and this app reaches Supabase with the anon key
 * from the browser. Any row-level policy loose enough for that page to read a
 * contract by token would equally allow `select *` over the whole table — every
 * employer's name, address and wage figure. A token is a filter the client
 * chooses, not a permission.
 *
 * So anon gets no direct access to `contracts` at all. The only way in is two
 * SECURITY DEFINER functions that take a token and act on exactly the one row it
 * matches. Recruiters, who are authenticated, still query the table normally.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * supabase/migrations/20260818000400_contracts.sql — the table, the policy and
 * both functions. See supabase/README.md for the run order.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from "./supabase";

export const CONTRACT_STATUSES = ["Draft", "Sent", "Partly Signed", "Signed"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** Which of the two parties a signing link belongs to. */
export type Party = "employer" | "helper";

/** ID 407 Clause 2 — the three mutually exclusive commencement bases. */
export const CLAUSE_2_OPTIONS = [
  { value: "A", label: "2A — starts on the date the Helper arrives in Hong Kong" },
  { value: "B", label: "2B — follows the expiry of an existing contract with the same employer" },
  { value: "C", label: "2C — starts when Immigration grants permission to remain" },
] as const;

/** Schedule item 5 — the major portion of domestic duties. */
export const DUTY_FIELDS = [
  { key: "householdChores", label: "Household chores" },
  { key: "cooking",         label: "Cooking" },
  { key: "agedPersons",     label: "Looking after aged persons in the household" },
  { key: "babySitting",     label: "Baby-sitting" },
  { key: "childMinding",    label: "Child-minding" },
] as const;

export type DutyKey = (typeof DUTY_FIELDS)[number]["key"];

/** Everything the agency fills in before sending the contract out to be signed. */
export interface ContractTerms {
  contractNo?:   string;   // D. H. Contract No. printed at the top right
  contractDate?: string;   // the date the contract is made
  placeOfOrigin?: string;  // Clause 1 — seeded from the helper's nationality

  clause2?:             string;   // "A" | "B" | "C"
  clause2bCommenceDate?: string;
  clause2bPreviousNo?:   string;

  wages?:           string;   // HK$ per month, Clause 5(a)
  foodArrangement?: string;   // "provided" | "allowance"
  foodAllowance?:   string;   // HK$ per month, Clause 5(b)
  otherFees?:       string;   // Clause 8(vi)

  duties?:          Partial<Record<DutyKey, boolean>>;
  /** "required" | "not required" — the delete-as-appropriate on duty 3 */
  agedPersonsCare?: string;
  dutiesOthers?:    string;   // Schedule 5.6, prints over 4 ruled lines
}

/** field_id -> the text (or tick) to print instead of the computed value. */
export type FieldOverrides = Record<string, string | boolean>;

/** field_id -> where to print it, in PDF points with a top-left origin. */
export type FieldPositions = Record<string, { x: number; y: number }>;

export interface Contract {
  id:           string;
  created_at:   string;
  updated_at:   string | null;
  applicant_id: string;
  employer_id:  string | null;
  status:       ContractStatus;
  terms:        ContractTerms | null;

  employer_token: string;
  helper_token:   string;

  employer_name:      string | null;
  employer_signature: string | null;
  employer_signed_at: string | null;
  helper_name:        string | null;
  helper_signature:   string | null;
  helper_signed_at:   string | null;

  // Both witnesses are the agency, signed from the dashboard rather than by link
  employer_witness_name:      string | null;
  employer_witness_signature: string | null;
  helper_witness_name:        string | null;
  helper_witness_signature:   string | null;

  // Hand corrections to this contract's printed sheet. An absent key means "use
  // the computed value / the shared mapping", so clearing an edit restores the
  // automatic behaviour rather than printing blank. See the migration.
  field_overrides: FieldOverrides | null;
  field_positions: FieldPositions | null;
}

/** What the public signing page is allowed to see. Mirrors contract_by_token(). */
export interface SigningView {
  party:  Party;
  status: ContractStatus;
  signed: boolean;
  terms:  ContractTerms | null;

  helper_name:      string | null;
  helper_photo:     string | null;
  helper_origin:    string | null;
  employer_name:    string | null;
  employer_address: string | null;
}

/** Clause 1 wants a place, not a nationality. */
export function placeOfOriginFor(nationality?: string | null): string {
  const n = (nationality ?? "").toLowerCase();
  if (n.startsWith("filipin") || n.startsWith("philip")) return "The Philippines";
  if (n.startsWith("indonesia")) return "Indonesia";
  return nationality ?? "";
}

/** The absolute link to hand to a party. Built in the browser, so it picks up
 *  whatever host the dashboard is being used on — localhost or the deployment. */
export function signingLink(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/contract/${token}`;
}

/**
 * The table is created by hand, so a missing one is a normal first-run state.
 * Turns Postgres' relation-not-found into the file to go and read, matching how
 * PdfMapper and employers.ts report the same thing.
 */
export function contractSetupHint(message: string): string | null {
  if (/contracts|contract_by_token|sign_contract/i.test(message)
      && /does not exist|schema cache|relation|function/i.test(message)) {
    return "Contracts are not set up yet — ask your administrator to run the migrations in supabase/migrations/ (see supabase/README.md).";
  }
  return null;
}

/* ── Recruiter side (authenticated) ───────────────────────────────────────── */

export async function fetchContracts(): Promise<Contract[]> {
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
  return (data ?? []) as Contract[];
}

/** Start a contract for a helper who already has an employer assigned. */
export async function createContract(
  applicantId: string,
  employerId: string,
  terms: ContractTerms,
): Promise<Contract> {
  const { data, error } = await supabase
    .from("contracts")
    .insert({ applicant_id: applicantId, employer_id: employerId, status: "Draft", terms })
    .select()
    .single();
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
  return data as Contract;
}

export async function updateContract(id: string, patch: Partial<Contract>): Promise<Contract> {
  const { data, error } = await supabase
    .from("contracts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
  return data as Contract;
}

/**
 * The contract belonging to one applicant, or null if none has been started.
 *
 * An applicant can in principle accumulate more than one over time (a placement
 * that fell through, then a second employer), so the newest wins — that is the
 * one a recruiter opening the profile means.
 */
export async function fetchContractForApplicant(applicantId: string): Promise<Contract | null> {
  const { data, error } = await supabase
    .from("contracts")
    .select("*")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
  return (data?.[0] as Contract | undefined) ?? null;
}

/**
 * Save the hand corrections for one contract's printed sheet.
 *
 * Both maps are written whole rather than merged in SQL: the editor already
 * holds the complete set, and a partial merge would make clearing an override
 * impossible to express.
 */
export async function saveContractFieldEdits(
  id: string,
  overrides: FieldOverrides,
  positions: FieldPositions,
): Promise<Contract> {
  return updateContract(id, {
    field_overrides: overrides,
    field_positions: positions,
  });
}

/** True when the columns from the field-edits migration are missing. */
export function needsFieldEditsMigration(message: string): boolean {
  return /field_overrides|field_positions/i.test(message)
      && /does not exist|schema cache|column/i.test(message);
}

/* ── Public side (anon, token only) ───────────────────────────────────────── */

/** Load the one contract a signing link refers to. Returns null for a bad token. */
export async function fetchSigningView(token: string): Promise<SigningView | null> {
  const { data, error } = await supabase.rpc("contract_by_token", { p_token: token });
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
  return (data ?? null) as SigningView | null;
}

/**
 * Record one party's signature. The function refuses a second signature from the
 * same party, so a re-submitted form cannot overwrite what was already agreed.
 */
export async function signContract(
  token: string, name: string, signatureUrl: string,
): Promise<void> {
  const { error } = await supabase.rpc("sign_contract", {
    p_token: token, p_name: name, p_signature: signatureUrl,
  });
  if (error) throw new Error(contractSetupHint(error.message) ?? error.message);
}

/** Upload a signature PNG and return its public URL. Shares the applicant bucket,
 *  which already accepts anonymous uploads because /apply does the same. */
export async function uploadSignature(dataUrl: string, who: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `signatures/${who}-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const { error } = await supabase.storage
    .from("applicant-photos")
    .upload(path, blob, { contentType: "image/png" });
  if (error) throw error;
  return supabase.storage.from("applicant-photos").getPublicUrl(path).data.publicUrl;
}

/** Progress label for the dashboard list. */
export function signingProgress(c: Contract): string {
  const e = !!c.employer_signed_at;
  const h = !!c.helper_signed_at;
  if (e && h) return "Both signed";
  if (e) return "Employer signed";
  if (h) return "Helper signed";
  return "Awaiting both";
}
