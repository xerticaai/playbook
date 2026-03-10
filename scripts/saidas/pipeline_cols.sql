SELECT column_name
FROM `operaciones-br.sales_intelligence.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name='pipeline'
  AND (LOWER(column_name) LIKE '%tipo%' OR LOWER(column_name) LIKE '%perfil%')
ORDER BY column_name;
