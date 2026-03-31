UPDATE file_extracted_data AS fed
SET data_category = batch0.data_category
FROM (
  SELECT file_upload_id, data_category
  FROM file_extracted_data
  WHERE chunk_index = 0
    AND data_category NOT IN ('otro', '_classification')
) AS batch0
WHERE fed.file_upload_id = batch0.file_upload_id
  AND fed.data_category = 'otro'
  AND fed.chunk_index > 0;