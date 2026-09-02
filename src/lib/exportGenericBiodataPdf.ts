/**
 * exportGenericBiodataPdf.ts — an unbranded biodata, drawn rather than stamped.
 *
 * The agency biodata works by overlaying values onto a scan of the agency's own
 * printed form, which carries their name across the top. Until an agency is
 * registered that form cannot go out, so this one carries the same applicant
 * details on a plain layout with no agency name, logo or contact details
 * anywhere — only a reference number and the applicant's own particulars.
 *
 * Because the page is generated there is no template image and nothing to
 * position: every field is laid out by this file, flows onto as many pages as it
 * needs, and cannot drift out of a box. That is why PDF Mapper lists this form
 * as needing no setup rather than offering a canvas.
 *
 * Anything the applicant left blank is simply omitted — an empty row would read
 * as a gap in her record rather than a question she was never asked.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { downloadPdf, encodable, fitValue, safeFilename, wrapLines } from "./pdfDraw";
import { ageFrom, formDate } from "./formDates";
import { kidsOf } from "./kids";
import type { ApplicantForExport, WEEntry } from "./exportBiodataPdf";

/* ── Page metrics ─────────────────────────────────────────────────────────── */
const PAGE_W  = 595.276;   // A4 portrait
const PAGE_H  = 841.89;
const MARGIN  = 42;
const CONTENT = PAGE_W - MARGIN * 2;
const BOTTOM  = 58;        // room kept clear for the footer

const INK    = rgb(0.09, 0.11, 0.15);
const MUTED  = rgb(0.45, 0.49, 0.55);
const RULE   = rgb(0.80, 0.82, 0.85);
const BAND   = rgb(0.94, 0.95, 0.96);
const HAIR   = rgb(0.88, 0.90, 0.92);

const SIZE_TITLE   = 17;
const SIZE_NAME    = 15;
const SIZE_SECTION = 8.5;
const SIZE_LABEL   = 7.5;
const SIZE_BODY    = 9;

/**
 * A cursor over a growing document.
 *
 * Every draw helper moves `y` down and asks for room first, so a long work
 * history spills onto a second page instead of running off the first.
 */
class Sheet {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  /** Start a new page unless `h` points still fit above the footer. */
  need(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  text(s: string, x: number, size: number, opts: { bold?: boolean; color?: typeof INK } = {}) {
    const font = opts.bold ? this.bold : this.font;
    // The standard fonts are WinAnsi-only and throw on anything outside it, so
    // every string this file draws is filtered here rather than at each site.
    const safe = encodable(s, font);
    if (!safe) return;
    this.page.drawText(safe, { x, y: this.y, size, font, color: opts.color ?? INK });
  }

  /** Same protection for the few places that need an explicit y. */
  textAt(s: string, x: number, y: number, size: number, color = INK, bold = false) {
    const font = bold ? this.bold : this.font;
    const safe = encodable(s, font);
    if (!safe) return;
    this.page.drawText(safe, { x, y, size, font, color });
  }

  rule(y = this.y, color = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
      thickness: 0.6, color,
    });
  }
}

/* ── Building blocks ──────────────────────────────────────────────────────── */

function sectionTitle(s: Sheet, label: string) {
  s.need(34);
  s.y -= 16;
  s.page.drawRectangle({
    x: MARGIN, y: s.y - 4, width: CONTENT, height: 15,
    color: BAND,
  });
  s.y += 0.5;
  s.text(label.toUpperCase(), MARGIN + 6, SIZE_SECTION, { bold: true, color: MUTED });
  s.y -= 16;
}

/** One label-over-value cell. Returns the height it used. */
function cell(s: Sheet, x: number, w: number, label: string, value: string): number {
  s.text(label.toUpperCase(), x, SIZE_LABEL, { color: MUTED });
  const lines = wrapLines(value, s.font, SIZE_BODY, w);
  lines.forEach((line, i) => s.textAt(line, x, s.y - 11 - i * 11, SIZE_BODY));
  return 11 + Math.max(1, lines.length) * 11;
}

/**
 * A grid of label/value pairs, `cols` across. Pairs with no value are dropped
 * first, so the grid closes up rather than printing empty cells.
 */
function grid(s: Sheet, pairs: [string, string | undefined | null][], cols = 3) {
  const filled = pairs.filter(([, v]) => v != null && String(v).trim() !== "") as [string, string][];
  if (!filled.length) return;

  const gap = 14;
  const colW = (CONTENT - gap * (cols - 1)) / cols;

  for (let i = 0; i < filled.length; i += cols) {
    const row = filled.slice(i, i + cols);
    s.need(34);
    let tallest = 0;
    row.forEach(([label, value], c) => {
      const x = MARGIN + c * (colW + gap);
      tallest = Math.max(tallest, cell(s, x, colW, label, value));
    });
    s.y -= tallest + 7;
  }
}

/** Pill list — skills, cooking, preferences. */
function chips(s: Sheet, items: string[]) {
  if (!items.length) return;
  const size = 8;
  const padX = 6, h = 14, gapX = 5, gapY = 5;
  let x = MARGIN;

  s.need(h + 8);
  for (const raw of items) {
    const item = encodable(raw, s.font);
    if (!item) continue;
    const w = s.font.widthOfTextAtSize(item, size) + padX * 2;
    if (x + w > PAGE_W - MARGIN) {          // wrap the row
      x = MARGIN;
      s.y -= h + gapY;
      s.need(h + 8);
    }
    s.page.drawRectangle({
      x, y: s.y - 4, width: w, height: h,
      color: BAND, borderColor: HAIR, borderWidth: 0.5,
    });
    s.textAt(item, x + padX, s.y, size);
    x += w + gapX;
  }
  s.y -= h + 6;
}

/** A label with free text beneath it, wrapped across the full width. */
function paragraph(s: Sheet, label: string, value?: string | null) {
  const text = (value ?? "").trim();
  if (!text) return;
  const lines = wrapLines(text, s.font, SIZE_BODY, CONTENT);
  s.need(14 + lines.length * 11);
  s.text(label.toUpperCase(), MARGIN, SIZE_LABEL, { color: MUTED });
  s.y -= 11;
  lines.forEach(line => {
    s.text(line, MARGIN, SIZE_BODY);
    s.y -= 11;
  });
  s.y -= 5;
}

/* ── Work experience ──────────────────────────────────────────────────────── */

/** Why a contract ended, in the applicant's own words where she gave a reason. */
function contractOutcome(we: WEEntry): string {
  const status = (we.contractStatus ?? "").trim();
  const reason = (we.terminatedReason || we.breakReason || "").trim();
  if (!status && !reason) return "";
  if (!reason) return status;
  return status ? `${status} — ${reason}` : reason;
}

function workEntry(s: Sheet, we: WEEntry, index: number, label: string) {
  const period = [we.dateFrom, we.dateTo].filter(Boolean).join(" – ");
  const chores = we.householdChores ?? [];

  // Keep the heading with at least the first row of its detail
  s.need(70);
  s.y -= 4;
  s.page.drawRectangle({
    x: MARGIN, y: s.y - 3, width: CONTENT, height: 14, color: BAND,
  });
  s.text(`${index}. ${label}`, MARGIN + 6, 8.5, { bold: true, color: MUTED });
  if (period) {
    const w = s.font.widthOfTextAtSize(period, 8.5);
    s.text(period, PAGE_W - MARGIN - 6 - w, 8.5, { color: MUTED });
  }
  s.y -= 16;

  grid(s, [
    ["Years of employment", we.yearsOfEmployment],
    ["Location",            we.location],
    ["Flat / house size",   we.flatSize],
    ["Employer nationality", we.employerNationality],
    ["Family members",      we.familyMembers],
    ["Co-helpers",          we.coHelpers],
  ], 3);

  if (chores.length) {
    s.text("HOUSEHOLD CHORES", MARGIN, SIZE_LABEL, { color: MUTED });
    s.y -= 12;
    chips(s, chores);
  }
  paragraph(s, "Job duties", we.jobDuties);
  paragraph(s, "Contract outcome", contractOutcome(we));

  s.y -= 2;
  s.rule(s.y, HAIR);
}

/* ── Header ───────────────────────────────────────────────────────────────── */

async function drawHeader(s: Sheet, ap: ApplicantForExport) {
  const fd  = ap.form_data ?? {};
  const ref = (ap.id ?? "").substring(0, 8).toUpperCase();

  // Deliberately neutral: a reference and a date, and no agency anywhere.
  s.text("DOMESTIC HELPER BIODATA", MARGIN, SIZE_TITLE, { bold: true });
  const meta = [ref && `Ref ${ref}`, ap.created_at && formDate(ap.created_at)]
    .filter(Boolean).join("   ·   ");
  if (meta) {
    const w = s.font.widthOfTextAtSize(meta, 8);
    s.text(meta, PAGE_W - MARGIN - w, 8, { color: MUTED });
  }
  s.y -= 10;
  s.rule();
  s.y -= 22;

  // Photo on the left, headline particulars beside it
  const photoW = 92, photoH = 112;
  const top = s.y;

  s.page.drawRectangle({
    x: MARGIN, y: top - photoH + 10, width: photoW, height: photoH,
    borderColor: RULE, borderWidth: 0.6,
  });
  if (ap.photo_url) {
    try {
      const res = await fetch(ap.photo_url);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const ct    = res.headers.get("content-type") ?? "";
        const img   = ct.includes("png")
          ? await s.doc.embedPng(bytes)
          : await s.doc.embedJpg(bytes);
        s.page.drawImage(img, {
          x: MARGIN, y: top - photoH + 10, width: photoW, height: photoH,
        });
      }
    } catch {
      // No photo is a blank frame, never a failed export
    }
  }

  const x = MARGIN + photoW + 18;
  const w = CONTENT - photoW - 18;

  // A long name at 15pt overruns the column beside the photo, so it steps down
  // until it fits rather than printing over the edge of the page.
  const name = fitValue((ap.full_name ?? "").toUpperCase(), s.bold, SIZE_NAME, w);
  s.page.drawText(encodable(name.text, s.bold), {
    x, y: s.y, size: name.size, font: s.bold, color: INK,
  });
  s.y -= 15;

  const summary = [ap.nationality, ap.gender, fd.maritalStatus].filter(Boolean).join("  ·  ");
  if (summary) {
    const fitted = fitValue(summary, s.font, SIZE_BODY, w);
    s.text(fitted.text, x, fitted.size, { color: MUTED });
    s.y -= 15;
  }

  const age = ageFrom(ap.date_of_birth);
  const facts: [string, string | undefined][] = [
    ["Date of birth", formDate(ap.date_of_birth)],
    ["Age",           age && `${age} years`],
    ["Mobile",        ap.mobile ?? undefined],
    ["Currently in",  fd.currentLocation],
    ["Height",        fd.height ? `${fd.height} cm` : undefined],
    ["Weight",        fd.weight ? `${fd.weight} kg` : undefined],
  ];
  const colW = (w - 12) / 2;
  facts.filter(([, v]) => v).forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    s.textAt(label.toUpperCase(), x + col * (colW + 12), s.y - row * 24, SIZE_LABEL, MUTED);
    s.textAt(value!, x + col * (colW + 12), s.y - row * 24 - 11, SIZE_BODY);
  });
  const rows = Math.ceil(facts.filter(([, v]) => v).length / 2);
  s.y = Math.min(s.y - rows * 24, top - photoH + 4);
}

/* ── Declaration ──────────────────────────────────────────────────────────── */

async function drawDeclaration(s: Sheet, ap: ApplicantForExport) {
  s.need(96);
  sectionTitle(s, "Declaration");

  const words = "I certify that the particulars given above are true and correct "
              + "to the best of my knowledge.";
  wrapLines(words, s.font, SIZE_BODY, CONTENT).forEach(line => {
    s.text(line, MARGIN, SIZE_BODY);
    s.y -= 12;
  });

  s.y -= 26;
  const sigW = 170, sigH = 40;

  if (ap.signature_url) {
    try {
      const res = await fetch(ap.signature_url);
      if (res.ok) {
        const img = await s.doc.embedPng(new Uint8Array(await res.arrayBuffer()));
        // Scaled to fit, never stretched — the pad crops to the ink, so the
        // proportions are part of the handwriting.
        const scale = Math.min(sigW / img.width, sigH / img.height);
        s.page.drawImage(img, {
          x: MARGIN + (sigW - img.width * scale) / 2,
          y: s.y + 4,
          width:  img.width  * scale,
          height: img.height * scale,
        });
      }
    } catch {
      // Predates the signature pad, or the file has gone — leave the line blank
    }
  }

  s.page.drawLine({
    start: { x: MARGIN, y: s.y }, end: { x: MARGIN + sigW, y: s.y },
    thickness: 0.6, color: RULE,
  });
  s.page.drawLine({
    start: { x: MARGIN + sigW + 40, y: s.y }, end: { x: MARGIN + sigW + 40 + 130, y: s.y },
    thickness: 0.6, color: RULE,
  });
  s.y -= 11;
  s.text("APPLICANT'S SIGNATURE", MARGIN, SIZE_LABEL, { color: MUTED });
  s.text("DATE", MARGIN + sigW + 40, SIZE_LABEL, { color: MUTED });

  const signed = formDate(ap.signed_at);
  if (signed) {
    s.textAt(signed, MARGIN + sigW + 40, s.y + 15, SIZE_BODY);
  }
}

/* ── Footer ───────────────────────────────────────────────────────────────── */

function drawFooters(doc: PDFDocument, font: PDFFont, name: string) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawLine({
      start: { x: MARGIN, y: BOTTOM - 14 }, end: { x: PAGE_W - MARGIN, y: BOTTOM - 14 },
      thickness: 0.6, color: HAIR,
    });
    const who = encodable(name.toUpperCase(), font);
    if (who) page.drawText(who, { x: MARGIN, y: BOTTOM - 26, size: 7, font, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 7),
      y: BOTTOM - 26, size: 7, font, color: MUTED,
    });
  });
}

/* ── Export ───────────────────────────────────────────────────────────────── */

/**
 * Build the document and hand back its bytes.
 *
 * Split from the download so the layout can be rendered and inspected outside a
 * browser — everything below this point is pure pdf-lib and needs no DOM.
 */
export async function buildGenericBiodataPdf(ap: ApplicantForExport): Promise<Uint8Array> {
  const fd   = ap.form_data ?? {};
  const kids = kidsOf(fd);
  const doc  = await PDFDocument.create();
  const s    = new Sheet(
    doc,
    await doc.embedFont(StandardFonts.Helvetica),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );

  await drawHeader(s, ap);

  sectionTitle(s, "Personal particulars");
  grid(s, [
    ["Place of birth",   fd.placeOfBirth],
    ["Religion",         fd.religion],
    ["Marital status",   fd.maritalStatus],
    ["Contract status",  fd.contractStatus],
    ["Last working day", formDate(fd.lastWorkingDay)],
    ["Family members",   fd.familyMembersCount],
  ]);

  sectionTitle(s, "Children");
  grid(s, [
    ["Boy/s",       kids.boys],
    ["Boys' ages",  kids.boysAges],
    ["Girl/s",      kids.girls],
    ["Girls' ages", kids.girlsAges],
    ["Total",       kids.total],
  ]);

  sectionTitle(s, "Education & languages");
  grid(s, [
    ["Education",           fd.education],
    ["Course",              fd.educationCourse],
    ["Total years in HK",   fd.totalYearsHK],
    ["Number of employers", fd.numberOfEmployers],
    ["English",             fd.languages?.english],
    ["Cantonese",           fd.languages?.cantonese],
    ["Mandarin",            fd.languages?.mandarin],
  ]);

  const skills  = fd.skills ?? [];
  const cooking = fd.cookingAbilities ?? [];
  if (skills.length || cooking.length || fd.specialSkills) {
    sectionTitle(s, "Skills");
    if (skills.length) {
      s.text("SKILLS", MARGIN, SIZE_LABEL, { color: MUTED });
      s.y -= 12;
      chips(s, skills);
    }
    if (cooking.length) {
      s.text("COOKING", MARGIN, SIZE_LABEL, { color: MUTED });
      s.y -= 12;
      chips(s, cooking);
    }
    paragraph(s, "Other skills", fd.specialSkills);
  }

  const p = fd.preferences ?? {};
  const prefs = [
    p.sundayOff              && "Sunday off",
    p.flexibleDayOff         && "Flexible day off",
    p.willingWithOtherHelper && "Willing to work with another helper",
    p.willingStayIn          && "Willing to stay in",
  ].filter(Boolean) as string[];
  if (prefs.length) {
    sectionTitle(s, "Work preferences");
    chips(s, prefs);
  }

  const overseas = (fd.otherExperience ?? []).filter(e => e?.country);
  if (overseas.length) {
    sectionTitle(s, "Experience outside Hong Kong");
    overseas.forEach(e => {
      grid(s, [
        ["Country", e.country],
        ["Years",   e.yearsOfEmployment],
      ], 2);
      paragraph(s, "Job duties", e.jobDuties);
    });
  }

  const hk = fd.workExperience ?? [];
  if (hk.length) {
    sectionTitle(s, "Hong Kong work experience");
    hk.forEach((we, i) => {
      workEntry(s, we, i + 1, i === 0 ? "Current / most recent employer" : "Previous employer");
    });
  }

  await drawDeclaration(s, ap);
  drawFooters(doc, s.font, ap.full_name ?? "Applicant");

  return doc.save();
}

export async function exportGenericBiodataPdf(ap: ApplicantForExport): Promise<void> {
  // Distinct from the agency export, which also ends in "- Biodata.pdf"
  downloadPdf(
    await buildGenericBiodataPdf(ap),
    safeFilename(ap.full_name ?? "Applicant", "Biodata (General)"),
  );
}
