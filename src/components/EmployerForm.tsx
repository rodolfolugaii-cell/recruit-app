"use client";

/**
 * EmployerForm.tsx — add or edit an employer.
 *
 * Laid out like ApplicantEditForm rather than like the printed contract: the
 * Schedule's ruled lines are built for reading, not for typing into. The
 * Residence, Household and Accommodation sections are ID 407 Schedule items 2
 * and 3 — none of it can come from the apply form, because it describes the
 * employer's home rather than the helper.
 */

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  AREA_UNITS, EMPLOYER_STATUSES, FACILITY_FIELDS,
  employerInitials, employerSetupHint, employerTint, uploadEmployerImage,
  type Employer, type EmployerData, type FacilityKey,
} from "@/lib/employers";
import { formatAges, formatCount } from "@/lib/kids";

/* ── Style tokens (match ApplicantEditForm) ───────────────────────────────── */
const inp = "mt-1 block w-full rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white";
const lbl = "block text-xs font-medium text-gray-600";

function Section({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mt-6 mb-3 first:mt-0">
      <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest pb-1 border-b border-gray-100">
        {title}
      </h3>
      {note && <p className="mt-1.5 text-[11px] text-gray-400">{note}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={lbl}>{label}</label>{children}</div>;
}

/** A measurement plus the sq ft / sq m that the form asks you to delete one of. */
function AreaField({
  label, value, unit, onValue, onUnit,
}: {
  label: string; value?: string; unit?: string;
  onValue: (v: string) => void; onUnit: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="mt-1 flex gap-2">
        <input value={value ?? ""} onChange={e => onValue(e.target.value)}
          inputMode="decimal" placeholder="0"
          className="flex-1 min-w-0 rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white" />
        <select value={unit ?? AREA_UNITS[0]} onChange={e => onUnit(e.target.value)}
          className="w-24 rounded-md border border-gray-300 p-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white">
          {AREA_UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </div>
    </Field>
  );
}

/** Yes / No pair, standing in for the two tick boxes the form prints. */
function YesNo({
  label, value, onChange,
}: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-gray-700 min-w-0 truncate">{label}</span>
      <div className="flex gap-1 flex-shrink-0">
        {["Yes", "No"].map(opt => (
          <button
            key={opt} type="button"
            onClick={() => onChange(value === opt ? "" : opt)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border transition-colors ${
              value === opt
                ? opt === "Yes"
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-slate-600 border-slate-600 text-white"
                : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
            }`}
          >{opt}</button>
        ))}
      </div>
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function EmployerForm({
  employer, onCancel, onSaved,
}: {
  /** null = adding a new employer */
  employer: Employer | null;
  onCancel: () => void;
  onSaved: (saved: Employer) => void;
}) {
  const [draft, setDraft] = useState<Employer>(() =>
    employer
      ? (JSON.parse(JSON.stringify(employer)) as Employer)
      : ({
          id: "", created_at: "", name: "", banner_url: null, logo_url: null,
          contact_person: null, phone: null, email: null, address: null,
          status: "Active",
          employer_data: {
            flatSizeUnit: "sq ft", servantRoomUnit: "sq ft", partitionUnit: "sq ft",
            servantRoom: "", facilities: {},
          },
        } as Employer)
  );
  const [saving, setSaving]   = useState(false);
  const [busyImg, setBusyImg] = useState<"banner" | "logo" | null>(null);

  const ed   = draft.employer_data ?? {};
  const tint = employerTint(draft.name || "New Employer");

  const setTop = <K extends keyof Employer>(k: K, v: Employer[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const setEd = <K extends keyof EmployerData>(k: K, v: EmployerData[K]) =>
    setDraft(d => ({ ...d, employer_data: { ...(d.employer_data ?? {}), [k]: v } }));

  const setFacility = (k: FacilityKey, v: string) =>
    setEd("facilities", { ...(ed.facilities ?? {}), [k]: v });

  const pickImage = async (e: React.ChangeEvent<HTMLInputElement>, kind: "banner" | "logo") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusyImg(kind);
    try {
      const url = await uploadEmployerImage(file, kind);
      setTop(kind === "banner" ? "banner_url" : "logo_url", url);
    } catch (err) {
      alert(`Could not upload the ${kind}: ` + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusyImg(null);
    }
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { alert("Employer name cannot be empty."); return; }
    setSaving(true);
    try {
      // Tidy the free-typed numbers the same way the biodata does, so the
      // contract prints "3" and "8, 11" rather than whatever was typed.
      const cleaned: EmployerData = {
        ...ed,
        adults:            formatCount(ed.adults),
        minors5to18:       formatCount(ed.minors5to18),
        minorsUnder5:      formatCount(ed.minorsUnder5),
        expectingBabies:   formatCount(ed.expectingBabies),
        constantCare:      formatCount(ed.constantCare),
        helpersEmployed:   formatCount(ed.helpersEmployed),
        shareRoomChildren: formatCount(ed.shareRoomChildren),
        shareRoomAges:     formatAges(ed.shareRoomAges),
      };

      const row = {
        name:           draft.name.trim(),
        banner_url:     draft.banner_url,
        logo_url:       draft.logo_url,
        contact_person: draft.contact_person || null,
        phone:          draft.phone   || null,
        email:          draft.email   || null,
        address:        draft.address || null,
        status:         draft.status  || "Active",
        employer_data:  cleaned,
      };

      const query = employer
        ? supabase.from("employers").update(row).eq("id", employer.id).select().single()
        : supabase.from("employers").insert(row).select().single();

      const { data, error } = await query;
      if (error) throw new Error(employerSetupHint(error.message) ?? error.message);
      onSaved(data as Employer);
    } catch (err) {
      alert("Failed to save: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">

      {/* ── Banner + identity ── */}
      <div className="relative">
        <div className="h-28 w-full bg-gradient-to-br from-slate-700 to-slate-900 overflow-hidden">
          {draft.banner_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.banner_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <label className="absolute top-2 right-2 cursor-pointer bg-black/50 hover:bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-md backdrop-blur-sm transition-colors">
          {busyImg === "banner" ? "Uploading…" : draft.banner_url ? "Change banner" : "Add banner"}
          <input type="file" accept="image/*" className="hidden" onChange={e => pickImage(e, "banner")} />
        </label>

        <div className="absolute -bottom-7 left-5">
          <label className="block cursor-pointer" title="Upload a logo">
            <div className={`w-16 h-16 rounded-xl border-4 border-white shadow-md overflow-hidden flex items-center justify-center ${tint.bg}`}>
              {draft.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={draft.logo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className={`text-lg font-black ${tint.text}`}>
                  {employerInitials(draft.name || "?")}
                </span>
              )}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={e => pickImage(e, "logo")} />
          </label>
        </div>
      </div>

      <div className="p-5 pt-10 space-y-1">

        {/* ── Employer ── */}
        <Section title="Employer" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Employer Name *">
            <input value={draft.name} onChange={e => setTop("name", e.target.value)}
              placeholder="e.g. JP Morgan" className={inp} />
          </Field>
          <Field label="Contact Person">
            <input value={draft.contact_person ?? ""} onChange={e => setTop("contact_person", e.target.value)} className={inp} />
          </Field>
          <Field label="Status">
            <select value={draft.status ?? "Active"} onChange={e => setTop("status", e.target.value)} className={inp}>
              {EMPLOYER_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Phone">
            <input value={draft.phone ?? ""} onChange={e => setTop("phone", e.target.value)} className={inp} />
          </Field>
          <Field label="Email">
            <input value={draft.email ?? ""} onChange={e => setTop("email", e.target.value)} type="email" className={inp} />
          </Field>
          <Field label="Address">
            <input value={draft.address ?? ""} onChange={e => setTop("address", e.target.value)} className={inp} />
          </Field>
        </div>

        {/* ── Residence ── */}
        <Section
          title="Residence — ID 407 Clause 3 + Schedule 2A"
          note="Where the helper works and resides, and the size of the flat or house."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Field label="Residence Address (if different from above)">
              <input value={ed.residenceAddress ?? ""} onChange={e => setEd("residenceAddress", e.target.value)}
                placeholder={draft.address ?? "Same as Address"} className={inp} />
            </Field>
          </div>
          <AreaField
            label="Approx. size of flat / house"
            value={ed.flatSize} unit={ed.flatSizeUnit}
            onValue={v => setEd("flatSize", v)} onUnit={v => setEd("flatSizeUnit", v)}
          />
        </div>

        {/* ── Household ── */}
        <Section
          title="Household — ID 407 Schedule 2B"
          note="Persons in the employer's household served on a regular basis. This is the employer's family, never the helper's own."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Adults">
            <input value={ed.adults ?? ""} onChange={e => setEd("adults", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
          <Field label="Minors aged 5–18">
            <input value={ed.minors5to18 ?? ""} onChange={e => setEd("minors5to18", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
          <Field label="Minors below 5">
            <input value={ed.minorsUnder5 ?? ""} onChange={e => setEd("minorsUnder5", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
          <Field label="Expecting babies">
            <input value={ed.expectingBabies ?? ""} onChange={e => setEd("expectingBabies", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
          <Field label="Requiring constant care">
            <input value={ed.constantCare ?? ""} onChange={e => setEd("constantCare", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
          <Field label="Helpers currently employed">
            <input value={ed.helpersEmployed ?? ""} onChange={e => setEd("helpersEmployed", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
          </Field>
        </div>

        {/* ── Accommodation ── */}
        <Section
          title="Accommodation — ID 407 Schedule 3A"
          note="Is there a servant room? If not, the form asks how the helper will sleep instead."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Separate servant room">
            <select value={ed.servantRoom ?? ""} onChange={e => setEd("servantRoom", e.target.value)} className={inp}>
              <option value="">—</option>
              <option>Yes</option>
              <option>No</option>
            </select>
          </Field>
          {ed.servantRoom === "Yes" && (
            <AreaField
              label="Estimated size of servant room"
              value={ed.servantRoomSize} unit={ed.servantRoomUnit}
              onValue={v => setEd("servantRoomSize", v)} onUnit={v => setEd("servantRoomUnit", v)}
            />
          )}
        </div>

        {ed.servantRoom === "No" && (
          <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-100 space-y-3">
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Sleeping arrangement</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Shares a room with (children)">
                <input value={ed.shareRoomChildren ?? ""} onChange={e => setEd("shareRoomChildren", formatCount(e.target.value))} inputMode="numeric" placeholder="0" className={inp} />
              </Field>
              <Field label="Aged">
                <input value={ed.shareRoomAges ?? ""} onChange={e => setEd("shareRoomAges", e.target.value)}
                  onBlur={e => setEd("shareRoomAges", formatAges(e.target.value))}
                  placeholder="e.g. 8, 11" className={inp} />
              </Field>
              <AreaField
                label="Separate partitioned area"
                value={ed.partitionSize} unit={ed.partitionUnit}
                onValue={v => setEd("partitionSize", v)} onUnit={v => setEd("partitionUnit", v)}
              />
            </div>
            <Field label="Others — please describe">
              <textarea value={ed.sleepOthers ?? ""} onChange={e => setEd("sleepOthers", e.target.value)}
                rows={2} className={inp} />
            </Field>
          </div>
        )}

        {/* ── Facilities ── */}
        <Section
          title="Facilities — ID 407 Schedule 3B"
          note="A visa is normally refused unless items (a) to (f) are provided free."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {FACILITY_FIELDS.map(f => (
            <YesNo
              key={f.key} label={f.label}
              value={ed.facilities?.[f.key]}
              onChange={v => setFacility(f.key, v)}
            />
          ))}
        </div>
        <div className="mt-3">
          <Field label="Other facilities — please specify">
            <textarea value={ed.otherFacilities ?? ""} onChange={e => setEd("otherFacilities", e.target.value)}
              rows={2} className={inp} />
          </Field>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 bg-white border-t border-gray-200">
        <button onClick={onCancel} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
          {saving ? "Saving…" : employer ? "Save Changes" : "Add Employer"}
        </button>
      </div>
    </div>
  );
}
