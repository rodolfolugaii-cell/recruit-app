/**
 * exportGenericBiodataPdf.ts — an unbranded biodata, drawn rather than stamped.
 *
 * The agency biodata works by overlaying values onto a scan of the agency's own
 * printed form, which carries their name across the top. Until an agency is
 * registered that form cannot go out, so this one carries the same applicant
 * details on a plain sheet with no agency name, logo or contact details
 * anywhere — only a reference number and the applicant's own particulars.
 *
 * ── The look ────────────────────────────────────────────────────────────────
 * Deliberately the plain BIO-DATA sheet used across the Philippines rather than
 * anything styled: a serif face, an I.D photo box in the top corner, section
 * headings as solid black bars, and every answer written on a ruled line after
 * "Label :". Employers expect to read it at a glance and recruiters expect to
 * be able to write on it, so there are no cards, chips or tinted panels.
 *
 * Because the page is generated there is no template image and nothing to
 * position: it flows onto as many pages as the record needs and cannot drift
 * out of a box. That is why PDF Mapper lists this form as needing no setup.
 *
 * Anything the applicant left blank prints as an empty ruled line, exactly as a
 * paper form would — the line is part of the form, not a gap in her record.
 */

import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  downloadPdf, drawImageCover, encodable, fitValue, safeFilename, wrapLines,
} from "./pdfDraw";
import { ageFrom, formDate } from "./formDates";
import { kidsOf } from "./kids";
import type { ApplicantForExport, WEEntry } from "./exportBiodataPdf";

/* ── Page metrics ─────────────────────────────────────────────────────────── */
const PAGE_W  = 595.276;   // A4 portrait
const PAGE_H  = 841.89;
const MARGIN  = 38;
const CONTENT = PAGE_W - MARGIN * 2;
const BOTTOM  = 44;        // room kept clear for the footer

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);
const LINE  = rgb(0.35, 0.35, 0.35);   // the ruled lines answers sit on
const EDGE  = rgb(0.1, 0.1, 0.1);      // section box borders

const SIZE_TITLE = 19;
const SIZE_BAR   = 9;      // white text in a black section bar
const SIZE_BODY   = 9;     // labels and answers
const SIZE_SMALL  = 7.5;

const PAD       = 9;       // inner padding of a section box
const ROW_H     = 14.5;    // one ruled line to the next, as tight as the printed sheet
const LABEL_COL = 104;     // where the colon sits, measured from the cell's left
const RULE_DROP = 3.2;     // how far the rule sits below the text baseline

/**
 * A cursor over a growing document.
 *
 * Section boxes are drawn as a border around whatever rows went inside them, so
 * the box height is not known until it closes. `boxTop` remembers where the
 * current one began; a page break closes it at the page edge and opens a fresh
 * one at the top of the next page, the way a continued form would look.
 */
class Sheet {
  page!: PDFPage;
  y = 0;
  private boxTop: number | null = null;

  constructor(
    readonly doc: PDFDocument,
    readonly serif: PDFFont,
    readonly serifBold: PDFFont,
    readonly sans: PDFFont,
  ) {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  newPage() {
    const wasOpen = this.boxTop !== null;
    if (wasOpen) this.closeBox();
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
    if (wasOpen) this.openBox();
  }

  /** Start a new page unless `h` points still fit above the footer. */
  need(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  openBox() {
    this.boxTop = this.y + 4;
  }

  closeBox() {
    if (this.boxTop === null) return;
    const top = this.boxTop;
    this.boxTop = null;
    const height = top - (this.y - 2);
    if (height <= 0) return;
    this.page.drawRectangle({
      x: MARGIN, y: this.y - 2, width: CONTENT, height,
      borderColor: EDGE, borderWidth: 0.7,
    });
  }

  /** Draw text at an explicit position, dropping anything the font cannot draw. */
  at(s: string, x: number, y: number, size: number, font = this.serif, color = BLACK) {
    const safe = encodable(s, font);
    if (!safe) return;
    this.page.drawText(safe, { x, y, size, font, color });
  }

  rule(x: number, y: number, w: number) {
    if (w <= 0) return;
    this.page.drawLine({
      start: { x, y }, end: { x: x + w, y },
      thickness: 0.6, color: LINE,
    });
  }
}

/* ── Building blocks ──────────────────────────────────────────────────────── */

/** The title, letter-spaced by hand since pdf-lib has no tracking control. */
function trackedCentre(s: Sheet, text: string, size: number, tracking: number) {
  const chars = Array.from(text);
  const width = chars.reduce(
    (sum, c) => sum + s.serifBold.widthOfTextAtSize(c, size) + tracking, 0) - tracking;
  let x = (PAGE_W - width) / 2;
  for (const c of chars) {
    s.at(c, x, s.y, size, s.serifBold);
    x += s.serifBold.widthOfTextAtSize(c, size) + tracking;
  }
}

/** A solid black section heading, as the printed form has. */
function bar(s: Sheet, label: string) {
  s.closeBox();
  s.need(48);
  s.y -= 16;
  s.page.drawRectangle({
    x: MARGIN, y: s.y - 4, width: CONTENT, height: 15, color: BLACK,
  });
  s.at(label.toUpperCase(), MARGIN + 7, s.y, SIZE_BAR, s.sans, WHITE);
  s.y -= 11;
  s.openBox();
  s.y -= 9;
}

const innerLeft  = MARGIN + PAD;
const innerWidth = CONTENT - PAD * 2;

/** One "Label : ______" cell on a ruled line. */
function drawCell(s: Sheet, x: number, w: number, label: string, value: string, labelCol: number) {
  const lab = fitValue(label, s.serif, SIZE_BODY, labelCol - 6);
  s.at(lab.text, x, s.y, lab.size);
  s.at(":", x + labelCol, s.y, SIZE_BODY);

  const ruleX = x + labelCol + 7;
  const ruleW = w - labelCol - 7;
  s.rule(ruleX, s.y - RULE_DROP, ruleW);

  if (value) {
    const fitted = fitValue(value, s.serif, SIZE_BODY, ruleW - 4);
    s.at(fitted.text, ruleX + 2, s.y, fitted.size);
  }
}

/**
 * A row of one or two labelled lines. Empty values still print their rule,
 * because on a paper form the blank line is part of the form.
 */
function row(
  s: Sheet,
  cells: [string, string | null | undefined][],
  labelCol = LABEL_COL,
) {
  if (!cells.length) return;
  s.need(ROW_H + 6);
  const gap  = 14;
  const cols = cells.length;
  const colW = (innerWidth - gap * (cols - 1)) / cols;
  cells.forEach(([label, value], i) => {
    drawCell(s, innerLeft + i * (colW + gap), colW, label, (value ?? "").trim(),
             cols > 1 ? Math.min(labelCol, colW - 60) : labelCol);
  });
  s.y -= ROW_H;
}

/**
 * A long answer written across as many ruled lines as it needs — the first
 * beside the label, the rest running the full width beneath it.
 */
function wrapped(s: Sheet, label: string, value?: string | null, labelCol = LABEL_COL) {
  const text = (value ?? "").trim();
  s.need(ROW_H + 6);

  const firstW = innerWidth - labelCol - 7;
  if (!text) {
    drawCell(s, innerLeft, innerWidth, label, "", labelCol);
    s.y -= ROW_H;
    return;
  }

  // Fill the short first line, then continue on full-width lines below
  const all   = wrapLines(text, s.serif, SIZE_BODY, firstW - 4);
  const first = all[0] ?? "";
  const rest  = text.slice(first.length).trim();

  drawCell(s, innerLeft, innerWidth, label, first, labelCol);
  s.y -= ROW_H;

  if (rest) {
    for (const line of wrapLines(rest, s.serif, SIZE_BODY, innerWidth - 4)) {
      s.need(ROW_H + 6);
      s.rule(innerLeft, s.y - RULE_DROP, innerWidth);
      s.at(line, innerLeft + 2, s.y, SIZE_BODY);
      s.y -= ROW_H;
    }
  }
}

/** A plain sub-heading inside a section, for one employment record. */
function subHead(s: Sheet, text: string) {
  s.need(ROW_H + 14);
  s.y -= 3;
  s.at(text.toUpperCase(), innerLeft, s.y, SIZE_SMALL, s.serifBold);
  s.y -= 12;
}

/* ── Header ───────────────────────────────────────────────────────────────── */

async function drawHeader(s: Sheet, ap: ApplicantForExport) {
  const boxW = 118, boxH = 96;
  const boxX = PAGE_W - MARGIN - boxW;
  const boxY = s.y - boxH + 12;

  // Title sits on the same band as the I.D photo box, as on the printed sheet
  s.y -= 26;
  trackedCentre(s, "BIO-DATA", SIZE_TITLE, 1.6);

  s.page.drawRectangle({
    x: boxX, y: boxY, width: boxW, height: boxH,
    borderColor: EDGE, borderWidth: 0.7,
  });

  let drewPhoto = false;
  if (ap.photo_url) {
    try {
      const res = await fetch(ap.photo_url);
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer());
        const ct    = res.headers.get("content-type") ?? "";
        const img   = ct.includes("png")
          ? await s.doc.embedPng(bytes)
          : await s.doc.embedJpg(bytes);
        // Inset by the border so the frame stays visible around the photo.
        // Cover, not stretch: a portrait photo forced to this landscape box
        // would come out visibly squashed.
        drawImageCover(s.page, img, boxX + 1.5, boxY + 1.5, boxW - 3, boxH - 3);
        drewPhoto = true;
      }
    } catch {
      // No photo is an empty frame, never a failed export
    }
  }
  if (!drewPhoto) {
    ["I.D", "PHOTO"].forEach((word, i) => {
      const w = s.serif.widthOfTextAtSize(word, SIZE_BODY);
      s.at(word, boxX + (boxW - w) / 2, boxY + boxH / 2 + 8 - i * 16, SIZE_BODY);
    });
  }

  // Clear the photo box before the first section bar
  s.y = Math.min(s.y - 14, boxY - 8);
}

/* ── Employment ───────────────────────────────────────────────────────────── */

/** Why a contract ended, in the applicant's own words where she gave a reason. */
function contractOutcome(we: WEEntry): string {
  const status = (we.contractStatus ?? "").trim();
  const reason = (we.terminatedReason || we.breakReason || "").trim();
  if (!status && !reason) return "";
  if (!reason) return status;
  return status ? `${status} — ${reason}` : reason;
}

function employmentEntry(s: Sheet, we: WEEntry, index: number) {
  subHead(s, `Employer ${index}`);
  row(s, [["Location", we.location]]);
  row(s, [["From", we.dateFrom], ["To", we.dateTo]]);
  row(s, [["Years of Service", we.yearsOfEmployment], ["Flat / House Size", we.flatSize]]);
  row(s, [["Employer Nationality", we.employerNationality], ["Family Members", we.familyMembers]]);
  row(s, [["No. of Co-helpers", we.coHelpers]]);
  wrapped(s, "Household Chores", (we.householdChores ?? []).join(", "));
  wrapped(s, "Job Duties", we.jobDuties);
  wrapped(s, "Reason for Leaving", contractOutcome(we));
  s.y -= 4;
}

/* ── Certification ────────────────────────────────────────────────────────── */

async function drawCertification(s: Sheet, ap: ApplicantForExport) {
  s.closeBox();
  s.need(140);
  s.y -= 22;

  const leftW  = 232;
  const rightX = MARGIN + leftW + 20;
  const rightW = CONTENT - leftW - 20;
  const top    = s.y;

  // Left: the few reference details this record actually holds. Inventing
  // SSS / TIN / NBI boxes we never collect would only look complete.
  const refs: [string, string][] = [
    ["Ref. No.",     (ap.id ?? "").substring(0, 8).toUpperCase()],
    ["Date Applied", formDate(ap.created_at)],
    ["Nationality",  ap.nationality ?? ""],
    ["Date Signed",  formDate(ap.signed_at)],
  ];
  let ry = top - 12;
  refs.forEach(([label, value]) => {
    s.at(label, MARGIN + 8, ry, SIZE_BODY);
    s.at(":", MARGIN + 92, ry, SIZE_BODY);
    const rx = MARGIN + 99;
    const rw = leftW - 99 - 8;
    s.rule(rx, ry - RULE_DROP, rw);
    if (value) {
      const fitted = fitValue(value, s.serif, SIZE_BODY, rw - 4);
      s.at(fitted.text, rx + 2, ry, fitted.size);
    }
    ry -= ROW_H;
  });
  s.page.drawRectangle({
    x: MARGIN, y: ry + ROW_H - 8, width: leftW, height: top - (ry + ROW_H - 8),
    borderColor: EDGE, borderWidth: 0.7,
  });

  // Right: the certification, then the signature line
  const words = "I hereby certify that the above information is true and correct to the "
              + "best of my knowledge and belief. I also understand that any "
              + "misrepresentation will be considered sufficient reason for withdrawal "
              + "of an offer or subsequent dismissal if employed.";
  let cy = top - 10;
  for (const line of wrapLines(words, s.serif, SIZE_SMALL, rightW)) {
    s.at(line, rightX, cy, SIZE_SMALL);
    cy -= 10;
  }

  const sigY = Math.min(cy - 34, ry + ROW_H - 22);
  if (ap.signature_url) {
    try {
      const res = await fetch(ap.signature_url);
      if (res.ok) {
        const img = await s.doc.embedPng(new Uint8Array(await res.arrayBuffer()));
        // Scaled to fit, never stretched — the pad crops to the ink, so the
        // proportions are part of the handwriting.
        const scale = Math.min((rightW - 20) / img.width, 34 / img.height);
        s.page.drawImage(img, {
          x: rightX + (rightW - img.width * scale) / 2,
          y: sigY + 4,
          width:  img.width  * scale,
          height: img.height * scale,
        });
      }
    } catch {
      // Predates the signature pad, or the file has gone — leave the line blank
    }
  }
  s.rule(rightX, sigY, rightW);
  const caption = "Applicant's Signature";
  const cw = s.serif.widthOfTextAtSize(caption, SIZE_SMALL);
  s.at(caption, rightX + (rightW - cw) / 2, sigY - 11, SIZE_SMALL);

  s.y = Math.min(sigY - 20, ry);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */

function drawFooters(doc: PDFDocument, font: PDFFont, name: string) {
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const who = encodable(name.toUpperCase(), font);
    if (who) page.drawText(who, { x: MARGIN, y: 26, size: 7, font, color: LINE });
    const label = `Page ${i + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 7),
      y: 26, size: 7, font, color: LINE,
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
    await doc.embedFont(StandardFonts.TimesRoman),
    await doc.embedFont(StandardFonts.TimesRomanBold),
    await doc.embedFont(StandardFonts.HelveticaBold),
  );

  await drawHeader(s, ap);

  /* ── Personal data ── */
  bar(s, "Personal Data:");
  row(s, [["Name", ap.full_name]]);
  row(s, [["Date of Birth", formDate(ap.date_of_birth)], ["Age", ageFrom(ap.date_of_birth)]]);
  row(s, [["Place of Birth", fd.placeOfBirth], ["Sex", ap.gender]]);
  row(s, [["Citizenship", ap.nationality], ["Civil Status", fd.maritalStatus]]);
  row(s, [["Height", fd.height ? `${fd.height} cm` : ""], ["Weight", fd.weight ? `${fd.weight} kg` : ""]]);
  row(s, [["Religion", fd.religion], ["Cell Phone", ap.mobile]]);
  row(s, [["Present Location", fd.currentLocation], ["Family Members", fd.familyMembersCount]]);
  row(s, [["No. of Children", kids.total], ["Boy/s", kids.boys]]);
  row(s, [["Boys' Ages", kids.boysAges], ["Girl/s", kids.girls]]);
  row(s, [["Girls' Ages", kids.girlsAges], ["Contract Status", fd.contractStatus]]);
  row(s, [["Last Working Day", formDate(fd.lastWorkingDay)]]);

  /* ── Education ── */
  bar(s, "Educational Attainment:");
  row(s, [["Attainment", fd.education]]);
  row(s, [["Course / Degree", fd.educationCourse]]);
  row(s, [["Total Years in HK", fd.totalYearsHK], ["No. of Employers", fd.numberOfEmployers]]);

  /* ── Languages ── */
  bar(s, "Language / Dialect Spoken:");
  row(s, [["English", fd.languages?.english], ["Cantonese", fd.languages?.cantonese]]);
  row(s, [["Mandarin", fd.languages?.mandarin]]);

  /* ── Skills ── */
  bar(s, "Skills:");
  wrapped(s, "Skills", (fd.skills ?? []).join(", "));
  wrapped(s, "Cooking", (fd.cookingAbilities ?? []).join(", "));
  wrapped(s, "Special Skills", fd.specialSkills);

  /* ── Preferences ── */
  const p = fd.preferences ?? {};
  bar(s, "Work Preferences:");
  row(s, [["Sunday Off", p.sundayOff ? "Yes" : "No"],
          ["Flexible Day Off", p.flexibleDayOff ? "Yes" : "No"]]);
  row(s, [["Willing to Stay In", p.willingStayIn ? "Yes" : "No"],
          ["With Other Helper", p.willingWithOtherHelper ? "Yes" : "No"]]);

  /* ── Employment ── */
  const overseas = (fd.otherExperience ?? []).filter(e => e?.country);
  const hk       = fd.workExperience ?? [];

  bar(s, "Employment Records:");
  if (!hk.length && !overseas.length) {
    row(s, [["Employer", ""]]);
    row(s, [["From", ""], ["To", ""]]);
  }
  hk.forEach((we, i) => employmentEntry(s, we, i + 1));

  if (overseas.length) {
    subHead(s, "Outside Hong Kong");
    overseas.forEach(e => {
      row(s, [["Country", e.country], ["Years", e.yearsOfEmployment]]);
      wrapped(s, "Job Duties", e.jobDuties);
    });
  }

  await drawCertification(s, ap);
  s.closeBox();
  drawFooters(doc, s.sans, ap.full_name ?? "Applicant");

  return doc.save();
}

export async function exportGenericBiodataPdf(ap: ApplicantForExport): Promise<void> {
  // Distinct from the agency export, which also ends in "- Biodata.pdf"
  downloadPdf(
    await buildGenericBiodataPdf(ap),
    safeFilename(ap.full_name ?? "Applicant", "Biodata (General)"),
  );
}
