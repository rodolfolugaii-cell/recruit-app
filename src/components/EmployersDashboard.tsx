"use client";

/**
 * EmployersDashboard.tsx — /dashboard/employers
 *
 * The households helpers get placed with. Cards rather than a list, to match
 * the Candidates board: an employer is something you browse and recognise, and
 * the banner plus logo is how a recruiter picks the right one at a glance.
 *
 * Each card also shows how many helpers are currently assigned, counted from
 * applicants.employer_id — that link is what lets an ID 407 contract be filled
 * with an employer's residence and household details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import EmployerForm from "@/components/EmployerForm";
import { supabase } from "@/lib/supabase";
import {
  employerInitials, employerTint, fetchEmployers, employerSetupHint,
  type Employer,
} from "@/lib/employers";

const STATUS_STYLE: Record<string, string> = {
  Active:   "bg-emerald-100 text-emerald-800",
  Prospect: "bg-amber-100 text-amber-800",
  Inactive: "bg-gray-200 text-gray-600",
};

/** One line of the little detail block on a card. */
function CardLine({ icon, value }: { icon: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-gray-500">
      <span className="flex-shrink-0 leading-4">{icon}</span>
      <span className="min-w-0 truncate" title={value}>{value}</span>
    </div>
  );
}

export default function EmployersDashboard() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");

  // null = closed; "new" = adding; an Employer = editing that one
  const [editing, setEditing] = useState<Employer | "new" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchEmployers();
      setEmployers(rows);

      // How many helpers each employer has. A missing employer_id column is the
      // same first-run state as a missing table, so it degrades to zero counts
      // rather than blanking the whole page.
      const { data, error: cErr } = await supabase
        .from("applicants")
        .select("employer_id")
        .not("employer_id", "is", null);
      if (!cErr && data) {
        const tally: Record<string, number> = {};
        (data as { employer_id: string | null }[]).forEach(r => {
          if (r.employer_id) tally[r.employer_id] = (tally[r.employer_id] ?? 0) + 1;
        });
        setCounts(tally);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const handleSaved = (saved: Employer) => {
    setEmployers(prev => {
      const without = prev.filter(e => e.id !== saved.id);
      return [saved, ...without];
    });
    setEditing(null);
  };

  const handleDelete = async (emp: Employer) => {
    const assigned = counts[emp.id] ?? 0;
    const warning = assigned
      ? `\n\n${assigned} helper${assigned === 1 ? " is" : "s are"} assigned to this employer. They will be left unassigned.`
      : "";
    if (!confirm(`Delete "${emp.name}" permanently?${warning}`)) return;
    try {
      const { error: dErr } = await supabase.from("employers").delete().eq("id", emp.id);
      if (dErr) throw new Error(employerSetupHint(dErr.message) ?? dErr.message);
      setEmployers(prev => prev.filter(e => e.id !== emp.id));
    } catch (e) {
      alert("Could not delete: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter(e =>
      [e.name, e.contact_person, e.address, e.email, e.phone]
        .some(v => v?.toLowerCase().includes(q))
    );
  }, [employers, search]);

  if (loading) {
    return <div className="text-gray-500 text-sm">Loading employers…</div>;
  }

  return (
    <div>
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employers…"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
        />
        <span className="text-sm text-gray-400">
          {visible.length} of {employers.length}
        </span>
        <button
          onClick={() => setEditing("new")}
          className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          + Add Employer
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Empty state ── */}
      {!error && !employers.length && (
        <div className="p-10 rounded-xl border border-dashed border-gray-300 bg-white text-center">
          <p className="text-4xl mb-3">🏢</p>
          <h3 className="font-semibold text-gray-800">No employers yet</h3>
          <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
            Add the households you place helpers with. Their residence, family size and
            facilities fill the parts of the ID 407 contract that the apply form cannot.
          </p>
          <button
            onClick={() => setEditing("new")}
            className="mt-5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            + Add your first employer
          </button>
        </div>
      )}

      {/* ── Card grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visible.map(emp => {
          const tint     = employerTint(emp.name);
          const ed       = emp.employer_data ?? {};
          const assigned = counts[emp.id] ?? 0;
          const household = [
            ed.adults       && `${ed.adults} adult${ed.adults === "1" ? "" : "s"}`,
            ed.minors5to18  && `${ed.minors5to18} aged 5–18`,
            ed.minorsUnder5 && `${ed.minorsUnder5} under 5`,
          ].filter(Boolean).join(" · ");

          return (
            <div key={emp.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">

              {/* Banner */}
              <div className="h-20 bg-gradient-to-br from-slate-700 to-slate-900 relative">
                {emp.banner_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emp.banner_url} alt="" className="w-full h-full object-cover" />
                )}
                {emp.status && (
                  <span className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLE[emp.status] ?? STATUS_STYLE.Inactive}`}>
                    {emp.status}
                  </span>
                )}
              </div>

              {/* Identity */}
              <div className="px-5 pb-4 -mt-6">
                <div className={`w-14 h-14 rounded-xl border-4 border-white shadow-sm overflow-hidden flex items-center justify-center ${tint.bg}`}>
                  {emp.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={emp.logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className={`text-base font-black ${tint.text}`}>{employerInitials(emp.name)}</span>
                  )}
                </div>
                <h3 className="mt-2.5 font-bold text-gray-900 truncate" title={emp.name}>{emp.name}</h3>
                {emp.contact_person && (
                  <p className="text-xs text-blue-600 font-medium mt-0.5 truncate">{emp.contact_person}</p>
                )}
              </div>

              {/* Details */}
              <div className="px-5 pb-4 space-y-1.5 flex-grow">
                <CardLine icon="📍" value={ed.residenceAddress || emp.address} />
                <CardLine icon="📞" value={emp.phone} />
                <CardLine icon="✉️" value={emp.email} />
                <CardLine icon="🏠" value={ed.flatSize ? `${ed.flatSize} ${ed.flatSizeUnit ?? ""}`.trim() : null} />
                <CardLine icon="👪" value={household || null} />
              </div>

              {/* Footer */}
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  {assigned
                    ? `${assigned} helper${assigned === 1 ? "" : "s"} assigned`
                    : "No helpers assigned"}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(emp)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(emp)}
                    title="Delete employer"
                    className="px-2 py-1 rounded-md text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Add / edit modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-8 overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}>
            <EmployerForm
              employer={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={handleSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}
