"use client";

/**
 * TrashZone.tsx — shared drag-to-trash UI for the Candidates and For Review boards.
 *
 * Three pieces, all rendered through a portal onto <body> so they float above
 * the dashboard regardless of where the parent sits in the layout:
 *
 *   TrashDropZone      floating bin, bottom-right, target of the drag
 *   DeleteConfirmDialog asks before anything is written
 *   UndoToast          8-second window to put the card back
 *
 * Deleting is a SOFT delete — the row's status becomes "Deleted" so it drops
 * out of both boards but stays in the table, listed on /dashboard/trash where
 * it can be restored or erased for good. Nothing is removed from Supabase here.
 *
 * ── Requires (one-time) ─────────────────────────────────────────────────────
 *   ALTER TABLE applicants
 *     ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
 *     ADD COLUMN IF NOT EXISTS deleted_from TEXT;
 *
 *   deleted_from remembers which board the card came from, so Restore puts it
 *   back where it belongs instead of always landing in Candidates.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── Layering ────────────────────────────────────────────────────────────────
 *   drag ghost (in the dashboards) 9999
 *   confirm dialog                10000   must sit above the ghost
 *   undo toast                     9995
 *   trash bin                      9990
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Status written to the row instead of deleting it */
export const DELETED_STATUS = "Deleted";

/** Supabase Storage bucket holding applicant photos */
export const PHOTO_BUCKET = "applicant-photos";

/**
 * Turn a public photo URL back into its Storage object path so the file can be
 * removed on a permanent delete. Returns null for empty or foreign URLs.
 *
 *   https://<ref>.supabase.co/storage/v1/object/public/applicant-photos/photos/abc.jpg
 *     → photos/abc.jpg
 */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${PHOTO_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/** Minimal shape the trash UI needs — both dashboards' Applicant satisfies it */
export interface TrashApplicant {
  id: string;
  full_name: string;
  photo_url?: string;
  nationality?: string;
}

/**
 * Is the cursor over the bin?
 *
 * The hit box is inflated by `pad` because the bin is a small target at the
 * edge of the screen and a card being dragged is far bigger than the cursor.
 */
export function isPointOverTrash(x: number, y: number, pad = 22): boolean {
  const el = document.querySelector<HTMLElement>("[data-trash-drop]");
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return x >= r.left - pad && x <= r.right + pad &&
         y >= r.top  - pad && y <= r.bottom + pad;
}

/* ── Bin icon — the lid tips open when a card is held over it ─────────────── */
function TrashIcon({ open, size }: { open: boolean; size: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
    >
      <g style={{
        transformOrigin: "20% 25%",
        transform: open ? "rotate(-20deg) translate(-0.5px, -1px)" : "none",
        transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}>
        <path d="M3 6h18" />
        <path d="M9 6V4h6v2" />
      </g>
      <path d="M5.5 6l0.9 13.1A2 2 0 008.4 21h7.2a2 2 0 002-1.9L18.5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/* ── Floating bin ─────────────────────────────────────────────────────────── */
export function TrashDropZone({
  visible, dragging, isOver,
}: {
  visible: boolean;   // hidden when the board has no cards
  dragging: boolean;  // a card is currently being dragged
  isOver: boolean;    // cursor is inside the (inflated) hit box
}) {
  if (typeof document === "undefined" || !visible) return null;

  const size     = isOver ? 92 : dragging ? 76 : 54;
  const iconSize = isOver ? 40 : dragging ? 32 : 22;

  return createPortal(
    <div
      style={{
        position: "fixed", right: 26, bottom: 26, zIndex: 9990,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        // Purely a drop target — hit-tested by coordinates, so it must never
        // intercept clicks on the dashboard underneath.
        pointerEvents: "none",
      }}
    >
      {/* Prompt appears only while dragging */}
      <div
        style={{
          opacity: dragging ? 1 : 0,
          transform: dragging ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.18s ease, transform 0.18s ease",
        }}
        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap shadow-lg ${
          isOver ? "bg-red-600 text-white" : "bg-slate-900/90 text-white"
        }`}
      >
        {isOver ? "Release to trash" : "Drop here to trash"}
      </div>

      <div style={{ position: "relative", width: size, height: size, transition: "width 0.2s ease, height 0.2s ease" }}>
        {/* Attention ring while a drag is in flight but not yet on target */}
        {dragging && !isOver && (
          <span className="absolute inset-0 rounded-full bg-red-400/30 animate-ping" />
        )}

        <div
          data-trash-drop
          className={`relative w-full h-full rounded-full flex items-center justify-center border-2 ${
            isOver
              ? "bg-red-600 border-red-600 text-white shadow-2xl shadow-red-500/40"
              : dragging
                ? "bg-white border-dashed border-red-400 text-red-500 shadow-xl"
                : "bg-white border-slate-200 text-slate-400 shadow-md"
          }`}
          style={{
            transform: isOver ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease",
            opacity: dragging ? 1 : 0.6,
          }}
        >
          <TrashIcon open={isOver} size={iconSize} />
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Confirmation ─────────────────────────────────────────────────────────── */
export function DeleteConfirmDialog({
  applicant, deleting, onCancel, onConfirm,
}: {
  applicant: TrashApplicant | null;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Esc cancels — but not mid-write, or the UI would desync from the DB
  useEffect(() => {
    if (!applicant) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !deleting) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applicant, deleting, onCancel]);

  if (!applicant || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ zIndex: 10000 }}
      onClick={() => { if (!deleting) onCancel(); }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 flex items-start gap-4">
          <div className="w-11 h-11 rounded-full bg-red-100 text-red-600 flex items-center justify-center flex-shrink-0">
            <TrashIcon open={false} size={22} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900">Move to trash?</h3>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              <span className="font-semibold text-gray-700">{applicant.full_name}</span>{" "}
              will be removed from this board.
            </p>
          </div>
        </div>

        <div className="px-6 pb-4 flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">
            {applicant.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={applicant.photo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">No Photo</div>
            )}
          </div>
          <div className="text-xs text-gray-500 leading-snug">
            The record is kept in the database, not erased — you can undo this straight after.
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:bg-gray-300"
          >
            {deleting ? "Moving…" : "Move to Trash"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Undo toast ───────────────────────────────────────────────────────────── */
export function UndoToast({
  name, undoing, onUndo, onDismiss,
}: {
  name: string | null;
  undoing: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  // Auto-dismiss after 8s. Restarts whenever a different card is trashed.
  useEffect(() => {
    if (!name) return;
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [name, onDismiss]);

  if (!name || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed left-1/2 bottom-8 -translate-x-1/2 flex items-center gap-4 bg-slate-900 text-white pl-5 pr-3 py-3 rounded-xl shadow-2xl"
      style={{ zIndex: 9995 }}
    >
      <span className="text-sm">
        <span className="font-semibold">{name}</span> moved to trash
      </span>
      <button
        onClick={onUndo}
        disabled={undoing}
        className="text-sm font-semibold text-amber-300 hover:text-amber-200 px-2 py-1 rounded transition-colors disabled:opacity-50"
      >
        {undoing ? "Restoring…" : "Undo"}
      </button>
      <button
        onClick={onDismiss}
        className="text-slate-400 hover:text-white text-xl leading-none px-1.5 transition-colors"
        title="Dismiss"
      >
        &times;
      </button>
    </div>,
    document.body
  );
}
