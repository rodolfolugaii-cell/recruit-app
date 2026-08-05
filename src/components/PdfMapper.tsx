"use client";

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE SETUP (one-time, do this before using the mapper)
// ─────────────────────────────────────────────────────────────────────────────
// 1. Go to Supabase → Storage → New bucket
//    Name:   pdf-templates
//    Public: YES (toggle on)
//
// 2. Run this in SQL Editor to create the mappings table:
//
//    CREATE TABLE IF NOT EXISTS pdf_field_mappings (
//      id         UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
//      field_id   TEXT    NOT NULL UNIQUE,
//      label      TEXT    NOT NULL,
//      field_type TEXT    NOT NULL,
//      page       INTEGER NOT NULL DEFAULT 1,
//      x          FLOAT   NOT NULL DEFAULT 0,
//      y          FLOAT   NOT NULL DEFAULT 0,
//      w          FLOAT   NOT NULL DEFAULT 100,
//      h          FLOAT   NOT NULL DEFAULT 14,
//      font_size  FLOAT,                        -- pt; NULL = use global default
//      updated_at TIMESTAMPTZ DEFAULT NOW()
//    );
//
// 2b. UPGRADING an existing table? Run this once to add text-size support:
//
//    ALTER TABLE pdf_field_mappings ADD COLUMN IF NOT EXISTS font_size FLOAT;
//
//    The global default size lives in a reserved row with
//    field_id = '__settings__'. It is written automatically by "Save All"
//    and is skipped when generating PDFs.
//
// 3. Upload the PDF once using the "📤 Upload PDF" button.
//    Both pages are rendered and saved to Storage automatically.
//    Every recruiter then loads the same images on next visit.
//
// 4. (Optional) Click "📂 Import JSON" → load biodata_field_mapping.json
//    to pre-populate all 157 positions → click "💾 Save All".
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  resetBiodataPdfCache,
  CHECKBOX_SIZE, TICK_SIZE, TICK_WEIGHT,
  TICK_LEFT_DX, TICK_LEFT_DY, TICK_RIGHT_DX, TICK_RIGHT_DY,
} from "@/lib/exportBiodataPdf";

const PDF_W = 595.276;
const PDF_H = 841.89;
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

async function pdfToDataUrls(file: File): Promise<Record<number, string>> {
  const pdfjs = await ensurePdfJs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const out: Record<number, string> = {};
  for (let i = 1; i <= Math.min(pdf.numPages, 2); i++) {
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
function storageUrl(page: number): string {
  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(`biodata-p${page}.png`);
  // Cache-bust so the browser re-fetches after a new upload
  return `${data.publicUrl}?t=${Date.now()}`;
}

async function uploadPageToStorage(
  dataUrl: string,
  page: number
): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`biodata-p${page}.png`, blob, {
        contentType: "image/png",
        upsert: true,  // overwrite the old template if one already exists
      });
    if (error) throw error;
    return storageUrl(page);
  } catch (err: any) {
    console.error("Storage upload error:", err);
    return null;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
type FieldType = "text" | "checkbox" | "date" | "image" | "signature";
interface FieldDef  { id: string; label: string; type: FieldType; defaultW?: number; defaultH?: number; }
interface Section   { title: string; page: 1 | 2; fields: FieldDef[]; }
interface Mapping   { field_id: string; label: string; field_type: string; page: number; x: number; y: number; w: number; h: number; font_size?: number | null; }

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

const TYPE_STYLE: Record<FieldType, { bg: string; border: string; badge: string; dot: string }> = {
  text:      { bg: "bg-blue-400/20",   border: "border-blue-500",   badge: "bg-blue-100 text-blue-700",    dot: "bg-blue-500"   },
  checkbox:  { bg: "bg-green-400/20",  border: "border-green-500",  badge: "bg-green-100 text-green-700",  dot: "bg-green-500"  },
  date:      { bg: "bg-amber-400/20",  border: "border-amber-500",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-500"  },
  image:     { bg: "bg-purple-400/20", border: "border-purple-500", badge: "bg-purple-100 text-purple-700",dot: "bg-purple-500" },
  signature: { bg: "bg-red-400/20",    border: "border-red-500",    badge: "bg-red-100 text-red-700",      dot: "bg-red-500"    },
};

// ── Field sections ─────────────────────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    title: "Application Info", page: 1,
    fields: [
      { id: "application_no",      label: "Application No.",           type: "text",    defaultW: 220 },
      { id: "photo",               label: "Photo",                     type: "image",   defaultW: 100, defaultH: 100 },
      { id: "is_firstimer",        label: "First-timer",              type: "checkbox" },
      { id: "contract_finished",   label: "Finished Contract",        type: "checkbox" },
      { id: "contract_plan_break", label: "Plan to Break",            type: "checkbox" },
      { id: "contract_terminated", label: "Terminated / Break",       type: "checkbox" },
      { id: "last_working_day",    label: "Last Working Day",         type: "text",    defaultW: 66  },
      { id: "signature",           label: "Applicant Signature",      type: "signature", defaultW: 130, defaultH: 34 },
    ],
  },
  {
    title: "Personal Details", page: 1,
    fields: [
      { id: "full_name",      label: "Full Name",      type: "text", defaultW: 128 },
      { id: "date_of_birth",  label: "Date of Birth",  type: "date", defaultW: 68  },
      { id: "nationality",    label: "Nationality",    type: "text", defaultW: 100 },
      { id: "religion",       label: "Religion",       type: "text", defaultW: 108 },
      { id: "age",            label: "Age",            type: "text", defaultW: 45  },
      { id: "height",         label: "Height",         type: "text", defaultW: 36  },
      { id: "weight",         label: "Weight",         type: "text", defaultW: 36  },
      { id: "marital_status", label: "Marital Status", type: "text", defaultW: 84  },
      { id: "kids_boys",      label: "Kids – Boys",    type: "text", defaultW: 50  },
      { id: "kids_girls",     label: "Kids – Girls",   type: "text", defaultW: 50  },
    ],
  },
  {
    title: "Spoken Language", page: 1,
    fields: [
      { id: "english_basic",   label: "English – Basic",   type: "checkbox" },
      { id: "english_good",    label: "English – Good",    type: "checkbox" },
      { id: "cantonese_basic", label: "Cantonese – Basic", type: "checkbox" },
      { id: "cantonese_good",  label: "Cantonese – Good",  type: "checkbox" },
      { id: "mandarin_basic",  label: "Mandarin – Basic",  type: "checkbox" },
      { id: "mandarin_good",   label: "Mandarin – Good",   type: "checkbox" },
    ],
  },
  {
    title: "Education", page: 1,
    fields: [
      { id: "edu_high_school",       label: "High School Graduate", type: "checkbox" },
      { id: "edu_vocational",        label: "Vocational Course",    type: "checkbox" },
      { id: "edu_college_undergrad", label: "College Undergrad",    type: "checkbox" },
      { id: "edu_college_grad",      label: "College Graduate",     type: "checkbox" },
      { id: "course_name",           label: "Course Name",          type: "text", defaultW: 100 },
      { id: "total_yrs_hk",          label: "Total Years in HK",    type: "text", defaultW: 90  },
      { id: "how_many_employers",    label: "How Many Employers",   type: "text", defaultW: 100 },
    ],
  },
  {
    title: "Other Country Exp.", page: 1,
    fields: [
      { id: "country_a_name",     label: "Country A – Employer",        type: "text", defaultW: 226 },
      { id: "country_a_yrs",      label: "Country A – Years",           type: "text", defaultW: 78  },
      { id: "country_a_duties_1", label: "Country A – Duties (line 1)", type: "text", defaultW: 120 },
      { id: "country_a_duties_2", label: "Country A – Duties (line 2)", type: "text", defaultW: 227 },
      { id: "country_b_name",     label: "Country B – Employer",        type: "text", defaultW: 225 },
      { id: "country_b_yrs",      label: "Country B – Years",           type: "text", defaultW: 78  },
      { id: "country_b_duties_1", label: "Country B – Duties (line 1)", type: "text", defaultW: 120 },
      { id: "country_b_duties_2", label: "Country B – Duties (line 2)", type: "text", defaultW: 227 },
    ],
  },
  {
    title: "My Skills", page: 1,
    fields: [
      { id: "skill_household_chores", label: "Household Chores",    type: "checkbox" },
      { id: "skill_cooking",          label: "Cooking",             type: "checkbox" },
      { id: "skill_child_care",       label: "Child Care",          type: "checkbox" },
      { id: "skill_newborn_care",     label: "New Born Care",       type: "checkbox" },
      { id: "skill_special_child",    label: "Special Child Care",  type: "checkbox" },
      { id: "skill_elderly_care",     label: "Elderly Care",        type: "checkbox" },
      { id: "skill_disabled_care",    label: "Disabled Person",     type: "checkbox" },
      { id: "skill_pet_care",         label: "Pet Care",            type: "checkbox" },
      { id: "skill_driving",          label: "Driving",             type: "checkbox" },
      { id: "skill_car_washing",      label: "Car Washing",         type: "checkbox" },
      { id: "skill_plant_care",       label: "Plant Care",          type: "checkbox" },
      { id: "skill_kids_tutorial",    label: "Kids Tutorial",       type: "checkbox" },
      { id: "skill_nursing_aide",     label: "Nursing Aide",        type: "checkbox" },
      { id: "pref_sunday_off",        label: "Sunday Off",          type: "checkbox" },
      { id: "pref_flexible_day",      label: "Flexible Day Off",    type: "checkbox" },
      { id: "willing_stay_in",        label: "Stay-in Employer",    type: "checkbox" },
      { id: "willing_other_helper",   label: "Other Helper",        type: "checkbox" },
    ],
  },
  {
    title: "Cooking Abilities", page: 1,
    fields: [
      { id: "cook_western",       label: "Western Food",             type: "checkbox" },
      { id: "cook_asian",         label: "Asian Food",               type: "checkbox" },
      { id: "cook_mediterranean", label: "Mediterranean Food",       type: "checkbox" },
      { id: "cook_baking",        label: "Baking",                   type: "checkbox" },
      { id: "cook_recipe_book",   label: "Follow Recipe / Cook Book",type: "checkbox" },
    ],
  },
  {
    title: "Current Working Exp. (HK)", page: 1,
    fields: [
      { id: "cwe_yrs",                  label: "Years of Employment",  type: "text",    defaultW: 47  },
      { id: "cwe_date_from",            label: "Date From (mm/yyyy)",  type: "date",    defaultW: 53  },
      { id: "cwe_date_to",              label: "Date To (mm/yyyy)",    type: "date",    defaultW: 48  },
      { id: "cwe_location",             label: "Location",             type: "text",    defaultW: 132 },
      { id: "cwe_flat_size",            label: "Flat / House Size",    type: "text",    defaultW: 49  },
      { id: "cwe_contract_finished",    label: "Finished Contract",    type: "checkbox" },
      { id: "cwe_plan_break",           label: "Plan to Break",        type: "checkbox" },
      { id: "cwe_family_members",       label: "Family Members",       type: "text",    defaultW: 32  },
      { id: "cwe_terminated_reason",    label: "Terminated Reason",    type: "text",    defaultW: 120 },
      { id: "cwe_co_helper_count",      label: "No. of Co-helper",     type: "text",    defaultW: 33  },
      { id: "cwe_break_reason",         label: "Break Reason",         type: "text",    defaultW: 195 },
      { id: "cwe_employer_nationality", label: "Employer Nationality", type: "text",    defaultW: 142 },
      { id: "jd_household_chores",      label: "JD: Household Chores",type: "checkbox" },
      { id: "jd_cooking",               label: "JD: Cooking",         type: "checkbox" },
      { id: "jd_child_care",            label: "JD: Child Care",      type: "checkbox" },
      { id: "jd_newborn_care",          label: "JD: New Born Care",   type: "checkbox" },
      { id: "jd_special_child",         label: "JD: Special Child",   type: "checkbox" },
      { id: "jd_elderly_care",          label: "JD: Elderly Care",    type: "checkbox" },
      { id: "jd_disabled_care",         label: "JD: Disabled Care",   type: "checkbox" },
      { id: "jd_pet_care",              label: "JD: Pet Care",        type: "checkbox" },
      { id: "jd_driving",               label: "JD: Driving",         type: "checkbox" },
      { id: "jd_car_washing",           label: "JD: Car Washing",     type: "checkbox" },
      { id: "jd_plant_gardening",       label: "JD: Plant / Gardening",type:"checkbox" },
      { id: "jd_others_text",           label: "JD: Others (text)",   type: "text",    defaultW: 80  },
    ],
  },
];

// Auto-generate WE 1/2/3 for page 2
const WE_TEMPLATE: FieldDef[] = [
  { id:"we{N}_yrs",               label:"WE{N}: Years",               type:"text",    defaultW:48  },
  { id:"we{N}_date_from",         label:"WE{N}: Date From",           type:"date",    defaultW:52  },
  { id:"we{N}_date_to",           label:"WE{N}: Date To",             type:"date",    defaultW:48  },
  { id:"we{N}_location",          label:"WE{N}: Location",            type:"text",    defaultW:131 },
  { id:"we{N}_flat_size",         label:"WE{N}: Flat Size",           type:"text",    defaultW:49  },
  { id:"we{N}_contract_finished", label:"WE{N}: Finished Contract",   type:"checkbox" },
  { id:"we{N}_plan_break",        label:"WE{N}: Plan to Break",       type:"checkbox" },
  { id:"we{N}_family_members",    label:"WE{N}: Family Members",      type:"text",    defaultW:32  },
  { id:"we{N}_terminated_reason", label:"WE{N}: Terminated Reason",   type:"text",    defaultW:120 },
  { id:"we{N}_co_helper",         label:"WE{N}: Co-helper Count",     type:"text",    defaultW:33  },
  { id:"we{N}_break_reason",      label:"WE{N}: Break Reason",        type:"text",    defaultW:195 },
  { id:"we{N}_employer_nat",      label:"WE{N}: Employer Nationality",type:"text",    defaultW:142 },
  { id:"we{N}_jd_household",      label:"WE{N} JD: Household Chores",type:"checkbox" },
  { id:"we{N}_jd_cooking",        label:"WE{N} JD: Cooking",         type:"checkbox" },
  { id:"we{N}_jd_child_care",     label:"WE{N} JD: Child Care",      type:"checkbox" },
  { id:"we{N}_jd_newborn",        label:"WE{N} JD: New Born Care",   type:"checkbox" },
  { id:"we{N}_jd_special_child",  label:"WE{N} JD: Special Child",   type:"checkbox" },
  { id:"we{N}_jd_elderly",        label:"WE{N} JD: Elderly Care",    type:"checkbox" },
  { id:"we{N}_jd_disabled",       label:"WE{N} JD: Disabled Care",   type:"checkbox" },
  { id:"we{N}_jd_pet",            label:"WE{N} JD: Pet Care",        type:"checkbox" },
  { id:"we{N}_jd_driving",        label:"WE{N} JD: Driving",         type:"checkbox" },
  { id:"we{N}_jd_car_wash",       label:"WE{N} JD: Car Washing",     type:"checkbox" },
  { id:"we{N}_jd_plant",          label:"WE{N} JD: Plant Care",      type:"checkbox" },
  { id:"we{N}_jd_others",         label:"WE{N} JD: Others",          type:"text",    defaultW:76  },
];
for (let n = 1; n <= 3; n++) {
  SECTIONS.push({
    title: `Work Experience ${n} (Page 2)`, page: 2,
    fields: WE_TEMPLATE.map(f => ({
      ...f,
      id:    f.id.replace(/{N}/g, String(n)),
      label: f.label.replace(/{N}/g, String(n)),
    })),
  });
}

const FIELD_LOOKUP: Record<string, FieldDef & { sectionPage: 1 | 2 }> = {};
SECTIONS.forEach(sec => sec.fields.forEach(f => { FIELD_LOOKUP[f.id] = { ...f, sectionPage: sec.page }; }));

function getDefaultDims(id: string) {
  const d = FIELD_LOOKUP[id];
  return { w: d?.defaultW ?? (d?.type === "checkbox" ? 12 : 100), h: d?.defaultH ?? (d?.type === "checkbox" ? 12 : d?.type === "image" ? 100 : 14) };
}

const ZOOM_LEVELS = [50, 75, 100, 125, 150, 175, 200];
const BASE_W = 540; // base PDF panel width in px at 100% zoom

// ── Component ──────────────────────────────────────────────────────────────────
export default function PdfMapper() {
  const [mappings, setMappings]       = useState<Record<string, Mapping>>({});
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<1 | 2>(1);
  const [saveStatus, setSaveStatus]   = useState<"idle" | "saving" | "saved" | "error">("idle");
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
  const [zoom, setZoom] = useState(100);
  const zoomIn  = () => setZoom(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(z) + 1, ZOOM_LEVELS.length - 1)]);
  const zoomOut = () => setZoom(z => ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(z) - 1, 0)]);

  // ── Dynamic PDF panel width ────────────────────────────────────────────────
  // Measured from the actual scroll container so the zoom wrapper always fills it
  const [pdfContW, setPdfContW] = useState(BASE_W);
  const pdfContRef = useRef<HTMLDivElement>(null);

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

  // ── On mount: load template images from Supabase Storage ────────────────────
  useEffect(() => {
    const loadFromStorage = async () => {
      setLoadingStorage(true);
      const imgs: Record<number, string> = {};
      // Check both pages exist by listing the bucket
      const { data: files } = await supabase.storage.from(BUCKET).list("", { search: "biodata-p" });
      const names = new Set(files?.map(f => f.name) ?? []);
      [1, 2].forEach(p => {
        if (names.has(`biodata-p${p}.png`)) {
          const { data } = supabase.storage.from(BUCKET).getPublicUrl(`biodata-p${p}.png`);
          imgs[p] = data.publicUrl;
        }
      });
      setPageImages(imgs);
      setLoadingStorage(false);
    };
    loadFromStorage();
  }, []);

  // ── Load field mappings from Supabase ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("pdf_field_mappings").select("*");
      if (error) { showMsg("Could not load mappings — check the Supabase table exists."); return; }
      if (data?.length) {
        const map: Record<string, Mapping> = {};
        data.forEach((row: Mapping) => {
          // The settings row carries the global default size, not a field
          if (row.field_id === SETTINGS_ROW_ID) {
            if (row.font_size && row.font_size > 0) setDefaultFontSize(row.font_size);
            return;
          }
          map[row.field_id] = row;
        });
        setMappings(map);
        showMsg(`Loaded ${Object.keys(map).length} saved mappings`);
      }
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
        dataUrls = await pdfToDataUrls(file);
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
        const url  = await uploadPageToStorage(dataUrl, page);
        if (url) {
          storageUrls[page] = url;
        } else {
          failed = true;
        }
      }
      setUploadingStorage(false);

      if (!failed) {
        setPageImages(prev => ({ ...prev, ...storageUrls }));
        resetBiodataPdfCache();  // exports must pick up the new template
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
        const url = await uploadPageToStorage(dataUrl, currentPage);
        setUploadingStorage(false);

        if (url) {
          setPageImages(prev => ({ ...prev, [currentPage]: url }));
          resetBiodataPdfCache();  // exports must pick up the new template
          showMsg(`✓ Page ${currentPage} saved to Storage`);
        } else {
          showMsg("⚠️ Image loaded locally but Storage upload failed. Check bucket exists and is public.");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // ── Place a marker on PDF click ──────────────────────────────────────────────
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't place a new marker if this click was the tail-end of a drag
    if (didDragRef.current) return;
    if (!selectedId || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const pdfX = parseFloat(((e.clientX - rect.left) / rect.width  * PDF_W).toFixed(1));
    const pdfY = parseFloat(((e.clientY - rect.top)  / rect.height * PDF_H).toFixed(1));
    const def  = FIELD_LOOKUP[selectedId];
    const dims = getDefaultDims(selectedId);
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
  }, [selectedId, currentPage, mappings]);

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
  }, []);

  // ── Save mappings to Supabase ────────────────────────────────────────────────
  const handleSave = async () => {
    const rows = Object.values(mappings).filter(m => m.field_id !== SETTINGS_ROW_ID);
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
    });

    const payload = [
      ...rows.map(toRow),
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
        : `Error: ${error.message}`);
    } else {
      setSaveStatus("saved");
      resetBiodataPdfCache();  // next biodata export picks up the new sizes/positions
      showMsg(`✓ Saved ${rows.length} mappings`);
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
    const rows = Object.values(mappings);
    if (!rows.length) { showMsg("No mappings to download yet."); return; }

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

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-gray-200">
        <span className="text-xs px-2.5 py-1 bg-slate-100 rounded-full text-slate-600 font-medium">
          {mappedCount} / {totalFields} total
        </span>
        <span className="text-xs px-2.5 py-1 bg-blue-50 rounded-full text-blue-700 font-medium">
          Page {currentPage}: {pageMapped} / {pageFields.length}
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
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors ${
            saveStatus === "saved" ? "bg-green-600" : saveStatus === "error" ? "bg-red-600" : saveStatus === "saving" ? "bg-gray-400" : "bg-slate-800 hover:bg-slate-700"
          }`}
        >
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "✓ Saved" : "💾 Save All"}
        </button>

        {statusMsg && <span className="text-xs text-slate-500 italic max-w-xs truncate">{statusMsg}</span>}
      </div>

      {/* ── Two-panel layout ──────────────────────────────────────────────────── */}
      <div className="flex gap-5 items-start">

        {/* ── LEFT: PDF viewer — takes all remaining space ───────────────────── */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">

          {/* Page toggle + zoom controls */}
          <div className="flex items-center gap-2">
            {([1, 2] as const).map(p => (
              <button key={p} onClick={() => { setCurrentPage(p); setSelectedId(null); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${currentPage === p ? "bg-slate-800 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"}`}
              >
                Page {p}
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
                onClick={() => setZoom(100)}
                title="Reset to 100%"
                className="w-12 h-7 flex items-center justify-center rounded text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm transition-all tabular-nums"
              >{zoom}%</button>
              <button
                onClick={zoomIn}
                disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                title="Zoom in"
                className="w-7 h-7 flex items-center justify-center rounded text-slate-600 hover:bg-white hover:shadow-sm disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base transition-all"
              >+</button>
            </div>
          </div>

          {/* Placement hint */}
          <p className="text-xs text-slate-400 italic -mt-1">
            {renderingPdf ? "Rendering PDF…" : uploadingStorage ? "Saving to Storage…" : selectedId ? `▸ Placing: ${FIELD_LOOKUP[selectedId]?.label ?? selectedId}` : "Click a field on the right to start placing"}
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
              <div style={{ width: `${renderW}px`, position: "relative" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={pageImages[currentPage]}
                  src={pageImages[currentPage]}
                  alt={`PDF page ${currentPage}`}
                  className="w-full block select-none"
                  draggable={false}
                  onError={() => setImgFailed(p => ({ ...p, [currentPage]: true }))}
                  onLoad={()  => setImgFailed(p => { const n = { ...p }; delete n[currentPage]; return n; })}
                />
                {/* Click / marker overlay — always covers the zoom wrapper exactly */}
                <div ref={overlayRef} onClick={handleOverlayClick}
                  className={`absolute inset-0 ${selectedId ? "cursor-crosshair" : "cursor-default"}`}>
                  {Object.values(mappings).filter(m => m.page === currentPage).map(m => {
                    const tk = (m.field_type in TYPE_STYLE ? m.field_type : "text") as FieldType;
                    const { bg, border } = TYPE_STYLE[tk];
                    const isSel  = selectedId === m.field_id;
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
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedId(m.field_id);
                          fieldRefs.current[m.field_id]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                        }}
                        className={`absolute border-2 flex ${isCb ? "items-center justify-center" : "items-end justify-start overflow-hidden"} ${bg} ${border} ${isSel ? "ring-2 ring-yellow-400 ring-offset-1 z-10" : ""}`}
                        style={{
                          left: `${(m.x / PDF_W) * 100}%`,
                          top:  `${(m.y / PDF_H) * 100}%`,
                          width: dispW, height: dispH,
                          minWidth: isCb ? "8px" : "6px",
                          minHeight: isCb ? "8px" : "4px",
                          cursor: "grab",
                        }}
                      >
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

                        {/* Sample text at the field's real size — sits on the same
                            baseline the exporter uses (1pt left / 2pt bottom padding),
                            so what you see here is what prints. */}
                        {isTxt && showTextPreview && pxPerPt > 0 && (
                          <span style={{
                            fontSize:   `${effSize(m) * pxPerPt}px`,
                            fontFamily: "Helvetica, Arial, sans-serif",
                            lineHeight: 1,
                            whiteSpace: "nowrap",
                            color: "rgba(15,23,42,0.8)",
                            paddingLeft:   `${1 * pxPerPt}px`,
                            paddingBottom: `${2 * pxPerPt}px`,
                            pointerEvents: "none", userSelect: "none",
                          }}>{m.label}</span>
                        )}
                      </div>
                    );
                  })}
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
    </div>
  );
}