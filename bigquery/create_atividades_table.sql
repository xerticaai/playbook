-- =====================================================================
-- TABELA: atividades (origem: Google Sheets aba "Atividades")
-- Projeto: operaciones-br
-- Dataset: sales_intelligence
-- Objetivo: armazenar atividades para o Pulso Semanal (Pauta Semanal)
-- Data: 2026-02-11
-- =====================================================================

CREATE TABLE IF NOT EXISTS `operaciones-br.sales_intelligence.atividades` (
  Atribuido STRING,
  Data DATE,
  EmpresaConta STRING,
  Tipo_de_Actividad STRING,
  Comentarios_completos STRING,
  Comentarios STRING,
  Assunto STRING,
  Local STRING,
  Oportunidade STRING,
  Contato STRING,
  Status STRING,
  Tipo_de_atividade STRING,
  Data_de_criacao DATE,
  Run_ID STRING,
  data_carga STRING
);
