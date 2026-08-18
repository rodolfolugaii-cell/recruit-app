"use client";

/**
 * EmployerAssign.tsx — showing and changing which employer a helper is placed with.
 *
 * Both boards render the badge, so an assignment made in For Review is visible
 * on the Candidates card too. Kept in one file rather than copied into each
 * dashboard: the two already duplicate their modals, and a badge that drifts
 * between them would be worse than the import.
 *
 * The assignment is what lets an ID 407 contract be filled — it joins the
 * helper's own details to the employer's residence, household and facilities.
 */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { employerInitials, employerTint, fetchEmployers, type Employer } from "@/lib/employers";

/**
 * Every employer, plus a lookup by id.
 *
 * A missing `employers` table is a normal first-run state, so a failure here
 * leaves an empty directory and the boards simply show no badges — it must not
 * take the applicant list down with it.
 */
export function useEmployerDirectory() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setEmployers(await fetchEmployers());
      } catch {
        setEmployers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const byId = useMemo(
    () => new Map(employers.map(e => [e.id, e])),
    [employers],
  );

  return { employers, byId, loading };
}

/**
 * The employer pill shown on an applicant card. Renders nothing when the helper
 * is unassigned — a board of "Unassigned" chips is noise, and the picker in the
 * profile modal is where that gets set.
 */
export function EmployerBadge({
  employer, className = "",
}: { employer?: Employer | null; className?: string }) {
  if (!employer) return null;
  const tint = employerTint(employer.name);
  return (
    <span
      title={`Assigned to ${employer.name}`}
      className={`inline-flex items-center gap-1.5 max-w-full text-[10px] font-semibold px-2 py-0.5 rounded-full ${tint.bg} ${tint.text} ${className}`}
    >
      {employer.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={employer.logo_url} alt="" className="w-3 h-3 rounded-sm object-cover flex-shrink-0" />
      ) : (
        <span className="w-3 h-3 rounded-sm bg-white/60 flex items-center justify-center text-[7px] font-black flex-shrink-0">
          {employerInitials(employer.name)}
        </span>
      )}
      <span className="truncate">{employer.name}</span>
    </span>
  );
}

/**
 * Assign or re-assign a helper. Writes straight through on change — there is no
 * separate save, because the only thing being edited is a single foreign key and
 * a half-made assignment has no meaning.
 */
export function EmployerPicker({
  applicantId, value, employers, onAssigned,
}: {
  applicantId: string;
  value?: string | null;
  employers: Employer[];
  onAssigned: (employerId: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const change = async (next: string) => {
    const employerId = next || null;
    setSaving(true);
    setError(null);
    try {
      const { error: uErr } = await supabase
        .from("applicants")
        .update({ employer_id: employerId })
        .eq("id", applicantId);
      if (uErr) throw uErr;
      onAssigned(employerId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(/employer_id/.test(msg)
        ? "Assignment needs a one-time database update — see the SQL in src/lib/employers.ts."
        : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <select
          value={value ?? ""}
          disabled={saving}
          onChange={e => change(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white disabled:opacity-50"
        >
          <option value="">— Unassigned —</option>
          {employers.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {saving && <span className="text-xs text-gray-400 flex-shrink-0">Saving…</span>}
      </div>
      {!employers.length && (
        <p className="mt-1 text-[11px] text-gray-400">
          No employers yet — add one on the Employers page.
        </p>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
