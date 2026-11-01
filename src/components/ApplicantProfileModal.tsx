"use client";

/**
 * ApplicantProfileModal.tsx — the full profile pop-up for one helper.
 *
 * Biodata view with the zodiac panel, inline editing, the employer picker, the
 * ID 407 / ID 988A / ID 988B sheets and both biodata PDF exports. It started
 * life inside ForReviewDashboard; it lives here so the Employers page opens
 * exactly the same thing when a helper card is clicked.
 *
 * The modal owns its own view state (tab, edit mode, the loaded contract). The
 * parent only hears about changes to the applicant itself, through
 * onApplicantChange, so it can mirror an edit or a new employer into whatever
 * it draws behind the modal. Render it with key={applicant.id} so opening a
 * different helper starts on the biodata tab with nothing left over.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { exportBiodataPdf, type ApplicantForExport } from "@/lib/exportBiodataPdf";
import { exportGenericBiodataPdf } from "@/lib/exportGenericBiodataPdf";
import ApplicantEditForm, { type EditableApplicant } from "@/components/ApplicantEditForm";
import ZodiacPanel from "@/components/ZodiacPanel";
import { kidsOf } from "@/lib/kids";
import { EmployerPicker } from "@/components/EmployerAssign";
import {
  createContract, fetchContractForApplicant, placeOfOriginFor, signingLink,
  type Contract,
} from "@/lib/contracts";
import ContractSheetEditor, { type SheetApplicant } from "@/components/ContractSheetEditor";
import { buildId407Values } from "@/lib/id407";
import { buildId988aValues } from "@/lib/id988a";
import { exportContractPdf, type ContractExportOptions } from "@/lib/exportContractPdf";
import { exportId988aPdf } from "@/lib/exportId988aPdf";
import { buildId988bValues } from "@/lib/id988b";
import { exportId988bPdf } from "@/lib/exportId988bPdf";
import type { Employer } from "@/lib/employers";

interface WorkExperienceEntry {
  yearsOfEmployment: string; dateFrom: string; dateTo: string;
  location: string; flatSize: string; contractStatus: string;
  terminatedReason: string; breakReason: string; householdChores: string[];
  jobDuties: string; coHelpers: string; employerNationality: string; familyMembers: string;
}
export interface ProfileApplicant {
  id: string;
  created_at: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  mobile: string;
  photo_url: string;
  signature_url?: string | null;
  signed_at?: string | null;
  status: string;
  /** The employer this helper is placed with — null until she is assigned. */
  employer_id?: string | null;
  form_data: {
    placeOfBirth?: string;       currentLocation?: string;
    height?: string;             weight?: string;
    maritalStatus?: string;      education?: string;
    religion?: string;           contractStatus?: string;
    lastWorkingDay?: string;     numberOfKids?: string;
    boysCount?: string;          boysAges?: string;
    girlsCount?: string;         girlsAges?: string;
    familyMembersCount?: string; educationCourse?: string;
    totalYearsHK?: string;       numberOfEmployers?: string;
    languages?: { english?: string; cantonese?: string; mandarin?: string; };
    specialSkills?: string;
    skills?: string[];           cookingAbilities?: string[];
    preferences?: { sundayOff?: boolean; flexibleDayOff?: boolean; willingWithOtherHelper?: boolean; willingStayIn?: boolean; };
    otherExperience?: { country?: string; yearsOfEmployment?: string; jobDuties?: string; }[];
    workExperience?: WorkExperienceEntry[];
  };
}

/* ── Biodata form helpers ──────────────────────────────────────────────── */
function BiodataCB({ checked }: { checked?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[13px] h-[13px] border border-gray-600 text-[12px] leading-none flex-shrink-0 align-middle">
      {checked ? "✓" : ""}
    </span>
  );
}
function BiodataFL({ label, value, cls }: { label: string; value?: string | null; cls?: string }) {
  return (
    <div className={`flex items-baseline gap-0.5 min-w-0 ${cls ?? ""}`}>
      <span className="text-[11px] text-gray-500 whitespace-nowrap flex-shrink-0">{label}</span>
      <span className="border-b border-gray-300 flex-1 font-medium text-[12px] min-h-[14px] overflow-hidden leading-tight">
        {value ?? ""}
      </span>
    </div>
  );
}
function BiodataWE({ entry }: { entry: WorkExperienceEntry | null }) {
  const e = entry;
  return (
    <div className="text-[12px] space-y-1.5">
      <div className="flex gap-2">
        <BiodataFL label="Yrs of Employment:" value={e?.yearsOfEmployment} cls="flex-1" />
        <BiodataFL label="Date From (mm/yyyy):" value={e?.dateFrom} cls="flex-1" />
        <BiodataFL label="To (mm/yyyy):" value={e?.dateTo} cls="flex-1" />
      </div>
      <div className="flex gap-2">
        <BiodataFL label="Location:" value={e?.location} cls="flex-[2]" />
        <BiodataFL label="Flat Size:" value={e?.flatSize ? `${e.flatSize} sq.ft.` : ""} cls="flex-1" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {(["Finished Contract", "Plan to Break", "Terminated", "Break"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <BiodataCB checked={e?.contractStatus === s} /> {s}
          </span>
        ))}
      </div>
      {e?.terminatedReason && (
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 whitespace-nowrap">Terminated/ Reason:</span>
          <span className="border-b border-gray-300 flex-1 font-medium">{e.terminatedReason}</span>
        </div>
      )}
      {e?.breakReason && (
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 whitespace-nowrap">Break/ Reason:</span>
          <span className="border-b border-gray-300 flex-1 font-medium">{e.breakReason}</span>
        </div>
      )}
      <div>
        <p className="font-semibold text-[11px] uppercase mb-1">Household Chores</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {["Cooking", "Child Care", "New Born Care", "Special Child Care", "Elderly Care",
            "Disabled Person Care", "Pet Care", "Driving", "Car Washing", "Plant Care / Gardening"].map((c) => (
            <span key={c} className="flex items-center gap-0.5">
              <BiodataCB checked={e?.householdChores?.includes(c)} /> {c}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-gray-500 whitespace-nowrap text-[11px] uppercase font-semibold flex-shrink-0">JOB DUTIES:</span>
        <span className="border-b border-gray-300 flex-1 font-medium min-h-[14px]">{e?.jobDuties ?? ""}</span>
      </div>
      <div className="flex gap-2">
        <BiodataFL label="No. of Co-helper:" value={e?.coHelpers} cls="flex-1" />
        <BiodataFL label="Nationality of Employer:" value={e?.employerNationality} cls="flex-[2]" />
      </div>
      <BiodataFL label="Family Members:" value={e?.familyMembers} />
    </div>
  );
}

export default function ApplicantProfileModal({
  applicant, employers, employersById, onEmployerCreated, onApplicantChange, onClose, footerStart,
}: {
  applicant: ProfileApplicant;
  employers: Employer[];
  employersById: Map<string, Employer>;
  /** A household described on the contract sheet now exists — fold it into the caller's directory. */
  onEmployerCreated: (e: Employer) => void;
  /** The applicant was edited or (re)assigned; the modal has already written it. */
  onApplicantChange: (updated: ProfileApplicant) => void;
  onClose: () => void;
  /** Left side of the footer — For Review puts "Move Back to Candidates" here. */
  footerStart?: ReactNode;
}) {
  /* ── Inline biodata editing ── */
  const [editing, setEditing] = useState(false);

  /* ── Profile modal tabs ── */
  // The contract sheet is a second view of the same applicant rather than a
  // separate page, because the reason to open it is always "does this person's
  // contract read right", which is a biodata question first.
  const [profileTab, setProfileTab] =
    useState<"biodata" | "contract" | "visa" | "employerform">("biodata");
  const [contract, setContract]     = useState<Contract | null>(null);
  const [contractLoaded, setContractLoaded] = useState(false);
  // Set from the employer dropdown: the sheet stands in for the employer form
  // until the record it describes exists.
  const [newEmployerMode, setNewEmployerMode] = useState(false);
  const [creatingContract, setCreatingContract] = useState(false);
  const [exporting, setExporting]               = useState(false);
  const [exportingGeneral, setExportingGeneral] = useState(false);

  /* ── Corrections saved from the edit form ─────────────────────────────────
     Handed back so the card behind, the biodata view and any subsequent PDF
     export all show the corrected data immediately. ── */
  const handleApplicantSaved = useCallback((updated: EditableApplicant) => {
    onApplicantChange({ ...applicant, ...(updated as unknown as Partial<ProfileApplicant>) });
    setEditing(false);
  }, [applicant, onApplicantChange]);

  /* ── Employer assignment ── */
  // EmployerPicker has already written the change, so this only mirrors it.
  const handleEmployerAssigned = useCallback((employerId: string | null) => {
    onApplicantChange({ ...applicant, employer_id: employerId });
  }, [applicant, onApplicantChange]);

  /* ── The open applicant's contract, for the sheet tabs ── */
  // Fetched on open rather than with the list: most profiles opened never
  // reach the contract, and one query per opened profile is cheaper than a
  // join across every card.
  const openId = applicant.id;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await fetchContractForApplicant(openId);
        if (!cancelled) setContract(found);
      } catch {
        // A missing contracts table is not a reason to fail opening a biodata;
        // the tab explains itself when it is opened.
      } finally {
        if (!cancelled) setContractLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [openId]);

  /* ── Start an ID 407 contract ── */
  // Only the details we already hold are seeded — the wage, the commencement
  // basis and the duties are commercial terms, set deliberately on the
  // Contracts page rather than guessed here.
  const handleCreateContract = useCallback(async () => {
    const ap = applicant;
    if (!ap.employer_id) return;
    setCreatingContract(true);
    try {
      const contract = await createContract(ap.id, ap.employer_id, {
        placeOfOrigin: placeOfOriginFor(ap.nationality),
        contractDate:  new Date().toISOString().slice(0, 10),
      });
      setContract(contract);
      const link = signingLink(contract.employer_token);
      try { await navigator.clipboard.writeText(link); } catch { /* insecure context */ }
      alert(
        `Contract created.

The employer's signing link has been copied to your clipboard:

${link}

Both links, the terms and the witnesses are on the Contracts page.`
      );
    } catch (e) {
      alert("Could not create the contract: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreatingContract(false);
    }
  }, [applicant]);

  /**
   * The sheet has just described a new employer into existence.
   *
   * Assign it, refresh the directory so the dropdown knows the name, then start
   * the contract — which is the whole point of having described it.
   */
  const handleEmployerCreated = useCallback(async (created: Employer) => {
    const ap = applicant;
    try {
      const { error } = await supabase
        .from("applicants")
        .update({ employer_id: created.id })
        .eq("id", ap.id);
      if (error) throw error;

      handleEmployerAssigned(created.id);
      onEmployerCreated(created);
      setNewEmployerMode(false);

      const contract = await createContract(ap.id, created.id, {
        placeOfOrigin: placeOfOriginFor(ap.nationality),
        contractDate:  new Date().toISOString().slice(0, 10),
      });
      setContract(contract);
    } catch (e) {
      alert("The employer was saved, but the contract could not be started: "
        + (e instanceof Error ? e.message : String(e)));
    }
  }, [applicant, handleEmployerAssigned, onEmployerCreated]);

  /* ── Which sheet the contract tab is showing ── */
  // The two forms share this view; only the field set, the value builder and
  // the export differ. Memoised so the sheet's own useMemo actually holds.
  // Which of the three sheets the contract tab is showing. They share one view;
  // only the field set, the value builder and the export differ.
  const sheetForm = profileTab === "visa" ? "id988a"
                  : profileTab === "employerform" ? "id988b"
                  : "id407";

  const sheetBuildValues = useCallback(
    (a: SheetApplicant, e: Employer | null, c: Contract | null) => {
      if (sheetForm === "id988a") return buildId988aValues(a, e, c);
      if (sheetForm === "id988b") return buildId988bValues(a, e, c);
      return buildId407Values(
        { full_name: a.full_name, nationality: a.nationality ?? null, signature_url: a.signature_url },
        e, c ?? ({ terms: {} } as Contract));
    },
    [sheetForm],
  );

  const sheetExport = useCallback(
    (a: SheetApplicant, e: Employer | null, c: Contract, o: ContractExportOptions) => {
      if (sheetForm === "id988a") return exportId988aPdf(a, e, c, o);
      if (sheetForm === "id988b") return exportId988bPdf(a, e, c, o);
      return exportContractPdf(
        { full_name: a.full_name, nationality: a.nationality ?? null, signature_url: a.signature_url },
        e, c, o);
    },
    [sheetForm],
  );

  /* ── Export filled biodata PDF ── */
  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    try {
      await exportBiodataPdf(applicant as ApplicantForExport);
    } catch (err) {
      alert("Export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  }, [applicant]);

  /* ── Export the unbranded biodata ── */
  // Drawn from scratch rather than stamped onto the agency's scanned form, so it
  // carries no agency name and needs no template or field positions.
  const handleExportGeneral = useCallback(async () => {
    setExportingGeneral(true);
    try {
      await exportGenericBiodataPdf(applicant as ApplicantForExport);
    } catch (err) {
      alert("Export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingGeneral(false);
    }
  }, [applicant]);

  return (
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
        // While editing, a stray backdrop click must not silently bin the edits
        onClick={() => { if (!editing) onClose(); }}
      >
        <div
          className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-gray-200 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-gray-200 flex justify-between items-center gap-4 bg-white">
            <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest flex-shrink-0">
              {editing ? "Editing Biodata" : "Applicant Biodata"}
            </h2>

            {/* Placement lives here rather than in the edit form: it is not part
                of what the applicant submitted, and it saves on its own. */}
            {!editing && (
              <div className="flex items-center gap-2 min-w-0 ml-auto mr-2">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap hidden sm:block">
                  Employer
                </span>
                <div className="w-52 max-w-[45vw]">
                  <EmployerPicker
                    applicantId={applicant.id}
                    value={applicant.employer_id}
                    employers={employers}
                    onAssigned={handleEmployerAssigned}
                    onCreateFromSheet={() => {
                      setProfileTab("contract");
                      setNewEmployerMode(true);
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={() => { if (!editing || confirm("Discard unsaved changes?")) { setEditing(false); onClose(); } }}
              className="text-gray-400 hover:text-gray-600 text-2xl font-semibold leading-none p-2"
            >&times;</button>
          </div>

          {/* ── Tabs — hidden while editing, which owns the whole modal ── */}
          {!editing && (
            <div className="px-3 pt-2 border-b border-gray-200 flex gap-1 bg-white">
              {([
                ["biodata",  "Biodata"],
                ["contract", "ID 407 Contract"],
                ["visa",     "ID 988A Visa"],
                ["employerform", "ID 988B Employer"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setProfileTab(key)}
                  className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
                    profileTab === key
                      ? "border-amber-500 text-gray-900 bg-white"
                      : "border-transparent text-gray-400 hover:text-gray-700"
                  }`}
                >
                  {label}
                  {key !== "biodata" && contractLoaded && !contract && (
                    <span className="ml-1.5 text-[10px] font-normal text-amber-500">not started</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ── Edit mode replaces the read-only biodata view ── */}
          {editing ? (
            <ApplicantEditForm
              applicant={applicant as unknown as EditableApplicant}
              onCancel={() => setEditing(false)}
              onSaved={handleApplicantSaved}
            />
          ) : profileTab !== "biodata" ? (
            !contractLoaded
              ? <div className="p-10 text-center text-sm text-gray-400">Loading contract…</div>
              : <ContractSheetEditor
                  // Remounting on a form switch is deliberate: zoom, page and
                  // any half-finished edit belong to the sheet being left.
                  key={`${profileTab}-${contract?.id ?? "none"}`}
                  formId={sheetForm}
                  buildValues={sheetBuildValues}
                  exportSheet={sheetExport}
                  // The visa form asks about the helper herself, so it needs
                  // more of her record than the contract sheet ever did.
                  applicant={{
                    full_name:     applicant.full_name,
                    nationality:   applicant.nationality,
                    signature_url: applicant.signature_url,
                    date_of_birth: applicant.date_of_birth,
                    gender:        applicant.gender,
                    mobile:        applicant.mobile,
                    photo_url:     applicant.photo_url,
                    form_data:     applicant.form_data,
                  }}
                  employer={applicant.employer_id
                    ? employersById.get(applicant.employer_id) ?? null
                    : null}
                  contract={contract}
                  onCreateContract={handleCreateContract}
                  creating={creatingContract}
                  canCreate={!!applicant.employer_id}
                  onContractSaved={setContract}
                  // Capturing a household off the sheet is an ID 407 feature;
                  // ID 988A carries none of those details.
                  newEmployerMode={sheetForm === "id407" && newEmployerMode}
                  onEmployerCreated={handleEmployerCreated}
                  onCancelNewEmployer={() => setNewEmployerMode(false)}
                />
          ) : (
          /* Biodata on the left, zodiac / fortune panel on the right.
             Stacks vertically below lg so the modal still works on a tablet. */
          <div className="flex flex-col lg:flex-row">
          <div className="flex-1 min-w-0 p-5 bg-white text-gray-900 leading-tight" style={{ fontSize: "13px" }}>
            {(() => {
              const fd = applicant.form_data;
              const ap = applicant;
              const dob = ap.date_of_birth ? new Date(ap.date_of_birth) : null;
              const age = dob ? String(new Date().getFullYear() - dob.getFullYear()) : "";
              const kids = kidsOf(fd);

              return (
                <>
                  {/* ── Company Header ── */}
                  <div className="text-center mb-3 pb-3 border-b-2 border-gray-800">
                    <p className="font-bold tracking-widest" style={{ fontSize: "15px" }}>CASTILLO DEL REY CONSULTANCY</p>
                    <p className="text-gray-500 text-[9px] mt-0.5">Shop D1, 1/F, Planet Square, 1-15 Tal Man Street, Hung Hom, Kowloon, Hong Kong</p>
                  </div>

                  {/* ── Section title + contract status ── */}
                  <div className="mb-2 pb-2 border-b border-gray-300">
                    <p className="font-bold text-[10px] mb-1.5">
                      PERSONAL PARTICULAR{" "}
                      <span className="font-normal">(Please write in BOLD/CAPITAL Letters)</span>
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                      {["Finished Contract", "Terminated", "Break of Contract", "Plan to Break"].map((s) => (
                        <span key={s} className="flex items-center gap-1">
                          <BiodataCB checked={fd?.contractStatus === s} /> {s}
                        </span>
                      ))}
                      <span className="flex items-center gap-1 ml-1">
                        Last working day:&nbsp;
                        <span className="border-b border-gray-400 inline-block min-w-[80px] font-medium">
                          {fd?.lastWorkingDay ? new Date(fd.lastWorkingDay).toLocaleDateString() : ""}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* ── Photo (LEFT) + Personal Info ── */}
                  <div className="flex gap-4 mb-2 pb-2 border-b border-gray-300">
                    {/* Photo — LEFT side */}
                    <div className="w-28 flex-shrink-0 flex flex-col items-center gap-1">
                      <div className="w-28 h-36 border-2 border-gray-500 overflow-hidden flex items-center justify-center bg-gray-50">
                        {ap.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ap.photo_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[11px] text-gray-400 text-center">Photo</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 text-center">Photo</p>
                      <BiodataFL label="Basic:" value="" cls="w-full" />
                    </div>
                    {/* Personal info — RIGHT side */}
                    <div className="flex-1 space-y-1.5 text-[12px]">
                      <div className="flex gap-2">
                        <BiodataFL label="Name:" value={ap.full_name} cls="flex-[2]" />
                        <BiodataFL label="Date of Birth:" value={dob ? dob.toLocaleDateString() : ""} cls="flex-1" />
                        <BiodataFL label="Nationality:" value={ap.nationality} cls="flex-1" />
                      </div>
                      <div className="flex gap-2">
                        <BiodataFL label="Religion:" value={fd?.religion} cls="flex-1" />
                        <BiodataFL label="Height:" value={fd?.height ? `${fd.height} cm` : ""} cls="flex-1" />
                        <BiodataFL label="Weight:" value={fd?.weight ? `${fd.weight} kg` : ""} cls="flex-1" />
                        <BiodataFL label="Age:" value={age} cls="w-14" />
                      </div>
                      <div className="flex gap-2">
                        <BiodataFL label="Marital Status:" value={fd?.maritalStatus} cls="flex-1" />
                        <BiodataFL label="Gender:" value={ap.gender} cls="flex-1" />
                      </div>
                      {/* Four blanks, as on the printed form: Boy/s + Age/s, Girl/s + Age/s */}
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-gray-500 whitespace-nowrap">Kids — Boy/s:</span>
                        <span className="border-b border-gray-300 w-6 font-medium">{kids.boys}</span>
                        <span className="text-gray-500 whitespace-nowrap">Age/s:</span>
                        <span className="border-b border-gray-300 w-16 font-medium">{kids.boysAges}</span>
                        <span className="text-gray-500 whitespace-nowrap">Girl/s:</span>
                        <span className="border-b border-gray-300 w-6 font-medium">{kids.girls}</span>
                        <span className="text-gray-500 whitespace-nowrap">Age/s:</span>
                        <span className="border-b border-gray-300 w-16 font-medium">{kids.girlsAges}</span>
                        <span className="text-gray-500 whitespace-nowrap">Family Members:</span>
                        <span className="border-b border-gray-300 w-8 font-medium">{fd?.familyMembersCount ?? ""}</span>
                      </div>
                      <div className="flex gap-2">
                        <BiodataFL label="Mobile:" value={ap.mobile} cls="flex-1" />
                        <BiodataFL label="Place of Birth:" value={fd?.placeOfBirth} cls="flex-1" />
                        <BiodataFL label="Current Location:" value={fd?.currentLocation} cls="flex-1" />
                      </div>
                    </div>
                  </div>

                  {/* ── Spoken Language ── */}
                  <div className="mb-2 pb-2 border-b border-gray-300">
                    <span className="font-bold text-[10px] uppercase">Spoken Language</span>
                    <div className="flex flex-wrap gap-x-8 gap-y-0.5 mt-1 text-[10px]">
                      {(["English", "Cantonese", "Mandarin"] as const).map((lang) => {
                        const key = lang.toLowerCase() as "english" | "cantonese" | "mandarin";
                        return (
                          <div key={lang} className="flex items-center gap-2">
                            <span className="text-gray-600 font-medium">{lang}</span>
                            <span className="flex items-center gap-1">
                              <BiodataCB checked={fd?.languages?.[key] === "Basic"} /> Basic
                            </span>
                            <span className="flex items-center gap-1">
                              <BiodataCB checked={fd?.languages?.[key] === "Good"} /> Good
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Education ── */}
                  <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                    <span className="font-bold uppercase">Educational Background</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                      {[
                        { label: "High School Graduate", val: "High School Graduate" },
                        { label: "College Undergraduate", val: "College Undergraduate" },
                        { label: "College Graduate",     val: "College Graduate"     },
                        { label: "Vocational Course",    val: "Vocational Course"    },
                      ].map(({ label, val }) => (
                        <span key={val} className="flex items-center gap-1">
                          <BiodataCB checked={fd?.education === val} /> {label}
                          {["College Graduate","College Undergraduate","Vocational Course"].includes(val) &&
                            fd?.education === val && fd?.educationCourse && (
                            <span className="ml-1 text-gray-600">
                              Course/: <span className="font-medium">{fd.educationCourse}</span>
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-6 mt-1">
                      <span>
                        Total Years in Hong Kong:{" "}
                        <span className="border-b border-gray-300 inline-block w-8 font-medium">{fd?.totalYearsHK ?? ""}</span>
                      </span>
                      <span>
                        How Many Employers:{" "}
                        <span className="border-b border-gray-300 inline-block w-8 font-medium">{fd?.numberOfEmployers ?? ""}</span>
                      </span>
                    </div>
                  </div>

                  {/* ── Special Skills ── */}
                  <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                    <span className="font-bold uppercase">SPECIAL SKILLS</span>
                    <div className="border-b border-gray-300 mt-1 min-h-[16px] font-medium">{fd?.specialSkills ?? ""}</div>
                    <div className="border-b border-gray-300 min-h-[14px]" />
                  </div>

                  {/* ── Other Country Experience ── */}
                  <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                    <span className="font-bold uppercase">OTHER COUNTRY EXPERIENCE</span>
                    <div className="grid grid-cols-2 gap-4 mt-1">
                      {(["A", "B"] as const).map((letter, i) => {
                        const exp = fd?.otherExperience?.[i];
                        return (
                          <div key={letter}>
                            <div className="flex items-baseline gap-1 mb-1">
                              <span className="font-bold">{letter}.</span>
                              <span className="border-b border-gray-300 flex-1 font-medium">{exp?.country ?? ""}</span>
                            </div>
                            <BiodataFL label="Yrs. of Employment:" value={exp?.yearsOfEmployment} cls="mb-1" />
                            <div>
                              <span className="text-gray-500">Job Duties:</span>
                              <div className="border-b border-gray-300 min-h-[14px] font-medium mt-0.5">{exp?.jobDuties ?? ""}</div>
                              <div className="border-b border-gray-300 min-h-[14px]" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Current HK Work Experience + Skills (2-column) ── */}
                  <div className="flex mb-2 border-b border-gray-300 pb-2">
                    {/* Left: Work Experience */}
                    <div className="flex-1 pr-3 border-r border-gray-400 text-[10px]">
                      <p className="font-bold text-[9px] uppercase mb-2 tracking-wide">
                        CURRENT WORKING EXPERIENCE in Hong Kong
                      </p>
                      {fd?.workExperience && fd.workExperience.length > 0
                        ? <BiodataWE entry={fd.workExperience[0]} />
                        : <BiodataWE entry={null} />}
                    </div>
                    {/* Right: Skills */}
                    <div className="w-[43%] pl-3 text-[10px]">
                      <p className="font-bold text-[9px] uppercase mb-1.5 tracking-wide">MY SKILLS</p>
                      <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 mb-3">
                        {["Cooking","Child Care","New Born Care","Special Child Care",
                          "Elderly Care","Disabled Person Care","Pet Care","Driving",
                          "Car Washing","Plant Care","Kids Tutorial","Nursing Aide"].map((s) => (
                          <span key={s} className="flex items-center gap-1">
                            <BiodataCB checked={fd?.skills?.includes(s)} /> {s}
                          </span>
                        ))}
                      </div>
                      <p className="font-bold text-[9px] uppercase mb-1 tracking-wide">COOKING ABILITIES</p>
                      <div className="space-y-0.5 mb-3">
                        {["Western Food","Asian Food","Mediterranean Food","Baking","Can follow Recipe and Cook Book"].map((c) => (
                          <span key={c} className="flex items-center gap-1">
                            <BiodataCB checked={fd?.cookingAbilities?.includes(c)} /> {c}
                          </span>
                        ))}
                      </div>
                      <div className="space-y-0.5">
                        <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.sundayOff}              /> Prefer Sunday Off</span>
                        <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.flexibleDayOff}         /> Flexible Day off</span>
                        <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.willingWithOtherHelper} /> Willing to Work with other helper</span>
                        <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.willingStayIn}          /> Willing to work with stay in employer</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Additional HK Work Experience entries ── */}
                  {fd?.workExperience && fd.workExperience.length > 1 &&
                    fd.workExperience.slice(1).map((we, i) => (
                      <div key={i} className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                        <p className="font-bold text-[9px] uppercase mb-2 tracking-wide">
                          WORK EXPERIENCE in Hong Kong #{i + 2}/
                        </p>
                        <BiodataWE entry={we} />
                      </div>
                    ))
                  }

                  {/* ── Disclaimer + Signature ── */}
                  <div className="mt-4 pt-3 border-t border-gray-300 text-[9px] text-gray-600 leading-relaxed">
                    <p>
                      I hereby certify that the above information is true and correct to the best of my ability and agree that{" "}
                      <strong className="text-gray-800">CASTILLO DEL REY CONSULTANCY</strong> may disclose my personal profile
                      to potential employers for the purpose of seeking employment as Foreign Domestic Helper.
                    </p>
                    <p className="font-bold text-[10px] text-center tracking-[0.25em] mt-2 text-gray-700">
                      CASTILLODELREYCONSULTANCY
                    </p>
                    <div className="mt-4 flex justify-start">
                      <div className="text-center">
                        {/* Captured signature sits on the ruled line; blank for
                            applicants who submitted before signing existed */}
                        <div className="h-10 flex items-end justify-center">
                          {ap.signature_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ap.signature_url} alt="Signature" className="max-h-10 max-w-[176px] object-contain" />
                          )}
                        </div>
                        <div className="border-t border-gray-500 w-44 pt-1 text-[9px]">Signature of Applicant</div>
                        {ap.signed_at && (
                          <div className="text-[8px] text-gray-400 mt-0.5">
                            Signed {new Date(ap.signed_at).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* ── Zodiac / fortune sidebar ──
              Sticky with its own scroll so it stays beside the biodata
              however far down the form the recruiter reads. ── */}
          <aside className="w-full lg:w-[320px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-gray-200 bg-slate-50/60 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(90vh-120px)] lg:overflow-y-auto">
            <ZodiacPanel dob={applicant.date_of_birth} name={applicant.full_name} />
          </aside>
          </div>
          )}

          {/* Footer is hidden in edit mode — the edit form brings its own */}
          {!editing && (
          <div className="p-6 border-t border-gray-100 bg-amber-50 flex justify-between items-center gap-3">
            <div>{footerStart}</div>
            <div className="flex items-center gap-2">
              {/* A contract needs an employer to be against, so this only
                  appears once she has been assigned one. */}
              {applicant.employer_id && (
                <button
                  onClick={handleCreateContract}
                  disabled={creatingContract}
                  title="Create an ID 407 contract and get the signing links"
                  className="bg-white text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  {creatingContract ? "Creating…" : "📄 Create Contract"}
                </button>
              )}
              {/* Biodata actions belong to the biodata tab — offering "Export
                  Biodata PDF" while the contract sheet is on screen reads as
                  the button that would print what you are looking at. */}
              {profileTab === "biodata" && (
              <button
                onClick={() => setEditing(true)}
                className="bg-white text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                ✏️ Edit
              </button>
              )}
              {profileTab === "biodata" && (<>
              <button
                onClick={handleExportPdf}
                disabled={exporting}
                className="flex items-center gap-2 bg-slate-800 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    Generating PDF…
                  </>
                ) : (
                  "📄 Export Biodata PDF"
                )}
              </button>
              <button
                onClick={handleExportGeneral}
                disabled={exportingGeneral}
                title="A plain biodata with the same details and no agency name on it"
                className="flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {exportingGeneral ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin inline-block" />
                    Generating…
                  </>
                ) : (
                  "📄 General Biodata"
                )}
              </button>
              </>)}
              <button
                onClick={onClose}
                className="bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
          )}
        </div>
      </div>
  );
}
