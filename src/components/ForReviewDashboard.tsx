"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import {
  TrashDropZone, DeleteConfirmDialog, UndoToast,
  isPointOverTrash, DELETED_STATUS,
} from "@/components/TrashZone";
import { EmployerBadge, useEmployerDirectory } from "@/components/EmployerAssign";
import EmployeeId from "@/components/EmployeeId";
import Pagination from "@/components/Pagination";
import { invalidatePaged, loadPage, needsRevalidate, pageCountFor } from "@/lib/pagedCache";
import ApplicantProfileModal, { type ProfileApplicant } from "@/components/ApplicantProfileModal";

/** The profile modal owns the full applicant shape — see ApplicantProfileModal.tsx */
type Applicant = ProfileApplicant;

interface DragState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isOverCandidates: boolean;
  isOverTrash: boolean;
  overIndex: number;
}

/** A trashed card held aside so Undo can put it back where it was */
interface PendingUndo {
  applicant: Applicant;
  index: number;       // position it occupied in sortedIds
  prevStatus: string;  // status to restore
}

/* ── Read-only card snapshot for the drag ghost (amber-tinted) ── */
function CardSnapshot({ applicant }: { applicant: Applicant }) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden flex flex-col h-full">
      <div className="p-6 flex items-start space-x-4 border-b border-gray-100">
        <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">
          {applicant.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={applicant.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
          )}
        </div>
        <div className="overflow-hidden">
          <EmployeeId code={applicant.employee_code} className="mb-1.5" />
          <h3 className="font-bold text-gray-900 truncate">{applicant.full_name}</h3>
          <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
          <span className="inline-block mt-2 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
            For Review
          </span>
        </div>
      </div>
      <div className="p-6 space-y-2 text-sm text-gray-600 flex-grow">
        <div className="flex justify-between">
          <span className="text-gray-400">Gender:</span>
          <span className="font-medium">{applicant.gender}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Location:</span>
          <span className="font-medium">{applicant.form_data?.currentLocation || "N/A"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Education:</span>
          <span className="font-medium">{applicant.form_data?.education || "N/A"}</span>
        </div>
      </div>
      <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
        <span className="text-xs text-gray-400">Applied: {new Date(applicant.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  );
}



/* ── One page of the For Review board ─────────────────────────────────────────
   Only the page on screen is fetched (and so only its photos load);
   pagedCache keeps each page once seen. ── */
const REVIEW_KEY = "applicants:review";

async function fetchReviewPage(from: number, to: number) {
  const { data, error, count } = await supabase
    .from("applicants")
    .select("*", { count: "exact" })
    .eq("status", "For Review")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return { rows: (data ?? []) as Applicant[], total: count ?? 0 };
}

export default function ForReviewDashboard() {
  const [applicants, setApplicants]      = useState<Applicant[]>([]);
  const [loading, setLoading]            = useState(true);
  // Employer names for the card badges and the picker in the profile modal
  const { employers, byId: employersById, addEmployer } = useEmployerDirectory();
  const [selectedApplicant, setSelected] = useState<Applicant | null>(null);
  const [movingBackId, setMovingBackId]  = useState<string | null>(null);
  const [pressingId, setPressingId]      = useState<string | null>(null);
  const [dragState, setDragState]        = useState<DragState | null>(null);
  const [sortedIds, setSortedIds]        = useState<string[]>([]);

  /* ── Pages ── */
  const [page, setPage]                  = useState(1);
  const [total, setTotal]                = useState(0);
  const [pageLoading, setPageLoading]    = useState(false);
  // Bumped after a change here, so the open page refetches and refills to 15
  const [reloadKey, setReloadKey]        = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);


  /* ── Trash ── */
  const [confirmDelete, setConfirmDelete] = useState<Applicant | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const [pendingUndo, setPendingUndo]     = useState<PendingUndo | null>(null);
  const [undoing, setUndoing]             = useState(false);

  const cardRefs          = useRef<Map<string, HTMLDivElement>>(new Map());
  const cardRectsSnapshot = useRef<Map<string, DOMRect>>(new Map()); // stable snapshot taken at drag-start
  const dragRef       = useRef<DragState | null>(null);
  const sortedRef     = useRef<string[]>([]);
  const applicantsRef = useRef<Applicant[]>([]);   // fresh list for drag-end handlers
  const wasDragging   = useRef(false);

  useEffect(() => { dragRef.current   = dragState;  }, [dragState]);
  useEffect(() => { sortedRef.current = sortedIds; }, [sortedIds]);
  useEffect(() => { applicantsRef.current = applicants; }, [applicants]);

  /* ── Fetch the page on screen (from the cache when it has been seen) ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let res = await loadPage(REVIEW_KEY, page, fetchReviewPage);
        if (!alive) return;
        // Removing the last card on the last page leaves it empty — step back
        if (!res.rows.length && page > 1) { setPage(pageCountFor(res.total)); return; }
        const show = (r: typeof res) => {
          setApplicants(r.rows);
          setSortedIds(r.rows.map((a) => a.id));
          setTotal(r.total);
        };
        show(res);
        // An older cached page is shown at once, then re-checked in the background
        if (needsRevalidate(res)) {
          setLoading(false);
          res = await loadPage(REVIEW_KEY, page, fetchReviewPage, { force: true });
          if (alive) show(res);
        }
      } catch (e) {
        console.error(e instanceof Error ? e.message : e);
      } finally {
        if (alive) { setLoading(false); setPageLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [page, reloadKey]);

  const goToPage = useCallback((p: number) => {
    setPageLoading(true);
    setPage(p);
    rootRef.current?.scrollIntoView({ block: "start" });
  }, []);

  /** A card moved boards or bins: every applicant list is now out of date. */
  const listsChanged = useCallback(() => {
    invalidatePaged("applicants:");
    setReloadKey((k) => k + 1);
  }, []);

  /* ── Move back to Candidates (also called from drag-drop) ── */
  const handleMoveBack = useCallback(async (id: string) => {
    setMovingBackId(id);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({ status: "New" })
        .eq("id", id);
      if (error) throw error;
      setApplicants((p) => p.filter((a) => a.id !== id));
      setSortedIds((p) => p.filter((i) => i !== id));
      setSelected((p) => (p?.id === id ? null : p));
      listsChanged();
    } catch (err: any) {
      alert("Failed to move back: " + err.message);
    } finally {
      setMovingBackId(null);
    }
  }, [listsChanged]);

  /* ── Trash (soft delete) ──────────────────────────────────────────────────
     Sets status to "Deleted" rather than removing the row, so a mis-drop is
     recoverable — from the Undo toast, or later from the database. ── */
  const handleConfirmDelete = useCallback(async () => {
    const target = confirmDelete;
    if (!target) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({
          status:       DELETED_STATUS,
          deleted_at:   new Date().toISOString(),
          deleted_from: target.status || "For Review",   // the Trash page restores to this
        })
        .eq("id", target.id);
      if (error) throw error;

      const index = sortedRef.current.indexOf(target.id);
      setApplicants((p) => p.filter((a) => a.id !== target.id));
      setSortedIds((p) => p.filter((i) => i !== target.id));
      setSelected((p) => (p?.id === target.id ? null : p));
      setConfirmDelete(null);
      setPendingUndo({ applicant: target, index, prevStatus: target.status || "For Review" });
      listsChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(/deleted_at|deleted_from/.test(msg)
        ? "Trash needs a one-time database update. Run this in the Supabase SQL Editor:\n\n" +
          "ALTER TABLE applicants\n  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,\n  ADD COLUMN IF NOT EXISTS deleted_from TEXT;"
        : "Failed to move to trash: " + msg);
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, listsChanged]);

  const handleUndoDelete = useCallback(async () => {
    const u = pendingUndo;
    if (!u) return;
    setUndoing(true);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({ status: u.prevStatus, deleted_at: null, deleted_from: null })
        .eq("id", u.applicant.id);
      if (error) throw error;

      setApplicants((p) => (p.some((a) => a.id === u.applicant.id) ? p : [...p, u.applicant]));
      setSortedIds((p) => {
        if (p.includes(u.applicant.id)) return p;
        const next = [...p];
        next.splice(u.index < 0 ? next.length : Math.min(u.index, next.length), 0, u.applicant.id);
        return next;
      });
      setPendingUndo(null);
      listsChanged();
    } catch (err) {
      alert("Failed to restore: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUndoing(false);
    }
  }, [pendingUndo, listsChanged]);

  const dismissUndo = useCallback(() => setPendingUndo(null), []);

  /* ── The profile modal ─────────────────────────────────────────────────────
     The modal writes its own changes (edits, employer, contract); this only
     mirrors the applicant back into the card behind it. ── */
  const openProfile = useCallback((ap: Applicant) => setSelected(ap), []);

  const handleApplicantChange = useCallback((updated: Applicant) => {
    setApplicants((list) => list.map((a) => (a.id === updated.id ? updated : a)));
    setSelected((p) => (p?.id === updated.id ? updated : p));
    // The card here is already up to date; cached copies elsewhere are not
    invalidatePaged("applicants:");
  }, []);


  /* ── Find which grid slot the cursor is hovering over ── */
  const findOverIndex = useCallback((mx: number, my: number, dragId: string): number => {
    const ids = sortedRef.current;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === dragId) continue;
      // Use the snapshot taken at drag-start — immune to live preview reordering
      const r = cardRectsSnapshot.current.get(ids[i]);
      if (!r) continue;
      // Only trigger when cursor is inside the centre 60% of the card.
      // The outer 20% on each side acts as a dead zone, preventing the
      // rapid back-and-forth caused by cards shifting under the cursor.
      const insetX = r.width  * 0.20;
      const insetY = r.height * 0.20;
      if (mx >= r.left + insetX && mx <= r.right  - insetX &&
          my >= r.top  + insetY && my <= r.bottom - insetY) {
        return i;
      }
    }
    return -1;
  }, []);

  /* ── Card mousedown ── */
  const handleCardPointerDown = useCallback((e: React.PointerEvent, applicant: Applicant) => {
    if (e.button !== 0 || movingBackId) return;
    e.preventDefault();

    const el = cardRefs.current.get(applicant.id);
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const ox = e.clientX, oy = e.clientY;

    // Snapshot every card's rect now, while the grid is in its natural order.
    // We use this stable snapshot for the entire drag so live preview reordering
    // doesn't cause oscillation during hover detection.
    const snap = new Map<string, DOMRect>();
    cardRefs.current.forEach((cardEl, id) => { snap.set(id, cardEl.getBoundingClientRect()); });
    cardRectsSnapshot.current = snap;
    setPressingId(applicant.id);

    const activate = (mx: number, my: number) => {
      wasDragging.current = true;
      document.body.classList.add("ht-drag-active-review");
      setPressingId(null);
      setDragState({ id: applicant.id, x: mx, y: my, w: width, h: height, isOverCandidates: false, isOverTrash: false, overIndex: -1 });
    };

    const onMove = (me: PointerEvent) => {
      if (Math.hypot(me.clientX - ox, me.clientY - oy) >= 8) { cleanup(); activate(me.clientX, me.clientY); }
    };
    const onUp   = () => { setPressingId(null); cleanup(); };
    const cleanup = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [movingBackId]);

  /* ── Active drag tracking ── */
  useEffect(() => {
    if (!dragState) return;

    const candidatesEl = () => document.querySelector<HTMLElement>("[data-candidates-drop]");

    const onMove = (e: PointerEvent) => {
      // Trash wins over every other target — once the cursor is on the bin,
      // neither the Candidates link nor a reorder slot should light up.
      const isOverTrash = isPointOverTrash(e.clientX, e.clientY);

      const el = candidatesEl();
      let isOverCandidates = false;
      if (el) {
        const r = el.getBoundingClientRect();
        isOverCandidates = !isOverTrash &&
                           e.clientX >= r.left && e.clientX <= r.right &&
                           e.clientY >= r.top  && e.clientY <= r.bottom;
        el.classList.toggle("candidates-drag-hover", isOverCandidates);
      }
      const overIndex = isOverTrash ? -1 : findOverIndex(e.clientX, e.clientY, dragRef.current!.id);
      setDragState((p) => p ? { ...p, x: e.clientX, y: e.clientY, isOverCandidates, isOverTrash, overIndex } : null);
    };

    const onUp = () => {
      const ds = dragRef.current;
      candidatesEl()?.classList.remove("candidates-drag-hover");
      document.body.classList.remove("ht-drag-active-review");
      setDragState(null);
      setTimeout(() => { wasDragging.current = false; }, 50);
      if (!ds) return;
      if (ds.isOverTrash) {
        // Ask first — nothing is written until the dialog is confirmed
        const target = applicantsRef.current.find((a) => a.id === ds.id);
        if (target) setConfirmDelete(target);
      } else if (ds.isOverCandidates) {
        handleMoveBack(ds.id);
      } else if (ds.overIndex !== -1) {
        setSortedIds((prev) => {
          const from = prev.indexOf(ds.id);
          const to   = ds.overIndex;
          if (from === to || from === -1) return prev;
          const next = [...prev];
          next.splice(from, 1);
          next.splice(to, 0, ds.id);
          return next;
        });
      }
    };

    const noSelect = (e: Event) => e.preventDefault();
    document.addEventListener("selectstart", noSelect);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("selectstart", noSelect);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      candidatesEl()?.classList.remove("candidates-drag-hover");
      document.body.classList.remove("ht-drag-active-review");
    };
  }, [dragState?.id, findOverIndex, handleMoveBack]);

  /* ── Live reorder preview ── */
  const displayedApplicants = (() => {
    const sorted = sortedIds.map((id) => applicants.find((a) => a.id === id)).filter(Boolean) as Applicant[];
    if (!dragState || dragState.overIndex === -1) return sorted;
    const from = sortedIds.indexOf(dragState.id);
    const to   = dragState.overIndex;
    if (from === to || from === -1) return sorted;
    const result = [...sorted];
    const [item] = result.splice(from, 1);
    result.splice(to, 0, item);
    return result;
  })();

  const activeApplicant = dragState ? applicants.find((a) => a.id === dragState.id) : null;
  const dragScale = dragState?.isOverCandidates || dragState?.isOverTrash ? 0.22 : 0.52;

  if (loading) return <div className="text-center py-12 text-gray-500">Loading candidates for review...</div>;

  return (
    <div ref={rootRef} className="scroll-mt-4">
      {applicants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 p-8 text-gray-500">
          No candidates are pending review. Send some from the Candidates page to get started.
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"

        >
          {displayedApplicants.map((applicant) => {
            const isDragging = dragState?.id === applicant.id;
            const isPressing = pressingId === applicant.id;

            /* Placeholder slot while card is being dragged */
            if (isDragging) {
              return (
                <div
                  key={applicant.id}
                  ref={(el) => { el ? cardRefs.current.set(applicant.id, el) : cardRefs.current.delete(applicant.id); }}
                  className="rounded-xl border-2 border-dashed border-amber-200 bg-amber-50/40 transition-all duration-200"
                  style={{ height: dragState.h }}
                />
              );
            }

            return (
              <div
                key={applicant.id}
                ref={(el) => { el ? cardRefs.current.set(applicant.id, el) : cardRefs.current.delete(applicant.id); }}
                onClick={() => { if (!wasDragging.current) openProfile(applicant); }}
                style={{
                  transform:  isPressing ? "scale(0.88)" : "scale(1)",
                  transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease",
                  userSelect: "none",
                  position:   "relative",
                }}
                className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md"
              >
                {/* ── Invisible centre-zone drag overlay (60 % × 60 %, centred) ──
                    Only this region has touch-action:none — the card edges
                    keep touch-action:auto so mobile scroll still works there. ── */}
                <div
                  onPointerDown={(e) => handleCardPointerDown(e, applicant)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!wasDragging.current) openProfile(applicant);
                  }}
                  style={{
                    position:    "absolute",
                    top:         "20%",
                    left:        "20%",
                    width:       "60%",
                    height:      "60%",
                    touchAction: "none",
                    cursor:      isPressing ? "grabbing" : "grab",
                    zIndex:      10,
                    borderRadius: "6px",
                  }}
                />
                {/* ── Photo + name ── */}
                <div className="p-6 flex items-start space-x-4 border-b border-gray-100">
                  <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0 border">
                    {applicant.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={applicant.photo_url} alt={applicant.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <EmployeeId code={applicant.employee_code} className="mb-1.5" />
                    <h3 className="font-bold text-gray-900 truncate" title={applicant.full_name}>{applicant.full_name}</h3>
                    <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
                    <span className="inline-block mt-2 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                      For Review
                    </span>
                    <EmployerBadge
                      employer={applicant.employer_id ? employersById.get(applicant.employer_id) : null}
                      className="mt-1.5 block w-fit"
                    />
                    {applicant.form_data?.contractStatus && (
                      <span className="inline-block mt-1 text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {applicant.form_data.contractStatus}
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Details ── */}
                <div className="p-6 space-y-2 text-sm text-gray-600 flex-grow">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gender:</span>
                    <span className="font-medium">{applicant.gender}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mobile:</span>
                    <span className="font-medium">{applicant.mobile}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Location:</span>
                    <span className="font-medium">{applicant.form_data?.currentLocation || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Education:</span>
                    <span className="font-medium truncate max-w-[150px]" title={applicant.form_data?.education}>
                      {applicant.form_data?.education || "N/A"}
                    </span>
                  </div>
                </div>

                {/* ── Footer ── */}
                <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex justify-between items-center gap-2">
                  <span className="text-xs text-gray-400">Applied: {new Date(applicant.created_at).toLocaleDateString()}</span>
                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); handleMoveBack(applicant.id); }}
                      disabled={!!movingBackId}
                      className="text-[11px] bg-gray-200 text-gray-700 px-2.5 py-1 rounded-md font-semibold hover:bg-gray-300 transition-colors disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {movingBackId === applicant.id ? "Moving…" : "Move Back"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); openProfile(applicant); }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold whitespace-nowrap"
                    >
                      View
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        page={page}
        pageCount={pageCountFor(total)}
        total={total}
        busy={pageLoading}
        onChange={goToPage}
      />

      {/* ── Drag ghost portal ─────────────────────────────────────────────
          Same two-div split as RecruiterDashboard:
          outer = cursor position (no transition)
          inner = scale with smooth CSS transition
      ──────────────────────────────────────────────────────────────────── */}
      {dragState && activeApplicant && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: dragState.x,
              top:  dragState.y,
              pointerEvents: "none",
              zIndex: 9999,
              willChange: "left, top",
            }}
          >
            <div
              style={{
                width:  dragState.w,
                height: dragState.h,
                transform: `translate(${-(dragState.w * dragScale) / 2}px, ${-(dragState.h * dragScale) / 2}px) scale(${dragScale})`,
                transformOrigin: "top left",
                transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.28))",
              }}
            >
              <CardSnapshot applicant={activeApplicant} />
            </div>
          </div>,
          document.body
        )
      }

      {/* ── Drag-to-trash ── */}
      <TrashDropZone
        visible={applicants.length > 0}
        dragging={!!dragState}
        isOver={!!dragState?.isOverTrash}
      />
      <DeleteConfirmDialog
        applicant={confirmDelete}
        deleting={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
      />
      <UndoToast
        name={pendingUndo?.applicant.full_name ?? null}
        undoing={undoing}
        onUndo={handleUndoDelete}
        onDismiss={dismissUndo}
      />

      {/* ── Profile Modal ── */}
      {selectedApplicant && (
        <ApplicantProfileModal
          key={selectedApplicant.id}
          applicant={selectedApplicant}
          employers={employers}
          employersById={employersById}
          onEmployerCreated={addEmployer}
          onApplicantChange={handleApplicantChange}
          onClose={() => setSelected(null)}
          footerStart={
            <button
              onClick={() => { setSelected(null); handleMoveBack(selectedApplicant.id); }}
              disabled={movingBackId === selectedApplicant.id}
              className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
            >
              {movingBackId === selectedApplicant.id ? "Moving…" : "Move Back to Candidates"}
            </button>
          }
        />
      )}
    </div>
  );
}