"use client";

/**
 * TrashDashboard.tsx — /dashboard/trash
 *
 * Lists every applicant whose status is "Deleted" and offers two exits:
 *
 *   Restore              back to the board it came from (deleted_from)
 *   Delete Permanently   removes the row AND its photo from Storage
 *
 * A list rather than the card grid used elsewhere: this is a recovery screen,
 * so "who / when / where from" matters more than the full profile.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 *   ALTER TABLE applicants
 *     ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
 *     ADD COLUMN IF NOT EXISTS deleted_from TEXT;
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DELETED_STATUS, PHOTO_BUCKET, storagePathFromUrl } from "@/components/TrashZone";

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
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

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

export default function TrashDashboard() {
  const [items, setItems]       = useState<TrashedApplicant[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadErr] = useState<string | null>(null);
  const [busyId, setBusyId]     = useState<string | null>(null);

  const [purgeTarget, setPurgeTarget] = useState<TrashedApplicant | null>(null);
  const [emptyOpen, setEmptyOpen]     = useState(false);
  const [purging, setPurging]         = useState(false);

  /* ── Fetch — bump reloadKey to refetch (used by Retry) ── */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("applicants")
        .select("id, created_at, full_name, nationality, gender, mobile, photo_url, deleted_at, deleted_from")
        .eq("status", DELETED_STATUS)
        .order("deleted_at", { ascending: false, nullsFirst: false });

      if (!alive) return;
      if (error) {
        // Most likely cause: the deleted_at / deleted_from migration hasn't been run
        setLoadErr(error.message);
        setItems([]);
      } else {
        setLoadErr(null);
        setItems((data ?? []) as TrashedApplicant[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  const retry = () => { setLoading(true); setLoadErr(null); setReloadKey((k) => k + 1); };

  /* ── Restore to whichever board it came from ── */
  const handleRestore = useCallback(async (item: TrashedApplicant) => {
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({
          status:       item.deleted_from || "New",
          deleted_at:   null,
          deleted_from: null,
        })
        .eq("id", item.id);
      if (error) throw error;
      setItems((p) => p.filter((i) => i.id !== item.id));
    } catch (e) {
      alert("Failed to restore: " + errText(e));
    } finally {
      setBusyId(null);
    }
  }, []);

  /* ── Permanent delete: photo first, then the row ──────────────────────────
     Storage failure is logged but never blocks the row delete — an orphaned
     image is a smaller problem than a record that refuses to go away. ── */
  const purgeOne = useCallback(async (item: TrashedApplicant) => {
    const path = storagePathFromUrl(item.photo_url);
    if (path) {
      const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      if (error) console.warn("Could not remove photo:", error.message);
    }
    const { error } = await supabase.from("applicants").delete().eq("id", item.id);
    if (error) throw error;
  }, []);

  const handlePurge = useCallback(async () => {
    if (!purgeTarget) return;
    setPurging(true);
    try {
      await purgeOne(purgeTarget);
      setItems((p) => p.filter((i) => i.id !== purgeTarget.id));
      setPurgeTarget(null);
    } catch (e) {
      alert("Failed to delete: " + errText(e));
    } finally {
      setPurging(false);
    }
  }, [purgeTarget, purgeOne]);

  const handleEmptyTrash = useCallback(async () => {
    setPurging(true);
    try {
      const paths = items.map((i) => storagePathFromUrl(i.photo_url)).filter(Boolean) as string[];
      if (paths.length) {
        const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
        if (error) console.warn("Could not remove some photos:", error.message);
      }
      const { error } = await supabase.from("applicants").delete().eq("status", DELETED_STATUS);
      if (error) throw error;
      setItems([]);
      setEmptyOpen(false);
    } catch (e) {
      alert("Failed to empty trash: " + errText(e));
    } finally {
      setPurging(false);
    }
  }, [items]);

  /* ── Render ── */
  if (loading) return <div className="text-center py-12 text-gray-500">Loading trash…</div>;

  if (loadError) {
    return (
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <p className="font-semibold text-red-700 text-sm">Could not load the trash</p>
        <p className="text-sm text-gray-600 mt-2">{loadError}</p>
        <p className="text-sm text-gray-500 mt-4">
          If this mentions <code className="bg-gray-100 px-1 rounded">deleted_at</code> or{" "}
          <code className="bg-gray-100 px-1 rounded">deleted_from</code>, run this once in the Supabase SQL Editor:
        </p>
        <pre className="mt-2 p-3 bg-slate-900 text-slate-100 rounded-lg text-xs overflow-x-auto">
{`ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_from TEXT;`}
        </pre>
        <button onClick={retry} className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="text-center py-16 bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-4xl mb-3">🗑️</div>
        <p className="text-gray-500">The trash is empty.</p>
        <p className="text-gray-400 text-sm mt-1">
          Drag a card onto the bin on the Candidates or For Review board to send it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
        <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-600 font-medium">
          {items.length} in trash
        </span>
        <p className="text-xs text-gray-400 italic">Restoring puts a candidate back on the board it came from.</p>
        <div className="flex-1" />
        <button
          onClick={() => setEmptyOpen(true)}
          className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
        >
          Empty Trash
        </button>
      </div>

      {/* ── Rows ── */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden">
        {items.map((item) => {
          const busy = busyId === item.id;
          return (
            <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-gray-50/70 transition-colors">

              <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">
                {item.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.photo_url} alt="" className="w-full h-full object-cover grayscale" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-800 truncate">{item.full_name}</p>
                <p className="text-xs text-gray-400 truncate">
                  {[item.nationality, item.gender, item.mobile].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>

              <div className="hidden md:block text-right flex-shrink-0">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                  was in {item.deleted_from === "For Review" ? "For Review" : "Candidates"}
                </span>
                <p className="text-[11px] text-gray-400 mt-1">
                  {item.deleted_at ? `Trashed ${new Date(item.deleted_at).toLocaleString()}` : "Trashed earlier"}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleRestore(item)}
                  disabled={busy}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:bg-gray-300 whitespace-nowrap"
                >
                  {busy ? "Restoring…" : "Restore"}
                </button>
                <button
                  onClick={() => setPurgeTarget(item)}
                  disabled={busy}
                  title="Delete permanently"
                  className="text-xs font-medium px-3 py-1.5 rounded-md text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DangerConfirm
        open={!!purgeTarget}
        title="Delete permanently?"
        body={`${purgeTarget?.full_name ?? "This candidate"} will be erased from the database, along with their photo.`}
        confirmLabel="Delete Permanently"
        busy={purging}
        onCancel={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
      />

      <DangerConfirm
        open={emptyOpen}
        title="Empty the trash?"
        body={`All ${items.length} candidate${items.length === 1 ? "" : "s"} in the trash will be erased from the database, along with their photos.`}
        confirmLabel="Empty Trash"
        busy={purging}
        onCancel={() => setEmptyOpen(false)}
        onConfirm={handleEmptyTrash}
      />
    </div>
  );
}
