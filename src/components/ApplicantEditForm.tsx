"use client";

/**
 * ApplicantEditForm.tsx — recruiter-side correction of a submitted biodata.
 *
 * Rendered inside the For Review profile modal when Edit is clicked. Everything
 * the applicant filled in is editable here, laid out as a proper form rather
 * than as a replica of the printed biodata — the replica's 10px ruled lines are
 * built for reading, not for typing into.
 *
 * Saving writes the five top-level columns plus the whole form_data blob, so
 * corrections flow straight through to the biodata modal and the exported PDF.
 *
 * Option strings come from lib/applicantOptions so an edit can never introduce
 * a value the PDF checkbox matching doesn't recognise.
 */

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SKILL_OPTIONS, COOKING_OPTIONS, HOUSEHOLD_CHORES,
  EDUCATION_OPTIONS, CONTRACT_STATUS_OPTIONS, WE_CONTRACT_STATUS_OPTIONS,
  LANG_LEVELS, NATIONALITY_OPTIONS, GENDER_OPTIONS, LOCATION_OPTIONS,
  MARITAL_OPTIONS, RELIGION_OPTIONS,
} from "@/lib/applicantOptions";

/* ── Types (structurally match the dashboards' Applicant) ─────────────────── */
export interface EditableWE {
  yearsOfEmployment: string; dateFrom: string; dateTo: string;
  location: string; flatSize: string; contractStatus: string;
  terminatedReason: string; breakReason: string; householdChores: string[];
  jobDuties: string; coHelpers: string; employerNationality: string; familyMembers: string;
}
export interface EditableApplicant {
  id: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  mobile: string;
  form_data: {
    placeOfBirth?: string;       currentLocation?: string;
    height?: string;             weight?: string;
    maritalStatus?: string;      education?: string;
    religion?: string;           contractStatus?: string;
    lastWorkingDay?: string;     numberOfKids?: string;
    boysAges?: string;           girlsAges?: string;
    familyMembersCount?: string; educationCourse?: string;
    totalYearsHK?: string;       numberOfEmployers?: string;
    languages?: { english?: string; cantonese?: string; mandarin?: string };
    specialSkills?: string;
    skills?: string[];           cookingAbilities?: string[];
    preferences?: { sundayOff?: boolean; flexibleDayOff?: boolean; willingWithOtherHelper?: boolean; willingStayIn?: boolean };
    otherExperience?: { country?: string; yearsOfEmployment?: string; jobDuties?: string }[];
    workExperience?: EditableWE[];
  };
}

const emptyWE = (): EditableWE => ({
  yearsOfEmployment: "", dateFrom: "", dateTo: "", location: "", flatSize: "",
  contractStatus: "", terminatedReason: "", breakReason: "",
  householdChores: [], jobDuties: "", coHelpers: "", employerNationality: "", familyMembers: "",
});

/* ── Style tokens (match ApplicantForm) ───────────────────────────────────── */
const inp = "mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white";
const lbl = "block text-xs font-medium text-gray-600";

function Section({ title }: { title: string }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mt-6 mb-3 pb-1 border-b border-gray-100 first:mt-0">
      {title}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={lbl}>{label}</label>{children}</div>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${checked ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"}`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-xs text-gray-700">{label}</span>
    </label>
  );
}

const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

/* ── Component ────────────────────────────────────────────────────────────── */
export default function ApplicantEditForm({
  applicant, onCancel, onSaved,
}: {
  applicant: EditableApplicant;
  onCancel: () => void;
  onSaved: (updated: EditableApplicant) => void;
}) {
  // Deep clone so Cancel truly discards — the nested form_data objects would
  // otherwise be shared with the card still rendered behind the modal.
  const [draft, setDraft] = useState<EditableApplicant>(
    () => JSON.parse(JSON.stringify(applicant)) as EditableApplicant
  );
  const [saving, setSaving] = useState(false);

  const fd = draft.form_data ?? {};
  const we = fd.workExperience ?? [];
  const oe = fd.otherExperience ?? [];

  /* ── Updaters ── */
  const setTop = (k: keyof EditableApplicant, v: string) =>
    setDraft(d => ({ ...d, [k]: v }));

  const setFd = <K extends keyof EditableApplicant["form_data"]>(
    k: K, v: EditableApplicant["form_data"][K]
  ) => setDraft(d => ({ ...d, form_data: { ...d.form_data, [k]: v } }));

  const setLang = (k: "english" | "cantonese" | "mandarin", v: string) =>
    setFd("languages", { ...(draft.form_data.languages ?? {}), [k]: v });

  const setPref = (k: "sundayOff" | "flexibleDayOff" | "willingWithOtherHelper" | "willingStayIn", v: boolean) =>
    setFd("preferences", { ...(draft.form_data.preferences ?? {}), [k]: v });

  const setOE = (i: number, k: "country" | "yearsOfEmployment" | "jobDuties", v: string) => {
    const next = [...oe];
    while (next.length < 2) next.push({ country: "", yearsOfEmployment: "", jobDuties: "" });
    next[i] = { ...next[i], [k]: v };
    setFd("otherExperience", next);
  };

  const setWE = (i: number, k: keyof EditableWE, v: string | string[]) => {
    const next = [...we];
    next[i] = { ...next[i], [k]: v } as EditableWE;
    setFd("workExperience", next);
  };

  const addWE    = () => { if (we.length < 4) setFd("workExperience", [...we, emptyWE()]); };
  const removeWE = (i: number) => setFd("workExperience", we.filter((_, idx) => idx !== i));

  /* ── Save ── */
  const handleSave = async () => {
    if (!draft.full_name?.trim()) { alert("Full name cannot be empty."); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({
          full_name:     draft.full_name.trim(),
          date_of_birth: draft.date_of_birth || null,
          nationality:   draft.nationality   || null,
          gender:        draft.gender        || null,
          mobile:        draft.mobile        || null,
          form_data:     draft.form_data,
        })
        .eq("id", draft.id);
      if (error) throw error;
      onSaved(draft);
    } catch (err) {
      alert("Failed to save changes: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  /* ── Render ── */
  return (
    <div className="flex flex-col">
      <div className="p-5 space-y-1">

        {/* ── Personal ── */}
        <Section title="Personal Details" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Full Name *">
            <input value={draft.full_name ?? ""} onChange={e => setTop("full_name", e.target.value)} className={inp} />
          </Field>
          <Field label="Date of Birth">
            <input type="date" value={draft.date_of_birth ?? ""} onChange={e => setTop("date_of_birth", e.target.value)} className={inp} />
          </Field>
          <Field label="Nationality">
            <select value={draft.nationality ?? ""} onChange={e => setTop("nationality", e.target.value)} className={inp}>
              <option value="">—</option>
              {NATIONALITY_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Gender">
            <select value={draft.gender ?? ""} onChange={e => setTop("gender", e.target.value)} className={inp}>
              <option value="">—</option>
              {GENDER_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Mobile">
            <input value={draft.mobile ?? ""} onChange={e => setTop("mobile", e.target.value)} className={inp} />
          </Field>
          <Field label="Place of Birth">
            <input value={fd.placeOfBirth ?? ""} onChange={e => setFd("placeOfBirth", e.target.value)} className={inp} />
          </Field>
          <Field label="Current Location">
            <select value={fd.currentLocation ?? ""} onChange={e => setFd("currentLocation", e.target.value)} className={inp}>
              <option value="">—</option>
              {LOCATION_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Height (cm)">
            <input value={fd.height ?? ""} onChange={e => setFd("height", e.target.value)} className={inp} />
          </Field>
          <Field label="Weight (kg)">
            <input value={fd.weight ?? ""} onChange={e => setFd("weight", e.target.value)} className={inp} />
          </Field>
          <Field label="Marital Status">
            <select value={fd.maritalStatus ?? ""} onChange={e => setFd("maritalStatus", e.target.value)} className={inp}>
              <option value="">—</option>
              {MARITAL_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Religion">
            <select value={fd.religion ?? ""} onChange={e => setFd("religion", e.target.value)} className={inp}>
              <option value="">—</option>
              {RELIGION_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="No. of Kids">
            <input value={fd.numberOfKids ?? ""} onChange={e => setFd("numberOfKids", e.target.value)} className={inp} />
          </Field>
          <Field label="Boys' Ages">
            <input value={fd.boysAges ?? ""} onChange={e => setFd("boysAges", e.target.value)} className={inp} />
          </Field>
          <Field label="Girls' Ages">
            <input value={fd.girlsAges ?? ""} onChange={e => setFd("girlsAges", e.target.value)} className={inp} />
          </Field>
          <Field label="Family Members">
            <input value={fd.familyMembersCount ?? ""} onChange={e => setFd("familyMembersCount", e.target.value)} className={inp} />
          </Field>
        </div>

        {/* ── Contract ── */}
        <Section title="Contract Status" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select value={fd.contractStatus ?? ""} onChange={e => setFd("contractStatus", e.target.value)} className={inp}>
              <option value="">—</option>
              {CONTRACT_STATUS_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Last Working Day">
            <input type="date" value={fd.lastWorkingDay ?? ""} onChange={e => setFd("lastWorkingDay", e.target.value)} className={inp} />
          </Field>
        </div>

        {/* ── Education & languages ── */}
        <Section title="Education & Languages" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Education Level">
            <select value={fd.education ?? ""} onChange={e => setFd("education", e.target.value)} className={inp}>
              <option value="">—</option>
              {EDUCATION_OPTIONS.map(v => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Course / Major">
            <input value={fd.educationCourse ?? ""} onChange={e => setFd("educationCourse", e.target.value)} className={inp} />
          </Field>
          <Field label="Total Years in HK">
            <input value={fd.totalYearsHK ?? ""} onChange={e => setFd("totalYearsHK", e.target.value)} className={inp} />
          </Field>
          <Field label="No. of Employers">
            <input value={fd.numberOfEmployers ?? ""} onChange={e => setFd("numberOfEmployers", e.target.value)} className={inp} />
          </Field>
        </div>

        <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100">
          {([["english", "English"], ["cantonese", "Cantonese"], ["mandarin", "Mandarin"]] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs font-medium text-gray-700">{label}</span>
              <div className="flex items-center gap-4">
                {LANG_LEVELS.map(lv => (
                  <label key={lv} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-600">
                    <input
                      type="radio" name={`lang-${key}`}
                      checked={fd.languages?.[key] === lv}
                      onChange={() => setLang(key, lv)}
                      className="accent-blue-600"
                    />
                    {lv}
                  </label>
                ))}
                {fd.languages?.[key] && (
                  <button onClick={() => setLang(key, "")} className="text-[11px] text-gray-400 hover:text-red-500">clear</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Skills ── */}
        <Section title="Skills" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-3">
          {SKILL_OPTIONS.map(s => (
            <Check key={s} label={s}
              checked={(fd.skills ?? []).includes(s)}
              onChange={() => setFd("skills", toggle(fd.skills ?? [], s))} />
          ))}
        </div>

        <Section title="Cooking Abilities" />
        <div className="grid grid-cols-2 gap-y-2 gap-x-3">
          {COOKING_OPTIONS.map(c => (
            <Check key={c} label={c}
              checked={(fd.cookingAbilities ?? []).includes(c)}
              onChange={() => setFd("cookingAbilities", toggle(fd.cookingAbilities ?? [], c))} />
          ))}
        </div>

        <Section title="Preferences" />
        <div className="grid grid-cols-2 gap-y-2 gap-x-3">
          <Check label="Prefer Sunday Off"        checked={!!fd.preferences?.sundayOff}              onChange={() => setPref("sundayOff", !fd.preferences?.sundayOff)} />
          <Check label="Flexible Day Off"         checked={!!fd.preferences?.flexibleDayOff}         onChange={() => setPref("flexibleDayOff", !fd.preferences?.flexibleDayOff)} />
          <Check label="Willing w/ Other Helper"  checked={!!fd.preferences?.willingWithOtherHelper} onChange={() => setPref("willingWithOtherHelper", !fd.preferences?.willingWithOtherHelper)} />
          <Check label="Willing Stay-in Employer" checked={!!fd.preferences?.willingStayIn}          onChange={() => setPref("willingStayIn", !fd.preferences?.willingStayIn)} />
        </div>

        <Section title="Special Skills" />
        <textarea
          value={fd.specialSkills ?? ""}
          onChange={e => setFd("specialSkills", e.target.value)}
          rows={2}
          className={inp}
        />

        {/* ── Other country experience ── */}
        <Section title="Other Country Experience" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1].map(i => (
            <div key={i} className="space-y-2 border border-gray-200 rounded-lg p-3">
              <p className="text-[11px] font-semibold text-gray-500">{i === 0 ? "A" : "B"}</p>
              <Field label="Country / Employer">
                <input value={oe[i]?.country ?? ""} onChange={e => setOE(i, "country", e.target.value)} className={inp} />
              </Field>
              <Field label="Years of Employment">
                <input value={oe[i]?.yearsOfEmployment ?? ""} onChange={e => setOE(i, "yearsOfEmployment", e.target.value)} className={inp} />
              </Field>
              <Field label="Job Duties">
                <textarea value={oe[i]?.jobDuties ?? ""} onChange={e => setOE(i, "jobDuties", e.target.value)} rows={2} className={inp} />
              </Field>
            </div>
          ))}
        </div>

        {/* ── HK work experience ── */}
        <Section title="Hong Kong Work Experience" />
        <p className="text-[11px] text-gray-400 -mt-2 mb-2">
          The first entry prints as “Current Working Experience”; the rest fill page 2.
        </p>

        {we.length === 0 && (
          <p className="text-xs text-gray-400 italic py-2">No work experience recorded.</p>
        )}

        <div className="space-y-4">
          {we.map((entry, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  {i === 0 ? "Current / Most Recent" : `Experience ${i + 1}`}
                </p>
                <button
                  onClick={() => removeWE(i)}
                  className="text-[11px] text-red-500 hover:text-red-700 hover:underline"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Years of Employment">
                  <input value={entry.yearsOfEmployment ?? ""} onChange={e => setWE(i, "yearsOfEmployment", e.target.value)} className={inp} />
                </Field>
                <Field label="Date From (mm/yyyy)">
                  <input value={entry.dateFrom ?? ""} onChange={e => setWE(i, "dateFrom", e.target.value)} className={inp} />
                </Field>
                <Field label="Date To (mm/yyyy)">
                  <input value={entry.dateTo ?? ""} onChange={e => setWE(i, "dateTo", e.target.value)} className={inp} />
                </Field>
                <Field label="Location">
                  <input value={entry.location ?? ""} onChange={e => setWE(i, "location", e.target.value)} className={inp} />
                </Field>
                <Field label="Flat Size (sq.ft.)">
                  <input value={entry.flatSize ?? ""} onChange={e => setWE(i, "flatSize", e.target.value)} className={inp} />
                </Field>
                <Field label="Family Members">
                  <input value={entry.familyMembers ?? ""} onChange={e => setWE(i, "familyMembers", e.target.value)} className={inp} />
                </Field>
                <Field label="Contract Status">
                  <select value={entry.contractStatus ?? ""} onChange={e => setWE(i, "contractStatus", e.target.value)} className={inp}>
                    <option value="">—</option>
                    {WE_CONTRACT_STATUS_OPTIONS.map(v => <option key={v}>{v}</option>)}
                  </select>
                </Field>
                <Field label="No. of Co-helpers">
                  <input value={entry.coHelpers ?? ""} onChange={e => setWE(i, "coHelpers", e.target.value)} className={inp} />
                </Field>
                <Field label="Employer Nationality">
                  <input value={entry.employerNationality ?? ""} onChange={e => setWE(i, "employerNationality", e.target.value)} className={inp} />
                </Field>
                <Field label="Terminated Reason">
                  <input value={entry.terminatedReason ?? ""} onChange={e => setWE(i, "terminatedReason", e.target.value)} className={inp} />
                </Field>
                <Field label="Break Reason">
                  <input value={entry.breakReason ?? ""} onChange={e => setWE(i, "breakReason", e.target.value)} className={inp} />
                </Field>
              </div>

              <div>
                <p className={lbl}>Household Chores</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-1.5 gap-x-3 mt-1.5">
                  {HOUSEHOLD_CHORES.map(c => (
                    <Check key={c} label={c}
                      checked={(entry.householdChores ?? []).includes(c)}
                      onChange={() => setWE(i, "householdChores", toggle(entry.householdChores ?? [], c))} />
                  ))}
                </div>
              </div>

              <Field label="Job Duties (free text)">
                <textarea value={entry.jobDuties ?? ""} onChange={e => setWE(i, "jobDuties", e.target.value)} rows={2} className={inp} />
              </Field>
            </div>
          ))}
        </div>

        {we.length < 4 && (
          <button
            onClick={addWE}
            className="mt-3 w-full py-2 rounded-lg border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Add work experience ({we.length}/4)
          </button>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="sticky bottom-0 p-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center gap-3">
        <p className="text-[11px] text-gray-400">Changes apply to the biodata card and the exported PDF.</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:bg-gray-300"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
