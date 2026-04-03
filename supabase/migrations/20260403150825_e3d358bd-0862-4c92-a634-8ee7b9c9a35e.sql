-- Fix Excel serial dates in ventas data (Mes column with values like 45231)
-- Convert serial numbers to ISO date strings in extracted_json->'data' array
UPDATE file_extracted_data
SET extracted_json = jsonb_set(
  extracted_json,
  '{data}',
  (
    SELECT jsonb_agg(
      CASE 
        WHEN (elem->>'Mes')::numeric > 1 AND (elem->>'Mes')::numeric < 200000 
        THEN jsonb_set(elem, '{Mes}', to_jsonb(to_char(DATE '1899-12-30' + ((elem->>'Mes')::integer * INTERVAL '1 day'), 'YYYY-MM-DD')))
        ELSE elem
      END
    )
    FROM jsonb_array_elements(extracted_json->'data') elem
  )
),
row_count = (
  SELECT count(*) FROM jsonb_array_elements(extracted_json->'data')
)
WHERE data_category = 'ventas' 
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(extracted_json->'data') e 
  WHERE (e->>'Mes') IS NOT NULL AND (e->>'Mes')::numeric > 1000
);

-- Filter out summary rows in marketing data (empty campaign name with numeric values)
UPDATE file_extracted_data
SET extracted_json = jsonb_set(
  extracted_json,
  '{data}',
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(extracted_json->'data') elem
    WHERE COALESCE(NULLIF(TRIM(elem->>'Nombre de la campaña'), ''), NULL) IS NOT NULL
  )
),
row_count = (
  SELECT count(*) FROM jsonb_array_elements(extracted_json->'data') elem
  WHERE COALESCE(NULLIF(TRIM(elem->>'Nombre de la campaña'), ''), NULL) IS NOT NULL
)
WHERE data_category = 'marketing'
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(extracted_json->'data') e
  WHERE COALESCE(NULLIF(TRIM(e->>'Nombre de la campaña'), ''), NULL) IS NULL
);