/**
 * pdfDraw.ts — stamping mapped values onto a scanned form.
 *
 * Both the biodata and the ID 407 contract work the same way: a page image from
 * Storage as the background, and a table of (x, y, w, h) boxes that a recruiter
 * positioned in PDF Mapper. Only the field names and the page size differ, so
 * everything that actually draws lives here and each form supplies its own
 * values.
 *
 * Coordinates arrive with a TOP-LEFT origin (the pdfplumber convention that
 * PDF Mapper stores), and pdf-lib works from the bottom left. toLibY() is the
 * single place that flip happens.
 */

import { PDFDocument, PDFFont, PDFPage, rgb, LineCapStyle } from "pdf-lib";

/* ── Checkbox geometry ────────────────────────────────────────────────────── */
// PDF Mapper draws every checkbox marker as a fixed CHECKBOX_SIZE square anchored
// at (x, y), whatever w/h the row happens to store. These constants are shared
// with the mapper so its preview and the print agree exactly.
export const CHECKBOX_SIZE = 12;   // pt — the marker square in PDF Mapper
export const TICK_SIZE     = 9;    // pt — overall span of the drawn ✓
export const TICK_WEIGHT   = 1.4;  // pt — stroke thickness
// Arm proportions, relative to TICK_SIZE, measured from the vertex
export const TICK_LEFT_DX  = 0.35;
export const TICK_LEFT_DY  = 0.50;
export const TICK_RIGHT_DX = 0.65;
export const TICK_RIGHT_DY = 0.80;

/** Fallback text size when a field and the global default both say nothing. */
export const DEFAULT_TEXT_SIZE = 8;

/** How small a paragraph may go before losing words is the lesser evil. */
export const PARAGRAPH_MIN_SIZE  = 5;
export const PARAGRAPH_SIZE_STEP = 0.5;

const BLACK = rgb(0, 0, 0);

export interface FieldMapping {
  field_id:   string;
  field_type: string;  // 'text' | 'checkbox' | 'date' | 'image' | 'signature'
  page:       number;
  x:          number;
  y:          number;  // from the TOP of the page
  w:          number;
  h:          number;
  font_size?: number | null;
}

/** Value per field: a string prints as text, `true` draws a tick, anything else is skipped. */
export type FieldValues = Record<string, string | boolean | undefined>;

/** The y of the BOTTOM edge of a field zone, in pdf-lib's coordinate space. */
export function toLibY(m: FieldMapping, pageHeight: number): number {
  return pageHeight - m.y - m.h;
}

/** A field's own size, else the form's global default. */
export function sizeFor(m: FieldMapping, defaultSize: number): number {
  return m.font_size && m.font_size > 0 ? m.font_size : defaultSize;
}

/**
 * Shrink `text` with a trailing ellipsis until it fits `maxW` at `size`.
 * Uses real glyph widths rather than a character-count estimate, so truncation
 * stays correct at any font size.
 */
export function fitText(text: string, font: PDFFont, size: number, maxW: number): string {
  if (maxW <= 0) return "";
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

/**
 * Greedy word-wrap of `text` across a run of boxes, one line each.
 *
 * Boxes are filled in order and may differ in width and font size — line 1 of a
 * duties field is short because the printed label eats into it, line 2 spans the
 * page. Only the LAST box ellipsises: everything still unplaced has nowhere left
 * to go. Returns one string per box, "" for any that end up unused.
 */
export function wrapAcross(
  text: string,
  font: PDFFont,
  boxes: { size: number; maxW: number }[],
): { lines: string[]; overflow: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let overflow = false;
  let w = 0;

  boxes.forEach((box, i) => {
    if (w >= words.length) { out.push(""); return; }

    // Last box takes whatever is left, ellipsised if it overflows
    if (i === boxes.length - 1) {
      const rest   = words.slice(w).join(" ");
      const fitted = fitText(rest, font, box.size, box.maxW);
      if (fitted !== rest) overflow = true;
      out.push(fitted);
      w = words.length;
      return;
    }

    let line = "";
    while (w < words.length) {
      const next = line ? `${line} ${words[w]}` : words[w];
      if (font.widthOfTextAtSize(next, box.size) > box.maxW) {
        // A single word wider than an empty box would spin here forever. Take
        // it (trimmed to fit) rather than dropping it, and start the next line.
        if (!line) { line = fitText(words[w], font, box.size, box.maxW); w++; overflow = true; }
        break;
      }
      line = next;
      w++;
    }
    out.push(line);
  });

  return { lines: out, overflow };
}

/**
 * Spread each paragraph group's answer across the line boxes that were mapped,
 * shrinking the type only as far as it takes to get all of it onto the page.
 *
 * A group is an ordered list of field ids — the first holds the whole answer,
 * the rest are the ruled lines beneath it. Two lines at 8pt hold roughly seventy
 * characters and a real answer runs longer, so flowing alone still ends in an
 * ellipsis. Losing the tail of what someone wrote is worse than a smaller point
 * size, so the paragraph steps down to PARAGRAPH_MIN_SIZE before it truncates.
 *
 * The whole group shares one size — a paragraph whose second line is visibly
 * smaller than its first reads as a mistake. Any size chosen is recorded in
 * `sizeOverrides`; fields that fit as configured are left out of it entirely.
 */
export function flowParagraphs(
  values: FieldValues,
  mappings: FieldMapping[],
  font: PDFFont,
  groups: string[][],
  defaultSize: number,
  sizeOverrides: Map<string, number>,
): void {
  for (const ids of groups) {
    const text = values[ids[0]];
    if (typeof text !== "string" || text.trim() === "") continue;

    const placed = ids
      .map(id => ({ id, m: mappings.find(f => f.field_id === id) }))
      .filter((e): e is { id: string; m: FieldMapping } => !!e.m);
    if (!placed.length) continue;

    // Uppercased here because the stamp loop uppercases too — measuring the
    // original would under-read the width and let capitals overflow.
    const upper = text.toUpperCase();
    const start = Math.min(...placed.map(({ m }) => sizeFor(m, defaultSize)));

    let size   = start;
    let result = wrapAcross(upper, font, placed.map(({ m }) => ({ size, maxW: m.w - 2 })));
    while (result.overflow && size > PARAGRAPH_MIN_SIZE) {
      size   = Math.max(PARAGRAPH_MIN_SIZE, size - PARAGRAPH_SIZE_STEP);
      result = wrapAcross(upper, font, placed.map(({ m }) => ({ size, maxW: m.w - 2 })));
    }

    placed.forEach(({ id }, i) => {
      values[id] = result.lines[i] ?? "";
      if (size !== start) sizeOverrides.set(id, size);
    });
  }
}

/**
 * A hand-drawn ✓ whose VERTEX lands on the centre of the square PDF Mapper drew.
 *
 * The centre comes from CHECKBOX_SIZE rather than m.w/m.h, because the mapper
 * renders checkboxes at that fixed size whatever the row stores — rows left with
 * text-shaped defaults (w = 100, h = 14) would otherwise put the tick tens of
 * points from where the recruiter clicked.
 */
export function drawTick(page: PDFPage, m: FieldMapping, pageHeight: number): void {
  const cx = m.x + CHECKBOX_SIZE / 2;
  const cy = pageHeight - (m.y + CHECKBOX_SIZE / 2);

  // Short arm: down from the upper left into the vertex
  page.drawLine({
    start:     { x: cx - TICK_SIZE * TICK_LEFT_DX, y: cy + TICK_SIZE * TICK_LEFT_DY },
    end:       { x: cx,                            y: cy },
    thickness: TICK_WEIGHT, color: BLACK, lineCap: LineCapStyle.Round,
  });
  // Long arm: up from the vertex to the upper right
  page.drawLine({
    start:     { x: cx,                             y: cy },
    end:       { x: cx + TICK_SIZE * TICK_RIGHT_DX, y: cy + TICK_SIZE * TICK_RIGHT_DY },
    thickness: TICK_WEIGHT, color: BLACK, lineCap: LineCapStyle.Round,
  });
}

/**
 * Draw an image into its box, scaled to FIT rather than stretched.
 *
 * `contain` preserves the aspect ratio and centres what is left over, which is
 * what keeps a signature from looking squashed — the pad exports a transparent
 * PNG cropped to the ink, so its shape carries meaning. Photos fill their box.
 *
 * A failure here is swallowed on purpose: a missing photo should leave the box
 * blank, not abandon a contract the rest of which is correct.
 */
export async function drawImageField(
  pdfDoc: PDFDocument,
  page: PDFPage,
  m: FieldMapping,
  url: string,
  pageHeight: number,
  mode: "fill" | "contain",
): Promise<void> {
  try {
    const res   = await fetch(url);
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ct    = res.headers.get("content-type") ?? "";
    const img   = ct.includes("png") || mode === "contain"
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);

    const libY = toLibY(m, pageHeight);
    if (mode === "fill") {
      page.drawImage(img, { x: m.x, y: libY, width: m.w, height: m.h });
      return;
    }
    const scale = Math.min(m.w / img.width, m.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, {
      x: m.x + (m.w - w) / 2,
      y: libY + (m.h - h) / 2,
      width: w, height: h,
    });
  } catch {
    // Leave the box blank and keep going
  }
}

/**
 * Stamp every mapped field that has a value.
 *
 * Images and signatures are handled by the caller before this runs, so anything
 * of those types is skipped here.
 */
export function stampFields(
  pages: PDFPage[],
  mappings: FieldMapping[],
  values: FieldValues,
  font: PDFFont,
  pageHeight: number,
  defaultSize: number,
  sizeOverrides: Map<string, number>,
): void {
  for (const m of mappings) {
    if (m.field_type === "image" || m.field_type === "signature") continue;

    const value = values[m.field_id];
    if (value === undefined || value === null || value === "" || value === false) continue;

    const page = pages[m.page - 1];
    if (!page) continue;

    if (m.field_type === "checkbox" && value === true) {
      drawTick(page, m, pageHeight);
    } else if (typeof value === "string" && value.trim() !== "") {
      const size = sizeOverrides.get(m.field_id) ?? sizeFor(m, defaultSize);
      // These forms ask for CAPITAL letters, so every value is upper-cased
      // before measuring — capitals are wider, and measuring the original would
      // let text overflow its box.
      const text = fitText(value.toUpperCase(), font, size, m.w - 2);
      page.drawText(text, {
        x: m.x + 1,
        y: toLibY(m, pageHeight) + 2,   // 2pt padding from the bottom of the zone
        size, font, color: BLACK,
      });
    }
  }
}

/** Hand the finished document to the browser as a download. */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  // Cast the buffer — pdf-lib never returns a SharedArrayBuffer
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Strip anything a filesystem would object to. */
export function safeFilename(name: string, suffix: string): string {
  const safe = (name || "Document").replace(/[^a-zA-Z0-9 ]/g, "").trim();
  return `${safe} - ${suffix}.pdf`;
}
