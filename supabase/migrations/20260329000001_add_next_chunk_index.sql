-- Add next_chunk_index to track partial chunked processing progress
ALTER TABLE public.file_uploads
  ADD COLUMN IF NOT EXISTS next_chunk_index integer DEFAULT 0;

-- Clean up duplicate extracted data records from previous buggy runs.
-- Keep only the most recently created record per (file_upload_id, chunk_index).
DELETE FROM public.file_extracted_data a
USING public.file_extracted_data b
WHERE a.created_at < b.created_at
  AND a.file_upload_id = b.file_upload_id
  AND a.chunk_index = b.chunk_index;
