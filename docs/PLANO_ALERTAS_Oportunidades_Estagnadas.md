# Plano de Implantação — Alertas de Oportunidades Estagnadas

## Objetivo
Disparar alerta por email, direto da UI, para oportunidades estagnadas com contexto do drilldown e acionamento rápido do vendedor.

## Arquivo Apps Script criado
- appscript/StagnantOpportunityAlert.gs

## Regras de Destinatários implementadas
- Para: vendedor da oportunidade (derivado do nome, formato nome.sobrenome@xertica.com)
- CC fixo:
  - amalia.silva@xertica.com
  - barbara.pessoa@xertica.com
- CC dinâmico por perfil:
  - customer success -> emilio.goncalves@xertica.com
  - bdms (default) -> gabriele.oliveira@xertica.com

## Endpoint para botão no frontend
- Método: POST
- URL: Web App URL do Apps Script publicado
- Body JSON sugerido:

{
  "secret": "<SECRET_OPCIONAL>",
  "source": "stagnant_card|drilldown",
  "actor": "email-ou-usuario-frontend",
  "deal": {
    "oportunidade": "...",
    "conta": "...",
    "vendedor": "...",
    "fase_atual": "...",
    "fiscal_q": "...",
    "data_prevista": "...",
    "dias_funil": 249,
    "idle_dias": 86,
    "atividades": 18,
    "gross": 70000,
    "net": 52000,
    "confianca": 30,
    "risco_score": 1,
    "meddic_score": 42,
    "tipo_oportunidade": "NOVO CLIENTE",
    "portfolio": "FDM",
    "acao_sugerida": "...",
    "risco_principal": "..."
  }
}

## Botões a adicionar no frontend
1. Card “Oportunidades Estagnadas”
   - Botão: “Avisar vendedor” por linha
   - Envia payload resumido do card

2. Drilldown executivo
   - Botão: “Enviar alerta” no painel de detalhe
   - Envia payload completo do deal selecionado

## Segurança mínima
- Configurar Script Property:
  - chave: STAGNANT_ALERT_SECRET
  - valor: token forte
- Frontend envia esse secret no POST.
- Se o secret não estiver configurado no Apps Script, endpoint aceita sem validação (modo bootstrap).

## Prática operacional sugerida (melhorias)
1. Anti-spam por oportunidade
   - Guardar último envio por oportunidade (PropertiesService) e bloquear reenvio em janela de 24h.

2. SLA explícito
   - Inserir no email “Atualizar CRM em até 24h”.

3. Escalonamento automático
   - Se sem atualização em 48h após alerta, enviar follow-up para gestão.

4. Métrica de automação
   - Criar aba “Alertas Estagnadas” no Sheets com:
     - oportunidade, vendedor, data_envio, origem, status

5. Lotes semanais
   - Trigger semanal para enviar resumo consolidado das estagnadas críticas.

## Go-live sugerido
- Fase 1 (manual assistido): botão no drilldown + card estagnadas.
- Fase 2: anti-spam + log.
- Fase 3: escalonamento automático + trigger semanal.
