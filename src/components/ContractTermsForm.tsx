"use client";

/**
 * ContractTermsForm.tsx — the agency's half of an ID 407 contract.
 *
 * Everything here is set by the agency before the contract goes out, because
 * these are the commercial terms: the wage must not fall below the minimum
 * allowable wage, and clause 2 has to match the helper's actual immigration
 * situation. The signing links show these back read-only.
 *
 * The employer's residence, household and facilities are NOT here — they live
 * on the employer record, since they are the same for every helper that
 * household takes on.
 */

import { useState } from "react";
import SignaturePad from "@/components/SignaturePad";
import {
  CLAUSE_2_OPTIONS, DUTY_FIELDS,
  updateContract, uploadSignature,
  type Contract, type ContractTerms, type DutyKey,
} from "@/lib/contracts";

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

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none py-1">
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

/** A witness line: a typed name plus a signature captured on the spot. */
function Witness({
  title, name, signature, onName, onSignature,
}: {
  title: string; name: string | null; signature: string | null;
  onName: (v: string) => void; onSignature: (dataUrl: string | null) => void;
}) {
  const [replacing, setReplacing] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
      <Field label="Name of Witness">
        <input value={name ?? ""} onChange={e => onName(e.target.value)} className={inp} />
      </Field>
      {signature && !replacing ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signature} alt="Witness signature" className="h-12 border border-gray-200 rounded bg-white" />
          <button onClick={() => setReplacing(true)}
            className="text-xs font-medium text-blue-600 hover:underline">Re-sign</button>
        </div>
      ) : (
        <div>
          <label className={lbl}>Signature of Witness</label>
          <div className="mt-1 rounded-md border border-gray-200 overflow-hidden bg-white">
            <SignaturePad onChange={onSignature} height={110} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Component ────────────────────────────────────────────────────────────── */
export default function ContractTermsForm({
  contract, onCancel, onSaved,
}: {
  contract: Contract;
  onCancel: () => void;
  onSaved: (saved: Contract) => void;
}) {
  const [terms, setTerms]   = useState<ContractTerms>(() => ({ ...(contract.terms ?? {}) }));
  const [wNames, setWNames] = useState({
    employer: contract.employer_witness_name ?? "",
    helper:   contract.helper_witness_name   ?? "",
  });
  // Freshly drawn PNGs, uploaded on save; null means "keep what is stored"
  const [wSigs, setWSigs] = useState<{ employer: string | null; helper: string | null }>({
    employer: null, helper: null,
  });
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ContractTerms>(k: K, v: ContractTerms[K]) =>
    setTerms(p => ({ ...p, [k]: v }));

  const toggleDuty = (k: DutyKey) =>
    setTerms(p => ({ ...p, duties: { ...(p.duties ?? {}), [k]: !p.duties?.[k] } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only upload a witness signature that was actually re-drawn
      const [empSig, helSig] = await Promise.all([
        wSigs.employer ? uploadSignature(wSigs.employer, "witness-employer") : Promise.resolve(null),
        wSigs.helper   ? uploadSignature(wSigs.helper,   "witness-helper")   : Promise.resolve(null),
      ]);

      const saved = await updateContract(contract.id, {
        terms,
        employer_witness_name:      wNames.employer || null,
        helper_witness_name:        wNames.helper   || null,
        ...(empSig ? { employer_witness_signature: empSig } : {}),
        ...(helSig ? { helper_witness_signature:   helSig } : {}),
      });
      onSaved(saved);
    } catch (e) {
      alert("Failed to save: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const locked = contract.status === "Signed";

  return (
    <div className="flex flex-col">
      <div className="p-5 space-y-1">

        {locked && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-100 text-xs text-amber-800">
            Both parties have signed, so the terms are locked — the signed contract
            has to stay the one that was agreed. Issue a new contract to change them.
            Witness names and signatures can still be added below.
          </div>
        )}

        {/* Once both parties have signed, the terms are what they agreed to and
            must stop being editable. A disabled fieldset locks every control
            inside it in one go; `contents` keeps the grid layout unchanged.
            Witnesses stay editable below — agency staff may attest afterwards. */}
        <fieldset disabled={locked} className="contents">

        {/* ── Contract ── */}
        <Section title="Contract" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="D. H. Contract No.">
            <input value={terms.contractNo ?? ""} onChange={e => set("contractNo", e.target.value)}
              placeholder="e.g. Q 363060" className={inp} />
          </Field>
          <Field label="Date of contract">
            <input type="date" value={terms.contractDate ?? ""} onChange={e => set("contractDate", e.target.value)} className={inp} />
          </Field>
          <Field label="Helper's place of origin">
            <input value={terms.placeOfOrigin ?? ""} onChange={e => set("placeOfOrigin", e.target.value)}
              placeholder="The Philippines" className={inp} />
          </Field>
        </div>

        {/* ── Commencement ── */}
        <Section
          title="Commencement — Clause 2"
          note="Use 2A, 2B or 2C, whichever fits. Only one may be used."
        />
        <div className="space-y-1">
          {CLAUSE_2_OPTIONS.map(o => (
            <label key={o.value} className="flex items-start gap-2 cursor-pointer py-1">
              <input type="radio" name="clause2" checked={terms.clause2 === o.value}
                onChange={() => set("clause2", o.value)} className="mt-0.5 accent-blue-600" />
              <span className="text-xs text-gray-700">{o.label}</span>
            </label>
          ))}
        </div>
        {terms.clause2 === "B" && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Commencing on">
              <input type="date" value={terms.clause2bCommenceDate ?? ""} onChange={e => set("clause2bCommenceDate", e.target.value)} className={inp} />
            </Field>
            <Field label="Following D. H. Contract No.">
              <input value={terms.clause2bPreviousNo ?? ""} onChange={e => set("clause2bPreviousNo", e.target.value)} className={inp} />
            </Field>
          </div>
        )}

        {/* ── Wages ── */}
        <Section
          title="Wages and food — Clause 5"
          note="Wages must not be less than the Minimum Allowable Wage prevailing at the date of the contract."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Monthly wages (HK$)">
            <input value={terms.wages ?? ""} onChange={e => set("wages", e.target.value)}
              inputMode="decimal" placeholder="0" className={inp} />
          </Field>
          <Field label="Food">
            <select value={terms.foodArrangement ?? ""} onChange={e => set("foodArrangement", e.target.value)} className={inp}>
              <option value="">—</option>
              <option value="provided">Provided free</option>
              <option value="allowance">Food allowance</option>
            </select>
          </Field>
          {terms.foodArrangement === "allowance" && (
            <Field label="Food allowance (HK$ / month)">
              <input value={terms.foodAllowance ?? ""} onChange={e => set("foodAllowance", e.target.value)}
                inputMode="decimal" placeholder="0" className={inp} />
            </Field>
          )}
        </div>
        <div className="mt-3">
          <Field label="Other fees and expenses — Clause 8(vi)">
            <input value={terms.otherFees ?? ""} onChange={e => set("otherFees", e.target.value)} className={inp} />
          </Field>
        </div>

        {/* ── Duties ── */}
        <Section
          title="Domestic duties — Schedule item 5"
          note="What this employer requires. Not the same as what the helper is able to do — her skills are on the biodata."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {DUTY_FIELDS.map(d => (
            <Check key={d.key} label={d.label}
              checked={!!terms.duties?.[d.key]} onChange={() => toggleDuty(d.key)} />
          ))}
        </div>
        {terms.duties?.agedPersons && (
          <div className="mt-2 max-w-xs">
            <Field label="Constant care or attention is…">
              <select value={terms.agedPersonsCare ?? ""} onChange={e => set("agedPersonsCare", e.target.value)} className={inp}>
                <option value="">—</option>
                <option value="required">required</option>
                <option value="not required">not required</option>
              </select>
            </Field>
          </div>
        )}
        <div className="mt-3">
          <Field label="Others — please specify">
            <textarea value={terms.dutiesOthers ?? ""} onChange={e => set("dutiesOthers", e.target.value)}
              rows={3} className={inp} />
          </Field>
        </div>

        </fieldset>

        {/* ── Witnesses ── */}
        <Section
          title="Witnesses"
          note="ID 407 needs a witness to each signature. These are signed here by agency staff."
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Witness
            title="Witness to the Employer"
            name={wNames.employer} signature={contract.employer_witness_signature}
            onName={v => setWNames(p => ({ ...p, employer: v }))}
            onSignature={v => setWSigs(p => ({ ...p, employer: v }))}
          />
          <Witness
            title="Witness to the Helper"
            name={wNames.helper} signature={contract.helper_witness_signature}
            onName={v => setWNames(p => ({ ...p, helper: v }))}
            onSignature={v => setWSigs(p => ({ ...p, helper: v }))}
          />
        </div>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 px-5 py-3 bg-white border-t border-gray-200">
        <button onClick={onCancel} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
          {saving ? "Saving…" : "Save Terms"}
        </button>
      </div>
    </div>
  );
}
