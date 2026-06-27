"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

interface WorkExperienceEntry {
  yearsOfEmployment: string; dateFrom: string; dateTo: string;
  location: string; flatSize: string; contractStatus: string;
  terminatedReason: string; breakReason: string; householdChores: string[];
  jobDuties: string; coHelpers: string; employerNationality: string; familyMembers: string;
}
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
    placeOfBirth?: string;       currentLocation?: string;
    height?: string;             weight?: string;
    maritalStatus?: string;      education?: string;
    religion?: string;           contractStatus?: string;
    lastWorkingDay?: string;     numberOfKids?: string;
    boysAges?: string;           girlsAges?: string;
    familyMembersCount?: string; educationCourse?: string;
    totalYearsHK?: string;       numberOfEmployers?: string;
    languages?: { english?: string; cantonese?: string; mandarin?: string; };
    specialSkills?: string;
    skills?: string[];           cookingAbilities?: string[];
    preferences?: { sundayOff?: boolean; flexibleDayOff?: boolean; willingWithOtherHelper?: boolean; willingStayIn?: boolean; };
    otherExperience?: { country?: string; yearsOfEmployment?: string; jobDuties?: string; }[];
    workExperience?: WorkExperienceEntry[];
  };
}

interface DragState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isOverCandidates: boolean;
  overIndex: number;
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

/* ── Modal helper components ──────────────────────────────────────────── */
function ModalSection({ title }: { title: string }) {
  return (
    <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mt-5 mb-3 pb-1 border-b border-gray-100 first:mt-0">
      {title}
    </h4>
  );
}
function ModalField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="pb-2 border-b border-gray-50">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-sm font-semibold text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}

/* ── Biodata form helpers ──────────────────────────────────────────────── */
function BiodataCB({ checked }: { checked?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center w-[13px] h-[13px] border border-gray-600 text-[12px] leading-none flex-shrink-0 align-middle">
      {checked ? "✓" : ""}
    </span>
  );
}
function BiodataFL({ label, value, cls }: { label: string; value?: string | null; cls?: string }) {
  return (
    <div className={`flex items-baseline gap-0.5 min-w-0 ${cls ?? ""}`}>
      <span className="text-[11px] text-gray-500 whitespace-nowrap flex-shrink-0">{label}</span>
      <span className="border-b border-gray-300 flex-1 font-medium text-[12px] min-h-[14px] overflow-hidden leading-tight">
        {value ?? ""}
      </span>
    </div>
  );
}
function BiodataWE({ entry }: { entry: WorkExperienceEntry | null }) {
  const e = entry;
  return (
    <div className="text-[12px] space-y-1.5">
      <div className="flex gap-2">
        <BiodataFL label="Yrs of Employment:" value={e?.yearsOfEmployment} cls="flex-1" />
        <BiodataFL label="Date From (mm/yyyy):" value={e?.dateFrom} cls="flex-1" />
        <BiodataFL label="To (mm/yyyy):" value={e?.dateTo} cls="flex-1" />
      </div>
      <div className="flex gap-2">
        <BiodataFL label="Location:" value={e?.location} cls="flex-[2]" />
        <BiodataFL label="Flat Size:" value={e?.flatSize ? `${e.flatSize} sq.ft.` : ""} cls="flex-1" />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {(["Finished Contract", "Plan to Break", "Terminated", "Break"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <BiodataCB checked={e?.contractStatus === s} /> {s}
          </span>
        ))}
      </div>
      {e?.terminatedReason && (
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 whitespace-nowrap">Terminated/ Reason:</span>
          <span className="border-b border-gray-300 flex-1 font-medium">{e.terminatedReason}</span>
        </div>
      )}
      {e?.breakReason && (
        <div className="flex items-baseline gap-1">
          <span className="text-gray-500 whitespace-nowrap">Break/ Reason:</span>
          <span className="border-b border-gray-300 flex-1 font-medium">{e.breakReason}</span>
        </div>
      )}
      <div>
        <p className="font-semibold text-[11px] uppercase mb-1">Household Chores</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {["Cooking", "Child Care", "New Born Care", "Special Child Care", "Elderly Care",
            "Disabled Person Care", "Pet Care", "Driving", "Car Washing", "Plant Care / Gardening"].map((c) => (
            <span key={c} className="flex items-center gap-0.5">
              <BiodataCB checked={e?.householdChores?.includes(c)} /> {c}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-start gap-1">
        <span className="text-gray-500 whitespace-nowrap text-[11px] uppercase font-semibold flex-shrink-0">JOB DUTIES:</span>
        <span className="border-b border-gray-300 flex-1 font-medium min-h-[14px]">{e?.jobDuties ?? ""}</span>
      </div>
      <div className="flex gap-2">
        <BiodataFL label="No. of Co-helper:" value={e?.coHelpers} cls="flex-1" />
        <BiodataFL label="Nationality of Employer:" value={e?.employerNationality} cls="flex-[2]" />
      </div>
      <BiodataFL label="Family Members:" value={e?.familyMembers} />
    </div>
  );
}


export default function ForReviewDashboard() {
  const [applicants, setApplicants]      = useState<Applicant[]>([]);
  const [loading, setLoading]            = useState(true);
  const [selectedApplicant, setSelected] = useState<Applicant | null>(null);
  const [movingBackId, setMovingBackId]  = useState<string | null>(null);
  const [pressingId, setPressingId]      = useState<string | null>(null);
  const [dragState, setDragState]        = useState<DragState | null>(null);
  const [sortedIds, setSortedIds]        = useState<string[]>([]);

  const cardRefs          = useRef<Map<string, HTMLDivElement>>(new Map());
  const cardRectsSnapshot = useRef<Map<string, DOMRect>>(new Map()); // stable snapshot taken at drag-start
  const dragRef     = useRef<DragState | null>(null);
  const sortedRef   = useRef<string[]>([]);
  const wasDragging = useRef(false);

  useEffect(() => { dragRef.current   = dragState;  }, [dragState]);
  useEffect(() => { sortedRef.current = sortedIds; }, [sortedIds]);

  /* ── Fetch ── */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("applicants")
          .select("*")
          .eq("status", "For Review")
          .order("created_at", { ascending: false });
        if (error) throw error;
        setApplicants(data || []);
        setSortedIds((data || []).map((a) => a.id));
      } catch (e: any) {
        console.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
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
    } catch (err: any) {
      alert("Failed to move back: " + err.message);
    } finally {
      setMovingBackId(null);
    }
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
      setDragState({ id: applicant.id, x: mx, y: my, w: width, h: height, isOverCandidates: false, overIndex: -1 });
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
      const el = candidatesEl();
      let isOverCandidates = false;
      if (el) {
        const r = el.getBoundingClientRect();
        isOverCandidates = e.clientX >= r.left && e.clientX <= r.right &&
                           e.clientY >= r.top  && e.clientY <= r.bottom;
        el.classList.toggle("candidates-drag-hover", isOverCandidates);
      }
      const overIndex = findOverIndex(e.clientX, e.clientY, dragRef.current!.id);
      setDragState((p) => p ? { ...p, x: e.clientX, y: e.clientY, isOverCandidates, overIndex } : null);
    };

    const onUp = () => {
      const ds = dragRef.current;
      candidatesEl()?.classList.remove("candidates-drag-hover");
      document.body.classList.remove("ht-drag-active-review");
      setDragState(null);
      setTimeout(() => { wasDragging.current = false; }, 50);
      if (!ds) return;
      if (ds.isOverCandidates) {
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
  const dragScale = dragState?.isOverCandidates ? 0.22 : 0.52;

  if (loading) return <div className="text-center py-12 text-gray-500">Loading candidates for review...</div>;

  return (
    <div>
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
                onClick={() => { if (!wasDragging.current) setSelected(applicant); }}
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
                    if (!wasDragging.current) setSelected(applicant);
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
                    <h3 className="font-bold text-gray-900 truncate" title={applicant.full_name}>{applicant.full_name}</h3>
                    <p className="text-xs text-blue-600 font-medium mt-1">{applicant.nationality}</p>
                    <span className="inline-block mt-2 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                      For Review
                    </span>
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

      {/* ── Profile Modal ── */}
      {selectedApplicant && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl border border-gray-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-white">
              <h2 className="text-xs font-bold text-gray-600 uppercase tracking-widest">Applicant Biodata</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-semibold leading-none p-2">&times;</button>
            </div>

            <div className="p-5 bg-white text-gray-900 leading-tight" style={{ fontSize: "13px" }}>
              {(() => {
                const fd = selectedApplicant.form_data;
                const ap = selectedApplicant;
                const dob = ap.date_of_birth ? new Date(ap.date_of_birth) : null;
                const age = dob ? String(new Date().getFullYear() - dob.getFullYear()) : "";

                return (
                  <>
                    {/* ── Company Header ── */}
                    <div className="text-center mb-3 pb-3 border-b-2 border-gray-800">
                      <p className="font-bold tracking-widest" style={{ fontSize: "15px" }}>CASTILLO DEL REY CONSULTANCY</p>
                      <p className="text-gray-500 text-[9px] mt-0.5">Shop D1, 1/F, Planet Square, 1-15 Tal Man Street, Hung Hom, Kowloon, Hong Kong</p>
                    </div>

                    {/* ── Section title + contract status ── */}
                    <div className="mb-2 pb-2 border-b border-gray-300">
                      <p className="font-bold text-[10px] mb-1.5">
                        PERSONAL PARTICULAR{" "}
                        <span className="font-normal">(Please write in BOLD/CAPITAL Letters)</span>
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                        {["Finished Contract", "Terminated", "Break of Contract", "Plan to Break"].map((s) => (
                          <span key={s} className="flex items-center gap-1">
                            <BiodataCB checked={fd?.contractStatus === s} /> {s}
                          </span>
                        ))}
                        <span className="flex items-center gap-1 ml-1">
                          Last working day:&nbsp;
                          <span className="border-b border-gray-400 inline-block min-w-[80px] font-medium">
                            {fd?.lastWorkingDay ? new Date(fd.lastWorkingDay).toLocaleDateString() : ""}
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* ── Photo (LEFT) + Personal Info ── */}
                    <div className="flex gap-4 mb-2 pb-2 border-b border-gray-300">
                      {/* Photo — LEFT side */}
                      <div className="w-28 flex-shrink-0 flex flex-col items-center gap-1">
                        <div className="w-28 h-36 border-2 border-gray-500 overflow-hidden flex items-center justify-center bg-gray-50">
                          {ap.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ap.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[11px] text-gray-400 text-center">Photo</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 text-center">Photo</p>
                        <BiodataFL label="Basic:" value="" cls="w-full" />
                      </div>
                      {/* Personal info — RIGHT side */}
                      <div className="flex-1 space-y-1.5 text-[12px]">
                        <div className="flex gap-2">
                          <BiodataFL label="Name:" value={ap.full_name} cls="flex-[2]" />
                          <BiodataFL label="Date of Birth:" value={dob ? dob.toLocaleDateString() : ""} cls="flex-1" />
                          <BiodataFL label="Nationality:" value={ap.nationality} cls="flex-1" />
                        </div>
                        <div className="flex gap-2">
                          <BiodataFL label="Religion:" value={fd?.religion} cls="flex-1" />
                          <BiodataFL label="Height:" value={fd?.height ? `${fd.height} cm` : ""} cls="flex-1" />
                          <BiodataFL label="Weight:" value={fd?.weight ? `${fd.weight} kg` : ""} cls="flex-1" />
                          <BiodataFL label="Age:" value={age} cls="w-14" />
                        </div>
                        <div className="flex gap-2">
                          <BiodataFL label="Marital Status:" value={fd?.maritalStatus} cls="flex-1" />
                          <BiodataFL label="Gender:" value={ap.gender} cls="flex-1" />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-gray-500 whitespace-nowrap">How many kids:</span>
                          <span className="border-b border-gray-300 w-6 font-medium">{fd?.numberOfKids ?? ""}</span>
                          <span className="text-gray-500 whitespace-nowrap">B/A:</span>
                          <span className="border-b border-gray-300 w-14 font-medium">{fd?.boysAges ?? ""}</span>
                          <span className="text-gray-500 whitespace-nowrap">G/A:</span>
                          <span className="border-b border-gray-300 w-14 font-medium">{fd?.girlsAges ?? ""}</span>
                          <span className="text-gray-500 whitespace-nowrap">Family Members:</span>
                          <span className="border-b border-gray-300 w-8 font-medium">{fd?.familyMembersCount ?? ""}</span>
                        </div>
                        <div className="flex gap-2">
                          <BiodataFL label="Mobile:" value={ap.mobile} cls="flex-1" />
                          <BiodataFL label="Place of Birth:" value={fd?.placeOfBirth} cls="flex-1" />
                          <BiodataFL label="Current Location:" value={fd?.currentLocation} cls="flex-1" />
                        </div>
                      </div>
                    </div>

                    {/* ── Spoken Language ── */}
                    <div className="mb-2 pb-2 border-b border-gray-300">
                      <span className="font-bold text-[10px] uppercase">Spoken Language</span>
                      <div className="flex flex-wrap gap-x-8 gap-y-0.5 mt-1 text-[10px]">
                        {(["English", "Cantonese", "Mandarin"] as const).map((lang) => {
                          const key = lang.toLowerCase() as "english" | "cantonese" | "mandarin";
                          return (
                            <div key={lang} className="flex items-center gap-2">
                              <span className="text-gray-600 font-medium">{lang}</span>
                              <span className="flex items-center gap-1">
                                <BiodataCB checked={fd?.languages?.[key] === "Basic"} /> Basic
                              </span>
                              <span className="flex items-center gap-1">
                                <BiodataCB checked={fd?.languages?.[key] === "Good"} /> Good
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Education ── */}
                    <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                      <span className="font-bold uppercase">Educational Background</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                        {[
                          { label: "High School Graduate", val: "High School Graduate" },
                          { label: "College Undergraduate", val: "College Undergraduate" },
                          { label: "College Graduate",     val: "College Graduate"     },
                          { label: "Vocational Course",    val: "Vocational Course"    },
                        ].map(({ label, val }) => (
                          <span key={val} className="flex items-center gap-1">
                            <BiodataCB checked={fd?.education === val} /> {label}
                            {["College Graduate","College Undergraduate","Vocational Course"].includes(val) &&
                              fd?.education === val && fd?.educationCourse && (
                              <span className="ml-1 text-gray-600">
                                Course/: <span className="font-medium">{fd.educationCourse}</span>
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-6 mt-1">
                        <span>
                          Total Years in Hong Kong:{" "}
                          <span className="border-b border-gray-300 inline-block w-8 font-medium">{fd?.totalYearsHK ?? ""}</span>
                        </span>
                        <span>
                          How Many Employers:{" "}
                          <span className="border-b border-gray-300 inline-block w-8 font-medium">{fd?.numberOfEmployers ?? ""}</span>
                        </span>
                      </div>
                    </div>

                    {/* ── Special Skills ── */}
                    <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                      <span className="font-bold uppercase">SPECIAL SKILLS</span>
                      <div className="border-b border-gray-300 mt-1 min-h-[16px] font-medium">{fd?.specialSkills ?? ""}</div>
                      <div className="border-b border-gray-300 min-h-[14px]" />
                    </div>

                    {/* ── Other Country Experience ── */}
                    <div className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                      <span className="font-bold uppercase">OTHER COUNTRY EXPERIENCE</span>
                      <div className="grid grid-cols-2 gap-4 mt-1">
                        {(["A", "B"] as const).map((letter, i) => {
                          const exp = fd?.otherExperience?.[i];
                          return (
                            <div key={letter}>
                              <div className="flex items-baseline gap-1 mb-1">
                                <span className="font-bold">{letter}.</span>
                                <span className="border-b border-gray-300 flex-1 font-medium">{exp?.country ?? ""}</span>
                              </div>
                              <BiodataFL label="Yrs. of Employment:" value={exp?.yearsOfEmployment} cls="mb-1" />
                              <div>
                                <span className="text-gray-500">Job Duties:</span>
                                <div className="border-b border-gray-300 min-h-[14px] font-medium mt-0.5">{exp?.jobDuties ?? ""}</div>
                                <div className="border-b border-gray-300 min-h-[14px]" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Current HK Work Experience + Skills (2-column) ── */}
                    <div className="flex mb-2 border-b border-gray-300 pb-2">
                      {/* Left: Work Experience */}
                      <div className="flex-1 pr-3 border-r border-gray-400 text-[10px]">
                        <p className="font-bold text-[9px] uppercase mb-2 tracking-wide">
                          CURRENT WORKING EXPERIENCE in Hong Kong
                        </p>
                        {fd?.workExperience && fd.workExperience.length > 0
                          ? <BiodataWE entry={fd.workExperience[0]} />
                          : <BiodataWE entry={null} />}
                      </div>
                      {/* Right: Skills */}
                      <div className="w-[43%] pl-3 text-[10px]">
                        <p className="font-bold text-[9px] uppercase mb-1.5 tracking-wide">MY SKILLS</p>
                        <div className="grid grid-cols-2 gap-x-1 gap-y-0.5 mb-3">
                          {["Cooking","Child Care","New Born Care","Special Child Care",
                            "Elderly Care","Disabled Person Care","Pet Care","Driving",
                            "Car Washing","Plant Care","Kids Tutorial","Nursing Aide"].map((s) => (
                            <span key={s} className="flex items-center gap-1">
                              <BiodataCB checked={fd?.skills?.includes(s)} /> {s}
                            </span>
                          ))}
                        </div>
                        <p className="font-bold text-[9px] uppercase mb-1 tracking-wide">COOKING ABILITIES</p>
                        <div className="space-y-0.5 mb-3">
                          {["Western Food","Asian Food","Mediterranean Food","Baking","Can follow Recipe and Cook Book"].map((c) => (
                            <span key={c} className="flex items-center gap-1">
                              <BiodataCB checked={fd?.cookingAbilities?.includes(c)} /> {c}
                            </span>
                          ))}
                        </div>
                        <div className="space-y-0.5">
                          <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.sundayOff}              /> Prefer Sunday Off</span>
                          <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.flexibleDayOff}         /> Flexible Day off</span>
                          <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.willingWithOtherHelper} /> Willing to Work with other helper</span>
                          <span className="flex items-center gap-1"><BiodataCB checked={fd?.preferences?.willingStayIn}          /> Willing to work with stay in employer</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Additional HK Work Experience entries ── */}
                    {fd?.workExperience && fd.workExperience.length > 1 &&
                      fd.workExperience.slice(1).map((we, i) => (
                        <div key={i} className="mb-2 pb-2 border-b border-gray-300 text-[10px]">
                          <p className="font-bold text-[9px] uppercase mb-2 tracking-wide">
                            WORK EXPERIENCE in Hong Kong #{i + 2}/
                          </p>
                          <BiodataWE entry={we} />
                        </div>
                      ))
                    }

                    {/* ── Disclaimer + Signature ── */}
                    <div className="mt-4 pt-3 border-t border-gray-300 text-[9px] text-gray-600 leading-relaxed">
                      <p>
                        I hereby certify that the above information is true and correct to the best of my ability and agree that{" "}
                        <strong className="text-gray-800">CASTILLO DEL REY CONSULTANCY</strong> may disclose my personal profile
                        to potential employers for the purpose of seeking employment as Foreign Domestic Helper.
                      </p>
                      <p className="font-bold text-[10px] text-center tracking-[0.25em] mt-2 text-gray-700">
                        CASTILLODELREYCONSULTANCY
                      </p>
                      <div className="mt-4 flex justify-start">
                        <div className="text-center">
                          <div className="border-t border-gray-500 w-44 pt-1 text-[9px]">Signature of Applicant</div>
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-6 border-t border-gray-100 bg-amber-50 flex justify-between items-center gap-3">
              <button
                onClick={() => { setSelected(null); handleMoveBack(selectedApplicant.id); }}
                disabled={movingBackId === selectedApplicant.id}
                className="bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                {movingBackId === selectedApplicant.id ? "Moving…" : "Move Back to Candidates"}
              </button>
              <button
                onClick={() => setSelected(null)}
                className="bg-amber-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
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