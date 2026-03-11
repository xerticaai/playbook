# Plano de Reducao de Tokens de IA (Apps Script)

Data: 2026-03-10
Status: Proposta tecnica pronta para execucao
Objetivo: reduzir consumo de tokens na leitura de oportunidades, atividades e alteracoes sem reduzir a complexidade do motor (governanca, hard gates, analise de risco e explicabilidade), preservando linguagem consultiva com nuance contextual.

## 1. Diagnostico do Consumo Atual

O consumo esta concentrado em quatro pontos:

1. Prompts extensos por oportunidade (OPEN/WON/LOST), com muito texto bruto de atividades/descricao/historico.
2. Retry com `maxOutputTokens` muito alto em casos de parse/truncamento.
3. Reanalise de oportunidades sem mudanca material (mesmo contexto sendo reenviado).
4. Chamadas de IA para tarefas de baixa complexidade textual (justificativas curtas, classificacoes estaveis) que poderiam usar cache/delta ou degradacao controlada.

Resumo: o motor esta correto em qualidade, mas gasta token por excesso de contexto bruto e baixa reutilizacao de resultados.

## 2. Principio Arquitetural

Manter a complexidade do motor nao significa reenviar todo o contexto bruto em cada chamada. A estrategia e:

- manter toda a inteligencia deterministica local (gates, scores, regras);
- enviar para IA somente o contexto minimo suficiente para decisao sem ambiguidade;
- acionar contexto completo apenas quando houver incerteza real;
- reusar resultado quando o estado da oportunidade nao mudou.
- manter texto local com tom de cobranca consultiva (sem efeito template), com frases dinamicas montadas por sinais do proprio motor.

## 3. Arquitetura Alvo (Token-Efficient)

## 3.1 Envelope de Contexto em 3 Camadas

### Camada A: Features estruturadas (sempre)
- score MEDDIC/BANT + gaps
- stage/probabilidade/fiscal/idle/velocity
- mudancas criticas agregadas (contadores e padrao)
- flags de governanca e inconsistencias

### Camada B: Evidencias curtas (quase sempre)
- no maximo 3 trechos de atividade (1-2 linhas cada)
- no maximo 2 trechos de alteracao (foco em close date/stage/valor)
- descricao CRM truncada com limite fixo e normalizacao

### Camada C: Contexto expandido (somente sob demanda)
- texto longo de atividades e historico detalhado
- habilitar apenas se modelo retornar baixa confianca de extraibilidade, conflito logico, ou `NO_JSON_FOUND` recorrente

Resultado esperado: preservar profundidade analitica com menos texto por chamada.

## 3.2 Pipeline de Decisao em Dois Estagios

1. Estagio 1 (barato): classificacao estruturada e curta, JSON estrito.
2. Estagio 2 (caro): executar apenas quando houver gatilho de incerteza ou necessidade executiva de justificativa expandida.

Gatilhos para Estagio 2:
- conflito entre regra deterministica e resposta da IA;
- confianca em zona cinza (ex.: 40-60) com alto impacto de receita;
- deteccao de anomalia critica;
- retorno truncado duas vezes seguidas.

## 3.3 Reuso por Fingerprint (Delta-only)

Criar um fingerprint da oportunidade para evitar reanalise identica:

- chave: `opp_id|stage|close_date|amount|idle_bucket|meddic_hash|bant_hash|changes_hash|activities_hash_top`;
- se fingerprint nao mudou, reusar JSON IA anterior;
- se mudou pouco (apenas atividade nao critica), rodar modo curto com Camada A + B minima.

Armazenamento sugerido:
- `PropertiesService` para estado rapido por lote;
- aba tecnica de cache para persistencia historica (opp_key, fingerprint, ts, json).

## 4. Otimizacoes Concretas por Componente

## 4.1 Prompts OPEN/WON/LOST

Ajustes:
- reduzir texto bruto de atividades para snippets selecionados por relevancia (nao por ordem apenas);
- trocar blocos longos de regras por codigos de regra curtos (ex.: `RG01..RG15`) e um dicionario fixo local;
- manter governanca completa, mas serializar em formato compacto (`flags:[...]`, `risk:{...}`, `evidence:[...]`).

Impacto estimado: -30% a -50% tokens de entrada por chamada OPEN.

## 4.2 Retry e Saida

Ajustes:
- evitar escalar para 8192 automaticamente;
- usar `maxOutputTokens` adaptativo por modo:
  - OPEN: 1200-1800
  - WON/LOST: 900-1400
  - justificativa curta: 300-600
- em truncamento, segundo retry deve pedir somente campos faltantes (com JSON parcial), nao repetir prompt completo.

Impacto estimado: -20% a -40% tokens de saida em cenarios com retry.

## 4.3 Justificativas em Massa (CorrigirFiscalQ)

Ajustes:
- substituir template fixo por Gerador Dinamico de Nuance Local para 70-85% dos casos;
- chamar IA apenas para casos de alto risco, alto valor, ou conflito de sinais;
- cache por `(forecast_cat, confianca_bucket, idle_bucket, gap_pattern)` com pequenas variacoes por conta/setor.

Impacto estimado: -50% a -80% no modulo de justificativas.

## 4.3.1 Gerador Dinamico de Nuance Local (sem token)

Problema alvo:
- evitar texto roboticamente repetitivo;
- manter "tom humano" de cobranca consultiva para diretoria e lideres comerciais;
- reduzir custo de IA para casos padrao.

Arquitetura do texto local (modular):

1. Bloco Abertura (temperatura do deal)
- cruza fase, idle, velocity, idade da oportunidade, proximidade do fechamento.

2. Bloco Diagnostico (ferida operacional)
- cruza gaps MEDDIC/BANT, sinais de Happy Ears, estagnacao de funil, incoerencias.

3. Bloco Fechamento Tatico (acao contextual)
- varia por tipo de oportunidade (nova, renovacao, upsell, transfer token) e contexto gov/B2G.

4. Bloco Tom Executivo (frase de impacto)
- fecha com recomendacao objetiva para 1:1 de gestao.

Regras para fugir do efeito template:
- biblioteca de frases por bloco com 3-6 variantes por condicao;
- selecao deterministica por hash do `opp_id` + `run_id` para variar texto sem aleatoriedade descontrolada;
- proibido repetir a mesma combinacao de frases para a mesma opp em runs consecutivas quando houver mudanca de sinal;
- limite de tamanho (ex.: 320-520 chars) para manter leitura executiva.

Exemplo de composicao (pseudo):
- `texto = abertura(item, idle, velocity) + diagnostico(meddic, bant, anomalias) + fechamento(isGov, tipoOpp, closeDate)`

Quando NAO usar texto local e escalar para IA:
- conflito severo entre sinais (ex.: score alto com 3 gates criticos);
- deal estrategico de alto valor acima de threshold definido;
- caso juridico/governo com narrativa ambigua (TR/ARP/ETP sem sequencia clara);
- ausencia de evidencias textuais minimas para sustentar justificativa.

## 4.3.2 Politica Hibrida (Local -> IA)

Ordem de execucao recomendada:

1. Sempre gerar versao local primeiro (rapida e com nuance).
2. Rodar validador de confianca da justificativa local:
- cobertura de sinais (idle, fase, risco, acao),
- consistencia com gates,
- clareza executiva.
3. So chamar IA se o validador reprovar ou cair em gatilho de excecao.

Meta operacional:
- >= 75% das oportunidades com justificativa local aprovada;
- <= 25% escaladas para IA.

## 4.4 Queue e Snapshot

Ajustes:
- antes de enviar a IA no processamento por fila, validar `fingerprint_changed`;
- se nao houve mudanca material, apenas atualizar timestamp/output tecnico sem nova inferencia;
- consolidar no snapshot agregados prontos para prompt (evita reformatar texto grande por item).

Impacto estimado: elimina chamadas redundantes em execucoes ciclicas.

## 5. Mecanismos de Qualidade (Sem Perder Complexidade)

Para garantir que economia nao degrade analise:

1. Score de equivalencia: comparar forecast_cat, acao_code, labels criticas e risco_principal entre versao atual e otimizada.
2. Suite de regressao com amostra estratificada:
- deals gov, deal desk, net zero, estagnados, renovacao, upsell, nova aquisicao.
3. Budget gates:
- bloquear deploy se divergencia de regras criticas > 2%.
4. Auditoria de explicabilidade:
- manter campo `evidencia_citada` obrigatorio em casos de risco alto.
5. Qualidade textual da justificativa local:
- avaliar legibilidade, especificidade e tom consultivo (sem frases genericas).
- bloquear fallback local se texto nao citar pelo menos 2 sinais concretos do deal.

## 6. Telemetria de Token (Obrigatoria)

Adicionar logs por chamada:

- `prompt_chars`
- `estimated_input_tokens`
- `max_output_tokens`
- `retry_count`
- `model_used`
- `fingerprint_hit` (cache hit/miss)
- `analysis_tier` (A+B ou A+B+C)
- `justification_mode` (`local_nuanced` | `ai_expanded`)
- `local_quality_score` (0-100)
- `local_to_ai_escalation_reason`

KPIs de sucesso:

1. Tokens por oportunidade (p50/p90)
2. Custo por lote
3. Taxa de cache hit
4. Taxa de retry
5. Divergencia de decisao vs baseline
6. Taxa de aceitacao da justificativa local
7. Reclamacoes de "texto generico" por usuarios chave (meta: proximo de zero)

## 7. Roadmap de Implementacao

## Fase 1 (1-2 dias) - Quick Wins

1. Max tokens adaptativo por modo.
2. Retry inteligente sem duplicar prompt completo.
3. Limitador de contexto bruto (snippets maximos).
4. Telemetria basica de consumo.
5. Primeira versao do Gerador Dinamico de Nuance Local (3 blocos + 3 variacoes por bloco).

Reducao esperada: 25%-40%.

## Fase 2 (2-4 dias) - Estrutural

1. Fingerprint e cache por oportunidade.
2. Envelope A/B/C com fallback expandido sob demanda.
3. Dicionario curto de regras (`RGxx`) para reduzir prompt fixo.
4. Validador de qualidade textual local + politica de escalonamento para IA.

Reducao adicional esperada: 20%-35%.

## Fase 3 (3-5 dias) - Avancada

1. Dois estagios (barato->caro) com gatilho de incerteza.
2. Biblioteca local de justificativas por padrao com tons por segmento (Gov, Enterprise, SMB, Renovacao).
3. Revalidacao automatica de equivalencia e custo.
4. Teste A/B interno: justificativa local vs IA para medir impacto em adesao do time comercial.

Reducao adicional esperada: 15%-25%.

## 8. Meta Realista

Sem reduzir complexidade do motor, a combinacao das fases permite alvo de reducao total de 45%-70% em tokens, dependendo da taxa de cache hit e do perfil de retries.

## 9. Checklist de Execucao

- [ ] Instrumentar telemetria de tokens por chamada
- [ ] Implementar budget adaptativo por modo
- [ ] Implementar retries parciais com JSON incremental
- [ ] Criar fingerprint por oportunidade
- [ ] Cachear resposta IA por fingerprint
- [ ] Introduzir envelope A/B/C
- [ ] Criar suite de regressao de equivalencia
- [ ] Definir budget gate de deploy
- [ ] Implementar Gerador Dinamico de Nuance Local (modular)
- [ ] Implementar validador de qualidade da justificativa local
- [ ] Definir gatilhos formais de escalonamento Local -> IA
- [ ] Instrumentar `justification_mode` e `local_quality_score`

---

Se quiser, no proximo passo eu implemento a Fase 1 direto no Apps Script com patch incremental (baixo risco), incluindo a primeira versao do Gerador Dinamico de Nuance Local e mantendo o comportamento funcional atual.