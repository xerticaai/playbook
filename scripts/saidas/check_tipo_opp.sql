SELECT
  Oportunidade,
  Tipo_Oportunidade,
  Perfil,
  data_carga
FROM `operaciones-br.sales_intelligence.pipeline`
WHERE Oportunidade IN (
  'PCDT-130863--GurIA',
  'PCDR-129266-Polícia Civil RS-investigacao criminal (PROCERGS)-'
)
ORDER BY data_carga DESC
LIMIT 20;
