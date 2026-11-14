"use client";

/**
 * PhotoCropper.tsx — crop the applicant's photo to a 1×1 square.
 *
 * Opens as soon as a photo is chosen on /apply, because only square photos are
 * accepted. The square frame is fixed; the photo moves and scales behind it:
 *
 *   reposition   drag with a finger or the mouse
 *   zoom         the slider, the mouse wheel, or a two-finger pinch
 *
 * The photo always covers the whole square — it can be zoomed and dragged,
 * but never far enough to leave an empty edge. "Use photo" draws exactly what
 * is in the square onto an OUTPUT × OUTPUT canvas and hands back a JPEG.
 *
 * All the geometry is in one place: the photo's on-screen size is
 * natural size × base × zoom, where base is the scale at which it just covers
 * the square (zoom 1), and pos is where its top-left corner sits inside the
 * square. Both are kept in range by clampPos.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const OUTPUT   = 800;   // px — the saved photo is OUTPUT × OUTPUT
const MAX_ZOOM = 4;

interface Pos { x: number; y: number }

export default function PhotoCropper({
  src, onCancel, onDone,
}: {
  /** An object URL for the chosen file */
  src: string;
  onCancel: () => void;
  onDone: (file: File) => void;
}) {
  // The square's size on screen: as large as fits, up to 320px
  const [view] = useState(() => Math.min(320, (typeof window !== "undefined" ? window.innerWidth : 400) - 64));
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom]       = useState(1);
  const [pos, setPos]         = useState<Pos>({ x: 0, y: 0 });
  const [saving, setSaving]   = useState(false);

  const imgRef   = useRef<HTMLImageElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  // Fingers / mouse currently down, and what the gesture started from
  const pointers = useRef(new Map<number, Pos>());
  const gesture  = useRef<{ pos: Pos; zoom: number; mid: Pos; dist: number } | null>(null);

  /** Scale at which the photo just covers the square. */
  const base = natural ? Math.max(view / natural.w, view / natural.h) : 1;

  /** Keep the photo covering the square at zoom `z`. */
  const clampPos = useCallback((p: Pos, z: number): Pos => {
    if (!natural) return p;
    const w = natural.w * base * z, h = natural.h * base * z;
    return {
      x: Math.min(0, Math.max(view - w, p.x)),
      y: Math.min(0, Math.max(view - h, p.y)),
    };
  }, [natural, base, view]);

  /** Zoom to `next`, keeping the point (cx, cy) inside the square still. */
  const zoomTo = useCallback((next: number, cx = view / 2, cy = view / 2, from: { pos: Pos; zoom: number } = { pos, zoom }) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    const k = z / from.zoom;
    setZoom(z);
    setPos(clampPos({ x: cx - (cx - from.pos.x) * k, y: cy - (cy - from.pos.y) * k }, z));
  }, [view, pos, zoom, clampPos]);

  /* ── First load: centre the photo at zoom 1 ── */
  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const n = { w: img.naturalWidth, h: img.naturalHeight };
    const b = Math.max(view / n.w, view / n.h);
    setNatural(n);
    setZoom(1);
    setPos({ x: (view - n.w * b) / 2, y: (view - n.h * b) / 2 });
  };

  /* ── Mouse wheel zoom, towards the cursor. Non-passive so the page stays put. ── */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoom, zoomTo]);

  /* ── Drag (one pointer) and pinch (two) ── */
  const startGesture = () => {
    const pts = [...pointers.current.values()];
    const mid  = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { pos, zoom, mid, dist };
  };

  const local = (e: React.PointerEvent): Pos => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    startGesture();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length >= 2 && g.dist > 0) {
      // Pinch: scale by the change in finger distance, about the start midpoint,
      // and follow the midpoint as it moves
      const mid  = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const z = Math.min(MAX_ZOOM, Math.max(1, g.zoom * (dist / g.dist)));
      const k = z / g.zoom;
      setZoom(z);
      setPos(clampPos({
        x: g.mid.x - (g.mid.x - g.pos.x) * k + (mid.x - g.mid.x),
        y: g.mid.y - (g.mid.y - g.pos.y) * k + (mid.y - g.mid.y),
      }, z));
    } else {
      const p = pts[0];
      setPos(clampPos({ x: g.pos.x + p.x - g.mid.x, y: g.pos.y + p.y - g.mid.y }, g.zoom));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    // A finger lifted mid-pinch: carry on as a drag from where things are now
    if (pointers.current.size) startGesture(); else gesture.current = null;
  };

  /* ── Draw what is inside the square and hand it back ── */
  const save = async () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    setSaving(true);
    try {
      const s = base * zoom;   // screen px per source px
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, -pos.x / s, -pos.y / s, view / s, view / s, 0, 0, OUTPUT, OUTPUT);
      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not create the photo");
      onDone(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } catch (e) {
      alert("Could not crop the photo: " + (e instanceof Error ? e.message : String(e)));
      setSaving(false);
    }
  };

  const shown = natural ? { w: natural.w * base * zoom, h: natural.h * base * zoom } : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-label="Crop your photo"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-bold text-gray-900">Crop your photo</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Photos must be square (1×1). Drag to move, and zoom so your face fills most of the square.
          </p>
        </div>

        {/* ── The square ── */}
        <div className="flex justify-center px-5">
          <div
            ref={frameRef}
            className="relative overflow-hidden rounded-lg bg-gray-900 touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: view, height: view }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt=""
              onLoad={onLoad}
              draggable={false}
              className="absolute top-0 left-0 max-w-none pointer-events-none"
              style={shown
                ? { width: shown.w, height: shown.h, transform: `translate(${pos.x}px, ${pos.y}px)` }
                : { opacity: 0 }}
            />
            {/* Rule-of-thirds guide */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => <div key={i} className="border border-white/25" />)}
            </div>
            {!natural && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">Loading…</div>
            )}
          </div>
        </div>

        {/* ── Zoom ── */}
        <div className="px-5 pt-4 flex items-center gap-3">
          <button type="button" onClick={() => zoomTo(zoom / 1.2)} disabled={zoom <= 1}
            aria-label="Zoom out"
            className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 text-lg leading-none hover:bg-gray-50 disabled:opacity-30">−</button>
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={e => zoomTo(Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-blue-600"
          />
          <button type="button" onClick={() => zoomTo(zoom * 1.2)} disabled={zoom >= MAX_ZOOM}
            aria-label="Zoom in"
            className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 text-lg leading-none hover:bg-gray-50 disabled:opacity-30">+</button>
        </div>

        <div className="mt-4 px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-100">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={!natural || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300">
            {saving ? "Saving…" : "Use photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
