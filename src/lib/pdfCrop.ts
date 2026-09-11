/**
 * pdfCrop.ts — trimming the white margin off a scanned template.
 *
 * A scan of a paper form usually carries a band of white around the form
 * itself. That band is harmless on screen but not when printing: the overlay
 * page has to be the size of the real form, or the values land off their lines.
 *
 * ── Coordinates do not move ─────────────────────────────────────────────────
 * The crop is stored in the ORIGINAL page space, the same space field positions
 * live in, and it never rewrites them. That is the whole point: adjusting the
 * crop later shifts the form content and every box by the same amount, so a
 * mapping stays correct instead of needing to be placed again.
 *
 * Two consequences follow, and they are what the rest of the code relies on:
 *
 *   on screen   the page is rendered at full size inside a clipping window, so
 *               click and drag maths keep working in original page space and
 *               only the visible region changes.
 *
 *   on export   the page really is the cropped size, and every box is
 *               translated by the crop origin on the way out.
 *
 * ── Storage ─────────────────────────────────────────────────────────────────
 * One reserved row per form in `pdf_field_mappings`, reusing its x/y/w/h
 * columns — no migration, and it travels with the mapping it belongs to. The
 * row is filtered out everywhere a real field is expected.
 */

/** A window onto the original page, in points, top-left origin. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the recruiter actually types: how much to shave off each edge. */
export interface CropMargins {
  top:    number;
  right:  number;
  bottom: number;
  left:   number;
}

/** Reserved row id holding one form's crop. */
export function cropRowId(formId: string): string {
  return `__crop_${formId}__`;
}

/** Reserved rows carry settings, not fields, and must never be stamped. */
export function isCropRow(fieldId: string): boolean {
  return fieldId.startsWith("__crop_") && fieldId.endsWith("__");
}

/** The whole page — what every form starts with. */
export function fullPageCrop(width: number, height: number): Crop {
  return { x: 0, y: 0, w: width, h: height };
}

export function isFullPage(crop: Crop, width: number, height: number): boolean {
  return crop.x === 0 && crop.y === 0
      && Math.abs(crop.w - width)  < 0.05
      && Math.abs(crop.h - height) < 0.05;
}

export function cropToMargins(crop: Crop, width: number, height: number): CropMargins {
  return {
    top:    round1(crop.y),
    right:  round1(width  - crop.x - crop.w),
    bottom: round1(height - crop.y - crop.h),
    left:   round1(crop.x),
  };
}

/**
 * Margins back to a window, kept inside the page and never collapsed.
 *
 * A crop with no area would divide by zero in every percentage the viewers
 * compute, so opposing margins are capped to leave a usable strip rather than
 * trusted to be sensible.
 */
export function marginsToCrop(m: CropMargins, width: number, height: number): Crop {
  const left   = clamp(m.left,   0, width  - MIN_CROP);
  const top    = clamp(m.top,    0, height - MIN_CROP);
  const right  = clamp(m.right,  0, width  - MIN_CROP - left);
  const bottom = clamp(m.bottom, 0, height - MIN_CROP - top);
  return {
    x: round1(left),
    y: round1(top),
    w: round1(width  - left - right),
    h: round1(height - top  - bottom),
  };
}

/**
 * A crop read back off its stored row, guarded against nonsense.
 *
 * A zero-size or off-page row would take the viewers down, so anything that
 * does not describe a usable window falls back to the whole page.
 */
export function normaliseCrop(
  raw: Partial<Crop> | null | undefined,
  width: number,
  height: number,
): Crop {
  const full = fullPageCrop(width, height);
  if (!raw) return full;

  const x = Number(raw.x), y = Number(raw.y);
  const w = Number(raw.w), h = Number(raw.h);
  if (![x, y, w, h].every(Number.isFinite)) return full;
  if (w < 1 || h < 1) return full;
  if (x < 0 || y < 0 || x + w > width + 1 || y + h > height + 1) return full;

  return { x: round1(x), y: round1(y), w: round1(w), h: round1(h) };
}

/**
 * How to render the full page inside a window showing only the crop.
 *
 * The returned percentages size and offset a full-page layer within a clipping
 * box, so everything already positioned as a percentage of the full page keeps
 * working untouched.
 */
export function cropViewStyle(crop: Crop, width: number, height: number) {
  return {
    /** Aspect of the visible window, for the container. */
    aspect: `${crop.w} / ${crop.h}`,
    /** Full-page layer, as a percentage of the window. */
    layer: {
      width:  `${(width  / crop.w) * 100}%`,
      height: `${(height / crop.h) * 100}%`,
      left:   `${(-crop.x / crop.w) * 100}%`,
      top:    `${(-crop.y / crop.h) * 100}%`,
    },
  };
}

/** The grab points on the crop box, plus the body that moves the whole thing. */
export type CropHandle = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

/** Narrower than this is a mistake, not a crop. Shared with marginsToCrop. */
export const MIN_CROP = 40;

/**
 * The crop after dragging one handle by (dx, dy).
 *
 * Pure, because getting this wrong is easy and invisible: an edge must move
 * without dragging its opposite edge along, must not invert when pulled past
 * it, and must not leave the page. Doing the arithmetic here rather than inside
 * a mousemove handler means all of that can actually be checked.
 */
export function dragCrop(
  start: Crop,
  handle: CropHandle,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Crop {
  const { x, y, w, h } = start;

  if (handle === "move") {
    return {
      x: round1(clamp(x + dx, 0, width - w)),
      y: round1(clamp(y + dy, 0, height - h)),
      w: round1(w), h: round1(h),
    };
  }

  let left = x, top = y, right = x + w, bottom = y + h;

  // Each edge is clamped against the page and against its opposite, so the box
  // can be squashed down to MIN_CROP but never turned inside out.
  if (handle.includes("w")) left   = clamp(x + dx,     0, right - MIN_CROP);
  if (handle.includes("e")) right  = clamp(x + w + dx, left + MIN_CROP, width);
  if (handle.includes("n")) top    = clamp(y + dy,     0, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = clamp(y + h + dy, top + MIN_CROP, height);

  return {
    x: round1(left),
    y: round1(top),
    w: round1(right - left),
    h: round1(bottom - top),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(Math.max(n, lo), Math.max(lo, hi));
}

function round1(n: number): number {
  return parseFloat(n.toFixed(1));
}
