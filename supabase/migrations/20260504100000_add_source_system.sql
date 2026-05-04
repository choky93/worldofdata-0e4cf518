-- Add source_system column to file_uploads for Wave A of segmentation feature.
-- Captured at upload via mandatory dropdown; used as hint for parser routing
-- (Wave B) and AI prompt specialization. Optional column to preserve back-compat
-- with existing files (NULL = legacy upload, AI-only flow).
ALTER TABLE public.file_uploads
ADD COLUMN IF NOT EXISTS source_system text;

COMMENT ON COLUMN public.file_uploads.source_system IS
  'Origin system declared by user at upload (e.g. meta_ads, tango, mercado_pago). NULL for legacy uploads.';

CREATE INDEX IF NOT EXISTS idx_file_uploads_source_system ON public.file_uploads(source_system) WHERE source_system IS NOT NULL;
