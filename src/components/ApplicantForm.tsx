"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/* ── Types ──────────────────────────────────────────────────────────────── */
interface WorkExperienceEntry {
  yearsOfEmployment: string;
  dateFrom: string;
  dateTo: string;
  location: string;
  flatSize: string;
  contractStatus: string;
  terminatedReason: string;
  breakReason: string;
  householdChores: string[];
  jobDuties: string;
  coHelpers: string;
  employerNationality: string;
  familyMembers: string;
}
interface OtherExpEntry { country: string; yearsOfEmployment: string; jobDuties: string; }
interface FormState {
  fullName: string; dob: string; placeOfBirth: string; nationality: string;
  gender: string; mobile: string; currentLocation: string; height: string;
  weight: string; maritalStatus: string; religion: string;
  contractStatus: string; lastWorkingDay: string;
  numberOfKids: string; boysAges: string; girlsAges: string; familyMembersCount: string;
  education: string; educationCourse: string;
  totalYearsHK: string; numberOfEmployers: string;
  langEnglish: string; langCantonese: string; langMandarin: string;
  specialSkills: string;
  skills: string[]; cookingAbilities: string[];
  preferences: { sundayOff: boolean; flexibleDayOff: boolean; willingWithOtherHelper: boolean; willingStayIn: boolean; };
  otherExperience: OtherExpEntry[];
  workExperience: WorkExperienceEntry[];
}

/* ── Constants ──────────────────────────────────────────────────────────── */
const STEPS = [
  "Personal Details",
  "Education & Languages",
  "Skills & Preferences",
  "Other Country Experience",
  "HK Work Experience",
  "Review & Submit",
];

const SKILL_OPTIONS = [
  "Cooking", "Child Care", "New Born Care", "Special Child Care",
  "Elderly Care", "Disabled Person Care", "Pet Care", "Driving",
  "Car Washing", "Plant Care", "Kids Tutorial", "Nursing Aide",
];
const COOKING_OPTIONS = [
  "Western Food", "Asian Food", "Mediterranean Food",
  "Baking", "Can follow Recipe and Cook Book",
];
const HOUSEHOLD_CHORES = [
  "Cooking", "Child Care", "New Born Care", "Special Child Care",
  "Elderly Care", "Disabled Person Care", "Pet Care",
  "Driving", "Car Washing", "Plant Care / Gardening",
];

const emptyWE = (): WorkExperienceEntry => ({
  yearsOfEmployment: "", dateFrom: "", dateTo: "", location: "", flatSize: "",
  contractStatus: "", terminatedReason: "", breakReason: "",
  householdChores: [], jobDuties: "", coHelpers: "", employerNationality: "", familyMembers: "",
});

const INITIAL: FormState = {
  fullName: "", dob: "", placeOfBirth: "", nationality: "", gender: "",
  mobile: "", currentLocation: "", height: "", weight: "", maritalStatus: "",
  religion: "", contractStatus: "", lastWorkingDay: "",
  numberOfKids: "", boysAges: "", girlsAges: "", familyMembersCount: "",
  education: "", educationCourse: "", totalYearsHK: "", numberOfEmployers: "",
  langEnglish: "", langCantonese: "", langMandarin: "", specialSkills: "",
  skills: [], cookingAbilities: [],
  preferences: { sundayOff: false, flexibleDayOff: false, willingWithOtherHelper: false, willingStayIn: false },
  otherExperience: [
    { country: "", yearsOfEmployment: "", jobDuties: "" },
    { country: "", yearsOfEmployment: "", jobDuties: "" },
  ],
  workExperience: [],
};

/* ── Shared style tokens ────────────────────────────────────────────────── */
const inp = "mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white";
const lbl = "block text-sm font-medium text-gray-700";
const tog = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

/* ── Sub-components ─────────────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mt-6 mb-3 pb-1 border-b border-gray-100 first:mt-0">
      {children}
    </h3>
  );
}

function CheckItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors duration-150 ${checked ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"}`}>
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 10 10">
            <path d="M2 5l2.5 2.5 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

function LangRow({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex gap-5">
        {(["Basic", "Good"] as const).map(opt => (
          <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" name={name} checked={value === opt} onChange={() => onChange(opt)} className="accent-blue-600" />
            <span className="text-sm text-gray-600">{opt}</span>
          </label>
        ))}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name={name} checked={value === ""} onChange={() => onChange("")} className="accent-blue-600" />
          <span className="text-sm text-gray-400">N/A</span>
        </label>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */
export default function ApplicantForm() {
  const [step, setStep]       = useState(0);
  const [data, setData]       = useState<FormState>(INITIAL);
  const [photo, setPhoto]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  /* ── Updaters ── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set  = (k: keyof FormState, v: any)                             => setData(p => ({ ...p, [k]: v }));
  const setPref = (k: keyof FormState["preferences"], v: boolean)       => setData(p => ({ ...p, preferences: { ...p.preferences, [k]: v } }));
  const setOE   = (i: number, k: keyof OtherExpEntry, v: string)       => setData(p => { const oe = [...p.otherExperience]; oe[i] = { ...oe[i], [k]: v }; return { ...p, otherExperience: oe }; });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setWE   = (i: number, k: keyof WorkExperienceEntry, v: any)    => setData(p => { const we = [...p.workExperience]; we[i] = { ...we[i], [k]: v }; return { ...p, workExperience: we }; });
  const addWE   = ()                                                     => { if (data.workExperience.length < 4) setData(p => ({ ...p, workExperience: [...p.workExperience, emptyWE()] })); };
  const removeWE = (i: number)                                           => setData(p => ({ ...p, workExperience: p.workExperience.filter((_, idx) => idx !== i) }));

  /* ── Photo ── */
  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)); }
  };

  /* ── Validation ── */
  const canNext = () => {
    if (step === 0) return !!(photo && data.fullName && data.dob && data.nationality && data.gender && data.mobile && data.currentLocation);
    return true;
  };

  /* ── Submit ── */
  const handleSubmit = async () => {
    setLoading(true);
    let photoUrl = "";
    try {
      if (photo) {
        const ext  = photo.name.split(".").pop();
        const path = `photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("applicant-photos").upload(path, photo);
        if (upErr) throw upErr;
        photoUrl = supabase.storage.from("applicant-photos").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("applicants").insert([{
        full_name:     data.fullName,
        date_of_birth: data.dob        || null,
        nationality:   data.nationality || null,
        gender:        data.gender      || null,
        mobile:        data.mobile      || null,
        photo_url:     photoUrl         || null,
        form_data: {
          placeOfBirth: data.placeOfBirth, currentLocation: data.currentLocation,
          height: data.height, weight: data.weight, maritalStatus: data.maritalStatus,
          education: data.education, religion: data.religion,
          contractStatus: data.contractStatus, lastWorkingDay: data.lastWorkingDay,
          numberOfKids: data.numberOfKids, boysAges: data.boysAges,
          girlsAges: data.girlsAges, familyMembersCount: data.familyMembersCount,
          educationCourse: data.educationCourse, totalYearsHK: data.totalYearsHK,
          numberOfEmployers: data.numberOfEmployers,
          languages: { english: data.langEnglish, cantonese: data.langCantonese, mandarin: data.langMandarin },
          specialSkills: data.specialSkills,
          skills: data.skills, cookingAbilities: data.cookingAbilities,
          preferences: data.preferences,
          otherExperience: data.otherExperience.filter(e => e.country),
          workExperience: data.workExperience,
        },
      }]);
      if (error) throw error;
      setSubmitted(true);
    } catch (err: unknown) {
      alert("Submission failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  /* ── Success screen ── */
  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6 text-gray-900">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Application Submitted!</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Thank you, <span className="font-semibold text-gray-700">{data.fullName}</span>.
            Your profile has been received and will be reviewed by our team shortly.
          </p>
        </div>
      </div>
    );
  }

  /* ── Step renderer ── */
  const renderStep = () => {
    switch (step) {

      /* ── STEP 0 · Personal Details ─────────────────────────────────────── */
      case 0: return (
        <div>
          {/* Photo */}
          <SectionTitle>Photo</SectionTitle>
          <div className="flex items-center gap-5">
            <div className="h-28 w-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 overflow-hidden relative flex-shrink-0">
              {preview
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={preview} alt="Preview" className="h-full w-full object-cover" />
                : <span className="text-gray-400 text-xs text-center px-3">Click to upload</span>}
              <input type="file" accept="image/*" onChange={handlePhoto}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">Upload a professional headshot.<br />JPEG or PNG accepted.</p>
          </div>

          {/* Identity */}
          <SectionTitle>Identity</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className={lbl}>Full Name *</label>
              <input value={data.fullName} onChange={e => set("fullName", e.target.value)} type="text" required placeholder="Please enter..." className={inp} />
            </div>
            <div>
              <label className={lbl}>Date of Birth *</label>
              <input value={data.dob} onChange={e => set("dob", e.target.value)} type="date" required className={inp} />
            </div>
            <div>
              <label className={lbl}>Place of Birth</label>
              <input value={data.placeOfBirth} onChange={e => set("placeOfBirth", e.target.value)} type="text" placeholder="City, Country" className={inp} />
            </div>
            <div>
              <label className={lbl}>Nationality *</label>
              <select value={data.nationality} onChange={e => set("nationality", e.target.value)} required className={inp}>
                <option value="">Please select...</option>
                <option>Filipino</option><option>Indonesian</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Gender *</label>
              <select value={data.gender} onChange={e => set("gender", e.target.value)} required className={inp}>
                <option value="">Please select...</option>
                <option>Female</option><option>Male</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Mobile *</label>
              <input value={data.mobile} onChange={e => set("mobile", e.target.value)} type="tel" required placeholder="+852..." className={inp} />
            </div>
            <div>
              <label className={lbl}>Current Location *</label>
              <select value={data.currentLocation} onChange={e => set("currentLocation", e.target.value)} required className={inp}>
                <option value="">Please select...</option>
                <option>Hong Kong</option><option>Philippines</option>
                <option>Indonesia</option><option>Others</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Height (cm)</label>
              <input value={data.height} onChange={e => set("height", e.target.value)} type="number" placeholder="e.g. 158" className={inp} />
            </div>
            <div>
              <label className={lbl}>Weight (kg)</label>
              <input value={data.weight} onChange={e => set("weight", e.target.value)} type="number" placeholder="e.g. 55" className={inp} />
            </div>
            <div>
              <label className={lbl}>Marital Status</label>
              <select value={data.maritalStatus} onChange={e => set("maritalStatus", e.target.value)} className={inp}>
                <option value="">Please select...</option>
                {["Single","Married","Separated","Divorced","Widowed"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Religion</label>
              <select value={data.religion} onChange={e => set("religion", e.target.value)} className={inp}>
                <option value="">Please select...</option>
                {["Catholic","Christian","Moslem","Buddhist","Hindu","Islam","Others"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Family */}
          <SectionTitle>Family</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className={lbl}>No. of Kids</label>
              <input value={data.numberOfKids} onChange={e => set("numberOfKids", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Boys — Ages</label>
              <input value={data.boysAges} onChange={e => set("boysAges", e.target.value)} type="text" placeholder='e.g. "3, 7"' className={inp} />
            </div>
            <div>
              <label className={lbl}>Girls — Ages</label>
              <input value={data.girlsAges} onChange={e => set("girlsAges", e.target.value)} type="text" placeholder='e.g. "5"' className={inp} />
            </div>
            <div>
              <label className={lbl}>Family Members</label>
              <input value={data.familyMembersCount} onChange={e => set("familyMembersCount", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
            </div>
          </div>

          {/* Contract status */}
          <SectionTitle>Current Contract Status</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Status</label>
              <select value={data.contractStatus} onChange={e => set("contractStatus", e.target.value)} className={inp}>
                <option value="">Please select...</option>
                {["First-Timer (No HK Experience)","Finished Contract","Plan to Break","Terminated","Break of Contract"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            {data.contractStatus && data.contractStatus !== "First-Timer (No HK Experience)" && (
              <div>
                <label className={lbl}>Last Working Day</label>
                <input value={data.lastWorkingDay} onChange={e => set("lastWorkingDay", e.target.value)} type="date" className={inp} />
              </div>
            )}
          </div>
        </div>
      );

      /* ── STEP 1 · Education & Languages ────────────────────────────────── */
      case 1: return (
        <div>
          <SectionTitle>Education</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Education Level</label>
              <select value={data.education} onChange={e => set("education", e.target.value)} className={inp}>
                <option value="">Please select...</option>
                {["High School Graduate","College Undergraduate","College Graduate","Vocational Course"].map(v => <option key={v}>{v}</option>)}
              </select>
            </div>
            {["College Undergraduate","College Graduate","Vocational Course"].includes(data.education) && (
              <div>
                <label className={lbl}>Course / Field of Study</label>
                <input value={data.educationCourse} onChange={e => set("educationCourse", e.target.value)} type="text" placeholder="e.g. Nursing, HRM..." className={inp} />
              </div>
            )}
            <div>
              <label className={lbl}>Total Years in Hong Kong</label>
              <input value={data.totalYearsHK} onChange={e => set("totalYearsHK", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Total Number of Employers</label>
              <input value={data.numberOfEmployers} onChange={e => set("numberOfEmployers", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
            </div>
          </div>

          <SectionTitle>Spoken Languages</SectionTitle>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <LangRow name="langEn" label="English"   value={data.langEnglish}   onChange={v => set("langEnglish", v)} />
            <LangRow name="langCa" label="Cantonese" value={data.langCantonese} onChange={v => set("langCantonese", v)} />
            <LangRow name="langMa" label="Mandarin"  value={data.langMandarin}  onChange={v => set("langMandarin", v)} />
          </div>

          <SectionTitle>Special Skills</SectionTitle>
          <textarea
            value={data.specialSkills}
            onChange={e => set("specialSkills", e.target.value)}
            rows={3}
            placeholder="Describe any special skills, certifications, or awards..."
            className={inp + " resize-none"}
          />
        </div>
      );

      /* ── STEP 2 · Skills & Preferences ─────────────────────────────────── */
      case 2: return (
        <div>
          <SectionTitle>My Skills</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {SKILL_OPTIONS.map(s => (
              <CheckItem key={s} label={s} checked={data.skills.includes(s)} onChange={() => set("skills", tog(data.skills, s))} />
            ))}
          </div>

          <SectionTitle>Cooking Abilities</SectionTitle>
          <div className="space-y-3">
            {COOKING_OPTIONS.map(c => (
              <CheckItem key={c} label={c} checked={data.cookingAbilities.includes(c)} onChange={() => set("cookingAbilities", tog(data.cookingAbilities, c))} />
            ))}
          </div>

          <SectionTitle>Preferences</SectionTitle>
          <div className="space-y-3">
            <CheckItem label="Prefer Sunday Off"                          checked={data.preferences.sundayOff}              onChange={() => setPref("sundayOff", !data.preferences.sundayOff)} />
            <CheckItem label="Flexible Day Off"                           checked={data.preferences.flexibleDayOff}         onChange={() => setPref("flexibleDayOff", !data.preferences.flexibleDayOff)} />
            <CheckItem label="Willing to work with another helper"        checked={data.preferences.willingWithOtherHelper} onChange={() => setPref("willingWithOtherHelper", !data.preferences.willingWithOtherHelper)} />
            <CheckItem label="Willing to stay in with employer"           checked={data.preferences.willingStayIn}          onChange={() => setPref("willingStayIn", !data.preferences.willingStayIn)} />
          </div>
        </div>
      );

      /* ── STEP 3 · Other Country Experience ──────────────────────────────── */
      case 3: return (
        <div>
          <p className="text-sm text-gray-500 mb-4">Work experience outside Hong Kong. Leave blank if not applicable.</p>
          {(["A","B"] as const).map((letter, i) => (
            <div key={letter} className="border border-gray-200 rounded-lg p-4 space-y-3 mb-4 last:mb-0">
              <h4 className="text-sm font-semibold text-gray-700">Experience {letter}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Country</label>
                  <input value={data.otherExperience[i].country} onChange={e => setOE(i, "country", e.target.value)} type="text" placeholder="e.g. Singapore" className={inp} />
                </div>
                <div>
                  <label className={lbl}>Years of Employment</label>
                  <input value={data.otherExperience[i].yearsOfEmployment} onChange={e => setOE(i, "yearsOfEmployment", e.target.value)} type="number" min="0" step="0.5" placeholder="0" className={inp} />
                </div>
                <div className="md:col-span-2">
                  <label className={lbl}>Job Duties</label>
                  <textarea value={data.otherExperience[i].jobDuties} onChange={e => setOE(i, "jobDuties", e.target.value)} rows={2} placeholder="Describe your main duties..." className={inp + " resize-none"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      );

      /* ── STEP 4 · HK Work Experience ────────────────────────────────────── */
      case 4: return (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 mb-4">
            This section is optional. Skip to the next step if you have no Hong Kong work experience.
          </div>

          {data.workExperience.map((we, i) => (
            <div key={i} className="border border-gray-200 rounded-lg overflow-hidden mb-4">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                <h4 className="text-sm font-semibold text-gray-700">Work Experience #{i + 1}</h4>
                <button type="button" onClick={() => removeWE(i)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
              </div>
              <div className="p-4 space-y-4">

                {/* Dates & location */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className={lbl}>Years of Employment</label>
                    <input value={we.yearsOfEmployment} onChange={e => setWE(i, "yearsOfEmployment", e.target.value)} type="number" min="0" step="0.5" placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Date From (MM/YYYY)</label>
                    <input value={we.dateFrom} onChange={e => setWE(i, "dateFrom", e.target.value)} type="text" placeholder="01/2020" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Date To (MM/YYYY)</label>
                    <input value={we.dateTo} onChange={e => setWE(i, "dateTo", e.target.value)} type="text" placeholder="12/2022" className={inp} />
                  </div>
                </div>

                {/* Employer info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Location</label>
                    <input value={we.location} onChange={e => setWE(i, "location", e.target.value)} type="text" placeholder="e.g. Kowloon" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Size of Flat / House (sq. ft.)</label>
                    <input value={we.flatSize} onChange={e => setWE(i, "flatSize", e.target.value)} type="text" placeholder="e.g. 500" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Employer Nationality</label>
                    <input value={we.employerNationality} onChange={e => setWE(i, "employerNationality", e.target.value)} type="text" placeholder="e.g. Chinese" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Family Members</label>
                    <input value={we.familyMembers} onChange={e => setWE(i, "familyMembers", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>No. of Co-Helpers</label>
                    <input value={we.coHelpers} onChange={e => setWE(i, "coHelpers", e.target.value)} type="number" min="0" placeholder="0" className={inp} />
                  </div>
                  <div>
                    <label className={lbl}>Contract Status</label>
                    <select value={we.contractStatus} onChange={e => setWE(i, "contractStatus", e.target.value)} className={inp}>
                      <option value="">Please select...</option>
                      {["Finished Contract","Plan to Break","Terminated","Break"].map(v => <option key={v}>{v}</option>)}
                    </select>
                  </div>
                </div>

                {/* Conditional reason fields */}
                {we.contractStatus === "Terminated" && (
                  <div>
                    <label className={lbl}>Reason for Termination</label>
                    <input value={we.terminatedReason} onChange={e => setWE(i, "terminatedReason", e.target.value)} type="text" placeholder="Please explain..." className={inp} />
                  </div>
                )}
                {(we.contractStatus === "Break" || we.contractStatus === "Plan to Break") && (
                  <div>
                    <label className={lbl}>Reason for Break</label>
                    <input value={we.breakReason} onChange={e => setWE(i, "breakReason", e.target.value)} type="text" placeholder="Please explain..." className={inp} />
                  </div>
                )}

                {/* Household chores */}
                <div>
                  <label className={lbl + " mb-2"}>Household Chores Performed</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {HOUSEHOLD_CHORES.map(c => (
                      <CheckItem key={c} label={c} checked={we.householdChores.includes(c)} onChange={() => setWE(i, "householdChores", tog(we.householdChores, c))} />
                    ))}
                  </div>
                </div>

                {/* Job duties */}
                <div>
                  <label className={lbl}>Job Duties</label>
                  <textarea value={we.jobDuties} onChange={e => setWE(i, "jobDuties", e.target.value)} rows={2} placeholder="Describe your main duties..." className={inp + " resize-none"} />
                </div>
              </div>
            </div>
          ))}

          {data.workExperience.length < 4 && (
            <button type="button" onClick={addWE}
              className="w-full border-2 border-dashed border-gray-300 rounded-lg py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
              + Add Work Experience Entry {data.workExperience.length > 0 && `(${data.workExperience.length} / 4)`}
            </button>
          )}
        </div>
      );

      /* ── STEP 5 · Review & Submit ────────────────────────────────────────── */
      case 5: return (
        <div>
          <p className="text-sm text-gray-500 mb-4">Please review your information before submitting.</p>

          {/* Identity card */}
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-gray-800">{data.fullName || "—"}</p>
              <p className="text-sm text-gray-500">{[data.nationality, data.gender].filter(Boolean).join(" · ")}</p>
              <p className="text-xs text-gray-400 mt-0.5">{data.mobile}</p>
            </div>
          </div>

          {/* Key fields grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {([
              ["Date of Birth",  data.dob],
              ["Location",       data.currentLocation],
              ["Religion",       data.religion],
              ["Marital Status", data.maritalStatus],
              ["Height / Weight", data.height || data.weight ? `${data.height || "—"} cm / ${data.weight || "—"} kg` : "—"],
              ["Education",      data.education],
              ["Total Years HK", data.totalYearsHK],
              ["No. of Employers", data.numberOfEmployers],
              ["Contract Status", data.contractStatus],
              ["Family Members", data.familyMembersCount],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="p-2.5 bg-white border border-gray-100 rounded-lg">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{k}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5 truncate">{v || "—"}</p>
              </div>
            ))}
          </div>

          {/* Languages */}
          {(data.langEnglish || data.langCantonese || data.langMandarin) && (
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Languages</p>
              <div className="flex flex-wrap gap-2">
                {data.langEnglish   && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">English — {data.langEnglish}</span>}
                {data.langCantonese && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">Cantonese — {data.langCantonese}</span>}
                {data.langMandarin  && <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">Mandarin — {data.langMandarin}</span>}
              </div>
            </div>
          )}

          {/* Skills */}
          {data.skills.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5 uppercase tracking-wider">Skills ({data.skills.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {data.skills.map(s => <span key={s} className="text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">{s}</span>)}
              </div>
            </div>
          )}

          {/* Work experience summary */}
          <p className="text-sm text-gray-600 mb-4">
            <span className="font-semibold">{data.workExperience.length}</span> HK work experience entr{data.workExperience.length === 1 ? "y" : "ies"} on record.
          </p>

          {/* Disclaimer */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500 leading-relaxed">
            I hereby certify that the above information is true and correct to the best of my ability and agree that{" "}
            <strong className="text-gray-700">CASTILLO DEL REY CONSULTANCY</strong> may disclose my personal profile
            to potential employers for the purpose of seeking employment as Foreign Domestic Helper.
          </div>
        </div>
      );

      default: return null;
    }
  };

  /* ── Main render ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 text-gray-900">
      <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

        {/* Progress header */}
        <div className="px-6 pt-5 pb-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-800">{STEPS[step]}</h2>
            <span className="text-xs text-gray-400">Step {step + 1} of {STEPS.length}</span>
          </div>
          {/* Bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
            <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          {/* Step dots */}
          <div className="flex justify-between px-0.5">
            {STEPS.map((s, i) => (
              <div key={i} title={s}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${i < step ? "bg-blue-600" : i === step ? "bg-blue-400" : "bg-gray-300"}`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="p-6">{renderStep()}</div>

        {/* Navigation */}
        <div className="px-6 pb-6 flex gap-3">
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
              ← Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed">
              Next →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
              {loading ? "Submitting…" : "Submit Application"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}