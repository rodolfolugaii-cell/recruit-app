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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EmployerForm from "@/components/EmployerForm";
import ApplicantProfileModal, { type ProfileApplicant } from "@/components/ApplicantProfileModal";
import EmployeeId, { EmployerId } from "@/components/EmployeeId";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE, invalidatePaged, pageCountFor, pageSlice } from "@/lib/pagedCache";
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
  employee_code:   string | null;
}

const HELPER_COLUMNS =
  "id, full_name, nationality, gender, mobile, photo_url, date_of_birth, status, employer_id, employee_code, " +
  "contract_status:form_data->>contractStatus";

/** Which board a helper sits on — null status is a fresh submission on Candidates. */
const boardOf = (h: Helper) => (h.status === "For Review" ? "For Review" : "Candidates");

/* ── Branch geometry ─────────────────────────────────────────────────────────
   Boxes stack PER_COLUMN deep, then a new column starts to the right. A bus
   line runs along the top of the columns, and each column's trunk drops from
   it with a tick into every box.

   Every box is BOX_H tall with GAP between them, and every column is the same
   width, so all the lines are placed with fixed offsets instead of measuring
   the DOM. Keep these in step with the h-[104px] / gap-3 / w-72 / pl-10 / pt-5
   classes below.

        stub ─┬──────────────── bus ─────────┬──
              ├─ box                          ├─ box
              ├─ box          …               └─ ＋
              └─ box (5th)                                                   */
const PER_COLUMN = 5;
const BOX_H      = 104;
const GAP        = 12;
const COL_GAP    = 40;   // between columns
const BUS_SPACE  = 20;   // pt-5 — room above the boxes for the bus
const BUS_Y      = BUS_SPACE / 2;
const TRUNK_X    = 20;   // -left-5 inside a pl-10 column
const LINE       = "bg-slate-400";

/**
 * One leaf on the branch: a tick into the box, and the trunk above and below
 * it. The first box in a column reaches up to the bus rather than to a box.
 */
function Branch({
  first, last, noBusOnWide = false, children,
}: {
  first: boolean; last: boolean;
  /** A lone column on a wide screen has no bus — the stub meets the tick, so nothing should rise above it. */
  noBusOnWide?: boolean;
  children: React.ReactNode;
}) {
  const reach = first ? BUS_SPACE - BUS_Y : GAP / 2;
  return (
    <div className="relative">
      {/* trunk, upper half */}
      <span className={`absolute -left-5 w-0.5 ${LINE} ${noBusOnWide ? "md:hidden" : ""}`}
        style={{ top: -reach, height: BOX_H / 2 + reach }} />
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

/** Split a list into runs of `n`. */
function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
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
        <EmployerId code={emp.employer_code} className="mt-2" />
        <h3 className="mt-1.5 font-bold text-gray-900 truncate" title={emp.name}>{emp.name}</h3>
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
          <button onClick={onDelete} title="Move to Trash"
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

function HelperCard({
  h, busy, opening, onOpen, onRemove,
}: { h: Helper; busy: boolean; opening: boolean; onOpen: () => void; onRemove: () => void }) {
  const age  = ageFrom(h.date_of_birth);
  const meta = [h.nationality, age && `${age} yrs`].filter(Boolean).join(" · ");
  return (
    // Left edge matches the board pill: amber for For Review, green for Candidates
    <div
      role="button" tabIndex={0} title="View full profile"
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`relative h-[104px] bg-white rounded-xl border border-slate-300 border-l-4 shadow-md pl-3 pr-8 flex items-center gap-3 cursor-pointer hover:shadow-lg hover:border-slate-400 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
        boardOf(h) === "For Review" ? "border-l-amber-400" : "border-l-emerald-400"
      } ${opening ? "opacity-60" : ""}`}
    >
      <HelperPhoto h={h} size="w-14 h-14" />
      <div className="min-w-0 flex-1">
        <EmployeeId code={h.employee_code} className="mb-1" />
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
      <button onClick={e => { e.stopPropagation(); onRemove(); }} onKeyDown={e => e.stopPropagation()}
        disabled={busy} title="Remove from this employer" aria-label="Remove from this employer"
        className="absolute top-2 right-2 w-5 h-5 rounded-md bg-red-500 text-white flex items-center justify-center shadow-sm hover:bg-red-600 transition-colors disabled:opacity-40">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
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

  // Unplaced helpers first — they are the usual answer — then the rest by name.
  // A link to a trashed employer is not a placement.
  const list = useMemo(() => {
    const placed = (h: Helper) => !!h.employer_id && employersById.has(h.employer_id);
    const needle = q.trim().toLowerCase();
    return helpers
      .filter(h => h.employer_id !== employer.id)
      .filter(h => !needle || [h.full_name, h.mobile, h.nationality, h.employee_code].some(v => v?.toLowerCase().includes(needle)))
      .sort((a, b) => Number(placed(a)) - Number(placed(b)) || a.full_name.localeCompare(b.full_name));
  }, [helpers, employer.id, employersById, q]);

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
            placeholder="Search by name, ID, mobile or nationality…"
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
                  <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                    <EmployeeId code={h.employee_code} className="flex-shrink-0" />
                    <span className="truncate">{h.full_name}</span>
                  </p>
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
  // 15 employers a page. Employer rows are light, so they are all loaded and
  // split here; only the page on screen renders, so only its images load.
  const [page, setPage]           = useState(1);
  const rootRef = useRef<HTMLDivElement>(null);
  const [busyHelper, setBusyHelper] = useState<string | null>(null);

  // null = closed; "new" = adding; an Employer = editing that one
  const [editing, setEditing]     = useState<Employer | "new" | null>(null);
  // The employer whose "+" box was clicked
  const [addingTo, setAddingTo]   = useState<Employer | null>(null);
  // The helper whose profile is open — the full row, fetched on click
  const [profile, setProfile]     = useState<ProfileApplicant | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

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
    invalidatePaged("applicants:");   // the boards' cards show the employer badge
  }, []);

  const handleAssign = useCallback(async (h: Helper) => {
    if (!addingTo) return;
    try {
      await setEmployerOf(h.id, addingTo.id);
    } catch (e) {
      alert("Could not add helper: " + (e instanceof Error ? e.message : String(e)));
    }
  }, [addingTo, setEmployerOf]);

  /* ── Profile modal ─────────────────────────────────────────────────────────
     The branch only holds a slice of each helper, so the full row is fetched
     when a card is clicked — the same record For Review opens. ── */
  const openHelper = async (h: Helper) => {
    if (openingId) return;
    setOpeningId(h.id);
    try {
      const { data, error: pErr } = await supabase.from("applicants").select("*").eq("id", h.id).single();
      if (pErr) throw pErr;
      setProfile(data as ProfileApplicant);
    } catch (e) {
      alert("Could not open the profile: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setOpeningId(null);
    }
  };

  // The modal has already written the change; mirror it into the branch, so
  // an edited name or a new employer moves the card without a reload
  const handleProfileChange = useCallback((u: ProfileApplicant) => {
    setProfile(u);
    invalidatePaged("applicants:");   // the boards' cached cards are now out of date
    setHelpers(list => list.map(h => (h.id !== u.id ? h : {
      ...h,
      full_name:       u.full_name,
      nationality:     u.nationality ?? null,
      gender:          u.gender ?? null,
      mobile:          u.mobile ?? null,
      photo_url:       u.photo_url ?? null,
      date_of_birth:   u.date_of_birth ?? null,
      employer_id:     u.employer_id ?? null,
      contract_status: u.form_data?.contractStatus || null,
      employee_code:   u.employee_code ?? null,
    })));
  }, []);

  const handleEmployerCreated = useCallback((e: Employer) => {
    setEmployers(prev => (prev.some(x => x.id === e.id) ? prev : [e, ...prev]));
  }, []);

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

  /* ── Move to Trash ─────────────────────────────────────────────────────────
     A soft delete: deleted_at is set and the row stays. The helpers' links are
     left alone, so Restore on the Trash page brings the whole branch back;
     until then they count as unassigned everywhere. Only deleting it from the
     Trash erases the employer for good. ── */
  const handleDelete = async (emp: Employer) => {
    const assigned = helpersByEmployer.get(emp.id)?.length ?? 0;
    const note = assigned
      ? `\n\n${assigned} helper${assigned === 1 ? " is" : "s are"} assigned to this employer. They will show as unassigned until the employer is restored.`
      : "";
    if (!confirm(`Move "${emp.name}" to the Trash?\n\nYou can restore it from the Trash page.${note}`)) return;
    try {
      const { error: dErr } = await supabase
        .from("employers")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", emp.id);
      if (dErr) {
        throw new Error(/deleted_at/.test(dErr.message)
          ? "Moving employers to the Trash needs a one-time database update — run supabase/migrations/20261031000300_employer_trash.sql."
          : employerSetupHint(dErr.message) ?? dErr.message);
      }
      setEmployers(prev => prev.filter(e => e.id !== emp.id));
    } catch (e) {
      alert("Could not move to Trash: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // Searching a helper's name finds the employer they are placed with
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employers;
    return employers.filter(e =>
      [e.name, e.employer_code, e.contact_person, e.address, e.email, e.phone].some(v => v?.toLowerCase().includes(q)) ||
      (helpersByEmployer.get(e.id) ?? []).some(h =>
        h.full_name.toLowerCase().includes(q) || !!h.employee_code?.toLowerCase().includes(q))
    );
  }, [employers, helpersByEmployer, search]);

  // A helper whose employer is in the Trash counts as unassigned
  // A delete can leave the page past the end — show the last one instead
  const pageCount = pageCountFor(visible.length);
  const pageNow   = Math.min(page, pageCount);
  const onPage    = pageSlice(visible, pageNow, PAGE_SIZE);

  const unplaced = helpers.filter(h => !h.employer_id || !employersById.has(h.employer_id)).length;

  if (loading) {
    return <div className="text-gray-500 text-sm">Loading employers…</div>;
  }

  return (
    <div ref={rootRef} className="scroll-mt-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
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
        {onPage.map(emp => {
          const placed = helpersByEmployer.get(emp.id) ?? [];
          // The "+" box is the last slot, so it moves to a new column once the
          // current one holds five
          const columns = chunk<Helper | null>([...placed, null], PER_COLUMN);
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
                  and meets the first trunk level with the first box; on phones
                  a short drop joins the card above to the bus. The stubs sit
                  outside the scroller, which would otherwise clip them. */}
              <div className="relative flex-1 min-w-0 mt-3 md:mt-0">
                <span className={`hidden md:block absolute left-0 h-0.5 ${LINE}`}
                  style={{ top: BUS_SPACE + BOX_H / 2 - 1, width: TRUNK_X }} />
                <span className={`md:hidden absolute w-0.5 ${LINE}`}
                  style={{ left: TRUNK_X, top: -12, height: 12 + BUS_Y }} />

                {/* Columns run sideways; too many for the screen scroll rather than wrap */}
                <div className="overflow-x-auto pb-3">
                  <div className="flex items-start w-max" style={{ gap: COL_GAP }}>
                    {columns.map((col, c) => (
                      <div key={c} className="relative w-72 flex-shrink-0 pl-10 pt-5">
                        {/* bus — from this trunk across to the next column's */}
                        {c < columns.length - 1 && (
                          <span className={`absolute h-0.5 ${LINE}`}
                            style={{ top: BUS_Y - 1, left: TRUNK_X, width: `calc(100% + ${COL_GAP}px)` }} />
                        )}
                        <div className="flex flex-col gap-3">
                          {col.map((h, i) => (
                            <Branch key={h?.id ?? "add"} first={i === 0} last={i === col.length - 1}
                              noBusOnWide={columns.length === 1 && i === 0}>
                              {h ? (
                                <HelperCard
                                  h={h}
                                  busy={busyHelper === h.id}
                                  opening={openingId === h.id}
                                  onOpen={() => openHelper(h)}
                                  onRemove={() => handleRemove(h, emp)}
                                />
                              ) : (
                                <button
                                  onClick={() => setAddingTo(emp)}
                                  className="w-full h-[104px] rounded-xl border-2 border-dashed border-slate-400 bg-white/60 text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                                >
                                  <span className="text-xl leading-none">＋</span> Add helper
                                </button>
                              )}
                            </Branch>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Pagination
        page={pageNow}
        pageCount={pageCount}
        total={visible.length}
        onChange={p => { setPage(p); rootRef.current?.scrollIntoView({ block: "start" }); }}
      />

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

      {/* ── Helper profile — the same modal as For Review ── */}
      {profile && (
        <ApplicantProfileModal
          key={profile.id}
          applicant={profile}
          employers={employers}
          employersById={employersById}
          onEmployerCreated={handleEmployerCreated}
          onApplicantChange={handleProfileChange}
          onClose={() => setProfile(null)}
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
