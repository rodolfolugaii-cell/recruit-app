/**
 * exportId988aPdf.ts — a filled ID 988A visa / extension-of-stay application.
 *
 * The same engine and the same rules as the ID 407 export, because it is printed
 * the same way:
 *
 *   values only   The agency feeds the real pre-printed ID 988A through the
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
 * exactly as they are for ID 407 — the two forms share one contract because the
 * field ids are namespaced apart.
 */

import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import {
  downloadPdf, drawImageField, flowParagraphs, safeFilename, stampFields,
  type FieldValues,
} from "./pdfDraw";
import { cropForForm, fetchAllMappings, fetchTemplateImage, mappingsForForm } from "./pdfTemplates";
import { formFieldIds, getForm, templateImageName } from "./pdfForms";
import { ID988A_IMAGE_FIELDS, buildId988aValues, type Id988aApplicant } from "./id988a";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";

const ID988A = getForm("id988a");

export interface Id988aExportOptions {
  /** Draw the scanned form behind the values — a proof copy, not for the printer. */
  includeTemplate?: boolean;
}

export async function exportId988aPdf(
  applicant: Id988aApplicant,
  employer: Employer | null,
  contract: Contract | null,
  opts: Id988aExportOptions = {},
): Promise<void> {
  const includeTemplate = opts.includeTemplate ?? false;

  const [{ rows, defaultSize, crops }, images] = await Promise.all([
    fetchAllMappings(),
    includeTemplate
      ? Promise.all(Array.from({ length: ID988A.pages }, (_, i) =>
          fetchTemplateImage(templateImageName(ID988A, i + 1), ID988A.label)))
      : Promise.resolve([] as Uint8Array[]),
  ]);

  const crop = cropForForm(crops, ID988A.id, ID988A.width, ID988A.height);

  const moved = contract?.field_positions ?? {};
  const mappings = mappingsForForm(rows, formFieldIds(ID988A))
    .map(m => (moved[m.field_id] ? { ...m, ...moved[m.field_id] } : m))
    .map(m => ({ ...m, x: m.x - crop.x, y: m.y - crop.y }));
  if (!mappings.length) {
    throw new Error(
      "No ID 988A field positions have been saved yet. Open PDF Mapper, switch " +
      "the form to “ID 988A Visa Form”, check the measured positions and Save All."
    );
  }

  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 0; i < ID988A.pages; i++) {
    const page = pdfDoc.addPage([crop.w, crop.h]);
    const bytes = images[i];
    if (bytes) {
      const img = await pdfDoc.embedPng(bytes);
      page.drawImage(img, {
        x: -crop.x,
        y: crop.y + crop.h - ID988A.height,
        width:  ID988A.width,
        height: ID988A.height,
      });
    }
    pages.push(page);
  }

  const values: FieldValues = buildId988aValues(applicant, employer, contract);
  const sizeOverrides = new Map<string, number>();
  const overrides = contract?.field_overrides ?? {};

  // Hand-editing any line of a paragraph takes the whole group out of the
  // auto-flow, for the same reason as ID 407: the wrap decides where line 2
  // begins, so it would either overwrite what was typed or leave a stale
  // remainder underneath it.
  const autoFlowed = ID988A.paragraphs.filter(ids => !ids.some(id => id in overrides));
  flowParagraphs(values, mappings, font, autoFlowed, defaultSize, sizeOverrides);
  for (const ids of ID988A.paragraphs) {
    if (autoFlowed.includes(ids)) continue;
    for (const id of ids) values[id] = overrides[id] ?? "";
  }
  for (const [id, text] of Object.entries(overrides)) values[id] = text;

  // The photograph fills its frame; a signature is scaled to fit, because the
  // pad crops to the ink and the proportions are part of the handwriting.
  await Promise.all(
    ID988A_IMAGE_FIELDS.flatMap(({ id, mode, source }) => {
      const url = contract ? source(applicant, contract) : source(applicant, {} as Contract);
      const m   = mappings.find(x => x.field_id === id);
      const page = m ? pages[m.page - 1] : undefined;
      if (!url || !m || !page) return [];
      return [drawImageField(pdfDoc, page, m, url, crop.h, mode)];
    })
  );

  stampFields({
    pages, mappings, values, font,
    pageHeight: crop.h, defaultSize, sizeOverrides,
    leftAlignFields: new Set(ID988A.paragraphs.flat()),
  });

  const who = [applicant.full_name, employer?.name].filter(Boolean).join(" - ");
  downloadPdf(
    await pdfDoc.save(),
    safeFilename(who, includeTemplate ? "ID 988A Proof" : "ID 988A Overlay"),
  );
}
