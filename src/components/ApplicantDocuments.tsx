"use client";

/**
 * ApplicantDocuments.tsx — the passport and visa at the end of a profile.
 *
 * Two thumbnails; clicking one opens a full-screen viewer:
 *
 *   zoom      − / + buttons, the mouse wheel (towards the cursor), or the
 *             + / − / 0 keys; 0 and "Fit" go back to the whole page
 *   pan       hold SPACE and drag — the cursor turns into a hand, as in an
 *             image editor. Once zoomed in, a plain drag pans too.
 *   switch    the Passport / Visa tabs, or ← / → when both are on file
 *   close     ✕, Esc, or a click on the dark backdrop
 *
 * The files sit in a private bucket, so each is shown through a signed URL
 * made when the profile opens (see lib/applicantDocuments.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DOCUMENT_LABELS, signedDocumentUrl, type DocumentKind,
} from "@/lib/applicantDocuments";

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const STEP      = 1.25;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type Urls = Partial<Record<DocumentKind, string>>;

/* ── Full-screen viewer ──────────────────────────────────────────────────── */
function DocumentViewer({
  urls, start, onClose,
}: { urls: Urls; start: DocumentKind; onClose: () => void }) {
  const kinds = (Object.keys(DOCUMENT_LABELS) as DocumentKind[]).filter(k => urls[k]);
  const [kind, setKind]       = useState<DocumentKind>(start);
  const [scale, setScale]     = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpace] = useState(false);
  const [dragging, setDrag]   = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  // Where a drag started, and whether it moved — a drag must not count as a
  // click on the backdrop and close the viewer
  const dragFrom = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const moved    = useRef(false);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  const show = useCallback((k: DocumentKind) => { setKind(k); setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  /** Zoom by `factor`, keeping the point under (cx, cy) — stage-centre coordinates — still. */
  const zoomAt = useCallback((factor: number, cx = 0, cy = 0) => {
    const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    const k = next / scale;
    setScale(next);
    setOffset({ x: cx - (cx - offset.x) * k, y: cy - (cy - offset.y) * k });
  }, [scale, offset]);

  /* ── Keyboard: Space to grab, zoom keys, arrows, Esc ── */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); setSpace(true); return; }
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomAt(STEP); }
      if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomAt(1 / STEP); }
      if (e.key === "0") { e.preventDefault(); reset(); }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && kinds.length > 1) {
        e.preventDefault();
        const i = kinds.indexOf(kind);
        show(kinds[(i + (e.key === "ArrowRight" ? 1 : kinds.length - 1)) % kinds.length]);
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") { e.preventDefault(); setSpace(false); } };
    // A lost key-up (window switched mid-hold) must not leave the hand stuck on
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [kind, kinds, onClose, reset, show, zoomAt]);

  /* ── Wheel: zoom towards the cursor. Non-passive so the page does not scroll. ── */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [zoomAt]);

  /* ── Drag to pan: with Space held, or any time once zoomed in ── */
  const canPan = spaceHeld || scale > 1;

  const onPointerDown = (e: React.PointerEvent) => {
    moved.current = false;
    if (!canPan) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    setDrag(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setOffset({ x: d.ox + dx, y: d.oy + dy });
  };
  const endDrag = () => { dragFrom.current = null; setDrag(false); };

  const btn = "w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-lg font-semibold transition-colors disabled:opacity-30";

  return createPortal(
    <div className="fixed inset-0 z-[10001] bg-black/90 flex flex-col select-none" role="dialog" aria-modal="true"
      aria-label={`${DOCUMENT_LABELS[kind]} viewer`}>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-black/60 text-white">
        <div className="flex gap-1">
          {kinds.map(k => (
            <button key={k} onClick={() => show(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                k === kind ? "bg-white text-gray-900" : "text-white/70 hover:bg-white/10"
              }`}>
              {DOCUMENT_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={() => zoomAt(1 / STEP)} disabled={scale <= MIN_SCALE} className={btn} aria-label="Zoom out">−</button>
        <span className="w-14 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
        <button onClick={() => zoomAt(STEP)} disabled={scale >= MAX_SCALE} className={btn} aria-label="Zoom in">+</button>
        <button onClick={reset} className="px-3 h-9 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-semibold transition-colors">Fit</button>
        <button onClick={onClose} className={`${btn} ml-2`} aria-label="Close">✕</button>
      </div>

      {/* ── Stage ── */}
      <div
        ref={stageRef}
        className="relative flex-1 overflow-hidden flex items-center justify-center touch-none"
        style={{ cursor: dragging ? "grabbing" : canPan ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={e => { if (e.target === e.currentTarget && !moved.current && !spaceHeld) onClose(); }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={urls[kind]}
          alt={DOCUMENT_LABELS[kind]}
          draggable={false}
          className="max-w-[92%] max-h-[92%] object-contain shadow-2xl pointer-events-none"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging ? "none" : "transform 0.12s ease-out",
          }}
        />
      </div>

      <p className="py-2 text-center text-[11px] text-white/50">
        Scroll or − / + to zoom · hold <kbd className="px-1 rounded bg-white/15">Space</kbd> and drag to move ·{" "}
        <kbd className="px-1 rounded bg-white/15">0</kbd> to fit · <kbd className="px-1 rounded bg-white/15">Esc</kbd> to close
      </p>
    </div>,
    document.body,
  );
}

/* ── Thumbnails, shown at the end of the biodata ─────────────────────────── */
export default function ApplicantDocuments({
  passportPath, visaPath,
}: { passportPath?: string | null; visaPath?: string | null }) {
  const [urls, setUrls]       = useState<Urls>({});
  const [failed, setFailed]   = useState(false);
  const [open, setOpen]       = useState<DocumentKind | null>(null);

  const paths: Partial<Record<DocumentKind, string>> = {};
  if (passportPath) paths.passport = passportPath;
  if (visaPath)     paths.visa     = visaPath;
  const kinds = Object.keys(DOCUMENT_LABELS) as DocumentKind[];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const entries = await Promise.all(
          ([["passport", passportPath], ["visa", visaPath]] as const)
            .filter(([, p]) => !!p)
            .map(async ([k, p]) => [k, await signedDocumentUrl(p as string)] as const),
        );
        if (alive) setUrls(Object.fromEntries(entries));
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [passportPath, visaPath]);

  return (
    <div className="mt-4 pt-3 border-t border-gray-300">
      <p className="font-bold text-[10px] uppercase tracking-wide mb-2">Passport &amp; Visa</p>
      {failed && (
        <p className="mb-2 text-[11px] text-red-600">The documents could not be opened. Try closing and reopening the profile.</p>
      )}
      <div className="flex flex-wrap gap-3">
        {kinds.map(k => {
          const url = urls[k];
          if (!paths[k]) {
            return (
              <div key={k} className="w-36">
                <div className="h-24 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center text-[11px] text-gray-400">
                  Not uploaded
                </div>
                <p className="mt-1 text-[11px] font-semibold text-gray-500">{DOCUMENT_LABELS[k]}</p>
              </div>
            );
          }
          return (
            <button key={k} type="button" onClick={() => url && setOpen(k)} disabled={!url}
              title={`View ${DOCUMENT_LABELS[k]}`}
              className="w-36 text-left group focus:outline-none">
              <div className="h-24 rounded-lg border border-gray-300 bg-gray-100 overflow-hidden shadow-sm group-hover:shadow-md group-hover:border-blue-400 group-focus-visible:ring-2 group-focus-visible:ring-blue-400 transition-all flex items-center justify-center">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={DOCUMENT_LABELS[k]} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-gray-400">{failed ? "Unavailable" : "Loading…"}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] font-semibold text-gray-700 group-hover:text-blue-600">
                {DOCUMENT_LABELS[k]} <span className="font-normal text-gray-400">· click to view</span>
              </p>
            </button>
          );
        })}
      </div>

      {open && <DocumentViewer urls={urls} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
