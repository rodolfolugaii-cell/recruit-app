-- ============================================================================
-- 0200 — pdf_field_mappings
--
-- Where each biodata field is stamped on the printed form. One row per field,
-- positioned by dragging it onto the template in PDF Mapper.
--
-- Coordinates are in PDF points with a TOP-LEFT origin (the pdfplumber
-- convention); src/lib/exportBiodataPdf.ts flips y for pdf-lib at draw time.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pdf_field_mappings (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id   TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL,
  field_type TEXT    NOT NULL,          -- text | checkbox | date | image | signature
  page       INTEGER NOT NULL DEFAULT 1,
  x          FLOAT   NOT NULL DEFAULT 0,
  y          FLOAT   NOT NULL DEFAULT 0,
  w          FLOAT   NOT NULL DEFAULT 100,
  h          FLOAT   NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Per-field text size (added with the size stepper) ───────────────────────
-- NULL means "use the global default", which is itself stored in a reserved row
-- with field_id = '__settings__'. That row is skipped when generating a PDF.
ALTER TABLE pdf_field_mappings
  ADD COLUMN IF NOT EXISTS font_size FLOAT;

-- field_id is the upsert conflict target for "Save All"
CREATE UNIQUE INDEX IF NOT EXISTS pdf_field_mappings_field_id_idx
  ON pdf_field_mappings (field_id);
