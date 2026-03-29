UPDATE file_uploads 
SET status = 'queued', processing_error = NULL, processing_started_at = NULL, next_chunk_index = 0
WHERE id IN ('a4dfea3f-5d06-4be7-a8b6-8933a4b98514', '44fa5996-55da-409c-b45e-f66f391f58c8');