"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SETUP (one-time, before using the mapper)
// ─────────────────────────────────────────────────────────────────────────────
// 1. Run supabase/migrations/20260818000200_pdf_field_mappings.sql, which
//    creates the table this page reads and writes. See supabase/README.md.
//
// 2. Create a PUBLIC Storage bucket named `pdf-templates` for the rendered
//    page images.
//
// 3. Upload the biodata PDF once with the "📤 Upload PDF" button. Both pages are
//    rendered and saved to Storage, so every recruiter loads the same template.
//
// 4. (Optional) "📂 Import JSON" → biodata_field_mapping.json to pre-populate
//    all 157 positions, then "💾 Save All".
//
// The global default text size lives in a reserved row with
// field_id = '__settings__'. It is written by "Save All" and skipped when
// generating PDFs.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { resetPdfTemplateCache } from "@/lib/pdfTemplates";
import {
  cropRowId, cropToMargins, dragCrop, fullPageCrop, isCropRow, isFullPage,
  marginsToCrop, normaliseCrop, type Crop, type CropHandle,
} from "@/lib/pdfCrop";
import {
  CHECKBOX_SIZE, TICK_SIZE, TICK_WEIGHT,
  TICK_LEFT_DX, TICK_LEFT_DY, TICK_RIGHT_DX, TICK_RIGHT_DY,
} from "@/lib/pdfDraw";
import {
  DEFAULT_FORM_ID, FORMS, fieldLookup, formOwnsField, getDefaultDims, getForm,
  templateImageName, type FieldType, type FormDef,
} from "@/lib/pdfForms";
import { combCellId, parseCombCell } from "@/lib/pdfCombs";

const BUCKET = "pdf-templates";

// ── Text size ────────────────────────────────────────────────────────────────
const DEFAULT_TXT_SIZE = 8;   // pt — matches exportBiodataPdf's fallback
const MIN_TXT_SIZE     = 4;
const MAX_TXT_SIZE     = 24;
// Reserved row that stores the global default size (never stamped on the PDF)
const SETTINGS_ROW_ID  = "__settings__";

// ── pdfjs loaded from CDN at runtime (no npm install) ────────────────────────
const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

async function ensurePdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${PDFJS_CDN}/pdf.min.js`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load pdf.js from CDN"));
    document.head.appendChild(s);
  });
  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
    `${PDFJS_CDN}/pdf.worker.min.js`;
  return (window as any).pdfjsLib;
}

async function pdfToDataUrls(file: File, maxPages: number): Promise<Record<number, string>> {
  const pdfjs = await ensurePdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const out: Record<number, string> = {};
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
    out[i] = canvas.toDataURL("image/png");
  }
  return out;
}

// ── Supabase Storage helpers ──────────────────────────────────────────────────
function storageUrl(form: FormDef, page: number): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(templateImageName(form, page));
  // Cache-bust so the browser re-fetches after a new upload
  return `${data.publicUrl}?t=${Date.now()}`;
}

async function uploadPageToStorage(
  dataUrl: string,
  form: FormDef,
  page: number
): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(templateImageName(form, page), blob, {
        contentType: "image/png",
        upsert: true,  // overwrite the old template if one already exists
      });
    if (error) throw error;
    return storageUrl(form, page);
  } catch (err: any) {
    console.error("Storage upload error:", err);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
// FieldType / FieldDef / FormSection describe what a form HAS; Mapping is the
// row in pdf_field_mappings saying where one of those fields sits.
interface Mapping   { field_id: string; label: string; field_type: string; page: number; x: number; y: number; w: number; h: number; font_size?: number | null; align?: string | null; }

// Only these types print text, so only they get a size control
const isTextual = (type: string) => type === "text" || type === "date";

// ── Reusable ±0.5pt size stepper ──────────────────────────────────────────────
// Declared outside the component so the input never remounts (and never loses
// focus) while typing.
function SizeStepper({
  value, onChange, base, title,
}: {
  value: number | null;                    // null = inheriting the default
  onChange: (v: number | null) => void;
  base: number;                            // value used when stepping from null
  title?: string;
}) {
  const clamp = (n: number) =>
    Math.min(MAX_TXT_SIZE, Math.max(MIN_TXT_SIZE, parseFloat(n.toFixed(1))));
  const step = (delta: number) => onChange(clamp((value ?? base) + delta));

  return (
    <div className="flex items-center bg-white border border-slate-300 rounded-md overflow-hidden" title={title}>
      <button
        onClick={() => step(-0.5)}
        className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 font-bold text-sm transition-colors"
        title="Smaller"
      >−</button>
      <input
        type="number" step={0.5} min={MIN_TXT_SIZE} max={MAX_TXT_SIZE}
        value={value ?? ""}
        placeholder={String(base)}
        onChange={e => {
          const raw = e.target.value;
          if (raw === "") { onChange(null); return; }
          const n = parseFloat(raw);
          onChange(Number.isFinite(n) ? clamp(n) : null);
        }}
        className="w-11 h-6 text-center text-xs text-slate-700 tabular-nums border-x border-slate-200 focus:outline-none focus:bg-blue-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={() => step(0.5)}
        className="w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-100 font-bold text-sm transition-colors"
        title="Bigger"
      >+</button>
      <span className="px-1.5 text-[10px] text-slate-400 select-none">pt</span>
    </div>
  );
}

/**
 * A width or height field that commits on blur or Enter rather than on every
 * keystroke.
 *
 * Applying as you type looks reasonable until someone clears the box to retype:
 * the empty string parses to nothing, the box snaps to its minimum, and the
 * controlled value fights the cursor. Holding a draft keeps typing free and
 * still lands a single, clamped change.
 */
function SizeInput({
  label, value, onCommit, tone = "slate",
}: {
  label: string;
  /** "" when a selection disagrees, which shows as a "mixed" placeholder. */
  value: number | "";
  onCommit: (v: number) => void;
  tone?: "slate" | "blue";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === "" ? "" : String(value));

  const commit = () => {
    if (draft === null) return;
    const v = parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(v)) onCommit(v);
  };

  return (
    <label className="flex items-center gap-1">
      <span className={`text-[11px] ${tone === "blue" ? "text-blue-500" : "text-slate-400"}`}>{label}</span>
      <input
        type="number" step={1} min={4}
        value={shown}
        placeholder={value === "" ? "mixed" : undefined}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { e.preventDefault(); setDraft(null); (e.target as HTMLInputElement).blur(); }
        }}
        className={`w-16 h-7 px-1.5 text-center text-xs tabular-nums text-slate-700 bg-white border rounded focus:outline-none focus:border-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
          tone === "blue" ? "border-blue-200" : "border-slate-300"
        }`}
      />
    </label>
  );
}

const TYPE_STYLE: Record<FieldType, { bg: string; border: string; badge: string; dot: string }> = {
  text:      { bg: "bg-blue-400/20",   border: "border-blue-500",   badge: "bg-blue-100 text-blue-700",    dot: "bg-blue-500"   },
  checkbox:  { bg: "bg-green-400/20",  border: "border-green-500",  badge: "bg-green-100 text-green-700",  dot: "bg-green-500"  },
  date:      { bg: "bg-amber-400/20",  border: "border-amber-500",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-500"  },
  image:     { bg: "bg-purple-400/20", border: "border-purple-500", badge: "bg-purple-100 text-purple-700",dot: "bg-purple-500" },
  signature: { bg: "bg-red-400/20",    border: "border-red-500",    badge: "bg-red-100 text-red-700",      dot: "bg-red-500"    },
};

/* Fine steps up to 200% for framing the page, coarser above it: past 200% the
   work is nudging one box onto one printed rule, so the jumps can be bigger
   without losing the place. 500% puts about a fifth of an A4 width on screen —
   enough to see a comb cell's own borders. */
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500];
/* Above this the scan is magnified past its own resolution. Smoothing turns a
   printed rule into a grey gradient, which is the one thing you are trying to
   line a box up against — so show the pixels instead. */
const ZOOM_PIXELATED = 200;
const BASE_W = 540; // base PDF panel width in px at 100% zoom

// ── Component ──────────────────────────────────────────────────────────────────
export default function PdfMapper() {
  const [mappings, setMappings]       = useState<Record<string, Mapping>>({});
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [formId, setFormId] = useState<string>(DEFAULT_FORM_ID);
  const form = useMemo(() => getForm(formId), [formId]);

  const PDF_W        = form.width;
  const PDF_H        = form.height;
  const SECTIONS     = form.sections;
  const FIELD_LOOKUP = useMemo(() => fieldLookup(form), [form]);
  const dimsFor      = useCallback((id: string) => getDefaultDims(form, id), [form]);
  // pdf_field_mappings holds every form's rows. Without this the biodata's 157
  // boxes would all draw on top of ID 407 sheet 1, since both call it page 1.
  // Comb cells added here are owned too, though the form never declared them.
  const ownsField = useCallback((id: string) => formOwnsField(form, id), [form]);

  // The crop window per form, as loaded and as edited. Field positions stay in
  // full-page space, so changing this never moves a box relative to the form —
  // see pdfCrop.ts.
  const [crops, setCrops] = useState<Record<string, Crop>>({});
  // Right-click menu over a placed box: resize it, or grow a comb a cell at a time
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  /* ── Desktop-style selection ──────────────────────────────────────────────
     Dragging on bare paper draws a rubber band and takes everything it touches,
     the way a file manager does. `selection` is what that leaves behind, and
     what the group toolbar acts on. It is separate from `selectedId`, which
     means "the field I am about to place" — quite a different idea. */
  const [selection, setSelection] = useState<string[]>([]);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Read by the key handler, which must not be rebuilt on every selection change
  const selectionRef = useRef<string[]>([]);
  const deleteSelectionRef = useRef<() => void>(() => {});
  const marqueeRef = useRef<{ x0: number; y0: number } | null>(null);
  // The band's latest extent, so mouseup can select without waiting on a render
  const marqueeNowRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const crop = crops[form.id] ?? fullPageCrop(PDF_W, PDF_H);
  const margins = cropToMargins(crop, PDF_W, PDF_H);
  const cropped = !isFullPage(crop, PDF_W, PDF_H);

  const setMargin = (edge: "top" | "right" | "bottom" | "left", value: number) => {
    const next = marginsToCrop({ ...margins, [edge]: value }, PDF_W, PDF_H);
    setCrops(p => ({ ...p, [form.id]: next }));
  };
  const resetCrop = () =>
    setCrops(p => ({ ...p, [form.id]: fullPageCrop(PDF_W, PDF_H) }));

  /* ── Adjusting the crop by eye ────────────────────────────────────────────
     Numbers alone make you guess at what is being cut off. While this is on the
     whole scan is shown with the crop drawn over it and everything outside it
     dimmed, so the window can be dragged onto the form's real edges. */
  const [cropEditing, setCropEditing] = useState(false);

  const startCropDrag = useCallback((handle: CropHandle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!overlayRef.current) return;
    const rect  = overlayRef.current.getBoundingClientRect();
    const scale = PDF_W / rect.width;          // screen px -> page points
    const start = crops[form.id] ?? fullPageCrop(PDF_W, PDF_H);
    const ox = e.clientX, oy = e.clientY;

    const onMove = (me: MouseEvent) => {
      const next = dragCrop(
        start, handle,
        (me.clientX - ox) * scale,
        (me.clientY - oy) * scale,
        PDF_W, PDF_H,
      );
      setCrops(p => ({ ...p, [form.id]: next }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = handle === "move" ? "move" : `${handle}-resize`;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [crops, form.id, PDF_W, PDF_H]);
  const PAGE_NUMBERS = useMemo(
    () => Array.from({ length: form.pages }, (_, i) => i + 1),
    [form],
  );

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [saveStatus, setSaveStatus]   = useState<"idle" | "saving" | "saved" | "error">("idle");
  /* What the server currently holds, as a comparable string per field id.
     Edits accumulate across every form in one session, so "unsaved" has to be
     answered for all of them at once — not just the form on screen. Comparing
     against a snapshot rather than setting a flag at each mutation site means
     no new edit action can forget to mark itself, and undoing a change by hand
     correctly clears the warning. State, not a ref: saving replaces it without
     touching `mappings`, and the badge still has to clear on that render. */
  const [savedSnap, setSavedSnap] = useState<Record<string, string>>({});
  const [statusMsg, setStatusMsg]     = useState("");
  const [expanded, setExpanded]       = useState<Record<string, boolean>>(
    Object.fromEntries(SECTIONS.map(s => [s.title, true]))
  );

  // ── Field-list filtering ─────────────────────────────────────────────────────
  // 150+ fields across the two pages, so the list needs narrowing down
  const [query, setQuery]                   = useState("");
  const [unmappedOnly, setUnmappedOnly]     = useState(false);
  const [currentPageOnly, setCurrentPageOnly] = useState(false);

  // ── Text size ────────────────────────────────────────────────────────────────
  // Global default, applied to every text/date field without its own size
  const [defaultFontSize, setDefaultFontSize] = useState(DEFAULT_TXT_SIZE);
  // Draw sample text inside markers so the size is visible on the template
  const [showTextPreview, setShowTextPreview] = useState(true);

  // ── Image state ──────────────────────────────────────────────────────────────
  // Stores the URL (Supabase Storage public URL or temporary data URL)
  const [pageImages, setPageImages]   = useState<Record<number, string>>({});
  // Track pages whose image src failed (file doesn't exist in Storage yet)
  const [imgFailed, setImgFailed]     = useState<Record<number, boolean>>({});
  // Loading states
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [renderingPdf, setRenderingPdf]     = useState(false);
  const [uploadingStorage, setUploadingStorage] = useState(false);

  // ── Zoom ──────────────────────────────────────────────────────────────────────
  const pdfContRef = useRef<HTMLDivElement>(null);   // the scroll container
  const [zoom, setZoom] = useState(100);

  /* Where to scroll once the page has grown or shrunk. At 500% the content is
     five times the viewport, so leaving scrollLeft/scrollTop where they were
     would throw whatever you were looking at off-screen — you would zoom in and
     have to go hunting for the box again.

     The target is worked out from the old scroll position alone, because the
     content scales linearly: the point under the centre of the viewport stays
     under the centre. Reading the new scrollWidth instead would mean measuring
     after layout, and the arithmetic is exact. */
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);

  const zoomTo = useCallback((next: number) => {
    const el = pdfContRef.current;
    if (el && next !== zoom) {
      const k = next / zoom;
      pendingScrollRef.current = {
        left: (el.scrollLeft + el.clientWidth  / 2) * k - el.clientWidth  / 2,
        top:  (el.scrollTop  + el.clientHeight / 2) * k - el.clientHeight / 2,
      };
    }
    setZoom(next);
  }, [zoom]);

  // Stepping by value, not by index, so a zoom set from anywhere else still
  // lands on the next rung rather than falling off the ladder at indexOf === -1.
  const zoomIn  = () => zoomTo(ZOOM_LEVELS.find(z => z > zoom) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
  const zoomOut = () => zoomTo([...ZOOM_LEVELS].reverse().find(z => z < zoom) ?? ZOOM_LEVELS[0]);

  /* The zoom buttons are ordinary clicks, so React flushes this before the
     browser paints and the jump is not visible. */
  useEffect(() => {
    const el = pdfContRef.current;
    const to = pendingScrollRef.current;
    if (!el || !to) return;
    pendingScrollRef.current = null;
    el.scrollLeft = Math.max(0, to.left);
    el.scrollTop  = Math.max(0, to.top);
  }, [zoom]);

  // ── Dynamic PDF panel width ────────────────────────────────────────────────
  // Measured from the actual scroll container so the zoom wrapper always fills it
  const [pdfContW, setPdfContW] = useState(BASE_W);

  useEffect(() => {
    const el = pdfContRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 100) setPdfContW(Math.floor(w));
    };
    measure(); // initial measure
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const overlayRef   = useRef<HTMLDivElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef  = useRef<HTMLInputElement>(null);
  const fieldRefs    = useRef<Record<string, HTMLDivElement | null>>({});
  const markerRefs   = useRef<Record<string, HTMLDivElement | null>>({});

  // Drag refs — using refs (not state) so mouse-move never triggers re-renders
  const draggingRef  = useRef<string | null>(null);
  const dragInfoRef  = useRef<{
    startPdfX: number; startPdfY: number;
    startMouseX: number; startMouseY: number;
  } | null>(null);
  const didDragRef   = useRef(false);   // blocks overlay onClick after a drag ends
  const mappingsRef  = useRef(mappings); // always-current snapshot for drag callbacks

  const showUploadZone = !pageImages[currentPage] || imgFailed[currentPage];

  // ── Load this form's template images from Storage ───────────────────────────
  // Runs again on a form switch: the sheets are different files, and showing the
  // previous form's scan under the new form's boxes would be worse than a blank.
  useEffect(() => {
    const loadFromStorage = async () => {
      setLoadingStorage(true);
      setPageImages({});
      setImgFailed({});
      const imgs: Record<number, string> = {};
      const { data: files } = await supabase.storage.from(BUCKET).list("", { search: `${form.id}-p` });
      const names = new Set(files?.map(f => f.name) ?? []);
      PAGE_NUMBERS.forEach(p => {
        const file = templateImageName(form, p);
        if (names.has(file)) {
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(file);
          imgs[p] = data.publicUrl;
        }
      });
      setPageImages(imgs);
      setLoadingStorage(false);
    };
    loadFromStorage();
  }, [form, PAGE_NUMBERS]);

  /* ── Load every form's mappings, once ──────────────────────────────────────
     One table holds every form, and Save All writes every form, so the editing
     session has to span them too. Reloading on a form switch would refetch over
     whatever had been placed and not yet saved — go and check something on the
     biodata, come back, and an afternoon on ID 988A is gone.

     So this runs once. Retired ids are carried over and measured defaults are
     seeded for ALL forms here, not just the one on screen, because the save
     that follows covers all of them. */
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("pdf_field_mappings").select("*");
      if (error) { showMsg("Could not load mappings — check the Supabase table exists."); return; }
      if (!data?.length) return;

      const map: Record<string, Mapping> = {};
      const loadedCrops: Record<string, Crop> = {};
      data.forEach((row: Mapping) => {
        // The settings row carries the global default size, not a field
        if (row.field_id === SETTINGS_ROW_ID) {
          if (row.font_size && row.font_size > 0) setDefaultFontSize(row.font_size);
          return;
        }
        // A crop row carries one form's window in the same x/y/w/h columns
        if (isCropRow(row.field_id)) {
          const id = row.field_id.slice("__crop_".length, -"__".length);
          const f  = FORMS.find(x => x.id === id);
          if (f) loadedCrops[id] = normaliseCrop(row, f.width, f.height);
          return;
        }
        map[row.field_id] = row;
      });
      setCrops(loadedCrops);

      let carried = 0;
      FORMS.forEach(f => {
        const look = fieldLookup(f);

        // Carry retired ids onto their replacement, then drop them from view
        Object.entries(f.retired).forEach(([oldId, newId]) => {
          const legacy = map[oldId];
          if (!legacy) return;
          delete map[oldId];
          if (map[newId]) return;          // already placed — keep what is there
          const def  = look[newId];
          const dims = getDefaultDims(f, newId);
          map[newId] = {
            ...legacy,
            field_id: newId,
            label:      def?.label ?? newId,
            field_type: def?.type  ?? legacy.field_type,
            w: dims.w, h: dims.h,
          };
          carried++;
        });

        // A form measured off its scan ships approximate positions. Fill only
        // the gaps, so a box someone has already placed is never moved.
        if (!f.defaultPositions) return;
        Object.entries(f.defaultPositions).forEach(([id, pos]) => {
          if (map[id]) return;
          const def = look[id];
          if (!def) return;
          const d = getDefaultDims(f, id);
          map[id] = {
            field_id: id, label: def.label, field_type: def.type,
            page: pos.page, x: pos.x, y: pos.y, w: d.w, h: d.h, font_size: null,
          };
        });
      });

      /* Snapshot only what actually came back from the table. The measured
         defaults seeded above exist nowhere but this browser, so leaving them
         out is what makes a freshly seeded form show as unsaved — which it is. */
      const snap: Record<string, string> = {};
      data.forEach((row: Mapping) => {
        if (row.field_id === SETTINGS_ROW_ID) return;
        snap[row.field_id] = isCropRow(row.field_id)
          ? `${row.x}|${row.y}|${row.w}|${row.h}`
          : `${row.page}|${row.x}|${row.y}|${row.w}|${row.h}|${row.font_size ?? ""}|${row.align ?? ""}`;
      });
      setSavedSnap(snap);

      setMappings(map);
      showMsg(carried
        ? `Loaded ${Object.keys(map).length} mappings — Boy/s and Girl/s are now a count box + an Age/s box. Place the 2 new Age/s boxes, then Save All.`
        : `Loaded ${Object.keys(map).length} saved mappings across ${FORMS.filter(f => !f.generated).length} forms`);
    })();
  }, []);

  // ── Handle PDF / image upload → render → save to Storage ─────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imgInputRef.current) imgInputRef.current.value = "";

    if (file.type === "application/pdf") {
      // ── PDF: render both pages, upload both to Storage ──────────────────────
      setRenderingPdf(true);
      showMsg("Rendering PDF pages…");
      let dataUrls: Record<number, string> = {};
      try {
        dataUrls = await pdfToDataUrls(file, form.pages);
        // Show rendered images immediately while uploading
        setPageImages(prev => ({ ...prev, ...dataUrls }));
        setImgFailed({});
      } catch {
        showMsg("Error rendering PDF. Make sure it is not password-protected.");
        setRenderingPdf(false);
        return;
      }
      setRenderingPdf(false);

      // Upload to Supabase Storage so all recruiters see the same PDF
      setUploadingStorage(true);
      showMsg("Saving to Storage… (all recruiters will see this PDF)");
      const storageUrls: Record<number, string> = {};
      let failed = false;
      for (const [pageStr, dataUrl] of Object.entries(dataUrls)) {
        const page = Number(pageStr);
        const url  = await uploadPageToStorage(dataUrl, form, page);
        if (url) {
          storageUrls[page] = url;
        } else {
          failed = true;
        }
      }
      setUploadingStorage(false);

      if (!failed) {
        setPageImages(prev => ({ ...prev, ...storageUrls }));
        resetPdfTemplateCache();  // exports must pick up the new template
        showMsg(`✓ PDF saved to Storage — ${Object.keys(storageUrls).length} pages ready for all recruiters`);
      } else {
        showMsg("⚠️ PDF rendered locally but Storage upload failed. Check bucket exists and is public.");
      }

    } else {
      // ── Image: upload this single page to Storage ────────────────────────────
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const dataUrl = evt.target?.result as string;
        // Show immediately
        setPageImages(prev => ({ ...prev, [currentPage]: dataUrl }));
        setImgFailed(prev => { const n = { ...prev }; delete n[currentPage]; return n; });

        setUploadingStorage(true);
        showMsg(`Uploading page ${currentPage} to Storage…`);
        const url = await uploadPageToStorage(dataUrl, form, currentPage);
        setUploadingStorage(false);

        if (url) {
          setPageImages(prev => ({ ...prev, [currentPage]: url }));
          resetPdfTemplateCache();  // exports must pick up the new template
          showMsg(`✓ Page ${currentPage} saved to Storage`);
        } else {
          showMsg("⚠️ Image loaded locally but Storage upload failed. Check bucket exists and is public.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Place a marker on PDF click ──────────────────────────────────────────────
  /** Page point under the cursor, in the full-page space the mappings live in. */
  const pagePoint = useCallback((clientX: number, clientY: number) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width)  * PDF_W,
      y: ((clientY - rect.top)  / rect.height) * PDF_H,
    };
  }, [PDF_W, PDF_H]);

  const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Markers stop their own mousedown, so reaching here means bare paper
    if (e.button !== 0 || !overlayRef.current) return;
    setCtxMenu(null);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const start = pagePoint(e.clientX, e.clientY);
    marqueeRef.current = { x0: start.x, y0: start.y };
    let dragged = false;

    const onMove = (me: MouseEvent) => {
      const s = marqueeRef.current;
      if (!s || !overlayRef.current) return;
      const now = pagePoint(me.clientX, me.clientY);
      if (!dragged && Math.hypot(now.x - s.x0, now.y - s.y0) < 3) return;
      dragged = true;
      const band = { x0: s.x0, y0: s.y0, x1: now.x, y1: now.y };
      marqueeNowRef.current = band;
      setMarquee(band);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const band = marqueeNowRef.current;
      marqueeRef.current = null;
      marqueeNowRef.current = null;
      setMarquee(null);

      if (!dragged || !band) {
        // A plain click on bare paper drops the selection, like a desktop
        if (!selectedId) setSelection([]);
        return;
      }

      // Anything the band touches, not only what it swallows whole — a one-point
      // wide comb cell is easy to miss otherwise.
      const left = Math.min(band.x0, band.x1), right = Math.max(band.x0, band.x1);
      const top  = Math.min(band.y0, band.y1), bottom = Math.max(band.y0, band.y1);
      const hit = Object.values(mappingsRef.current)
        .filter(m => m.page === currentPage && ownsField(m.field_id))
        .filter(m => {
          const w = m.field_type === "checkbox" ? CHECKBOX_SIZE : m.w;
          const h = m.field_type === "checkbox" ? CHECKBOX_SIZE : m.h;
          return m.x < right && m.x + w > left && m.y < bottom && m.y + h > top;
        })
        .map(m => m.field_id);

      // Shift keeps what was already chosen, as every desktop does
      setSelection(prev => additive ? [...new Set([...prev, ...hit])] : hit);

      // Placement would be surprising after a rubber band, so suppress the click
      didDragRef.current = true;
      setTimeout(() => { didDragRef.current = false; }, 50);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pagePoint, selectedId, currentPage, ownsField]);

  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't place a new marker if this click was the tail-end of a drag
    if (didDragRef.current) return;
    if (!selectedId || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const pdfX = parseFloat(((e.clientX - rect.left) / rect.width  * PDF_W).toFixed(1));
    const pdfY = parseFloat(((e.clientY - rect.top)  / rect.height * PDF_H).toFixed(1));
    const def  = FIELD_LOOKUP[selectedId];
    const dims = dimsFor(selectedId);
    setMappings(prev => ({
      ...prev,
      [selectedId]: {
        field_id: selectedId, label: def?.label ?? selectedId,
        field_type: def?.type ?? "text", page: currentPage,
        x: pdfX, y: pdfY,
        w: prev[selectedId]?.w ?? dims.w,
        h: prev[selectedId]?.h ?? dims.h,
      },
    }));
    // Auto-advance to next unmapped field on this page
    const ids  = SECTIONS.filter(s => s.page === currentPage).flatMap(s => s.fields).map(f => f.id);
    const idx  = ids.indexOf(selectedId);
    const next = ids.slice(idx + 1).find(fid => !mappings[fid] && fid !== selectedId);
    setSelectedId(next ?? null);
    if (next) setTimeout(() => fieldRefs.current[next]?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [selectedId, currentPage, mappings, SECTIONS, FIELD_LOOKUP, dimsFor, PDF_W, PDF_H]);

  // Keep mappingsRef in sync so drag callbacks always read the latest positions
  useEffect(() => { mappingsRef.current = mappings; }, [mappings]);

  // ── Drag existing markers to reposition ──────────────────────────────────────
  // Uses direct DOM updates during the drag (no React re-renders) for butter-smooth
  // movement, then commits the final PDF coordinate to React state on mouseup.
  const handleMarkerMouseDown = useCallback((
    e: React.MouseEvent<HTMLDivElement>,
    fieldId: string,
  ) => {
    e.preventDefault();
    e.stopPropagation(); // don't trigger overlay onClick

    const mapping = mappingsRef.current[fieldId];
    if (!mapping || !overlayRef.current) return;

    draggingRef.current = fieldId;
    didDragRef.current  = false;
    dragInfoRef.current = {
      startPdfX:   mapping.x,
      startPdfY:   mapping.y,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
    };

    setSelectedId(fieldId);
    document.body.style.cursor     = "grabbing";
    document.body.style.userSelect = "none";

    // Lift the marker visually
    const el = markerRefs.current[fieldId];
    if (el) {
      el.style.opacity   = "0.85";
      el.style.zIndex    = "50";
      el.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)";
      el.style.transition = "none"; // disable any CSS transition during drag
    }

    const onMove = (me: MouseEvent) => {
      if (!draggingRef.current || !dragInfoRef.current || !overlayRef.current) return;
      const info = dragInfoRef.current;
      const rect = overlayRef.current.getBoundingClientRect();

      const newX = Math.max(0, Math.min(PDF_W,
        info.startPdfX + ((me.clientX - info.startMouseX) / rect.width)  * PDF_W));
      const newY = Math.max(0, Math.min(PDF_H,
        info.startPdfY + ((me.clientY - info.startMouseY) / rect.height) * PDF_H));

      // Update DOM directly — bypasses React for silky performance
      const markerEl = markerRefs.current[draggingRef.current];
      if (markerEl) {
        markerEl.style.left = `${(newX / PDF_W) * 100}%`;
        markerEl.style.top  = `${(newY / PDF_H) * 100}%`;
      }
    };

    const onUp = (me: MouseEvent) => {
      const fid  = draggingRef.current;
      const info = dragInfoRef.current;
      if (!fid || !info || !overlayRef.current) return;

      const rect = overlayRef.current.getBoundingClientRect();
      const dx = me.clientX - info.startMouseX;
      const dy = me.clientY - info.startMouseY;

      // Only commit if the mouse actually moved (avoids jitter on plain clicks)
      if (Math.hypot(dx, dy) > 3) {
        didDragRef.current = true;
        setTimeout(() => { didDragRef.current = false; }, 50);

        const newX = parseFloat(Math.max(0, Math.min(PDF_W,
          info.startPdfX + (dx / rect.width)  * PDF_W)).toFixed(1));
        const newY = parseFloat(Math.max(0, Math.min(PDF_H,
          info.startPdfY + (dy / rect.height) * PDF_H)).toFixed(1));

        setMappings(prev => ({
          ...prev,
          [fid]: { ...prev[fid], x: newX, y: newY },
        }));
      }

      // Restore marker style
      const markerEl = markerRefs.current[fid];
      if (markerEl) {
        markerEl.style.opacity    = "";
        markerEl.style.zIndex     = "";
        markerEl.style.boxShadow  = "";
        markerEl.style.transition = "";
      }

      draggingRef.current = null;
      dragInfoRef.current = null;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [PDF_W, PDF_H]);

  // ── Nudge the selected marker with the arrow keys ────────────────────────────
  // Dragging can only ever be as precise as the zoom allows: at 100% one screen
  // pixel is more than a PDF point, so a box cannot be landed exactly on a ruled
  // line by hand. The arrows step in real points instead, which makes placement
  // exact and repeatable whatever the zoom happens to be.
  useEffect(() => {
    const DIRS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Never steal a key from someone typing in the sidebar or a size box
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
                 el.tagName === "SELECT" || el.isContentEditable)) return;

      // Escape drops the rubber-band selection, Delete clears what it holds
      if (e.key === "Escape" && selectionRef.current.length) {
        setSelection([]); setCtxMenu(null); return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectionRef.current.length) {
        e.preventDefault(); deleteSelectionRef.current(); return;
      }

      const dir = DIRS[e.key];
      if (!dir) return;
      if (e.altKey) return;          // leave the browser's own alt+arrow alone

      // A rubber-band selection moves as one; otherwise it is the box being
      // placed. Nudging only the placing box while five sit selected would look
      // like the arrows had stopped working.
      const group = selectionRef.current.length
        ? selectionRef.current
        : selectedId ? [selectedId] : [];
      if (!group.length) return;

      // A field that is selected but not yet placed has nothing to nudge, and a
      // box on another page would move invisibly
      const movable = group.filter(id => {
        const m = mappingsRef.current[id];
        return m && m.page === currentPage;
      });
      if (!movable.length) return;

      // Shift for coarse, ctrl/cmd for the finest step the stored 0.1pt allows
      const step = e.shiftKey ? 10 : (e.ctrlKey || e.metaKey) ? 0.1 : 1;
      e.preventDefault();            // stop the page scrolling under the mapper

      setMappings(prev => {
        const next = { ...prev };
        movable.forEach(id => {
          const m = next[id];
          if (!m) return;
          next[id] = {
            ...m,
            x: parseFloat(Math.max(0, Math.min(PDF_W, m.x + dir[0] * step)).toFixed(1)),
            y: parseFloat(Math.max(0, Math.min(PDF_H, m.y + dir[1] * step)).toFixed(1)),
          };
        });
        return next;
      });
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId, currentPage, PDF_W, PDF_H]);

  /* ── Resizing ────────────────────────────────────────────────────────────
     Until now a box took its size from the form's default and could never be
     changed, so a field that printed too wide had to be lived with. */

  /** Every id a size change should reach, given one starting id. */
  const resizeGroup = useCallback((fieldId: string): string[] => {
    // A comb is one field printed as a row of identical squares. Sizing one and
    // not the rest would leave letters in boxes of different widths, so the
    // whole comb follows suit.
    const cell = parseCombCell(fieldId);
    if (cell && form.combs?.some(c => c.base === cell.base)) {
      return Object.keys(mappings).filter(
        id => parseCombCell(id)?.base === cell.base
      );
    }
    return [fieldId];
  }, [form, mappings]);

  const MIN_BOX = 4;   // pt — below this a box cannot be grabbed or seen

  /**
   * How a value sits in its box.
   *
   * Centred suits a blank on a printed form; left suits prose that continues
   * onto the line below, where the lines must share a margin to read as one
   * paragraph. Clearing it hands the choice back to the form's own rule.
   */
  const setAlign = useCallback((ids: string[], align: "left" | "center" | null) => {
    setMappings(p => {
      const next = { ...p };
      ids.forEach(id => { if (next[id]) next[id] = { ...next[id], align }; });
      return next;
    });
  }, []);

  /** What a box will actually do, given the form's rule when it has no choice of its own. */
  const effectiveAlign = useCallback((id: string): "left" | "center" => {
    const m = mappings[id];
    if (m?.align === "left" || m?.align === "center") return m.align;
    return form.paragraphs.some(g => g.includes(id)) ? "left" : "center";
  }, [mappings, form]);

  const resizeFields = useCallback((ids: string[], w?: number, h?: number) => {
    setMappings(p => {
      const next = { ...p };
      ids.forEach(id => {
        const m = next[id];
        if (!m) return;
        next[id] = {
          ...m,
          w: w === undefined ? m.w : parseFloat(Math.max(MIN_BOX, w).toFixed(1)),
          h: h === undefined ? m.h : parseFloat(Math.max(MIN_BOX, h).toFixed(1)),
        };
      });
      return next;
    });
  }, []);

  /**
   * Drag one edge or corner of a mapped box.
   *
   * Same rectangle problem as the crop window, so the same swept-tested
   * geometry does the arithmetic — only the minimum differs, since a box may be
   * far smaller than a crop. A comb resizes as one, exactly as the numeric
   * fields do, so a row of letter squares cannot end up ragged.
   */
  const startBoxResize = useCallback((fieldId: string, handle: CropHandle, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const m = mappingsRef.current[fieldId];
    if (!m || !overlayRef.current) return;

    const rect  = overlayRef.current.getBoundingClientRect();
    const scale = PDF_W / rect.width;
    const start = { x: m.x, y: m.y, w: m.w, h: m.h };
    const group = resizeGroup(fieldId);
    const ox = e.clientX, oy = e.clientY;

    const onMove = (me: MouseEvent) => {
      const next = dragCrop(
        start, handle,
        (me.clientX - ox) * scale,
        (me.clientY - oy) * scale,
        PDF_W, PDF_H, MIN_BOX,
      );
      setMappings(p => {
        const out = { ...p };
        group.forEach(id => {
          const box = out[id];
          if (!box) return;
          // Only this box moves; the rest of a comb just matches its size
          out[id] = id === fieldId
            ? { ...box, x: next.x, y: next.y, w: next.w, h: next.h }
            : { ...box, w: next.w, h: next.h };
        });
        return out;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = `${handle}-resize`;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [PDF_W, PDF_H, resizeGroup]);

  /* ── Growing a comb ──────────────────────────────────────────────────────
     The printed form has a fixed number of little squares, but a scan can be
     miscounted and another form may want more. Adding steps one pitch to the
     right of the box you right-clicked, so a comb is built by repeating the
     same gesture rather than by placing each square from scratch. */
  const combOf = useCallback((fieldId: string) => {
    const cell = parseCombCell(fieldId);
    if (!cell) return null;
    const spec = form.combs?.find(c => c.base === cell.base);
    return spec ? { spec, n: cell.n } : null;
  }, [form]);

  const addCombBox = useCallback((fieldId: string) => {
    const found = combOf(fieldId);
    if (!found) return;
    const { spec } = found;
    const from = mappings[fieldId];
    if (!from) return;

    // The next free number, so removing from the middle never collides
    let next = 1;
    Object.keys(mappings).forEach(id => {
      const c = parseCombCell(id);
      if (c?.base === spec.base && c.n >= next) next = c.n + 1;
    });
    const id = combCellId(spec.base, next);

    setMappings(p => ({
      ...p,
      [id]: {
        field_id: id,
        label: `${spec.label} — box ${next}`,
        field_type: "text",
        page: from.page,
        x: parseFloat((from.x + spec.pitch).toFixed(1)),
        y: from.y,
        w: from.w,
        h: from.h,
        font_size: from.font_size ?? null,
      },
    }));
    setSelectedId(id);
    showMsg(`Added ${spec.label} box ${next} — drag it into place, then Save All.`);
  }, [combOf, mappings]);

  const removeCombBox = useCallback((fieldId: string) => {
    const found = combOf(fieldId);
    if (!found) return;
    setMappings(p => { const n = { ...p }; delete n[fieldId]; return n; });
    if (selectedId === fieldId) setSelectedId(null);
    showMsg(`Removed ${found.spec.label} box ${found.n}. Save All to keep the change.`);
  }, [combOf, selectedId]);

  /* ── Group actions ──────────────────────────────────────────────────────── */
  /* One row's saveable content. Only the columns Save All writes are included,
     so the `id` / `updated_at` that come back from select("*") cannot make an
     untouched row look edited. */
  const rowKey = (m: Mapping) =>
    `${m.page}|${m.x}|${m.y}|${m.w}|${m.h}|${m.font_size ?? ""}|${m.align ?? ""}`;

  /** Unsaved edits per form, plus the total — drives the Save All badge. */
  const unsaved = useMemo(() => {
    const live: Record<string, string> = {};
    Object.values(mappings).forEach(m => {
      if (m.field_id === SETTINGS_ROW_ID || isCropRow(m.field_id)) return;
      live[m.field_id] = rowKey(m);
    });
    Object.entries(crops).forEach(([id, c]) => {
      const f = FORMS.find(x => x.id === id);
      if (f && !isFullPage(c, f.width, f.height)) live[cropRowId(id)] = `${c.x}|${c.y}|${c.w}|${c.h}`;
    });

    const saved = savedSnap;
    const changed = Array.from(new Set([...Object.keys(live), ...Object.keys(saved)]))
      .filter(id => live[id] !== saved[id]);

    const byForm: Record<string, number> = {};
    changed.forEach(id => {
      const owner = isCropRow(id)
        ? FORMS.find(f => cropRowId(f.id) === id)
        : FORMS.find(f => formOwnsField(f, id));
      if (owner) byForm[owner.id] = (byForm[owner.id] ?? 0) + 1;
    });
    return { total: changed.length, byForm };
  }, [mappings, crops, savedSnap]);

  const selectionBoxes = useMemo(
    () => selection.map(id => mappings[id]).filter(Boolean),
    [selection, mappings],
  );

  useEffect(() => { selectionRef.current = selection; }, [selection]);

  const deleteSelection = useCallback(() => {
    if (!selection.length) return;
    setMappings(p => {
      const n = { ...p };
      selection.forEach(id => delete n[id]);
      return n;
    });
    showMsg(`Cleared ${selection.length} mapping${selection.length === 1 ? "" : "s"}. Save All to keep it.`);
    setSelection([]);
    setSelectedId(null);
  }, [selection]);

  useEffect(() => { deleteSelectionRef.current = deleteSelection; }, [deleteSelection]);

  /** Line the selection up on whichever edge is furthest that way already. */
  const alignSelection = useCallback((edge: "left" | "top") => {
    if (selection.length < 2) return;
    setMappings(p => {
      const n = { ...p };
      const value = edge === "left"
        ? Math.min(...selection.map(id => n[id]?.x ?? Infinity))
        : Math.min(...selection.map(id => n[id]?.y ?? Infinity));
      selection.forEach(id => {
        if (!n[id]) return;
        n[id] = edge === "left" ? { ...n[id], x: value } : { ...n[id], y: value };
      });
      return n;
    });
  }, [selection]);

  /** Even spacing across the row, for a comb placed by hand. */
  const distributeSelection = useCallback(() => {
    if (selection.length < 3) return;
    setMappings(p => {
      const n = { ...p };
      const row = selection.map(id => n[id]).filter(Boolean).sort((a, b) => a.x - b.x);
      const first = row[0].x, last = row[row.length - 1].x;
      const step = (last - first) / (row.length - 1);
      row.forEach((m, i) => {
        n[m.field_id] = { ...m, x: parseFloat((first + i * step).toFixed(1)) };
      });
      return n;
    });
  }, [selection]);

  /* A session's work now spans every form and can run long, so a stray reload
     or a closed tab would take the lot. The browser only honours this if the
     page has been interacted with, which any mapping edit already is. */
  useEffect(() => {
    if (!unsaved.total) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved.total]);

  // ── Save mappings to Supabase ────────────────────────────────────────────────
  const handleSave = async () => {
    const rows = Object.values(mappings)
      .filter(m => m.field_id !== SETTINGS_ROW_ID && !isCropRow(m.field_id));
    if (!rows.length) { showMsg("Nothing to save yet."); return; }
    setSaveStatus("saving");

    // Persist the global default alongside the field rows
    // Send ONLY these columns. Rows loaded with select("*") still carry the
    // table's own `id` / `updated_at`, and PostgREST unions the keys across a
    // bulk upsert — so any row missing `id` would be inserted with id = NULL
    // instead of the gen_random_uuid() default, and the insert would fail.
    // Omitting `id` everywhere lets the default apply; field_id is the
    // conflict target, so upserts still match existing rows correctly.
    const toRow = (m: Mapping) => ({
      field_id:   m.field_id,
      label:      m.label,
      field_type: m.field_type,
      page:       m.page,
      x: m.x, y: m.y, w: m.w, h: m.h,
      font_size:  m.font_size ?? null,
      align:      m.align ?? null,
    });

    // A crop row per form that has one, in the same x/y/w/h columns a field
    // uses. An uncropped form writes nothing, so the table stays as it was.
    const cropRows = Object.entries(crops)
      .filter(([id, c]) => {
        const f = FORMS.find(x => x.id === id);
        return f && !isFullPage(c, f.width, f.height);
      })
      .map(([id, c]) => ({
        field_id: cropRowId(id), label: `${id} crop`, field_type: "crop",
        page: 0, x: c.x, y: c.y, w: c.w, h: c.h, font_size: null,
      }));

    const payload = [
      ...rows.map(toRow),
      ...cropRows,
      {
        field_id: SETTINGS_ROW_ID, label: "Global settings", field_type: "settings",
        page: 0, x: 0, y: 0, w: 0, h: 0, font_size: defaultFontSize,
      },
    ];

    const { error } = await supabase.from("pdf_field_mappings").upsert(payload, { onConflict: "field_id" });
    if (error) {
      setSaveStatus("error");
      showMsg(/font_size/.test(error.message)
        ? "Error: column 'font_size' is missing — run: ALTER TABLE pdf_field_mappings ADD COLUMN IF NOT EXISTS font_size FLOAT;"
        : /align/.test(error.message)
          ? "Error: column 'align' is missing — run supabase/migrations/20260912000100_field_alignment.sql"
          : `Error: ${error.message}`);
    } else {
      setSaveStatus("saved");
      resetPdfTemplateCache();  // next biodata export picks up the new sizes/positions

      // The server now holds exactly what was sent, so the payload is the new
      // snapshot — no refetch, and the unsaved badge clears for every form.
      const snap: Record<string, string> = {};
      [...rows.map(toRow), ...cropRows].forEach(r => {
        snap[r.field_id] = r.field_type === "crop"
          ? `${r.x}|${r.y}|${r.w}|${r.h}`
          : `${r.page}|${r.x}|${r.y}|${r.w}|${r.h}|${r.font_size ?? ""}|${(r as { align?: string | null }).align ?? ""}`;
      });
      setSavedSnap(snap);

      const forms = FORMS.filter(f => rows.some(m => formOwnsField(f, m.field_id))).length;
      showMsg(`✓ Saved ${rows.length} mappings across ${forms} form${forms === 1 ? "" : "s"}`);
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Import from biodata_field_mapping.json ────────────────────────────────────
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const json = JSON.parse(evt.target?.result as string);
        const raw: any[] = json.fields ?? json;
        const next: Record<string, Mapping> = { ...mappings };
        let count = 0;
        raw.forEach(f => {
          const fid = f.id ?? f.field_id ?? "";
          if (!fid || fid === SETTINGS_ROW_ID) return;
          next[fid] = { field_id: fid, label: f.label, field_type: f.type ?? f.field_type ?? "text", page: f.page, x: f.x, y: f.y, w: f.w ?? 100, h: f.h ?? 14, font_size: f.font_size ?? f.fontSize ?? null };
          count++;
        });
        // Older exports have no size info — keep whatever default is set
        const importedDefault = json.meta?.default_font_size;
        if (importedDefault > 0) setDefaultFontSize(importedDefault);
        setMappings(next);
        showMsg(`Imported ${count} fields — click 💾 Save All to persist`);
      } catch { showMsg("Error: could not parse JSON file."); }
    };
    reader.readAsText(file);
    if (jsonInputRef.current) jsonInputRef.current.value = "";
  };

  // ── Download current mappings as JSON (local backup / base template) ──────────
  const handleDownloadJSON = () => {
    // Only this form's rows: page_width_pts below describes one form, so mixing
    // both in a file would make the exported coordinates meaningless.
    const rows = Object.values(mappings).filter(m => ownsField(m.field_id));
    if (!rows.length) { showMsg(`No ${form.label} mappings to download yet.`); return; }

    const payload = {
      meta: {
        exported_at:       new Date().toISOString(),
        page_width_pts:    PDF_W,
        page_height_pts:   PDF_H,
        coordinate_origin: "top-left (pdfplumber screen space)",
        total_fields:      rows.length,
        default_font_size: defaultFontSize,
      },
      // Each field stored with both 'id' and 'field_id' so the file is
      // re-importable by this mapper AND compatible with exportBiodataPdf
      fields: rows.map(r => ({
        id:         r.field_id,
        field_id:   r.field_id,
        label:      r.label,
        type:       r.field_type,
        field_type: r.field_type,
        page:       r.page,
        x: r.x, y: r.y, w: r.w, h: r.h,
        font_size:  r.font_size ?? null,   // null = inherits default_font_size
        pdf_y: parseFloat((PDF_H - r.y - r.h).toFixed(1)),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = `biodata_mapping_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showMsg(`Downloaded ${rows.length} field mappings as JSON`);
  };

  const clearMapping  = (id: string) => { setMappings(p => { const n = { ...p }; delete n[id]; return n; }); if (selectedId === id) setSelectedId(null); };
  const showMsg       = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(""), 5000); };
  const toggleSection = (t: string) => setExpanded(p => ({ ...p, [t]: !p[t] }));

  // ── Text size helpers ────────────────────────────────────────────────────────
  // Size actually used when generating the PDF: the field's own, else the default
  const effSize = (m: Mapping) => (m.font_size && m.font_size > 0 ? m.font_size : defaultFontSize);

  const setFieldFontSize = (id: string, size: number | null) =>
    setMappings(p => (p[id] ? { ...p, [id]: { ...p[id], font_size: size } } : p));

  // Push one size onto every mapped text/date field on a page — the usual case
  // when the whole form prints too small or too large.
  const applySizeToPage = (size: number, page: number) => {
    let n = 0;
    setMappings(prev => {
      const next = { ...prev };
      Object.values(prev).forEach(m => {
        if (m.page === page && isTextual(m.field_type)) { next[m.field_id] = { ...m, font_size: size }; n++; }
      });
      return next;
    });
    showMsg(`Set ${n} text fields on page ${page} to ${size}pt — click 💾 Save All`);
  };

  const totalFields = SECTIONS.flatMap(s => s.fields).length;
  const mappedCount = Object.keys(mappings).filter(id => FIELD_LOOKUP[id]).length;
  const pageFields  = SECTIONS.filter(s => s.page === currentPage).flatMap(s => s.fields);
  const pageMapped  = pageFields.filter(f => mappings[f.id]).length;

  // Currently selected field + its mapping (drives the properties panel)
  const selMapping  = selectedId ? mappings[selectedId] : undefined;
  const selDef      = selectedId ? FIELD_LOOKUP[selectedId] : undefined;

  // Rendered size of the PDF panel — used to scale the on-canvas text preview
  const renderW = Math.round(pdfContW * zoom / 100);
  const pxPerPt = renderW / PDF_W;

  /* ── Filtered field list ────────────────────────────────────────────────────
     Sections are rebuilt with only their matching fields, then empty ones are
     dropped, so the list collapses down to just what was asked for. ── */
  const q = query.trim().toLowerCase();
  const filtering = !!q || unmappedOnly || currentPageOnly;

  const visibleSections = SECTIONS
    .filter(s => !currentPageOnly || s.page === currentPage)
    .map(s => ({
      ...s,
      fields: s.fields.filter(f =>
        (!q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)) &&
        (!unmappedOnly || !mappings[f.id])
      ),
    }))
    .filter(s => s.fields.length > 0);

  const matchCount = visibleSections.reduce((n, s) => n + s.fields.length, 0);

  const clearFilters = () => { setQuery(""); setUnmappedOnly(false); setCurrentPageOnly(false); };

  const chipClass = (on: boolean) =>
    `px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
      on ? "bg-slate-800 text-white border-slate-800"
         : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
    }`;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Form picker ──────────────────────────────────────────────────────── */}
      {/* Positions for every form share one table, so switching here only changes
          which field set and which template are on screen. Nothing is lost. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden">
          {FORMS.map(f => (
            <button
              key={f.id}
              onClick={() => { if (f.id !== formId) { setFormId(f.id); setCurrentPage(1); setSelectedId(null); setSelection([]); setCtxMenu(null); } }}
              className={`px-4 py-2 text-sm font-semibold transition-colors ${
                f.id === formId
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {f.label}
              {/* Edits survive a form switch now, so a tab has to be able to say
                  it is carrying some — otherwise leaving ID 988A mapped but
                  unsaved looks identical to having saved it. */}
              {unsaved.byForm[f.id] ? (
                <span
                  title={`${unsaved.byForm[f.id]} unsaved change${unsaved.byForm[f.id] === 1 ? "" : "s"} — Save All keeps every form at once`}
                  className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${
                    f.id === formId ? "bg-amber-300" : "bg-amber-500"
                  }`}
                />
              ) : null}
            </button>
          ))}
        </div>
        {form.note && <span className="text-xs text-slate-400">{form.note}</span>}
      </div>

      {/* ── Right-click menu ───────────────────────────────────────────────
          A backdrop catches the next click anywhere, so the menu closes the
          way every other menu does rather than lingering over the page. */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40"
               onMouseDown={() => setCtxMenu(null)}
               onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-50 min-w-[190px] rounded-lg border border-slate-200 bg-white shadow-lg py-1 text-xs"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={e => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
              {FIELD_LOOKUP[ctxMenu.id]?.label ?? ctxMenu.id}
            </p>

            {/* ── Box size ── */}
            {mappings[ctxMenu.id] && (() => {
              const m = mappings[ctxMenu.id];
              const group = resizeGroup(ctxMenu.id);
              const isCb = m.field_type === "checkbox";
              return (
                <div className="px-3 py-2 border-t border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Box size
                  </p>
                  {isCb ? (
                    <p className="text-[11px] text-slate-400 leading-snug">
                      A tick box always prints at {CHECKBOX_SIZE}pt, so its size is fixed.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <SizeInput label="W" value={m.w} onCommit={v => resizeFields(group, v, undefined)} />
                        <SizeInput label="H" value={m.h} onCommit={v => resizeFields(group, undefined, v)} />
                        <span className="text-[11px] text-slate-400">pt</span>
                      </div>
                      {group.length > 1 && (
                        <p className="mt-1.5 text-[10px] text-blue-600 leading-snug">
                          Applies to all {group.length} boxes of this field, so the row stays even.
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Text alignment ── */}
            {mappings[ctxMenu.id] && mappings[ctxMenu.id].field_type !== "checkbox" && (() => {
              const m = mappings[ctxMenu.id];
              const group = resizeGroup(ctxMenu.id);
              const eff = effectiveAlign(ctxMenu.id);
              const auto = m.align !== "left" && m.align !== "center";
              return (
                <div className="px-3 py-2 border-t border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Text starts
                  </p>
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden">
                    {([
                      ["left",   "Left edge", "Prose that carries on to the line below"],
                      ["center", "Centre",    "A value sitting in the middle of a printed blank"],
                    ] as const).map(([value, label, hint]) => (
                      <button
                        key={value}
                        title={hint}
                        onClick={() => setAlign(group, value)}
                        className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                          !auto && m.align === value
                            ? "bg-slate-800 text-white"
                            : "bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-slate-400 leading-snug">
                    {auto
                      ? `Following the form: ${eff === "left" ? "left edge" : "centred"}.`
                      : group.length > 1
                        ? `Set for all ${group.length} boxes of this field.`
                        : "Set for this box."}
                  </p>
                  {!auto && (
                    <button
                      onClick={() => setAlign(group, null)}
                      className="mt-1 text-[10px] font-semibold text-blue-600 hover:underline"
                    >
                      Follow the form again
                    </button>
                  )}
                </div>
              );
            })()}

            <div className="border-t border-slate-100" />
            {combOf(ctxMenu.id) ? (
              <>
                <button
                  onClick={() => { addCombBox(ctxMenu.id); setCtxMenu(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700"
                >
                  Add box
                </button>
                <button
                  onClick={() => { removeCombBox(ctxMenu.id); setCtxMenu(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-100 text-slate-700"
                >
                  Remove this box
                </button>
              </>
            ) : (
              <p className="px-3 py-1.5 text-slate-400">
                Only a one-letter box can be added to.
              </p>
            )}
            <div className="my-1 border-t border-slate-100" />
            <button
              onClick={() => { clearMapping(ctxMenu.id); setCtxMenu(null); }}
              className="w-full text-left px-3 py-1.5 hover:bg-red-50 text-red-600"
            >
              Clear this mapping
            </button>
          </div>
        </>
      )}

      {form.generated ? (
        <div className="p-8 rounded-xl border border-dashed border-gray-300 bg-white">
          <p className="text-3xl mb-3">🧾</p>
          <h3 className="font-semibold text-gray-800">Nothing to map on this one</h3>
          <p className="mt-2 text-sm text-gray-500 max-w-xl leading-relaxed">
            The General Biodata is drawn by the app rather than printed over a scanned
            form, so there is no template to upload and no field to position. Its layout
            flows to fit whatever the applicant filled in, and grows onto a second page
            when her work history needs one.
          </p>
          <p className="mt-3 text-sm text-gray-500 max-w-xl leading-relaxed">
            Download it from <span className="font-medium text-gray-700">For Review</span> →
            open an applicant → <span className="font-medium text-gray-700">📄 General Biodata</span>.
            It carries the same details as the agency biodata, with no agency name on it.
          </p>
        </div>
      ) : (
      <>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
        <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-600 font-medium">
          {mappedCount} / {totalFields} total
        </span>
        <span className="text-xs px-2.5 py-1 bg-blue-50 rounded-full text-blue-700 font-medium">
          {form.id === "id407" ? "Sheet" : "Page"} {currentPage}: {pageMapped} / {pageFields.length}
        </span>
        {uploadingStorage && (
          <span className="text-xs px-2.5 py-1 bg-amber-50 rounded-full text-amber-700 font-medium animate-pulse">
            ☁️ Uploading to Storage…
          </span>
        )}

        <div className="flex-1" />

        {/* Upload PDF / image */}
        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          {pageImages[1] || pageImages[2] ? "🔄 Replace PDF / Image" : "📤 Upload PDF / Image"}
          <input ref={imgInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileUpload} />
        </label>

        {/* Import JSON */}
        <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
          📂 Import JSON
          <input ref={jsonInputRef} type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
        </label>

        {/* Download JSON — saves current mappings as a local backup / base template */}
        <button
          onClick={handleDownloadJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          📥 Download JSON
        </button>

        {/* Save All */}
        <button
          onClick={handleSave} disabled={saveStatus === "saving"}
          title={unsaved.total
            ? `${unsaved.total} unsaved change${unsaved.total === 1 ? "" : "s"} across ${Object.keys(unsaved.byForm).length} form${Object.keys(unsaved.byForm).length === 1 ? "" : "s"} — all saved together`
            : "Saves every form's mappings, not just the one on screen"}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors ${
            saveStatus === "saved" ? "bg-green-600"
              : saveStatus === "error" ? "bg-red-600"
              : saveStatus === "saving" ? "bg-gray-400"
              : unsaved.total ? "bg-amber-600 hover:bg-amber-500"
              : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {saveStatus === "saving" ? "Saving…"
            : saveStatus === "saved" ? "✓ Saved"
            : unsaved.total ? `💾 Save All (${unsaved.total})`
            : "💾 Save All"}
        </button>

        {statusMsg && <span className="text-xs text-slate-500 italic max-w-xs truncate">{statusMsg}</span>}
      </div>

      {/* ── Two-panel layout ──────────────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT: PDF viewer — takes all remaining space ───────────────────── */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">

          {/* ── Crop: trim the scan's white margin ────────────────────────
              Field positions are untouched by this. They live in full-page
              space, so moving an edge shifts the form and every box together
              and a mapping stays correct — see pdfCrop.ts. */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Crop
            </span>
            <button
              onClick={() => { setCropEditing(v => !v); setSelection([]); setCtxMenu(null); }}
              title={cropEditing
                ? "Go back to seeing the cropped result"
                : "Show the whole scan and drag the crop window onto the form's edges"}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                cropEditing
                  ? "bg-blue-600 text-white hover:bg-blue-700"
                  : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
              }`}
            >
              {cropEditing ? "Done adjusting" : "Adjust visually"}
            </button>
            {(["top", "right", "bottom", "left"] as const).map(edge => (
              <label key={edge} className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 capitalize">{edge}</span>
                <input
                  type="number" step={1} min={0}
                  value={margins[edge]}
                  onChange={e => setMargin(edge, parseFloat(e.target.value) || 0)}
                  className="w-14 h-7 px-1.5 text-center text-xs tabular-nums text-slate-700 bg-white border border-slate-300 rounded focus:outline-none focus:border-blue-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </label>
            ))}
            <span className="text-[11px] text-slate-400 tabular-nums">
              pt · page {Math.round(crop.w)} × {Math.round(crop.h)}
            </span>
            {cropped && (
              <button
                onClick={resetCrop}
                title="Show the whole scan again"
                className="px-2 py-1 rounded text-[11px] font-semibold text-slate-500 hover:bg-slate-200 transition-colors"
              >
                Reset
              </button>
            )}
            <span className={`text-[11px] font-medium ${
              cropEditing ? "text-blue-600" : cropped ? "text-amber-600" : "text-slate-400"
            }`}>
              {cropEditing
                ? "Drag the frame or its handles — the dimmed area is what gets cut off"
                : cropped
                  ? "Applies to the sheet editor and the export — Save All to keep it"
                  : "Full scan"}
            </span>
          </div>

          {/* ── Group selection toolbar ────────────────────────────────────
              Only here while something is selected, so it never competes with
              the controls that are always needed. */}
          {selection.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
              <span className="text-[11px] font-bold text-blue-700 tabular-nums">
                {selection.length} selected
              </span>

              {(() => {
                const boxes = selectionBoxes.filter(m => m.field_type !== "checkbox");
                if (!boxes.length) {
                  return <span className="text-[11px] text-blue-500">Tick boxes print at a fixed size.</span>;
                }
                const same = (get: (m: typeof boxes[number]) => number) => {
                  const first = get(boxes[0]);
                  return boxes.every(m => get(m) === first) ? first : "";
                };
                return (
                  <>
                    <SizeInput tone="blue" label="W" value={same(m => m.w)}
                      onCommit={v => resizeFields(selection, v, undefined)} />
                    <SizeInput tone="blue" label="H" value={same(m => m.h)}
                      onCommit={v => resizeFields(selection, undefined, v)} />
                    <span className="text-[11px] text-blue-400">pt</span>
                  </>
                );
              })()}

              <span className="w-px h-5 bg-blue-200" />
              <button onClick={() => alignSelection("left")} disabled={selection.length < 2}
                title="Line them all up on the leftmost edge"
                className="px-2 py-1 rounded text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-30 transition-colors">
                Align left
              </button>
              <button onClick={() => alignSelection("top")} disabled={selection.length < 2}
                title="Line them all up on the topmost edge"
                className="px-2 py-1 rounded text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-30 transition-colors">
                Align top
              </button>
              <button onClick={distributeSelection} disabled={selection.length < 3}
                title="Space them evenly between the first and the last"
                className="px-2 py-1 rounded text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-30 transition-colors">
                Space evenly
              </button>

              <span className="w-px h-5 bg-blue-200" />
              <button onClick={deleteSelection}
                title="Clear these mappings — the fields stay, their positions go"
                className="px-2 py-1 rounded text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors">
                Clear mappings
              </button>
              <button onClick={() => setSelection([])}
                className="px-2 py-1 rounded text-[11px] font-semibold text-slate-500 hover:bg-slate-200 transition-colors">
                Deselect
              </button>
            </div>
          )}

          {/* Page toggle + zoom controls */}
          <div className="flex items-center gap-2">
            {PAGE_NUMBERS.map(p => (
              <button key={p} onClick={() => { setCurrentPage(p); setSelectedId(null); setSelection([]); setCtxMenu(null); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${currentPage === p ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"}`}
              >
                {/* ID 407 is a booklet: sheet 1 carries form pages 4 and 1 */}
                {form.id === "id407" ? `Sheet ${p} (pages ${p === 1 ? "4 | 1" : "2 | 3"})` : `Page ${p}`}
                {pageImages[p] && !imgFailed[p] && <span className="ml-1.5 w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />}
              </button>
            ))}

            <div className="flex-1" />

            {/* Toggle the on-canvas text-size preview */}
            <button
              onClick={() => setShowTextPreview(v => !v)}
              title={showTextPreview ? "Hide text size preview" : "Show text size preview"}
              className={`px-2.5 h-9 rounded-lg text-sm font-medium transition-colors border ${
                showTextPreview
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-500 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span className="font-serif">Aa</span>
            </button>

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-1">
              <button
                onClick={zoomOut}
                disabled={zoom <= ZOOM_LEVELS[0]}
                title="Zoom out"
                className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base transition-all"
              >−</button>
              <button
                onClick={() => zoomTo(100)}
                title={zoom === 100 ? "Zoom — 50% to 500%" : "Back to 100%"}
                className={`w-14 h-7 flex items-center justify-center rounded text-xs font-medium hover:bg-white hover:shadow-sm transition-all tabular-nums ${
                  zoom === 100 ? "text-slate-600" : "text-slate-900 font-semibold"
                }`}
              >{zoom}%</button>
              <button
                onClick={zoomIn}
                disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                title="Zoom in"
                className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base transition-all"
              >+</button>
            </div>
          </div>

          {/* Placement hint — the nudge keys only show once there is a placed
              box for them to act on, so the line never advertises a dead key */}
          <p className="text-xs text-slate-400 italic -mt-1">
            {renderingPdf ? "Rendering PDF…" : uploadingStorage ? "Saving to Storage…" : selectedId ? (
              <>
                {`▸ Placing: ${FIELD_LOOKUP[selectedId]?.label ?? selectedId}`}
                {mappings[selectedId] && mappings[selectedId].page === currentPage &&
                  " — arrow keys nudge 1pt · shift 10pt · ctrl 0.1pt"}
              </>
            ) : "Click a field on the right to start placing"}
          </p>

          {/* PDF image + overlay
              ─ outer div scrolls (both axes when zoomed > 100%)
              ─ inner zoom-wrapper sizes the content; image is w-full of it
              ─ overlay is absolute inset-0 over the zoom-wrapper, so
                click coordinates map correctly at any zoom level          */}
          <div
            ref={pdfContRef}
            className="border border-slate-300 rounded-lg overflow-auto bg-white"
            style={{ maxHeight: "calc(100vh - 270px)" }}
          >
            {/* Storage loading */}
            {loadingStorage && (
              <div className="flex flex-col items-center justify-center gap-3 p-12" style={{ minHeight: "420px" }}>
                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-500">Loading template from Storage…</p>
              </div>
            )}

            {/* PDF rendering */}
            {renderingPdf && (
              <div className="flex flex-col items-center justify-center gap-3 p-12" style={{ minHeight: "420px" }}>
                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm text-slate-600">Rendering PDF pages…</p>
              </div>
            )}

            {/* PDF image inside zoom wrapper */}
            {!loadingStorage && !renderingPdf && !showUploadZone && (
              <div
                style={{
                  width:    `${((cropEditing ? PDF_W : crop.w) / PDF_W) * renderW}px`,
                  height:   `${((cropEditing ? PDF_H : crop.h) / PDF_W) * renderW}px`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
              <div
                style={{
                  width:    `${renderW}px`,
                  position: "absolute",
                  left:     `${(cropEditing ? 0 : -crop.x / PDF_W) * renderW}px`,
                  top:      `${(cropEditing ? 0 : -crop.y / PDF_W) * renderW}px`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={pageImages[currentPage]}
                  src={pageImages[currentPage]}
                  alt={`PDF page ${currentPage}`}
                  className="w-full block select-none"
                  style={zoom > ZOOM_PIXELATED ? { imageRendering: "pixelated" } : undefined}
                  draggable={false}
                  onError={() => setImgFailed(p => ({ ...p, [currentPage]: true }))}
                  onLoad={()  => setImgFailed(p => { const n = { ...p }; delete n[currentPage]; return n; })}
                />
                {/* Click / marker overlay — always covers the zoom wrapper exactly */}
                <div ref={overlayRef}
                  onClick={cropEditing ? undefined : handleOverlayClick}
                  onMouseDown={cropEditing ? undefined : handleOverlayMouseDown}
                  onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }}
                  className={`absolute inset-0 ${selectedId ? "cursor-crosshair" : "cursor-default"}`}>
                  {/* ── The crop window, while it is being adjusted ──────────
                      Four dimmed bands show what is being cut off; the frame
                      moves, and the eight handles resize it. */}
                  {cropEditing && (
                    <div className="absolute inset-0 z-30">
                      {([
                        { top: 0, left: 0, right: 0, height: `${(crop.y / PDF_H) * 100}%` },
                        { bottom: 0, left: 0, right: 0, height: `${((PDF_H - crop.y - crop.h) / PDF_H) * 100}%` },
                        { top: `${(crop.y / PDF_H) * 100}%`, left: 0, width: `${(crop.x / PDF_W) * 100}%`, height: `${(crop.h / PDF_H) * 100}%` },
                        { top: `${(crop.y / PDF_H) * 100}%`, right: 0, width: `${((PDF_W - crop.x - crop.w) / PDF_W) * 100}%`, height: `${(crop.h / PDF_H) * 100}%` },
                      ] as React.CSSProperties[]).map((band, i) => (
                        <div key={i} className="absolute bg-slate-900/55" style={band} />
                      ))}

                      <div
                        onMouseDown={e => startCropDrag("move", e)}
                        className="absolute border-2 border-blue-500 cursor-move"
                        style={{
                          left:   `${(crop.x / PDF_W) * 100}%`,
                          top:    `${(crop.y / PDF_H) * 100}%`,
                          width:  `${(crop.w / PDF_W) * 100}%`,
                          height: `${(crop.h / PDF_H) * 100}%`,
                        }}
                      >
                        {([
                          ["nw", "0%",   "0%",   "nwse"], ["n", "50%",  "0%",   "ns"],
                          ["ne", "100%", "0%",   "nesw"], ["e", "100%", "50%",  "ew"],
                          ["se", "100%", "100%", "nwse"], ["s", "50%",  "100%", "ns"],
                          ["sw", "0%",   "100%", "nesw"], ["w", "0%",   "50%",  "ew"],
                        ] as [CropHandle, string, string, string][]).map(([h, left, top, cur]) => (
                          <span
                            key={h}
                            onMouseDown={e => startCropDrag(h, e)}
                            className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-sm bg-white border-2 border-blue-500 shadow"
                            style={{ left, top, cursor: `${cur}-resize` }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {marquee && (
                    <div
                      className="absolute border border-blue-500 bg-blue-400/15 pointer-events-none z-20"
                      style={{
                        left:   `${(Math.min(marquee.x0, marquee.x1) / PDF_W) * 100}%`,
                        top:    `${(Math.min(marquee.y0, marquee.y1) / PDF_H) * 100}%`,
                        width:  `${(Math.abs(marquee.x1 - marquee.x0) / PDF_W) * 100}%`,
                        height: `${(Math.abs(marquee.y1 - marquee.y0) / PDF_H) * 100}%`,
                      }}
                    />
                  )}
                  {Object.values(mappings)
                    .filter(m => m.page === currentPage && ownsField(m.field_id))
                    .map(m => {
                    const tk = (m.field_type in TYPE_STYLE ? m.field_type : "text") as FieldType;
                    const { bg, border } = TYPE_STYLE[tk];
                    const isSel  = selectedId === m.field_id;
                    const inGroup = selection.includes(m.field_id);
                    // Preview where the value will really sit, not always centred
                    const alignOf = effectiveAlign(m.field_id);
                    const isCb   = m.field_type === "checkbox";
                    const isTxt  = isTextual(m.field_type);

                    // Checkboxes always render as a fixed CHECKBOX_SIZE square — never
                    // as wide bars — regardless of what w/h is stored in the mapping.
                    // The exporter uses the same constant, so preview == print.
                    const dispW  = isCb
                      ? `${(CHECKBOX_SIZE / PDF_W) * 100}%`
                      : `${Math.max((m.w / PDF_W) * 100, 0.5)}%`;
                    const dispH  = isCb
                      ? `${(CHECKBOX_SIZE / PDF_H) * 100}%`
                      : `${Math.max((m.h / PDF_H) * 100, 0.4)}%`;

                    return (
                      <div key={m.field_id}
                        ref={el => { markerRefs.current[m.field_id] = el; }}
                        title={`${m.field_id} — ${m.label}${isTxt ? `\nText size: ${effSize(m)}pt${m.font_size ? "" : " (default)"}` : ""}\nDrag to reposition`}
                        onMouseDown={e => handleMarkerMouseDown(e, m.field_id)}
                        onContextMenu={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedId(m.field_id);
                          setCtxMenu({ id: m.field_id, x: e.clientX, y: e.clientY });
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          setCtxMenu(null);
                          if (e.shiftKey || e.ctrlKey || e.metaKey) {
                            setSelection(prev => prev.includes(m.field_id)
                              ? prev.filter(id => id !== m.field_id)
                              : [...prev, m.field_id]);
                            return;
                          }
                          setSelectedId(m.field_id);
                          fieldRefs.current[m.field_id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }}
                        className={`absolute border-2 flex ${
                          isCb ? "items-center justify-center"
                               : `items-end overflow-hidden ${alignOf === "left" ? "justify-start" : "justify-center"}`
                        } ${bg} ${border} ${isSel ? "ring-2 ring-yellow-400 ring-offset-1 z-10" : inGroup ? "ring-2 ring-blue-500 ring-offset-1 z-10" : ""}`}
                        style={{
                          left: `${(m.x / PDF_W) * 100}%`,
                          top:  `${(m.y / PDF_H) * 100}%`,
                          width: dispW, height: dispH,
                          minWidth: isCb ? "8px" : "6px",
                          minHeight: isCb ? "8px" : "4px",
                          cursor: "grab",
                        }}
                      >
                        {/* Resize handles, on the selected box only — eight dots on
                            every marker would bury the page. A tick box has no
                            size to change, so it gets none. */}
                        {isSel && !isCb && (
                          <>
                            {([
                              ["nw", "0%",   "0%",   "nwse"], ["n", "50%",  "0%",   "ns"],
                              ["ne", "100%", "0%",   "nesw"], ["e", "100%", "50%",  "ew"],
                              ["se", "100%", "100%", "nwse"], ["s", "50%",  "100%", "ns"],
                              ["sw", "0%",   "100%", "nesw"], ["w", "0%",   "50%",  "ew"],
                            ] as [CropHandle, string, string, string][]).map(([hd, left, top, cur]) => (
                              <span
                                key={hd}
                                onMouseDown={ev => startBoxResize(m.field_id, hd, ev)}
                                onClick={ev => ev.stopPropagation()}
                                className="absolute w-2 h-2 -ml-1 -mt-1 rounded-[2px] bg-white border border-yellow-500 shadow-sm z-20"
                                style={{ left, top, cursor: `${cur}-resize` }}
                              />
                            ))}
                          </>
                        )}

                        {/* True-to-print tick: same geometry the exporter draws, with the
                            vertex pinned to the centre of this square. Rendered from a
                            zero-sized SVG at 50%/50% with overflow visible, so the arms
                            can extend past the marker exactly as they do on the page. */}
                        {isCb && pxPerPt > 0 && (
                          <svg
                            width={0} height={0}
                            style={{
                              position: "absolute", left: "50%", top: "50%",
                              overflow: "visible", pointerEvents: "none",
                            }}
                          >
                            <path
                              d={
                                `M ${-TICK_SIZE * TICK_LEFT_DX * pxPerPt} ${-TICK_SIZE * TICK_LEFT_DY * pxPerPt} ` +
                                `L 0 0 ` +
                                `L ${TICK_SIZE * TICK_RIGHT_DX * pxPerPt} ${-TICK_SIZE * TICK_RIGHT_DY * pxPerPt}`
                              }
                              fill="none"
                              stroke="rgba(15,23,42,0.85)"
                              strokeWidth={Math.max(TICK_WEIGHT * pxPerPt, 0.75)}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}

                        {/* Sample text at the field's real size — centred on the same
                            baseline the exporter uses (2pt bottom padding), so what you
                            see here is what prints. */}
                        {isTxt && showTextPreview && pxPerPt > 0 && (
                          <span style={{
                            fontSize:   `${effSize(m) * pxPerPt}px`,
                            fontFamily: "Helvetica, Arial, sans-serif",
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                            color: "rgba(15,23,42,0.8)",
                            paddingBottom: `${2 * pxPerPt}px`,
                            paddingLeft: alignOf === "left" ? `${1 * pxPerPt}px` : undefined,
                            pointerEvents: "none", userSelect: "none",
                          }}>{m.label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>
            )}

            {/* Upload zone */}
            {!loadingStorage && !renderingPdf && showUploadZone && (
              <label className="flex flex-col items-center justify-center gap-4 p-12 cursor-pointer group" style={{ minHeight: "420px" }}>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileUpload} />
                <div className="w-16 h-16 rounded-2xl bg-slate-100 group-hover:bg-blue-50 transition-colors flex items-center justify-center text-3xl">📄</div>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-700 group-hover:text-blue-600 transition-colors">Upload the biodata PDF</p>
                  <p className="text-xs text-slate-400 mt-1">Saved to Supabase Storage — all recruiters load the same file</p>
                  <p className="text-xs text-slate-400">PDF auto-renders both pages · PNG/JPG loads current page only</p>
                </div>
                <div className="px-4 py-2 rounded-lg border border-dashed border-slate-300 group-hover:border-blue-400 text-xs text-slate-400 group-hover:text-blue-500 transition-colors">
                  Click to browse — .pdf .png .jpg .webp
                </div>
              </label>
            )}
          </div>

          {/* Legend */}
          <div className="flex gap-3 flex-wrap text-xs text-slate-500">
            {(Object.entries(TYPE_STYLE) as [FieldType, (typeof TYPE_STYLE)[FieldType]][]).map(([t, s]) => (
              <span key={t} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded-sm border-2 ${s.border} ${s.bg}`} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* ── RIGHT: Field list — fixed compact width ────────────────────────── */}
        <div className="flex-shrink-0 space-y-2 overflow-y-auto" style={{ width: "340px", maxHeight: "calc(100vh - 215px)" }}>

          {/* ── Search + text size controls ────────────────────────────────── */}
          <div className="sticky top-0 z-20 bg-white pb-2 space-y-2">

            {/* Search */}
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">🔍</span>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") setQuery(""); }}
                placeholder="Search fields…"
                className="w-full pl-8 pr-8 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 placeholder-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  title="Clear search (Esc)"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 text-lg leading-none transition-colors"
                >×</button>
              )}
            </div>

            {/* Quick filters */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setUnmappedOnly(v => !v)}
                className={chipClass(unmappedOnly)}
                title="Show only fields that still need placing"
              >
                Unmapped
              </button>
              <button
                onClick={() => setCurrentPageOnly(v => !v)}
                className={chipClass(currentPageOnly)}
                title="Hide fields belonging to the other page"
              >
                Page {currentPage}
              </button>

              <div className="flex-1" />

              {filtering && (
                <>
                  <span className="text-[11px] text-slate-400 tabular-nums">{matchCount} shown</span>
                  <button
                    onClick={clearFilters}
                    className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>

            {/* Global default */}
            <div
              className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 flex items-center justify-between gap-2"
              title="Size used by every text field that has no size of its own"
            >
              <span className="text-xs font-semibold text-slate-700">Default text size</span>
              <SizeStepper
                value={defaultFontSize}
                base={DEFAULT_TXT_SIZE}
                onChange={v => setDefaultFontSize(v ?? DEFAULT_TXT_SIZE)}
                title="Size used by fields with no size of their own"
              />
            </div>

            {/* Selected field */}
            {selectedId && (
              <div className="border border-yellow-300 bg-yellow-50/60 rounded-lg px-3 py-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800 truncate">
                    {selDef?.label ?? selectedId}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${TYPE_STYLE[(selDef?.type ?? "text")].badge}`}>
                    {selDef?.type ?? "text"}
                  </span>
                </div>

                {!selMapping ? (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    Click the PDF to place this field, then set its text size here.
                  </p>
                ) : !isTextual(selMapping.field_type) ? (
                  <p className="text-[11px] text-slate-500 leading-snug">
                    No text size — this field prints a {selMapping.field_type === "checkbox" ? "tick" : "image"}.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-600">Text size</span>
                      <SizeStepper
                        value={selMapping.font_size ?? null}
                        base={defaultFontSize}
                        onChange={v => setFieldFontSize(selMapping.field_id, v)}
                        title="Size for this field only"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-400">
                        {selMapping.font_size
                          ? `Overrides the ${defaultFontSize}pt default`
                          : `Using the ${defaultFontSize}pt default`}
                      </span>
                      {selMapping.font_size != null && (
                        <button
                          onClick={() => setFieldFontSize(selMapping.field_id, null)}
                          className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline flex-shrink-0"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => applySizeToPage(effSize(selMapping), currentPage)}
                      className="w-full text-[11px] py-1.5 rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Apply {effSize(selMapping)}pt to all text fields on page {currentPage}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* No results */}
          {filtering && matchCount === 0 && (
            <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-lg">
              <p className="text-sm text-slate-500">No fields match.</p>
              <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline mt-1">
                Reset filters
              </button>
            </div>
          )}

          {visibleSections.map(section => {
            // While filtering, force sections open — a collapsed one would hide
            // the very match the search just surfaced.
            const isOpen   = filtering || expanded[section.title] !== false;
            const secMapped = section.fields.filter(f => mappings[f.id]).length;
            const isActive = section.page === currentPage;
            return (
              <div key={section.title} className={`border rounded-lg overflow-hidden transition-opacity ${isActive ? "border-slate-200" : "border-slate-100 opacity-40"}`}>
                <button onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${section.page === 1 ? "bg-blue-100 text-blue-700" : "bg-teal-100 text-teal-700"}`}>
                      p{section.page}
                    </span>
                    <span className="text-sm font-medium text-slate-700">{section.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{secMapped}/{section.fields.length}</span>
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="divide-y divide-slate-100">
                    {section.fields.map(field => {
                      const mapping = mappings[field.id];
                      const isSel   = selectedId === field.id;
                      const { badge, dot } = TYPE_STYLE[field.type];
                      return (
                        <div key={field.id} ref={el => { fieldRefs.current[field.id] = el; }}
                          onClick={() => { if (isSel) { setSelectedId(null); return; } setSelectedId(field.id); if (section.page !== currentPage) setCurrentPage(section.page); }}
                          className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm transition-colors ${isSel ? "bg-yellow-50 border-l-4 border-yellow-400" : "hover:bg-slate-50"}`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${mapping ? dot : "bg-slate-200"}`} />
                          <span className={`flex-1 min-w-0 truncate text-xs ${isSel ? "font-medium text-slate-900" : "text-slate-600"}`}>{field.label}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${badge}`}>{field.type}</span>
                          {/* Flag fields that deviate from the default size */}
                          {mapping?.font_size && isTextual(mapping.field_type) && (
                            <span className="text-[10px] px-1 py-0.5 rounded flex-shrink-0 bg-amber-100 text-amber-700 font-medium tabular-nums"
                              title={`Custom text size: ${mapping.font_size}pt`}>
                              {mapping.font_size}pt
                            </span>
                          )}
                          {mapping && <span className="text-xs text-slate-400 flex-shrink-0 hidden md:block">{Math.round(mapping.x)},{Math.round(mapping.y)}</span>}
                          {mapping && (
                            <button onClick={e => { e.stopPropagation(); clearMapping(field.id); }}
                              className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors text-base leading-none px-1" title="Clear mapping">×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
    </div>
  );
}