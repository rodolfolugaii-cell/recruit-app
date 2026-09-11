/**
 * pdfCombs.ts — the boxed fields where the form wants one letter per cell.
 *
 * ID 988A prints "Surname in English" as a row of little squares rather than a
 * ruled line, and a single wide value stamped across them lands between the
 * boxes instead of inside them. So a comb is mapped the way it is printed: one
 * box per letter, each positioned on its own.
 *
 * ── How a cell is named ─────────────────────────────────────────────────────
 * A cell is the base field id with its position appended — `id988a_surname__1`,
 * `id988a_surname__2`. The base id never gets a mapping of its own; it exists
 * so the value builder has one place to put the whole word, and so the mapper
 * can talk about "Surname" rather than nineteen separate things.
 *
 * The count is not fixed. A form ships with as many cells as the printed comb
 * has, and PDF Mapper can add or remove one from the end — a longer name field
 * on another form needs no code change, and neither does a miscounted scan.
 *
 * ── Why the value is spread late ────────────────────────────────────────────
 * spreadCombs() runs at export, after the value builder and after any typed
 * correction, so a recruiter editing "Surname" on the sheet edits the word and
 * not a letter. One character lands in each placed cell, left to right, and the
 * base key is dropped so nothing stamps the whole word over the top.
 */

import type { FieldMapping, FieldValues } from "./pdfDraw";

/** Where a comb starts and how far apart its cells sit, in points. */
export interface CombSpec {
  /** The field whose value fills the comb, e.g. "id988a_surname". */
  base:  string;
  label: string;
  page:  number;
  x:     number;
  y:     number;
  w:     number;
  h:     number;
  /** Centre-to-centre spacing, which is what "add a box" steps by. */
  pitch: number;
  /** How many cells the printed form has. */
  count: number;
}

const CELL = /^(.*)__(\d+)$/;

export function combCellId(base: string, n: number): string {
  return `${base}__${n}`;
}

/** The base and index of a cell id, or null if it is an ordinary field. */
export function parseCombCell(fieldId: string): { base: string; n: number } | null {
  const m = CELL.exec(fieldId);
  return m ? { base: m[1], n: Number(m[2]) } : null;
}

/** Does this id belong to one of these combs — including cells added later? */
export function isCombCellOf(fieldId: string, bases: Set<string>): boolean {
  const cell = parseCombCell(fieldId);
  return !!cell && bases.has(cell.base);
}

/** The cell ids a comb currently has, in order. */
export function combCellIds(spec: CombSpec, count = spec.count): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => combCellId(spec.base, i + 1));
}

/** Where cell `n` starts if the comb were laid out evenly from its origin. */
export function combCellPosition(spec: CombSpec, n: number): { page: number; x: number; y: number } {
  return {
    page: spec.page,
    x: parseFloat((spec.x + (n - 1) * spec.pitch).toFixed(1)),
    y: spec.y,
  };
}

/**
 * How many cells a comb has right now — the highest numbered one that has been
 * placed, or the form's own count when none have been.
 *
 * Reading it back off the mappings rather than storing it separately means
 * adding a cell is just placing a box, and the count can never disagree with
 * what is on the page.
 */
export function combCellCount(
  spec: CombSpec,
  mappings: { field_id: string }[],
): number {
  let highest = 0;
  for (const m of mappings) {
    const cell = parseCombCell(m.field_id);
    if (cell?.base === spec.base && cell.n > highest) highest = cell.n;
  }
  return highest || spec.count;
}

/**
 * Spread each comb's value one character per placed cell.
 *
 * Cells are filled in the order they sit on the page, not the order they were
 * created, so a cell dragged out of sequence still gets the letter that belongs
 * where it now is. The base key is deleted afterwards: leaving it would stamp
 * the whole word across the comb on top of the letters.
 */
export function spreadCombs(
  values: FieldValues,
  mappings: FieldMapping[],
  specs: CombSpec[],
): void {
  for (const spec of specs) {
    const raw = values[spec.base];
    delete values[spec.base];
    if (typeof raw !== "string") continue;

    const text = raw.trim().toUpperCase();

    const cells = mappings
      .filter(m => parseCombCell(m.field_id)?.base === spec.base)
      .sort((a, b) => (a.page - b.page) || (a.x - b.x));

    cells.forEach((cell, i) => {
      values[cell.field_id] = text[i] ?? "";
    });
  }
}
