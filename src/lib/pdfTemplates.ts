/**
 * pdfTemplates.ts — loading what a form export needs from Supabase.
 *
 * The field positions for every form share one table, `pdf_field_mappings`,
 * keyed on a globally unique field_id. The page images share one public bucket,
 * named per form: biodata-p1.png, id407-p1.png and so on.
 *
 * Both are cached for the session, because a recruiter exporting a run of
 * documents would otherwise refetch several hundred kilobytes of template image
 * per document. PDF Mapper clears the cache after saving, so a moved box shows
 * up on the next export without a page reload.
 */

import { supabase } from "./supabase";
import { DEFAULT_TEXT_SIZE, type FieldMapping } from "./pdfDraw";

export const TEMPLATE_BUCKET = "pdf-templates";

/** Reserved row carrying the global default text size — never a real field. */
export const SETTINGS_ROW_ID = "__settings__";

let _mappingsCache: FieldMapping[] | null = null;
let _defaultSize = DEFAULT_TEXT_SIZE;
const _imgCache = new Map<string, Uint8Array>();

/** Drop the cached mappings and template images so the next export refetches. */
export function resetPdfTemplateCache(): void {
  _mappingsCache = null;
  _defaultSize   = DEFAULT_TEXT_SIZE;
  _imgCache.clear();
}

/**
 * Every mapped field, plus the global default text size.
 *
 * The settings row is pulled out and dropped here: it is not a field and must
 * never be stamped onto a page.
 */
export async function fetchAllMappings(): Promise<{ rows: FieldMapping[]; defaultSize: number }> {
  if (_mappingsCache) return { rows: _mappingsCache, defaultSize: _defaultSize };

  const { data, error } = await supabase.from("pdf_field_mappings").select("*");
  if (error) throw new Error(`Could not load field mappings: ${error.message}`);
  if (!data?.length) throw new Error("No field mappings found. Set them up in PDF Mapper first.");

  const all      = data as FieldMapping[];
  const settings = all.find(r => r.field_id === SETTINGS_ROW_ID);
  _defaultSize   = settings?.font_size && settings.font_size > 0
    ? settings.font_size
    : DEFAULT_TEXT_SIZE;
  _mappingsCache = all.filter(r => r.field_id !== SETTINGS_ROW_ID);

  return { rows: _mappingsCache, defaultSize: _defaultSize };
}

/** Only the fields belonging to one form, so nothing bleeds between templates. */
export function mappingsForForm(rows: FieldMapping[], ids: Set<string>): FieldMapping[] {
  return rows.filter(m => ids.has(m.field_id));
}

/** One page image from the template bucket. */
export async function fetchTemplateImage(name: string, formLabel: string): Promise<Uint8Array> {
  const cached = _imgCache.get(name);
  if (cached) return cached;

  const { data } = supabase.storage.from(TEMPLATE_BUCKET).getPublicUrl(name);
  const res = await fetch(data.publicUrl);
  if (!res.ok) {
    throw new Error(
      `The ${formLabel} template page "${name}" is missing (${res.status}). ` +
      `Upload it in PDF Mapper → 📤 Upload PDF.`
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  _imgCache.set(name, bytes);
  return bytes;
}
