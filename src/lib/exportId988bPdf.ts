/**
 * exportId988bPdf.ts — a filled ID 988B application for employment of a helper.
 *
 * The same engine and the same rules as the ID 407 export, because it is printed
 * the same way:
 *
 *   values only   The agency feeds the real pre-printed ID 988B through the
 *                 printer, so only the ink that belongs in the blanks may land
 *                 on it. `includeTemplate` puts the scan back for a proof copy.
 *
 *   the crop      The exported page is the window PDF Mapper stored, not the
 *                 whole scan, and boxes are translated by the crop origin here.
 *
 *   actual size   The page keeps the template's dimensions exactly. Any "fit to
 *                 page" rescales it and moves every value off its line.
 *
 * Per-contract box moves and typed corrections are read off the contract row,
 * exactly as they are for ID 407 — every form shares one contract because the
 * field ids are namespaced apart.
 *
 * This is the EMPLOYER's form, so the signature drawn on every page is theirs
 * rather than the helper's.
 */

import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import {
  downloadPdf, drawImageField, flowParagraphs, safeFilename, stampFields,
  type FieldValues,
} from "./pdfDraw";
import { cropForForm, fetchAllMappings, fetchTemplateImage } from "./pdfTemplates";
import { getForm, mappingsForFormDef, templateImageName } from "./pdfForms";
import { ID988B_IMAGE_FIELDS, buildId988bValues } from "./id988b";
import type { Id988aApplicant } from "./id988a";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";

const ID988B = getForm("id988b");

export interface Id988bExportOptions {
  /** Draw the scanned form behind the values — a proof copy, not for the printer. */
  includeTemplate?: boolean;
}

export async function exportId988bPdf(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
  opts: Id988bExportOptions = {},
): Promise<void> {
  const includeTemplate = opts.includeTemplate ?? false;

  const [{ rows, defaultSize, crops }, images] = await Promise.all([
    fetchAllMappings(),
    includeTemplate
      ? Promise.all(Array.from({ length: ID988B.pages }, (_, i) =>
          fetchTemplateImage(templateImageName(ID988B, i + 1), ID988B.label)))
      : Promise.resolve([] as Uint8Array[]),
  ]);

  const crop = cropForForm(crops, ID988B.id, ID988B.width, ID988B.height);

  const moved = contract?.field_positions ?? {};
  const mappings = mappingsForFormDef(rows, ID988B)
    .map(m => (moved[m.field_id] ? { ...m, ...moved[m.field_id] } : m))
    .map(m => ({ ...m, x: m.x - crop.x, y: m.y - crop.y }));
  if (!mappings.length) {
    throw new Error(
      "No ID 988B field positions have been saved yet. Open PDF Mapper, switch " +
      "the form to “ID 988B Visa Form”, check the measured positions and Save All."
    );
  }

  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 0; i < ID988B.pages; i++) {
    const page = pdfDoc.addPage([crop.w, crop.h]);
    const bytes = images[i];
    if (bytes) {
      const img = await pdfDoc.embedPng(bytes);
      page.drawImage(img, {
        x: -crop.x,
        y: crop.y + crop.h - ID988B.height,
        width:  ID988B.width,
        height: ID988B.height,
      });
    }
    pages.push(page);
  }

  const values: FieldValues = buildId988bValues(applicant, employer, contract);
  const sizeOverrides = new Map<string, number>();
  const overrides = contract?.field_overrides ?? {};

  // Hand-editing any line of a paragraph takes the whole group out of the
  // auto-flow, for the same reason as ID 407: the wrap decides where line 2
  // begins, so it would either overwrite what was typed or leave a stale
  // remainder underneath it.
  const autoFlowed = ID988B.paragraphs.filter(ids => !ids.some(id => id in overrides));
  flowParagraphs(values, mappings, font, autoFlowed, defaultSize, sizeOverrides);
  for (const ids of ID988B.paragraphs) {
    if (autoFlowed.includes(ids)) continue;
    for (const id of ids) values[id] = overrides[id] ?? "";
  }
  for (const [id, text] of Object.entries(overrides)) values[id] = text;

  // The employer signs every page; scaled to fit, because the pad crops to the
  // ink and the proportions are part of the handwriting.
  await Promise.all(
    ID988B_IMAGE_FIELDS.flatMap(({ id, mode, source }) => {
      const url = source(contract);
      const m   = mappings.find(x => x.field_id === id);
      const page = m ? pages[m.page - 1] : undefined;
      if (!url || !m || !page) return [];
      return [drawImageField(pdfDoc, page, m, url, crop.h, mode)];
    })
  );

  stampFields({
    pages, mappings, values, font,
    pageHeight: crop.h, defaultSize, sizeOverrides,
    leftAlignFields: new Set(ID988B.paragraphs.flat()),
  });

  const who = [applicant.full_name, employer?.name].filter(Boolean).join(" - ");
  downloadPdf(
    await pdfDoc.save(),
    safeFilename(who, includeTemplate ? "ID 988B Proof" : "ID 988B Overlay"),
  );
}
