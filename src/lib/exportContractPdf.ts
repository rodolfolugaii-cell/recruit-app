/**
 * exportContractPdf.ts — a filled ID 407 employment contract.
 *
 * Same engine as the biodata export: the scanned form as a background image,
 * values stamped into boxes a recruiter positioned in PDF Mapper. What differs
 * is where the values come from — three records rather than one.
 *
 *   the helper      her name, place of origin and signature. Almost nothing
 *                   else on the apply form belongs on this contract.
 *   the employer    the residence, the household, the accommodation and the
 *                   facilities — Schedule items 2 and 3.
 *   the contract    the placement terms, both parties' signatures and the
 *                   witnesses.
 *
 * The export deliberately does not refuse an unsigned or half-filled contract.
 * A recruiter often needs the form on paper before it is complete — to check a
 * layout, or to have it signed in ink. id407Gaps() reports what is missing so
 * the dashboard can say so, rather than this quietly blocking the download.
 *
 * ── Values only, by default ─────────────────────────────────────────────────
 * The output carries no scan of the form. ID 407 is an official pre-printed
 * document, so the agency feeds the real one through the printer and only the
 * ink that belongs in the blanks may land on it — a background would print a
 * photocopy of the form on top of the form.
 *
 * The page keeps the template's exact dimensions even with nothing drawn behind
 * the values, because that is what makes the coordinates land in the right
 * blanks. It must be printed at actual size: any "fit to page" or "shrink to
 * printable area" rescales the page and moves every value off its line.
 *
 * `includeTemplate` puts the scan back for a proof copy, which is worth running
 * on plain paper and holding against the form before committing a real one.
 */

import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import {
  downloadPdf, drawImageField, flowParagraphs, safeFilename, stampFields,
  type FieldValues,
} from "./pdfDraw";
import { fetchAllMappings, fetchTemplateImage, mappingsForForm } from "./pdfTemplates";
import { formFieldIds, getForm, templateImageName } from "./pdfForms";
import { ID407_IMAGE_FIELDS, buildId407Values, type ContractApplicant } from "./id407";
import type { Contract } from "./contracts";
import type { Employer } from "./employers";

const ID407 = getForm("id407");

export interface ContractExportOptions {
  /**
   * Draw the scanned form behind the values.
   *
   * Off by default — see the note at the top of this file. Turning it on makes
   * a proof copy for checking alignment, and is the only mode that needs the
   * template images to exist at all.
   */
  includeTemplate?: boolean;
}

export async function exportContractPdf(
  applicant: ContractApplicant,
  employer: Employer | null,
  contract: Contract,
  opts: ContractExportOptions = {},
): Promise<void> {
  const includeTemplate = opts.includeTemplate ?? false;

  // 1. Positions, and the booklet sheets only if they are going to be drawn
  const [{ rows, defaultSize }, images] = await Promise.all([
    fetchAllMappings(),
    includeTemplate
      ? Promise.all(Array.from({ length: ID407.pages }, (_, i) =>
          fetchTemplateImage(templateImageName(ID407, i + 1), ID407.label)))
      : Promise.resolve([] as Uint8Array[]),
  ]);

  // Per-contract box moves win over the shared mapping. Applied here, before
  // anything measures or stamps, so the whole pipeline sees one set of boxes.
  const moved = contract.field_positions ?? {};
  const mappings = mappingsForForm(rows, formFieldIds(ID407))
    .map(m => (moved[m.field_id] ? { ...m, ...moved[m.field_id] } : m));
  if (!mappings.length) {
    throw new Error(
      "No ID 407 field positions have been set yet. Open PDF Mapper, switch the " +
      "form to “ID 407 Contract”, place the fields and save."
    );
  }

  // 2. A page per sheet, at the template's exact size whether or not the scan
  //    is drawn behind it. Built from the form's page count rather than from the
  //    images, so an overlay still has a page for every sheet — and a missing
  //    template can no longer silently drop the fields belonging to one.
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages: PDFPage[] = [];
  for (let i = 0; i < ID407.pages; i++) {
    const page = pdfDoc.addPage([ID407.width, ID407.height]);
    const bytes = images[i];
    if (bytes) {
      const img = await pdfDoc.embedPng(bytes);
      page.drawImage(img, { x: 0, y: 0, width: ID407.width, height: ID407.height });
    }
    pages.push(page);
  }

  // 3. Values, then flow the free text over the ruled lines it was given
  const values: FieldValues = buildId407Values(applicant, employer, contract);
  const sizeOverrides = new Map<string, number>();
  const overrides = contract.field_overrides ?? {};

  // Hand-editing any line of a paragraph takes the whole group out of the
  // auto-flow. Re-wrapping around a typed line is the one thing that cannot
  // work: the wrap decides where line 2 begins, so it would either overwrite
  // what was typed or leave a stale remainder underneath it. Owning all the
  // lines at once is the only behaviour that stays predictable.
  const autoFlowed = ID407.paragraphs.filter(ids => !ids.some(id => id in overrides));
  flowParagraphs(values, mappings, font, autoFlowed, defaultSize, sizeOverrides);
  for (const ids of ID407.paragraphs) {
    if (autoFlowed.includes(ids)) continue;
    for (const id of ids) values[id] = overrides[id] ?? "";
  }

  // Everything else: a correction simply replaces the computed value
  for (const [id, text] of Object.entries(overrides)) values[id] = text;

  // 4. Signatures — scaled to fit, never stretched, since the pad exports a
  //    transparent PNG cropped to the ink and its shape carries meaning.
  await Promise.all(
    ID407_IMAGE_FIELDS.flatMap(({ id, source }) => {
      const url = source(contract);
      const m   = mappings.find(x => x.field_id === id);
      const page = m ? pages[m.page - 1] : undefined;
      if (!url || !m || !page) return [];
      return [drawImageField(pdfDoc, page, m, url, ID407.height, "contain")];
    })
  );

  // 5. Stamp the rest and hand it over
  stampFields({
    pages, mappings, values, font,
    pageHeight: ID407.height, defaultSize, sizeOverrides,
    keepUnitFields: new Set(ID407.unitFields ?? []),
    leftAlignFields: new Set(ID407.paragraphs.flat()),
  });

  // Named apart so an overlay and a proof of the same contract never collide in
  // the downloads folder — and so nobody feeds a proof into the printer.
  const who = [applicant.full_name, employer?.name].filter(Boolean).join(" - ");
  downloadPdf(
    await pdfDoc.save(),
    safeFilename(who, includeTemplate ? "ID 407 Proof" : "ID 407 Overlay"),
  );
}
