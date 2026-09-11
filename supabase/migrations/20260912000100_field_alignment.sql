-- ============================================================================
-- 0600 — per-field text alignment
--
-- A value stamped into a blank on a scanned form reads best centred: it sits in
-- the middle of the blank and grows evenly both ways. That is still the default.
--
-- But a field that carries prose — a duties line, an address, anything that
-- continues onto the line below — has to start hard against the left edge, or
-- the lines of one paragraph will not share a margin and stop reading as a
-- single run of text.
--
-- Until now that choice was hard-coded per form: the lines belonging to a
-- declared paragraph group were left-aligned and everything else centred. This
-- column lets a recruiter override it for any one box in PDF Mapper.
--
--   NULL      use the form's own rule (paragraph lines left, everything centred)
--   'left'    always start at the left edge of the box
--   'center'  always centre within the box
-- ============================================================================

ALTER TABLE pdf_field_mappings
  ADD COLUMN IF NOT EXISTS align TEXT;
