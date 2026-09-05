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
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
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

export async function exportContractPdf(
  applicant: ContractApplicant,
  employer: Employer | null,
  contract: Contract,
): Promise<void> {
  // 1. Positions and both booklet sheets together
  const [{ rows, defaultSize }, ...images] = await Promise.all([
    fetchAllMappings(),
    ...Array.from({ length: ID407.pages }, (_, i) =>
      fetchTemplateImage(templateImageName(ID407, i + 1), ID407.label)),
  ]);

  const mappings = mappingsForForm(rows, formFieldIds(ID407));
  if (!mappings.length) {
    throw new Error(
      "No ID 407 field positions have been set yet. Open PDF Mapper, switch the " +
      "form to “ID 407 Contract”, place the fields and save."
    );
  }

  // 2. A page per sheet, the scan as its background
  const pdfDoc = await PDFDocument.create();
  const font   = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages  = await Promise.all(images.map(async (bytes) => {
    const img  = await pdfDoc.embedPng(bytes);
    const page = pdfDoc.addPage([ID407.width, ID407.height]);
    page.drawImage(img, { x: 0, y: 0, width: ID407.width, height: ID407.height });
    return page;
  }));

  // 3. Values, then flow the free text over the ruled lines it was given
  const values: FieldValues = buildId407Values(applicant, employer, contract);
  const sizeOverrides = new Map<string, number>();
  flowParagraphs(values, mappings, font, ID407.paragraphs, defaultSize, sizeOverrides);

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

  const who = [applicant.full_name, employer?.name].filter(Boolean).join(" - ");
  downloadPdf(await pdfDoc.save(), safeFilename(who, "ID 407 Contract"));
}
