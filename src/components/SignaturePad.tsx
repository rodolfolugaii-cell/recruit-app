"use client";

/**
 * SignaturePad.tsx — freehand signature capture for the apply form.
 *
 * Uses pointer events, so a finger on a phone, a stylus, and a click-drag with
 * a mouse all run through the same handlers. `touch-action: none` on the canvas
 * stops mobile browsers from scrolling the page mid-stroke.
 *
 * Emits a TRIMMED, transparent PNG data URL: the ink is cropped to its bounding
 * box before export, so a small squiggle in a wide box still fills the space it
 * is given on the biodata PDF instead of floating in a sea of empty pixels.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STROKE   = "#0f172a";   // slate-900
const LINE_W   = 2.2;         // CSS px
const TRIM_PAD = 6;           // CSS px of breathing room kept around the ink

interface Pt { x: number; y: number }

/** Crop to the inked area and return a PNG data URL, or null if blank. */
function trimToInk(canvas: HTMLCanvasElement, dpr: number): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const { width, height } = canvas;
  if (!width || !height) return null;

  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // alpha channel — anything faintly inked counts
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;   // nothing drawn

  const pad = Math.round(TRIM_PAD * dpr);
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width  - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL("image/png");
}

export default function SignaturePad({
  onChange, height = 170,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dprRef    = useRef(1);
  const drawing   = useRef(false);
  const lastPt    = useRef<Pt | null>(null);
  const lastMid   = useRef<Pt | null>(null);
  const hasInkRef = useRef(false);

  const [hasInk, setHasInk] = useState(false);

  /* ── Size the backing store to the device pixel ratio so strokes stay crisp.
        Re-runs on resize / rotation, preserving whatever is already drawn. ── */
  const resize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (rect.width < 1) return;

    const dpr  = window.devicePixelRatio || 1;
    const prev = hasInkRef.current ? c.toDataURL() : null;

    dprRef.current = dpr;
    c.width  = Math.round(rect.width  * dpr);
    c.height = Math.round(rect.height * dpr);

    // Resetting width/height clears the context, so restyle it every time
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth   = LINE_W;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.strokeStyle = STROKE;
    ctx.fillStyle   = STROKE;

    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = prev;
    }
  }, []);

  useEffect(() => {
    resize();
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [resize]);

  const ctxOf = () => canvasRef.current?.getContext("2d") ?? null;

  const pointAt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const emit = () => {
    const c = canvasRef.current;
    if (!c) return;
    onChange(trimToInk(c, dprRef.current));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const ctx = ctxOf();
    if (!ctx) return;
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;

    const p = pointAt(e);
    lastPt.current  = p;
    lastMid.current = p;

    // A tap with no movement should still leave a mark
    ctx.beginPath();
    ctx.arc(p.x, p.y, LINE_W / 2, 0, Math.PI * 2);
    ctx.fill();

    hasInkRef.current = true;
    setHasInk(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ctxOf();
    if (!ctx || !lastPt.current || !lastMid.current) return;

    const p   = pointAt(e);
    const lp  = lastPt.current;
    const mid = { x: (lp.x + p.x) / 2, y: (lp.y + p.y) / 2 };

    // Quadratic through the midpoints — smooths the sparse samples a fast
    // swipe produces, which plain lineTo renders as visible facets.
    ctx.beginPath();
    ctx.moveTo(lastMid.current.x, lastMid.current.y);
    ctx.quadraticCurveTo(lp.x, lp.y, mid.x, mid.y);
    ctx.stroke();

    lastPt.current  = p;
    lastMid.current = mid;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current  = null;
    lastMid.current = null;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    emit();
  };

  const clear = () => {
    const c   = canvasRef.current;
    const ctx = ctxOf();
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    hasInkRef.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Signature <span className="text-red-500">*</span>
        </label>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          Clear
        </button>
      </div>

      <div className={`relative rounded-lg border-2 bg-white transition-colors ${hasInk ? "border-gray-300" : "border-dashed border-gray-300"}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            display: "block",
            width: "100%",
            height,
            touchAction: "none",   // keeps the page from scrolling mid-stroke
            cursor: "crosshair",
          }}
        />

        {/* Baseline + hint, hidden as soon as there is ink */}
        {!hasInk && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm text-gray-400">Sign here</span>
            <span className="text-[11px] text-gray-300 mt-0.5">Use your finger, stylus, or mouse</span>
          </div>
        )}
        <div className="absolute left-6 right-6 pointer-events-none border-b border-gray-200" style={{ bottom: 28 }} />
      </div>

      <p className="text-[11px] text-gray-400 mt-1.5">
        By signing you confirm the details above are true and correct.
      </p>
    </div>
  );
}
