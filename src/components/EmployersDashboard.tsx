"use client";

/**
 * EmployersDashboard.tsx — /dashboard/employers
 *
 * The households helpers get placed with, drawn as a bracket: each employer is
 * a card on the left with a branch running out to the helpers placed with it,
 * and a "+" box at the foot of the branch to place another. Who works for whom
 * reads straight off the page instead of from a count.
 *
 * The link itself is applicants.employer_id — the same column the picker in the
 * profile modals writes, and what lets an ID 407 contract be filled with an
 * employer's residence and household details. Trashed helpers are left out:
 * they are off both boards, so drawing them here would only mislead.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import EmployerForm from "@/components/EmployerForm";
import { supabase } from "@/lib/supabase";
import { ageFrom } from "@/lib/formDates";
import {
  employerInitials, employerTint, fetchEmployers, employerSetupHint,
  type Employer,
} from "@/lib/employers";

const STATUS_STYLE: Record<string, string> = {
  Active:   "bg-emerald-100 text-emerald-800",
  Prospect: "bg-amber-100 text-amber-800",
  Inactive: "bg-gray-200 text-gray-600",
};

/** The slice of an applicant the bracket needs — kept small, form_data stays behind. */
interface Helper {
  id:              string;
  full_name:       string;
  nationality:     string | null;
  gender:          string | null;
  mobile:          string | null;
  photo_url:       string | null;
  date_of_birth:   string | null;
  status:          string | null;
  employer_id:     string | null;
  contract_status: string | null;
}

const HELPER_COLUMNS =
  "id, full_name, nationality, gender, mobile, photo_url, date_of_birth, status, employer_id, " +
  "contract_status:form_data->>contractStatus";

/** Which board a helper sits on — null status is a fresh submission on Candidates. */
const boardOf = (h: Helper) => (h.status === "For Review" ? "For Review" : "Candidates");

/* ── Branch geometry ─────────────────────────────────────────────────────────
   Every box on a branch is BOX_H tall with GAP between them, so the trunk and
   the ticks can be placed with fixed offsets instead of measuring the DOM.
   The stub from the employer card meets the trunk level with the middle of the
   first box. Keep these in step with the h-[88px] / gap-3 classes below. ── */
const BOX_H = 88;
const GAP   = 12;
const LINE  = "bg-slate-400";

/** One leaf on the branch: a tick into the box, and the trunk above and below it. */
function Branch({ first, last, children }: { first: boolean; last: boolean; children: React.ReactNode }) {
  return (
    <div className="relative">
      {/* trunk, upper half — joins the box above (on phones, the first one reaches up to the employer card) */}
      <span
        className={`absolute -left-5 w-0.5 ${LINE} ${first ? "md:hidden" : ""}`}
        style={{ top: -GAP / 2 - (first ? GAP / 2 : 0), height: BOX_H / 2 + GAP / 2 + (first ? GAP / 2 : 0) }}
      />
      {/* trunk, lower half — runs on to the box below */}
      {!last && (
        <span className={`absolute -left-5 w-0.5 ${LINE}`} style={{ top: BOX_H / 2, height: BOX_H / 2 + GAP / 2 }} />
      )}
      {/* tick */}
      <span className={`absolute -left-5 w-5 h-0.5 ${LINE}`} style={{ top: BOX_H / 2 - 1 }} />
      {children}
    </div>
  );
}

/** One line of the little detail block on an employer card. */
function CardLine({ icon, value }: { icon: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs text-gray-500">
      <span className="flex-shrink-0 leading-4">{icon}</span>
      <span className="min-w-0 truncate" title={value}>{value}</span>
    </div>
  );
}

function EmployerCard({
  emp, assigned, onEdit, onDelete,
}: { emp: Employer; assigned: number; onEdit: () => void; onDelete: () => void }) {
  const tint = employerTint(emp.name);
  const ed   = emp.employer_data ?? {};
  const household = [
    ed.adults       && `${ed.adults} adult${ed.adults === "1" ? "" : "s"}`,
    ed.minors5to18  && `${ed.minors5to18} aged 5–18`,
    ed.minorsUnder5 && `${ed.minorsUnder5} under 5`,
  ].filter(Boolean).join(" · ");

  return (
    // Darker outline, real shadow and a blue left edge — white on the page's
    // gray-50 alone all but disappears
    <div className="bg-white rounded-xl border border-slate-300 border-l-4 border-l-blue-500 shadow-md overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      {/* Banner */}
      <div className="h-16 bg-gradient-to-br from-slate-700 to-slate-900 relative">
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
      {/* relative: without it the positioned banner paints over the logo's top half */}
      <div className="relative px-5 pb-3 -mt-6">
        <div className={`w-12 h-12 rounded-xl border-4 border-white shadow-sm overflow-hidden flex items-center justify-center ${tint.bg}`}>
          {emp.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emp.logo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className={`text-sm font-black ${tint.text}`}>{employerInitials(emp.name)}</span>
          )}
        </div>
        <h3 className="mt-2 font-bold text-gray-900 truncate" title={emp.name}>{emp.name}</h3>
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
          {assigned ? `${assigned} helper${assigned === 1 ? "" : "s"}` : "No helpers yet"}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={onEdit}
            className="px-2.5 py-1 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors">
            Edit
          </button>
          <button onClick={onDelete} title="Delete employer"
            className="px-2 py-1 rounded-md text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

/** The helper's photo, or a grey tile — shared by the branch card and the picker. */
function HelperPhoto({ h, size }: { h: Helper; size: string }) {
  return (
    <div className={`${size} rounded-lg overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0 flex items-center justify-center`}>
      {h.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={h.photo_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[9px] text-gray-400">No Photo</span>
      )}
    </div>
  );
}

function HelperCard({ h, busy, onRemove }: { h: Helper; busy: boolean; onRemove: () => void }) {
  const age  = ageFrom(h.date_of_birth);
  const meta = [h.nationality, age && `${age} yrs`].filter(Boolean).join(" · ");
  return (
    // Left edge matches the board pill: amber for For Review, green for Candidates
    <div className={`h-[88px] bg-white rounded-xl border border-slate-300 border-l-4 shadow-md px-3 flex items-center gap-3 hover:shadow-lg transition-shadow ${
      boardOf(h) === "For Review" ? "border-l-amber-400" : "border-l-emerald-400"
    }`}>
      <HelperPhoto h={h} size="w-14 h-14" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-gray-900 truncate" title={h.full_name}>{h.full_name}</p>
        <p className="text-xs text-blue-600 truncate">{meta || "—"}</p>
        {h.mobile && <p className="text-[11px] text-gray-500 truncate">{h.mobile}</p>}
        <div className="mt-0.5 flex items-center gap-1 min-w-0">
          <span className={`text-[10px] px-1.5 py-px rounded-full font-semibold flex-shrink-0 ${
            boardOf(h) === "For Review" ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-700"
          }`}>
            {boardOf(h)}
          </span>
          {h.contract_status && (
            <span className="text-[10px] px-1.5 py-px rounded-full bg-gray-100 text-gray-500 truncate" title={h.contract_status}>
              {h.contract_status}
            </span>
          )}
        </div>
      </div>
      <button onClick={onRemove} disabled={busy} title="Remove from this employer"
        className="self-start mt-2 px-1.5 py-0.5 rounded-md text-xs text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40">
        {busy ? "…" : "✕"}
      </button>
    </div>
  );
}

/* ── Picker: place a helper with an employer ─────────────────────────────── */
function AssignHelperDialog({
  employer, helpers, employersById, onPick, onClose,
}: {
  employer: Employer;
  helpers: Helper[];
  employersById: Map<string, Employer>;
  onPick: (h: Helper) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ]         = useState("");
  const [busyId, setBusy] = useState<string | null>(null);

  // Unplaced helpers first — they are the usual answer — then the rest by name
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return helpers
      .filter(h => h.employer_id !== employer.id)
      .filter(h => !needle || [h.full_name, h.mobile, h.nationality].some(v => v?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(!!a.employer_id) - Number(!!b.employer_id) || a.full_name.localeCompare(b.full_name));
  }, [helpers, employer.id, q]);

  const pick = async (h: Helper) => {
    setBusy(h.id);
    try { await onPick(h); } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md my-12 overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Add a helper</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">to <span className="font-semibold text-gray-700">{employer.name}</span></p>
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search by name, mobile or nationality…"
            className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-100">
          {!list.length && <p className="p-6 text-center text-sm text-gray-400">No helpers match.</p>}
          {list.map(h => {
            const current = h.employer_id ? employersById.get(h.employer_id) : null;
            return (
              <button key={h.id} onClick={() => pick(h)} disabled={!!busyId}
                className="w-full px-5 py-2.5 flex items-center gap-3 text-left hover:bg-blue-50/60 transition-colors disabled:opacity-50">
                <HelperPhoto h={h} size="w-10 h-10" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{h.full_name}</p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {[h.nationality, h.mobile, boardOf(h)].filter(Boolean).join(" · ")}
                  </p>
                  {current && (
                    <p className="text-[11px] text-amber-600 truncate">Currently with {current.name} — will be moved</p>
                  )}
                </div>
                <span className="text-xs font-semibold text-blue-600 flex-shrink-0">
                  {busyId === h.id ? "Adding…" : "Add"}
                </span>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmployersDashboard() {
  const [employers, setEmployers] = useState<Employer[]>([]);
  const [helpers, setHelpers]     = useState<Helper[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [busyHelper, setBusyHelper] = useState<string | null>(null);

  // null = closed; "new" = adding; an Employer = editing that one
  const [editing, setEditing]     = useState<Employer | "new" | null>(null);
  // The employer whose "+" box was clicked
  const [addingTo, setAddingTo]   = useState<Employer | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEmployers(await fetchEmployers());

      // Every helper still on a board. A missing employer_id column is the same
      // first-run state as a missing table, so it degrades to empty branches
      // rather than blanking the whole page.
      const { data, error: hErr } = await supabase
        .from("applicants")
        .select(HELPER_COLUMNS)
        .or("status.is.null,status.neq.Deleted")
        .order("full_name");
      if (!hErr && data) setHelpers(data as unknown as Helper[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const employersById = useMemo(() => new Map(employers.map(e => [e.id, e])), [employers]);

  const helpersByEmployer = useMemo(() => {
    const map = new Map<string, Helper[]>();
    helpers.forEach(h => {
      if (h.employer_id) map.set(h.employer_id, [...(map.get(h.employer_id) ?? []), h]);
    });
    return map;
  }, [helpers]);

  /** Write a helper's employer_id, then mirror it locally. */
  const setEmployerOf = useCallback(async (helperId: string, employerId: string | null) => {
    const { error: uErr } = await supabase
      .from("applicants")
      .update({ employer_id: employerId })
      .eq("id", helperId);
    if (uErr) throw uErr;
    setHelpers(list => list.map(h => (h.id === helperId ? { ...h, employer_id: employerId } : h)));
  }, []);

  const handleAssign = useCallback(async (h: Helper) => {
    if (!addingTo) return;
    try {
      await setEmployerOf(h.id, addingTo.id);
    } catch (e) {
      alert("Could not add helper: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [addingTo, setEmployerOf]);

  const handleRemove = async (h: Helper, emp: Employer) => {
    if (!confirm(`Remove ${h.full_name} from ${emp.name}?\n\nThe helper stays on their board, just unassigned.`)) return;
    setBusyHelper(h.id);
    try {
      await setEmployerOf(h.id, null);
    } catch (e) {
      alert("Could not remove helper: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyHelper(null);
    }
  };

  const handleSaved = (saved: Employer) => {
    setEmployers(prev => {
      const without = prev.filter(e => e.id !== saved.id);
      return [saved, ...without];
    });
    setEditing(null);
  };

  const handleDelete = async (emp: Employer) => {
    const assigned = helpersByEmployer.get(emp.id)?.length ?? 0;
    const warning = assigned
      ? `\n\n${assigned} helper${assigned === 1 ? " is" : "s are"} assigned to this employer. They will be left unassigned.`
      : "";
    if (!confirm(`Delete "${emp.name}" permanently?${warning}`)) return;
    try {
      const { error: dErr } = await supabase.from("employers").delete().eq("id", emp.id);
      if (dErr) throw new Error(employerSetupHint(dErr.message) ?? dErr.message);
      setEmployers(prev => prev.filter(e => e.id !== emp.id));
      setHelpers(list => list.map(h => (h.employer_id === emp.id ? { ...h, employer_id: null } : h)));
    } catch (e) {
      alert("Could not delete: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Searching a helper's name finds the employer they are placed with
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter(e =>
      [e.name, e.contact_person, e.address, e.email, e.phone].some(v => v?.toLowerCase().includes(q)) ||
      (helpersByEmployer.get(e.id) ?? []).some(h => h.full_name.toLowerCase().includes(q))
    );
  }, [employers, helpersByEmployer, search]);

  const unplaced = helpers.filter(h => !h.employer_id).length;

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
          placeholder="Search employers or helpers…"
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none text-gray-900 bg-white"
        />
        <span className="text-sm text-gray-400">
          {visible.length} of {employers.length}
          {helpers.length > 0 && ` · ${unplaced} helper${unplaced === 1 ? "" : "s"} unassigned`}
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

      {/* ── Brackets: employer → branch → helpers ── */}
      <div className="space-y-8">
        {visible.map(emp => {
          const placed = helpersByEmployer.get(emp.id) ?? [];
          return (
            <div key={emp.id} className="flex flex-col md:flex-row md:items-start">
              <div className="w-full md:w-80 flex-shrink-0">
                <EmployerCard
                  emp={emp}
                  assigned={placed.length}
                  onEdit={() => setEditing(emp)}
                  onDelete={() => handleDelete(emp)}
                />
              </div>

              {/* The branch. On wide screens a stub leaves the card's right edge
                  level with the first box; on phones the trunk drops from above. */}
              <div className="relative flex-1 min-w-0 pl-10 mt-3 md:mt-0 md:max-w-md">
                <span className={`hidden md:block absolute left-0 w-5 h-0.5 ${LINE}`} style={{ top: BOX_H / 2 - 1 }} />
                <div className="flex flex-col gap-3">
                  {placed.map((h, i) => (
                    <Branch key={h.id} first={i === 0} last={false}>
                      <HelperCard h={h} busy={busyHelper === h.id} onRemove={() => handleRemove(h, emp)} />
                    </Branch>
                  ))}
                  <Branch first={!placed.length} last>
                    <button
                      onClick={() => setAddingTo(emp)}
                      className="w-full h-[88px] rounded-xl border-2 border-dashed border-slate-400 bg-white/60 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <span className="text-xl leading-none">＋</span> Add helper
                    </button>
                  </Branch>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Add helper picker ── */}
      {addingTo && (
        <AssignHelperDialog
          employer={addingTo}
          helpers={helpers}
          employersById={employersById}
          onPick={handleAssign}
          onClose={() => setAddingTo(null)}
        />
      )}

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
