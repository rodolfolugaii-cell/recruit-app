"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

interface Applicant {
  id: string;
  created_at: string;
  full_name: string;
  date_of_birth: string;
  nationality: string;
  gender: string;
  mobile: string;
  photo_url: string;
  status: string;
  form_data: {
    placeOfBirth?: string;
    currentLocation?: string;
    height?: string;
    weight?: string;
    maritalStatus?: string;
    education?: string;
    religion?: string;
  };
}

interface DragState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isOverReview: boolean;
  overIndex: number;
}

/* ── Read-only card used inside the drag ghost (no buttons/events) ── */
function CardSnapshot({ applicant }: { applicant: Applicant }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col h-full">
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
          <h3 className="font-bold text-gray-900 truncate">{applicant.full_name}</h3>
          <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
          <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
            {applicant.status || "New"}
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
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <span className="text-xs text-gray-400">
          Applied: {new Date(applicant.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

export default function RecruiterDashboard() {
  const [applicants, setApplicants]         = useState<Applicant[]>([]);
  const [loading, setLoading]               = useState(true);
  const [selectedApplicant, setSelected]    = useState<Applicant | null>(null);
  const [sendingId, setSendingId]           = useState<string | null>(null);
  const [pressingId, setPressingId]         = useState<string | null>(null);
  const [dragState, setDragState]           = useState<DragState | null>(null);
  const [sortedIds, setSortedIds]           = useState<string[]>([]);

  // Refs so event-listener closures always see fresh state
  const cardRefs      = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragRef       = useRef<DragState | null>(null);
  const sortedRef     = useRef<string[]>([]);
  const wasDragging   = useRef(false);         // suppresses click-to-open after a drag

  useEffect(() => { dragRef.current   = dragState;  }, [dragState]);
  useEffect(() => { sortedRef.current = sortedIds; }, [sortedIds]);

  /* ── Fetch ── */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("applicants")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const filtered = (data || []).filter((a) => a.status !== "For Review");
        setApplicants(filtered);
        setSortedIds(filtered.map((a) => a.id));
      } catch (e: any) {
        console.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Send for Review (also called from drag-drop) ── */
  const handleSendForReview = useCallback(async (id: string) => {
    setSendingId(id);
    try {
      const { error } = await supabase
        .from("applicants")
        .update({ status: "For Review" })
        .eq("id", id);
      if (error) throw error;
      setApplicants((p) => p.filter((a) => a.id !== id));
      setSortedIds((p) => p.filter((i) => i !== id));
      setSelected((p) => (p?.id === id ? null : p));
    } catch (err: any) {
      alert("Failed to send for review: " + err.message);
    } finally {
      setSendingId(null);
    }
  }, []);

  /* ── Find which grid slot the cursor is hovering over ── */
  const findOverIndex = useCallback((mx: number, my: number, dragId: string): number => {
    const ids = sortedRef.current;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i] === dragId) continue;
      const el = cardRefs.current.get(ids[i]);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (mx >= r.left && mx <= r.right && my >= r.top && my <= r.bottom) return i;
    }
    return -1;
  }, []);

  /* ── Card mousedown — starts the press / activates drag after 8px movement ── */
  const handleCardPointerDown = useCallback((e: React.PointerEvent, applicant: Applicant) => {
    if ((e.pointerType === "mouse" && e.button !== 0) || sendingId) return;
    e.preventDefault();

    const el = cardRefs.current.get(applicant.id);
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const ox = e.clientX, oy = e.clientY;
    setPressingId(applicant.id);

    const activate = (mx: number, my: number) => {
      wasDragging.current = true;
      document.body.classList.add("ht-drag-active");
      setPressingId(null);
      setDragState({ id: applicant.id, x: mx, y: my, w: width, h: height, isOverReview: false, overIndex: -1 });
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
  }, [sendingId]);

  /* ── Active drag tracking (position + review-zone detection + reorder preview) ── */
  useEffect(() => {
    if (!dragState) return;

    const reviewEl = () => document.querySelector<HTMLElement>("[data-review-drop]");

    const onMove = (e: PointerEvent) => {
      const el = reviewEl();
      let isOverReview = false;
      if (el) {
        const r = el.getBoundingClientRect();
        isOverReview = e.clientX >= r.left && e.clientX <= r.right &&
                       e.clientY >= r.top  && e.clientY <= r.bottom;
        el.classList.toggle("drag-hover", isOverReview);
      }
      const overIndex = findOverIndex(e.clientX, e.clientY, dragRef.current!.id);
      setDragState((p) => p ? { ...p, x: e.clientX, y: e.clientY, isOverReview, overIndex } : null);
    };

    const onUp = () => {
      const ds = dragRef.current;
      reviewEl()?.classList.remove("drag-hover");
      document.body.classList.remove("ht-drag-active");
      setDragState(null);
      // Briefly keep wasDragging true so the card's onClick doesn't fire
      setTimeout(() => { wasDragging.current = false; }, 50);
      if (!ds) return;
      if (ds.isOverReview) {
        handleSendForReview(ds.id);
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
      reviewEl()?.classList.remove("drag-hover");
      document.body.classList.remove("ht-drag-active");
    };
  }, [dragState?.id, findOverIndex, handleSendForReview]);

  /* ── Live reorder preview: inject dragged card at hover position for display ── */
  const displayedApplicants = (() => {
    const sorted = sortedIds
      .map((id) => applicants.find((a) => a.id === id))
      .filter(Boolean) as Applicant[];
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
  // Ghost shrinks further when hovering over the For Review sidebar link
  const dragScale = dragState?.isOverReview ? 0.22 : 0.52;

  if (loading) return <div className="text-center py-12 text-gray-500">Loading submissions...</div>;

  return (
    <div>
      {applicants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200 p-8 text-gray-500">
          No new submissions. All candidates may have been sent for review!
        </div>
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"

        >
          {displayedApplicants.map((applicant) => {
            const isDragging = dragState?.id === applicant.id;
            const isPressing = pressingId === applicant.id;

            /* Placeholder ghost slot while card is being dragged */
            if (isDragging) {
              return (
                <div
                  key={applicant.id}
                  ref={(el) => { el ? cardRefs.current.set(applicant.id, el) : cardRefs.current.delete(applicant.id); }}
                  className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 transition-all duration-200"
                  style={{ height: dragState.h }}
                />
              );
            }

            return (
              <div
                key={applicant.id}
                ref={(el) => { el ? cardRefs.current.set(applicant.id, el) : cardRefs.current.delete(applicant.id); }}
                onPointerDown={(e) => handleCardPointerDown(e, applicant)}
                onClick={() => { if (!wasDragging.current) setSelected(applicant); }}
                style={{
                  transform:  isPressing ? "scale(0.88)" : "scale(1)",
                  transition: "transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s ease",
                  cursor:     isPressing ? "grabbing" : "grab",
                  touchAction: "none",
                  userSelect: "none",
                }}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md"
              >
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
                    <h3 className="font-bold text-gray-900 truncate" title={applicant.full_name}>{applicant.full_name}</h3>
                    <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
                    <span className="inline-block mt-2 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                      {applicant.status || "New"}
                    </span>
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
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center gap-2">
                  <span className="text-xs text-gray-400">Applied: {new Date(applicant.created_at).toLocaleDateString()}</span>
                  {/* stopPropagation on the wrapper prevents drag from starting on button clicks */}
                  <div
                    className="flex items-center gap-2 flex-shrink-0"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSendForReview(applicant.id); }}
                      disabled={!!sendingId}
                      className="text-[11px] bg-amber-500 text-white px-2.5 py-1 rounded-md font-semibold hover:bg-amber-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {sendingId === applicant.id ? "Sending…" : "Send for Review"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelected(applicant); }}
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

      {/* ── Drag ghost portal ─────────────────────────────────────────────────
          Outer div: follows cursor (no transition — updates every mousemove)
          Inner div: handles scale with a smooth CSS transition
          This split lets scale animate while position stays crisp.
      ─────────────────────────────────────────────────────────────────────── */}
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
                /* Center the scaled card on the cursor */
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

      {/* ── Profile Modal ── */}
      {selectedApplicant && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-gray-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800">Candidate Full Profile</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-semibold leading-none p-2">&times;</button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 pb-6 border-b border-gray-100">
                <div className="w-32 h-32 bg-gray-100 rounded-xl overflow-hidden border shadow-inner flex-shrink-0">
                  {selectedApplicant.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selectedApplicant.photo_url} alt={selectedApplicant.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Photo</div>
                  )}
                </div>
                <div className="text-center sm:text-left space-y-1">
                  <h3 className="text-2xl font-bold text-gray-900">{selectedApplicant.full_name}</h3>
                  <p className="text-sm text-blue-600 font-semibold">{selectedApplicant.nationality}</p>
                  <div className="pt-2">
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold">
                      {selectedApplicant.status || "New"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                {([
                  ["Date of Birth",    selectedApplicant.date_of_birth ? new Date(selectedApplicant.date_of_birth).toLocaleDateString() : "N/A"],
                  ["Place of Birth",   selectedApplicant.form_data?.placeOfBirth    || "N/A"],
                  ["Gender",           selectedApplicant.gender],
                  ["Mobile Phone",     selectedApplicant.mobile],
                  ["Current Location", selectedApplicant.form_data?.currentLocation || "N/A"],
                  ["Education Level",  selectedApplicant.form_data?.education        || "N/A"],
                  ["Religion",         selectedApplicant.form_data?.religion         || "N/A"],
                  ["Marital Status",   selectedApplicant.form_data?.maritalStatus    || "N/A"],
                  ["Height",           selectedApplicant.form_data?.height ? `${selectedApplicant.form_data.height} cm` : "N/A"],
                  ["Weight",           selectedApplicant.form_data?.weight ? `${selectedApplicant.form_data.weight} kg` : "N/A"],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="border-b pb-2">
                    <span className="text-gray-400 block text-xs uppercase tracking-wider font-semibold">{label}</span>
                    <span className="font-semibold text-gray-800">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-3">
              <button
                onClick={() => handleSendForReview(selectedApplicant.id)}
                disabled={sendingId === selectedApplicant.id}
                className="bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors disabled:bg-gray-300"
              >
                {sendingId === selectedApplicant.id ? "Sending…" : "Send for Review"}
              </button>
              <button
                onClick={() => setSelected(null)}
                className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}