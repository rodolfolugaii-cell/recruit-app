"use client";

/**
 * TrashDashboard.tsx — /dashboard/trash
 *
 * Two sections, one per kind of record, each offering the same two exits:
 *
 *   Helpers     applicants whose status is "Deleted"
 *               Restore → back to the board it came from (deleted_from)
 *
 *   Employers   employers with deleted_at set
 *               Restore → back on the Employers page, still linked to the
 *               helpers who were assigned (trashing never clears employer_id)
 *
 *   Delete      removes the row AND its images from Storage, for good.
 *               A permanently deleted employer leaves its helpers unassigned
 *               (the foreign key is ON DELETE SET NULL); it never takes them
 *               with it.
 *
 * A list rather than the card grid used elsewhere: this is a recovery screen,
 * so "who / when / where from" matters more than the full profile.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 * applicants.deleted_at / deleted_from   20260818000100_applicants.sql
 * applicants.duplicate_of                20261031000100_applicant_duplicates.sql
 * employers.deleted_at                   20261031000300_employer_trash.sql
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DELETED_STATUS, PHOTO_BUCKET, storagePathFromUrl } from "@/components/TrashZone";
import { employerInitials, employerTint, type Employer } from "@/lib/employers";

interface TrashedApplicant {
  id: string;
  created_at: string;
  full_name: string;
  nationality: string | null;
  gender: string | null;
  mobile: string | null;
  photo_url: string | null;
  deleted_at: string | null;
  deleted_from: string | null;
  /** Set when /apply trashed a repeat submission — the id of the application kept */
  duplicate_of: string | null;
}

type TrashedEmployer = Employer & { deleted_at: string | null };

type Section = "helpers" | "employers";

/** What the permanent-delete dialog is about to erase */
type PurgeTarget =
  | { kind: "helper";   item: TrashedApplicant }
  | { kind: "employer"; item: TrashedEmployer };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Remove images from Storage. Logged, never thrown — an orphaned image is a
 *  smaller problem than a record that refuses to go away. */
async function removeImages(urls: (string | null | undefined)[]) {
  const paths = urls.map(storagePathFromUrl).filter(Boolean) as string[];
  if (!paths.length) return;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  if (error) console.warn("Could not remove some images:", error.message);
}

const trashedWhen = (at: string | null) =>
  at ? `Trashed ${new Date(at).toLocaleString()}` : "Trashed earlier";

/* ── Confirmation overlay (permanent delete + empty trash) ────────────────── */
function DangerConfirm({
  open, title, body, confirmLabel, busy, onCancel, onConfirm,
}: {
  open: boolean; title: string; body: string; confirmLabel: string;
  busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[10000]"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-2 leading-snug">{body}</p>
          <p className="text-xs text-red-600 font-medium mt-3">This cannot be undone.</p>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:bg-gray-300"
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── One row: thumbnail, who, where from, Restore + Delete ────────────────── */
function TrashRow({
  thumb, title, badge, subtitle, origin, when, busy, onRestore, onDelete,
}: {
  thumb: React.ReactNode; title: string; badge?: React.ReactNode; subtitle: string;
  origin: string; when: string; busy: boolean; onRestore: () => void; onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50/70 transition-colors">
      <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">{thumb}</div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-800 truncate">{title}{badge}</p>
        <p className="text-xs text-gray-400 truncate">{subtitle || "—"}</p>
      </div>

      <div className="hidden md:block text-right flex-shrink-0">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{origin}</span>
        <p className="text-[11px] text-gray-400 mt-1">{when}</p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onRestore} disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:bg-gray-300 whitespace-nowrap"
        >
          {busy ? "Restoring…" : "Restore"}
        </button>
        <button
          onClick={onDelete} disabled={busy} title="Delete permanently"
          className="text-xs font-medium px-3 py-1.5 rounded-md text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40 whitespace-nowrap"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function TrashDashboard() {
  const [section, setSection]   = useState<Section>("helpers");
  const [helpers, setHelpers]   = useState<TrashedApplicant[]>([]);
  const [employers, setEmployers] = useState<TrashedEmployer[]>([]);
  // How many helpers still point at each trashed employer — restoring reconnects them
  const [linked, setLinked]     = useState<Record<string, number>>({});
  const [loading, setLoading]   = useState(true);
  // Loaded separately, so one section's missing migration never blanks the other
  const [helperErr, setHelperErr]     = useState<string | null>(null);
  const [employerErr, setEmployerErr] = useState<string | null>(null);
  const [busyId, setBusyId]     = useState<string | null>(null);

  const [purgeTarget, setPurgeTarget] = useState<PurgeTarget | null>(null);
  const [emptyOpen, setEmptyOpen]     = useState(false);
  const [purging, setPurging]         = useState(false);

  /* ── Fetch — bump reloadKey to refetch (used by Retry) ── */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [h, e] = await Promise.all([
        supabase
          .from("applicants")
          .select("id, created_at, full_name, nationality, gender, mobile, photo_url, deleted_at, deleted_from, duplicate_of")
          .eq("status", DELETED_STATUS)
          .order("deleted_at", { ascending: false, nullsFirst: false }),
        supabase
          .from("employers")
          .select("*")
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false }),
      ]);
      if (!alive) return;

      setHelperErr(h.error?.message ?? null);
      setHelpers(h.error ? [] : ((h.data ?? []) as TrashedApplicant[]));

      setEmployerErr(e.error?.message ?? null);
      const emps = e.error ? [] : ((e.data ?? []) as TrashedEmployer[]);
      setEmployers(emps);

      if (emps.length) {
        const { data } = await supabase
          .from("applicants")
          .select("employer_id")
          .in("employer_id", emps.map((x) => x.id))
          .or(`status.is.null,status.neq.${DELETED_STATUS}`);
        if (!alive) return;
        const tally: Record<string, number> = {};
        (data as { employer_id: string }[] | null)?.forEach((r) => {
          tally[r.employer_id] = (tally[r.employer_id] ?? 0) + 1;
        });
        setLinked(tally);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const retry = () => { setLoading(true); setReloadKey((k) => k + 1); };

  /* ── Restore ── */
  const restoreHelper = useCallback(async (item: TrashedApplicant) => {
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({ status: item.deleted_from || "New", deleted_at: null, deleted_from: null })
        .eq("id", item.id);
      if (error) throw error;
      setHelpers((p) => p.filter((i) => i.id !== item.id));
    } catch (e) {
      alert("Failed to restore: " + errText(e));
    } finally {
      setBusyId(null);
    }
  }, []);

  const restoreEmployer = useCallback(async (item: TrashedEmployer) => {
    setBusyId(item.id);
    try {
      const { error } = await supabase.from("employers").update({ deleted_at: null }).eq("id", item.id);
      if (error) throw error;
      setEmployers((p) => p.filter((i) => i.id !== item.id));
    } catch (e) {
      alert("Failed to restore: " + errText(e));
    } finally {
      setBusyId(null);
    }
  }, []);

  /* ── Permanent delete: images first, then the row ── */
  const handlePurge = useCallback(async () => {
    const t = purgeTarget;
    if (!t) return;
    setPurging(true);
    try {
      if (t.kind === "helper") {
        await removeImages([t.item.photo_url]);
        const { error } = await supabase.from("applicants").delete().eq("id", t.item.id);
        if (error) throw error;
        setHelpers((p) => p.filter((i) => i.id !== t.item.id));
      } else {
        await removeImages([t.item.banner_url, t.item.logo_url]);
        const { error } = await supabase.from("employers").delete().eq("id", t.item.id);
        if (error) throw error;
        setEmployers((p) => p.filter((i) => i.id !== t.item.id));
      }
      setPurgeTarget(null);
    } catch (e) {
      alert("Failed to delete: " + errText(e));
    } finally {
      setPurging(false);
    }
  }, [purgeTarget]);

  /* ── Empty Trash: both sections ── */
  const handleEmptyTrash = useCallback(async () => {
    setPurging(true);
    try {
      await removeImages([
        ...helpers.map((i) => i.photo_url),
        ...employers.flatMap((i) => [i.banner_url, i.logo_url]),
      ]);
      if (helpers.length) {
        const { error } = await supabase.from("applicants").delete().eq("status", DELETED_STATUS);
        if (error) throw error;
        setHelpers([]);
      }
      if (employers.length) {
        const { error } = await supabase.from("employers").delete().not("deleted_at", "is", null);
        if (error) throw error;
        setEmployers([]);
      }
      setEmptyOpen(false);
    } catch (e) {
      alert("Failed to empty trash: " + errText(e));
    } finally {
      setPurging(false);
    }
  }, [helpers, employers]);

  /* ── Render ── */
  if (loading) return <div className="text-center py-12 text-gray-500">Loading trash…</div>;

  const total = helpers.length + employers.length;
  const err   = section === "helpers" ? helperErr : employerErr;

  const emptyBody = [
    helpers.length   && `${helpers.length} helper${helpers.length === 1 ? "" : "s"} (with their photos)`,
    employers.length && `${employers.length} employer${employers.length === 1 ? "" : "s"} (with their banners and logos)`,
  ].filter(Boolean).join(" and ");

  const purgeBody = !purgeTarget ? "" : purgeTarget.kind === "helper"
    ? `${purgeTarget.item.full_name} will be erased from the database, along with their photo.`
    : `${purgeTarget.item.name} will be erased from the database, along with its banner and logo.` +
      ((linked[purgeTarget.item.id] ?? 0)
        ? ` The ${linked[purgeTarget.item.id]} helper${linked[purgeTarget.item.id] === 1 ? "" : "s"} assigned to it will be left unassigned — they are not deleted.`
        : "");

  return (
    <div className="space-y-4">

      {/* ── Header: sections + Empty Trash ── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          {([
            ["helpers",   "Helpers",   helpers.length],
            ["employers", "Employers", employers.length],
          ] as const).map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setSection(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                section === key ? "bg-slate-800 text-white" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              }`}
            >
              {label}
              <span className={`ml-1.5 text-[11px] px-1.5 py-px rounded-full ${
                section === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>{n}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 italic">
          {section === "helpers"
            ? "Restoring puts a candidate back on the board it came from."
            : "Restoring puts an employer back, still linked to its helpers."}
        </p>
        <div className="flex-1" />
        {total > 0 && (
          <button
            onClick={() => setEmptyOpen(true)}
            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            Empty Trash
          </button>
        )}
      </div>

      {/* ── Load error for this section ── */}
      {err && (
        <div className="bg-white rounded-lg border border-red-200 p-6">
          <p className="font-semibold text-red-700 text-sm">
            Could not load the {section === "helpers" ? "helpers" : "employers"} in the trash
          </p>
          <p className="text-sm text-gray-600 mt-2">{err}</p>
          <p className="text-sm text-gray-500 mt-4">
            This usually means a database update has not been run yet. Run the files in{" "}
            <code className="bg-gray-100 px-1 rounded">supabase/migrations/</code> in the Supabase SQL Editor —{" "}
            {section === "helpers"
              ? <>for this section, <code className="bg-gray-100 px-1 rounded">20261031000100_applicant_duplicates.sql</code>.</>
              : <><code className="bg-gray-100 px-1 rounded">20261031000300_employer_trash.sql</code>.</>}
          </p>
          <button onClick={retry} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ── Empty section ── */}
      {!err && (section === "helpers" ? !helpers.length : !employers.length) && (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200 p-8">
          <div className="text-4xl mb-3">🗑️</div>
          <p className="text-gray-500">No {section} in the trash.</p>
          <p className="text-gray-400 text-sm mt-1">
            {section === "helpers"
              ? "Drag a card onto the bin on the Candidates or For Review board to send it here."
              : "Use the ✕ on an employer's card on the Employers page to send it here."}
          </p>
        </div>
      )}

      {/* ── Helpers ── */}
      {!err && section === "helpers" && helpers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {helpers.map((item) => (
            <TrashRow
              key={item.id}
              thumb={item.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.photo_url} alt="" className="w-full h-full object-cover grayscale" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>
              )}
              title={item.full_name}
              badge={item.duplicate_of && (
                <span title="Same name and mobile as an earlier application — sent here automatically"
                  className="ml-2 align-middle text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  Duplicate
                </span>
              )}
              subtitle={[item.nationality, item.gender, item.mobile].filter(Boolean).join(" · ")}
              origin={`was in ${item.deleted_from === "For Review" ? "For Review" : "Candidates"}`}
              when={trashedWhen(item.deleted_at)}
              busy={busyId === item.id}
              onRestore={() => restoreHelper(item)}
              onDelete={() => setPurgeTarget({ kind: "helper", item })}
            />
          ))}
        </div>
      )}

      {/* ── Employers ── */}
      {!err && section === "employers" && employers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
          {employers.map((item) => {
            const tint = employerTint(item.name);
            const n    = linked[item.id] ?? 0;
            return (
              <TrashRow
                key={item.id}
                thumb={item.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.logo_url} alt="" className="w-full h-full object-cover grayscale" />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-sm font-black ${tint.bg} ${tint.text}`}>
                    {employerInitials(item.name)}
                  </div>
                )}
                title={item.name}
                subtitle={[item.contact_person, item.phone, item.email].filter(Boolean).join(" · ")}
                origin={n ? `${n} helper${n === 1 ? "" : "s"} linked` : "no helpers"}
                when={trashedWhen(item.deleted_at)}
                busy={busyId === item.id}
                onRestore={() => restoreEmployer(item)}
                onDelete={() => setPurgeTarget({ kind: "employer", item })}
              />
            );
          })}
        </div>
      )}

      <DangerConfirm
        open={!!purgeTarget}
        title="Delete permanently?"
        body={purgeBody}
        confirmLabel="Delete Permanently"
        busy={purging}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
      />

      <DangerConfirm
        open={emptyOpen}
        title="Empty the trash?"
        body={`Everything in the trash will be erased from the database: ${emptyBody}.`}
        confirmLabel="Empty Trash"
        busy={purging}
        onCancel={() => setEmptyOpen(false)}
        onConfirm={handleEmptyTrash}
      />
    </div>
  );
}
