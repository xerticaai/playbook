# Plano de Automação de Emails — Pauta Semanal

## Objetivo
Expandir o uso de automações de email além de `stagnantopp` para aumentar velocidade de execução comercial, reduzir risco de perda e melhorar previsibilidade de fechamento.

## Escopo
- Fonte principal: dados da Pauta Semanal (`/api/weekly-agenda`) e visão executiva.
- Canal inicial: email transacional (Apps Script via proxy Cloud Run).
- Público: vendedor dono da oportunidade, especialista por perfil, liderança e operação (conforme regra).

---

## 1) Catálogo de automações recomendadas

### 1.1 Oportunidade estagnada (já implementado)
- **Gatilho**: `idle_dias >= 30` e/ou `dias_funil >= 90`.
- **Ação**: email imediato com contexto e ação sugerida.
- **Objetivo**: reativar deal e forçar atualização de plano.

### 1.2 Data prevista inconsistente (fechamento irrealista)
- **Gatilho**:
  - data de fechamento no quarter atual, mas atividade/nota indica retomada só em quarter futuro; ou
  - data de fechamento alterada repetidamente (ex.: >= 3 mudanças em janela curta).
- **Ação**: email pedindo correção de `Data_Prevista` e justificativa no CRM.
- **Destinatários**: vendedor + liderança direta.
- **Objetivo**: aumentar qualidade de forecast.

### 1.3 Fase incompatível com evidência recente
- **Gatilho**: fase avançada (ex.: Deal Desk) com sinais de regressão (objeção forte, reavaliação técnica, ausência de decisor).
- **Ação**: email sugerindo regressão de fase e checklist mínimo para avançar novamente.
- **Objetivo**: reduzir “fase inflada” no pipeline.

### 1.4 Ausência de Economic Buyer / Champion
- **Gatilho**: campos-chave MEDDIC/BANT ausentes em oportunidades de alto valor.
- **Ação**: email com checklist de qualificação obrigatória.
- **Objetivo**: elevar taxa de conversão em deals estratégicos.

### 1.5 Confiança baixa com valor alto
- **Gatilho**: `confianca < 50%` e `gross/net` acima de limiar (definir por portfólio).
- **Ação**: alerta de risco para vendedor + gestor com plano de recuperação em 48h.
- **Objetivo**: priorizar esforço onde impacto financeiro é maior.

### 1.6 Sem atividade após alerta (escalonamento)
- **Gatilho**: alerta enviado e nenhuma nova atividade/atualização em 48h.
- **Ação**: follow-up automático para gestão + resumo do histórico de alertas.
- **Objetivo**: fechar o loop operacional.

### 1.7 Queda abrupta de probabilidade
- **Gatilho**: variação negativa brusca de confiança em período curto (ex.: -20 pontos em 7 dias).
- **Ação**: email de “risco emergente” solicitando causa raiz e plano.
- **Objetivo**: detectar deterioração cedo.

### 1.8 Pipeline podre / zumbi por vendedor (resumo semanal)
- **Gatilho**: snapshot semanal por vendedor com volume de deals sem avanço.
- **Ação**: email consolidado semanal (não por deal).
- **Objetivo**: higiene contínua do pipeline.

---

## 2) Priorização sugerida (ordem de implementação)

## Fase 1 (rápido impacto)
1. Data prevista inconsistente.
2. Fase incompatível com evidência.
3. Escalonamento após 48h sem atualização.

## Fase 2 (qualidade de execução)
4. Ausência de Economic Buyer / Champion.
5. Confiança baixa com valor alto.
6. Queda abrupta de probabilidade.

## Fase 3 (governança contínua)
7. Resumo semanal de pipeline podre/zumbi por vendedor.

---

## 3) Melhorias recomendadas para `stagnantopp`

### 3.1 Regras e confiabilidade
- **Cooldown adaptativo**:
  - padrão 24h;
  - críticos podem permitir reenvio em 8–12h;
  - após confirmação de atualização no CRM, reset automático do cooldown.
- **Dedupe por evento**: hash de (`oportunidade`, `fase`, `data_prevista`, `risco_principal`) para evitar alertas duplicados por retry.
- **Janela de silêncio**: evitar disparos fora de horário comercial (configurável).

### 3.2 Conteúdo do email
- Incluir “o que mudou desde o último alerta” (delta de confiança, fase, data prevista, atividade).
- Inserir CTA explícito:
  - “Atualizar CRM agora” (link direto para oportunidade);
  - “Registrar atividade de follow-up”.
- Bloco de compliance operacional:
  - SLA esperado (24h),
  - data/hora do próximo escalonamento automático.

### 3.3 Observabilidade (logs e operação)
- Salvar logs em armazenamento persistente (BigQuery/Firestore), além de memória do Cloud Run.
- Campos mínimos de auditoria:
  - `timestamp`, `opportunity`, `seller`, `recipient_to`, `recipient_cc`, `status_http`, `appscript_success`, `error`, `webhook_url`, `fallback_attempted`, `source`, `actor`.
- Criar endpoint de métricas:
  - taxa de sucesso por dia,
  - top erros,
  - tempo médio de resposta do webhook.

### 3.4 UX no frontend (aba estagnadas)
- Exibir status final do último envio por deal (badge: enviado, falha, cooldown, escalado).
- Mostrar “próximo envio permitido em” por deal (contador simples).
- Filtro rápido no painel de logs:
  - `falhas`, `sucesso`, `últimas 24h`, `meus envios`.

### 3.5 Segurança
- Secret obrigatório em produção (não opcional).
- Rotação periódica de secret com janela de transição.
- Lista de origem permitida por ambiente (`prod`, `staging`).

---

## 4) Arquitetura recomendada (evolução)
- **Atual**: Frontend -> Cloud Run proxy -> Apps Script -> Gmail.
- **Evolução recomendada**:
  1. Cloud Run valida regra + registra log persistente.
  2. Publica evento (fila) para envio assíncrono.
  3. Worker de envio executa retries e escreve status final.
  4. Frontend consulta status por deal.

Benefícios: menor acoplamento, retries mais robustos, trilha de auditoria confiável.

---

## 5) KPIs para acompanhar automações
- Taxa de entrega de email (% sucesso técnico).
- Tempo até primeira atualização de CRM após alerta.
- % de deals estagnados reativados em 7 dias.
- % de deals com data prevista corrigida após alerta.
- Redução de oportunidades em fase inconsistente.

---

## 6) Backlog técnico objetivo
1. Persistir logs de alertas (BigQuery ou Firestore).
2. Endpoint `GET /api/stagnant-alert/status?opportunity=...`.
3. Endpoint `POST /api/stagnant-alert/escalate` (batch por SLA expirado).
4. Templates por tipo de alerta (`stagnant`, `closing_date_mismatch`, `phase_mismatch`, etc).
5. Feature flags por tipo de automação.
6. Painel de saúde das automações na visão executiva.

---

## 7) Definições operacionais a alinhar antes de implantar
- Limiares por tipo de alerta (dias, confiança, valor).
- Dono de cada SLA (vendedor, liderança, operação).
- Política de escalonamento (quem entra em CC e quando).
- Horário comercial e calendário de feriados.
- Critério de sucesso por automação (meta mensal).
