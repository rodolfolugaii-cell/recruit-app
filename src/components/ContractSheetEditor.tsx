"use client";

/**
 * ContractSheetEditor.tsx — the ID 407 contract as it will print, editable.
 *
 * The scanned form sits underneath and every mapped box is drawn over it in
 * place, filled from the same buildId407Values() the export uses. What you see
 * is therefore the sheet, not a form that happens to produce one, and a value
 * that lands badly is visible here rather than after printing.
 *
 * Two kinds of correction are possible, and they are deliberately different
 * gestures because they have different consequences:
 *
 *   left click    edit the text. Enter or ✓ keeps it, Escape, ✗ or a click
 *                 outside throws it away.
 *   right click   → Move. The box turns draggable (arrows nudge it, as in PDF
 *                 Mapper) and nothing is committed until Apply is pressed.
 *
 * Both are stored per contract, so neither disturbs another applicant's sheet
 * nor the shared mapping. Clearing an edit restores the automatic value.
 *
 * Checkboxes and signatures render read-only: a tick reflects what the contract
 * terms say, and changing what was agreed belongs on the Contracts page, not on
 * a view whose job is the printed layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  fetchAllMappings, mappingsForForm, resetPdfTemplateCache, TEMPLATE_BUCKET,
} from "@/lib/pdfTemplates";
import { formFieldIds, getForm, templateImageName } from "@/lib/pdfForms";
import { cropForForm } from "@/lib/pdfTemplates";
import { fullPageCrop, type Crop } from "@/lib/pdfCrop";
import type { Id988aApplicant } from "@/lib/id988a";
import { sizeFor, type FieldMapping } from "@/lib/pdfDraw";
import {
  saveContractFieldEdits, needsFieldEditsMigration,
  type Contract, type FieldOverrides, type FieldPositions,
} from "@/lib/contracts";
import { type ContractExportOptions } from "@/lib/exportContractPdf";
import {
  EMPLOYER_FIELD_SET, EMPLOYER_CHECK_FIELDS, employerFromSheet,
  employerSheetGaps, partnerOf,
} from "@/lib/id407Employer";
import { createEmployer, type Employer } from "@/lib/employers";

/**
 * Everything about the sheet that differs between forms, worked out once per
 * form id. The editor itself is identical for ID 407 and ID 988A — only the
 * field set, the page size and the value builder change.
 */
function formFacts(formId: string) {
  const form = getForm(formId);
  return {
    form,
    PDF_W: form.width,
    PDF_H: form.height,
    PAGES: Array.from({ length: form.pages }, (_, i) => i + 1),
    FIELD_TYPES: Object.fromEntries(
      form.sections.flatMap(sec => sec.fields.map(f => [f.id, f.type])),
    ) as Record<string, string>,
    FIELD_LABELS: Object.fromEntries(
      form.sections.flatMap(sec => sec.fields.map(f => [f.id, f.label])),
    ) as Record<string, string>,
    /** Lines that flow as one paragraph, so the editor can say so. */
    PARAGRAPH_OF: Object.fromEntries(
      form.paragraphs.flatMap(ids => ids.map(id => [id, ids])),
    ) as Record<string, string[]>,
  };
}

/** The applicant fields any sheet might ask about — a superset of both forms. */
export type SheetApplicant = Id988aApplicant;

/** Same ladder as PDF Mapper, carried up to 500% — this view is where a box is
 *  judged against a printed rule, and that needs more magnification than placing
 *  one does. */
const ZOOM_LEVELS = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500];

type MoveState = { id: string; x: number; y: number } | null;
type CtxMenu   = { id: string; x: number; y: number } | null;

export default function ContractSheetEditor({
  formId,
  buildValues,
  exportSheet,
  applicant,
  employer,
  contract,
  onCreateContract,
  creating,
  canCreate,
  onContractSaved,
  newEmployerMode,
  onEmployerCreated,
  onCancelNewEmployer,
}: {
  /** Which form this sheet is — "id407" or "id988a". */
  formId: string;
  buildValues: (a: SheetApplicant, e: Employer | null, c: Contract | null) => Record<string, string | boolean | undefined>;
  exportSheet: (a: SheetApplicant, e: Employer | null, c: Contract, opts: ContractExportOptions) => Promise<void>;
  applicant: SheetApplicant;
  employer: Employer | null;
  contract: Contract | null;
  onCreateContract: () => void;
  creating: boolean;
  /** False until an employer is assigned — a contract needs one to be against. */
  canCreate: boolean;
  onContractSaved: (c: Contract) => void;
  /**
   * Describe a brand-new employer by typing onto the sheet itself. Only ID 407
   * carries the household details, so only that sheet offers it.
   */
  newEmployerMode: boolean;
  onEmployerCreated: (e: Employer) => void;
  onCancelNewEmployer: () => void;
}) {
  const { form, PDF_W, PDF_H, PAGES, FIELD_TYPES, FIELD_LABELS, PARAGRAPH_OF } =
    useMemo(() => formFacts(formId), [formId]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [defaultSize, setDefaultSize] = useState(8);
  const [images, setImages] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Seeded from the contract rather than synced to it by an effect: the parent
  // remounts this view (key={contract.id}) when a different contract is opened,
  // so a save can update the record without discarding what is on screen.
  const [overrides, setOverrides] = useState<FieldOverrides>(contract?.field_overrides ?? {});
  const [positions, setPositions] = useState<FieldPositions>(contract?.field_positions ?? {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Which export is running, so only that button shows its spinner
  const [exporting, setExporting] = useState<"overlay" | "proof" | null>(null);
  const [creatingEmployer, setCreatingEmployer] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [move, setMove] = useState<MoveState>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sheetRef  = useRef<HTMLDivElement | null>(null);
  const inputRef  = useRef<HTMLInputElement | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [zoom, setZoom] = useState(100);
  const zoomIn  = () => setZoom(z => ZOOM_LEVELS[Math.min(ZOOM_LEVELS.indexOf(z) + 1, ZOOM_LEVELS.length - 1)]);
  const zoomOut = () => setZoom(z => ZOOM_LEVELS[Math.max(ZOOM_LEVELS.indexOf(z) - 1, 0)]);

  // Measured from the scroll container, so 100% means "fits the modal" and every
  // other level is honestly relative to it
  const [contW, setContW] = useState(0);
  // renderW stays the FULL page width. The crop only clips what is visible, so
  // every coordinate below — and pxPerPt — keeps working in full-page space.
  const [crop, setCrop] = useState<Crop>(() => fullPageCrop(PDF_W, PDF_H));
  const renderW = Math.round((contW * zoom / 100) * (PDF_W / crop.w));
  const pxPerPt = renderW / PDF_W;

  /* ── Load the shared mapping and both sheet images ───────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { rows, defaultSize: ds, crops } = await fetchAllMappings();
        if (cancelled) return;
        setMappings(mappingsForForm(rows, formFieldIds(form)));
        setDefaultSize(ds);
        // The same window the mapper set and the export will use
        setCrop(cropForForm(crops, form.id, PDF_W, PDF_H));

        const urls: Record<number, string> = {};
        for (const p of PAGES) {
          const { data } = supabase.storage
            .from(TEMPLATE_BUCKET)
            .getPublicUrl(templateImageName(form, p));
          urls[p] = data.publicUrl;
        }
        if (!cancelled) setImages(urls);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form, PAGES, PDF_W, PDF_H]);

  /* ── Track the container width so text can be sized in real points ───────── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // clientWidth, not getBoundingClientRect(): the latter counts the vertical
    // scrollbar, so the wrapper would be a few pixels wider than the space it
    // has and 100% zoom would scroll sideways for no reason.
    const measure = () => {
      const w = el.clientWidth;
      if (w > 100) setContW(Math.floor(w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  /* ── The values the export would print, before any hand correction ───────── */
  const computed = useMemo(() => {
    // A contract that does not exist yet still has a helper with a name, and
    // showing those boxes filled is the clearest possible prompt for the rest.
    const stub = { terms: {} } as Contract;
    // Describing a new employer starts from an empty household, not from
    // whoever happened to be assigned before
    const src = newEmployerMode ? null : employer;
    return buildValues(applicant, src, contract ?? stub);
  }, [applicant, employer, contract, newEmployerMode, buildValues]);

  const valueOf = useCallback((id: string): string => {
    const v = overrides[id] ?? computed[id];
    return typeof v === "string" ? v : "";
  }, [overrides, computed]);

  const tickedOf = useCallback((id: string): boolean => {
    const v = overrides[id] ?? computed[id];
    return v === true;
  }, [overrides, computed]);

  /** The box as it currently sits: shared mapping, then this contract's move. */
  const boxOf = useCallback((m: FieldMapping): FieldMapping => {
    const moved = positions[m.field_id];
    return moved ? { ...m, x: moved.x, y: moved.y } : m;
  }, [positions]);

  const pageMappings = useMemo(
    () => mappings.filter(m => m.page === page),
    [mappings, page],
  );

  /* ── Editing ─────────────────────────────────────────────────────────────── */

  /**
   * Whether this box accepts a value right now.
   *
   * Normally that means a contract exists to record the correction against.
   * While describing a new employer there is no contract yet and the sheet is
   * standing in for the employer form, so exactly the boxes that make up an
   * employer profile open up and nothing else does — typing a wage into a
   * record that has not been agreed would be inventing terms.
   */
  const canEdit = useCallback((id: string): boolean => (
    newEmployerMode ? EMPLOYER_FIELD_SET.has(id) : !!contract
  ), [newEmployerMode, contract]);

  const beginEdit = useCallback((id: string) => {
    if (!canEdit(id)) return;
    if (move) return;                    // a move is in progress; finish it first
    setCtxMenu(null);
    setEditingId(id);
    setDraft(valueOf(id));
  }, [canEdit, move, valueOf]);

  /** Tick one of a Yes/No or unit pair, clearing whichever it excludes. */
  const toggleCheck = useCallback((id: string) => {
    if (!canEdit(id)) return;
    setOverrides(prev => {
      const next = { ...prev, [id]: !(prev[id] === true) };
      const other = partnerOf(id);
      if (other && next[id] === true) next[other] = false;
      return next;
    });
    setDirty(true);
  }, [canEdit]);

  const commitEdit = useCallback(() => {
    if (!editingId) return;
    const id = editingId;
    setOverrides(prev => {
      const next = { ...prev };
      const auto = typeof computed[id] === "string" ? (computed[id] as string) : "";
      // Typing the automatic value back is a way of asking for it to stay
      // automatic, so the override is dropped rather than frozen at today's text
      if (draft === auto) delete next[id];
      else next[id] = draft;
      return next;
    });
    setDirty(true);
    setEditingId(null);
  }, [editingId, draft, computed]);

  const cancelEdit = useCallback(() => setEditingId(null), []);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  /* ── Moving ──────────────────────────────────────────────────────────────── */

  const beginMove = useCallback((id: string) => {
    const m = mappings.find(x => x.field_id === id);
    if (!m) return;
    const b = boxOf(m);
    setCtxMenu(null);
    setEditingId(null);
    setMove({ id, x: b.x, y: b.y });
  }, [mappings, boxOf]);

  const applyMove = useCallback(() => {
    if (!move) return;
    setPositions(prev => ({ ...prev, [move.id]: { x: move.x, y: move.y } }));
    setDirty(true);
    setMove(null);
  }, [move]);

  const cancelMove = useCallback(() => setMove(null), []);

  const resetPosition = useCallback((id: string) => {
    setPositions(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDirty(true);
    setCtxMenu(null);
  }, []);

  const clearOverride = useCallback((id: string) => {
    setOverrides(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDirty(true);
    setCtxMenu(null);
  }, []);

  /** Drag the box under the pointer while a move is armed. */
  const onMoveHandleDown = useCallback((e: React.MouseEvent) => {
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = sheetRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX, startY = e.clientY;
    const originX = move.x, originY = move.y;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ((ev.clientX - startX) / rect.width)  * PDF_W;
      const dy = ((ev.clientY - startY) / rect.height) * PDF_H;
      setMove(prev => prev && ({
        ...prev,
        x: parseFloat(Math.max(0, Math.min(PDF_W, originX + dx)).toFixed(1)),
        y: parseFloat(Math.max(0, Math.min(PDF_H, originY + dy)).toFixed(1)),
      }));
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [move, PDF_W, PDF_H]);

  /* ── Keys: arrows nudge a move, Escape backs out of whatever is open ─────── */
  useEffect(() => {
    const DIRS: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (ctxMenu) { setCtxMenu(null); return; }
        if (editingId) { cancelEdit(); return; }
        if (move) { cancelMove(); return; }
        return;
      }
      if (!move || e.altKey) return;
      const dir = DIRS[e.key];
      if (!dir) return;
      // Same steps as PDF Mapper, so the two views feel like one tool
      const step = e.shiftKey ? 10 : (e.ctrlKey || e.metaKey) ? 0.1 : 1;
      e.preventDefault();
      setMove(prev => prev && ({
        ...prev,
        x: parseFloat(Math.max(0, Math.min(PDF_W, prev.x + dir[0] * step)).toFixed(1)),
        y: parseFloat(Math.max(0, Math.min(PDF_H, prev.y + dir[1] * step)).toFixed(1)),
      }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [move, editingId, ctxMenu, cancelEdit, cancelMove, PDF_W, PDF_H]);

  /* ── Saving ──────────────────────────────────────────────────────────────── */
  /** Write the pending edits and hand back the saved record. */
  const persist = useCallback(async (): Promise<Contract | null> => {
    if (!contract) return null;
    if (!dirty) return contract;
    const updated = await saveContractFieldEdits(contract.id, overrides, positions);
    // The export reads mappings through a session cache; a moved box has to
    // survive into the next download without a page reload.
    resetPdfTemplateCache();
    setDirty(false);
    onContractSaved(updated);
    return updated;
  }, [contract, dirty, overrides, positions, onContractSaved]);

  const describeError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return needsFieldEditsMigration(msg)
      ? "This needs a one-time database update. Run supabase/migrations/20260905000100_contract_field_edits.sql in the Supabase SQL Editor."
      : msg;
  };

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try { await persist(); }
    catch (e) { setSaveError(describeError(e)); }
    finally { setSaving(false); }
  }, [persist]);

  /**
   * Print the sheet.
   *
   * Pending edits are saved first and the export runs against the record that
   * comes back, because exportContractPdf() reads the corrections off the
   * contract row — exporting the stale prop would quietly print the version
   * before the change someone just made.
   */
  const exportPdf = useCallback(async (opts: ContractExportOptions = {}) => {
    setExporting(opts.includeTemplate ? "proof" : "overlay");
    setSaveError(null);
    try {
      const fresh = await persist();
      if (!fresh) return;
      await exportSheet(applicant, employer, fresh, opts);
    } catch (e) {
      setSaveError(describeError(e));
    } finally {
      setExporting(null);
    }
  }, [persist, applicant, employer, exportSheet]);

  /**
   * Save the household described on the sheet as a new employer.
   *
   * Only the employer is created here. Assigning it and opening the contract is
   * the parent's business — it owns the applicant row — so this hands the saved
   * record back rather than reaching across for the applicant id.
   */
  const createEmployerFromSheet = useCallback(async () => {
    const gaps = employerSheetGaps(overrides);
    if (gaps.length) {
      setSaveError(`Still needed before this employer can be saved: ${gaps.join(", ")}.`);
      return;
    }
    setCreatingEmployer(true);
    setSaveError(null);
    try {
      const saved = await createEmployer(employerFromSheet(overrides));
      onEmployerCreated(saved);
    } catch (e) {
      setSaveError(describeError(e));
    } finally {
      setCreatingEmployer(false);
    }
  }, [overrides, onEmployerCreated]);

  /* ── Render ──────────────────────────────────────────────────────────────── */

  if (loading) {
    return <div className="p-10 text-center text-sm text-gray-400">Loading contract sheet…</div>;
  }
  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-600 mb-1">Could not load the contract sheet.</p>
        <p className="text-xs text-gray-500">{loadError}</p>
      </div>
    );
  }
  if (!mappings.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-700 mb-1">No ID 407 field positions have been set yet.</p>
        <p className="text-xs text-gray-500">
          Open PDF Mapper, switch the form to “ID 407 Contract”, place the fields and save.
        </p>
      </div>
    );
  }

  const editingBox = editingId
    ? boxOf(mappings.find(m => m.field_id === editingId)!)
    : null;

  return (
    <div className="p-4">
      {/* ── Describing a new employer onto the sheet ── */}
      {newEmployerMode && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-blue-900">New employer — fill in the household on the sheet.</p>
            <p className="text-xs text-blue-700 mt-0.5">
              The employer’s name, residence, Schedule 2 household and Schedule 3
              accommodation boxes are open below — click any one and type, or tick
              the Yes/No marks. Everything else fills itself once the contract exists.
            </p>
          </div>
          <button
            onClick={onCancelNewEmployer}
            disabled={creatingEmployer}
            className="px-3 py-1.5 rounded-md bg-white border border-blue-300 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={createEmployerFromSheet}
            disabled={creatingEmployer}
            className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
          >
            {creatingEmployer ? "Creating…" : "Create employer & contract"}
          </button>
        </div>
      )}

      {/* ── No contract yet: the sheet still shows, but nothing is editable ── */}
      {!contract && !newEmployerMode && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">No contract yet for this applicant.</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {canCreate
                ? "The helper’s name and place of origin are shown from the biodata. Create a contract to fill in the employer, terms and signatures — and to edit any box."
                : "The helper’s name and place of origin are shown from the biodata. Assign an employer above before a contract can be created."}
            </p>
          </div>
          {canCreate && (
            <button
              onClick={onCreateContract}
              disabled={creating}
              className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
            >
              {creating ? "Creating…" : "Create Contract"}
            </button>
          )}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {PAGES.map(p => (
            <button
              key={p}
              onClick={() => { setEditingId(null); setMove(null); setPage(p); }}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                p === page ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-800"
              }`}
            >
              Sheet {p}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-1">
          <button
            onClick={zoomOut}
            disabled={zoom <= ZOOM_LEVELS[0]}
            title="Zoom out"
            className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:bg-white hover:shadow-sm disabled:opacity-30 font-bold text-base"
          >−</button>
          <button
            onClick={() => setZoom(100)}
            title="Reset to fit"
            className="w-14 h-7 flex items-center justify-center rounded text-xs font-medium text-gray-600 hover:bg-white hover:shadow-sm tabular-nums"
          >{zoom}%</button>
          <button
            onClick={zoomIn}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            title="Zoom in"
            className="w-7 h-7 flex items-center justify-center rounded text-gray-600 hover:bg-white hover:shadow-sm disabled:opacity-30 font-bold text-base"
          >+</button>
        </div>

        <button
          onClick={() => setShowBoxes(v => !v)}
          title="Show or hide the field outlines"
          className={`px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
            showBoxes
              ? "bg-blue-50 border-blue-300 text-blue-700"
              : "bg-white border-gray-300 text-gray-500"
          }`}
        >{showBoxes ? "Boxes shown" : "Boxes hidden"}</button>

        <p className="text-[11px] text-gray-400 italic">
          {move
            ? "Drag the box, or nudge with the arrow keys — 1pt · shift 10pt · ctrl 0.1pt"
            : newEmployerMode
              ? "Blue boxes are the employer’s — click to type, or tick a Yes/No"
              : contract
                ? "Left-click a box to edit · right-click for more"
                : "Read-only until a contract is created"}
        </p>

        <div className="ml-auto flex items-center gap-2">
          {saveError && <span className="text-[11px] text-red-600 max-w-md">{saveError}</span>}
          {dirty && !saveError && <span className="text-[11px] text-amber-600">Unsaved changes</span>}
          <button
            onClick={save}
            disabled={!contract || !dirty || saving || !!exporting}
            className="px-3 py-1.5 rounded-md bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            onClick={() => exportPdf({ includeTemplate: true })}
            disabled={!contract || saving || !!exporting}
            title="A proof on plain paper: the form with the values on it, for checking alignment before you print a real one"
            className="px-3 py-1.5 rounded-md bg-white text-gray-700 border border-gray-300 text-xs font-semibold hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
          >
            {exporting === "proof" ? "Generating…" : "🖨 Proof copy"}
          </button>
          <button
            onClick={() => exportPdf()}
            disabled={!contract || saving || !!exporting}
            title={dirty
              ? "Saves your changes, then downloads the values only, to print onto the real form"
              : "Downloads the values only, to print onto the real form"}
            className="px-3 py-1.5 rounded-md bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 disabled:opacity-40 whitespace-nowrap"
          >
            {exporting === "overlay" ? "Generating…" : "📄 Print Overlay"}
          </button>
        </div>
      </div>

      {/* ── The sheet ──
          outer div scrolls both ways once zoomed past the container; the inner
          wrapper carries the zoomed width, and every box is positioned as a
          percentage of it, so the overlay stays registered at any zoom. ── */}
      <div
        ref={scrollRef}
        className="border border-gray-300 rounded-lg overflow-auto bg-gray-100"
        style={{ maxHeight: "calc(90vh - 260px)" }}
      >
      <div
        className="relative bg-white select-none overflow-hidden"
        style={{
          width:  renderW ? `${(crop.w / PDF_W) * renderW}px` : "100%",
          height: renderW ? `${(crop.h / PDF_W) * renderW}px` : undefined,
        }}
      >
      <div
        className="absolute bg-white select-none"
        style={{
          width: renderW ? `${renderW}px` : "100%",
          left:  renderW ? `${(-crop.x / PDF_W) * renderW}px` : 0,
          top:   renderW ? `${(-crop.y / PDF_W) * renderW}px` : 0,
        }}
        ref={sheetRef}
        // A click on bare paper is the "outside" that throws an edit away
        onMouseDown={() => { if (editingId) cancelEdit(); setCtxMenu(null); }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[page]}
          alt={`${form.label} sheet ${page}`}
          className="w-full block"
          draggable={false}
          onError={() => setLoadError(
            `The ${form.label} template page "${templateImageName(form, page)}" is missing. ` +
            `Upload it in PDF Mapper → Upload PDF.`
          )}
        />

        {pxPerPt > 0 && pageMappings.map(mapping => {
          const m    = boxOf(mapping);
          const id   = m.field_id;
          const type = FIELD_TYPES[id] ?? "text";
          const isMoving  = move?.id === id;
          const isEditing = editingId === id;
          const box  = isMoving ? { ...m, x: move.x, y: move.y } : m;

          // The editing input is rendered separately, on top of everything
          if (isEditing) return null;

          const edited = id in overrides;
          const nudged = id in positions;
          const style: React.CSSProperties = {
            position: "absolute",
            left:   `${(box.x / PDF_W) * 100}%`,
            top:    `${(box.y / PDF_H) * 100}%`,
            width:  `${(box.w / PDF_W) * 100}%`,
            height: `${(box.h / PDF_H) * 100}%`,
          };

          if (type === "checkbox") {
            const editable = canEdit(id) && EMPLOYER_CHECK_FIELDS.includes(id);
            return (
              <div
                key={id}
                title={editable
                  ? `${FIELD_LABELS[id] ?? id} — click to tick`
                  : `${FIELD_LABELS[id] ?? id} — set from the contract terms`}
                style={{ ...style, cursor: editable ? "pointer" : undefined }}
                onMouseDown={editable ? (e => { e.stopPropagation(); toggleCheck(id); }) : undefined}
                className={`flex items-center justify-center ${
                  editable ? "" : "pointer-events-none"
                } ${
                  showBoxes
                    ? editable
                      ? "border border-dashed border-blue-500/60 bg-blue-500/[0.07] hover:bg-blue-200/60"
                      : "border border-dashed border-gray-400/60 bg-gray-400/5"
                    : ""
                }`}
              >
                {tickedOf(id) && (
                  <span
                    className="font-bold text-gray-900 leading-none"
                    style={{ fontSize: `${Math.max(8, 11 * pxPerPt)}px` }}
                  >✓</span>
                )}
              </div>
            );
          }

          if (type === "signature" || type === "image") {
            const url = computed[id];
            return (
              <div
                key={id}
                style={style}
                className={`pointer-events-none flex items-end justify-center ${
                  showBoxes ? "border border-dashed border-gray-400/60 bg-gray-400/5" : ""
                }`}
              >
                {typeof url === "string" && url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="max-w-full max-h-full object-contain" />
                ) : null}
              </div>
            );
          }

          const text = valueOf(id);
          return (
            <div
              key={id}
              style={{ ...style, cursor: canEdit(id) ? (isMoving ? "grab" : "text") : "default" }}
              title={`${FIELD_LABELS[id] ?? id}${edited ? " — edited" : ""}${nudged ? " — moved" : ""}`}
              onMouseDown={e => {
                if (isMoving) { onMoveHandleDown(e); return; }
                e.stopPropagation();
                setCtxMenu(null);
                if (e.button === 0) beginEdit(id);
              }}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                if (!contract || move) return;
                setEditingId(null);
                setCtxMenu({ id, x: e.clientX, y: e.clientY });
              }}
              // An editable box has to be findable before it is hovered — the whole
              // point is knowing where you may click. Blue is editable, green has
              // been hand-edited, and the outline can be switched off to read the
              // sheet as it will print.
              className={`flex items-end justify-center overflow-hidden transition-colors ${
                isMoving
                  ? "ring-2 ring-blue-500 bg-blue-100/70 z-30"
                  : edited
                    ? (showBoxes
                        ? "border border-emerald-500/70 bg-emerald-100/50 hover:bg-emerald-200/70"
                        : "hover:bg-emerald-200/60")
                    : (showBoxes
                        ? (canEdit(id)
                            ? "border border-dashed border-blue-500/60 bg-blue-500/[0.07] hover:bg-blue-200/60 hover:border-blue-600"
                            : "border border-dashed border-gray-400/50 bg-gray-400/5")
                        : (canEdit(id) ? "hover:bg-blue-100/50" : ""))
              }`}
            >
              <span
                className="whitespace-nowrap leading-none text-gray-900"
                style={{
                  fontSize: `${sizeFor(m, defaultSize) * pxPerPt}px`,
                  paddingBottom: `${2 * pxPerPt}px`,
                }}
              >{text.toUpperCase()}</span>
            </div>
          );
        })}

        {/* ── Inline editor, positioned exactly over its box ── */}
        {editingBox && pxPerPt > 0 && (
          <>
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
              }}
              style={{
                position: "absolute",
                left:   `${(editingBox.x / PDF_W) * 100}%`,
                top:    `${(editingBox.y / PDF_H) * 100}%`,
                width:  `${(editingBox.w / PDF_W) * 100}%`,
                height: `${(editingBox.h / PDF_H) * 100}%`,
                fontSize: `${sizeFor(editingBox, defaultSize) * pxPerPt}px`,
                zIndex: 40,
              }}
              className="border-2 border-blue-500 bg-white text-center text-gray-900 px-0 outline-none rounded-none"
            />
            <FloatingChip
              pageW={PDF_W} pageH={PDF_H}
              box={editingBox}
              label={FIELD_LABELS[editingId!] ?? editingId!}
              note={PARAGRAPH_OF[editingId!]
                ? "Editing this takes the whole paragraph off auto-wrap"
                : undefined}
              onApply={commitEdit}
              onCancel={cancelEdit}
            />
          </>
        )}

        {/* ── Move chip, following the box ── */}
        {move && (
          <FloatingChip
              pageW={PDF_W} pageH={PDF_H}
            box={{ ...boxOf(mappings.find(m => m.field_id === move.id)!), x: move.x, y: move.y }}
            label={`${FIELD_LABELS[move.id] ?? move.id} — ${move.x}, ${move.y}`}
            onApply={applyMove}
            onCancel={cancelMove}
          />
        )}
      </div>
      </div>

      {/* ── Right-click menu ── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onMouseDown={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[190px] text-sm"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onMouseDown={e => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide truncate">
              {FIELD_LABELS[ctxMenu.id] ?? ctxMenu.id}
            </p>
            <button
              onClick={() => beginMove(ctxMenu.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
            >Move</button>
            <button
              onClick={() => beginEdit(ctxMenu.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
            >Edit text</button>
            {ctxMenu.id in overrides && (
              <button
                onClick={() => clearOverride(ctxMenu.id)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
              >Reset text to automatic</button>
            )}
            {ctxMenu.id in positions && (
              <button
                onClick={() => resetPosition(ctxMenu.id)}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
              >Reset position to mapping</button>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

/**
 * The little Apply / Cancel box that trails whatever is being changed.
 *
 * Anchored below its box, or above when the box sits near the foot of the page,
 * so the controls never land off the sheet.
 */
function FloatingChip({
  box, label, note, onApply, onCancel, pageW, pageH,
}: {
  box: FieldMapping;
  label: string;
  note?: string;
  onApply: () => void;
  onCancel: () => void;
  /** The chip anchors against the page edge, and the two forms differ in size. */
  pageW: number;
  pageH: number;
}) {
  const below = box.y + box.h < pageH - 70;
  return (
    <div
      style={{
        position: "absolute",
        left: `${(box.x / pageW) * 100}%`,
        top: below
          ? `${((box.y + box.h + 4) / pageH) * 100}%`
          : undefined,
        bottom: below
          ? undefined
          : `${((pageH - box.y + 4) / pageH) * 100}%`,
        zIndex: 50,
      }}
      onMouseDown={e => e.stopPropagation()}
      className="flex items-center gap-1 bg-gray-900 text-white rounded-md shadow-lg px-1.5 py-1 whitespace-nowrap"
    >
      <span className="text-[10px] text-gray-300 px-1 max-w-[220px] truncate">{label}</span>
      {note && <span className="text-[10px] text-amber-300 px-1 max-w-[260px] truncate">{note}</span>}
      <button
        onClick={onApply}
        className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-[11px] font-semibold"
      >Apply</button>
      <button
        onClick={onCancel}
        className="px-2 py-0.5 rounded bg-gray-600 hover:bg-gray-500 text-[11px] font-semibold"
      >Cancel</button>
    </div>
  );
}
