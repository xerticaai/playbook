# Lógica Oficial — Performance Equipe (IPV) com Feriados e Férias

## 1) Objetivo
Definir uma regra única e consistente para cálculo do IPV em `Performance Equipe`, incorporando:
- impacto de **feriados**;
- impacto de **férias/afastamentos**;
- **consonância total** entre visão de equipe e visão individual;
- sem alterar a lógica da `Weekly Agenda`.

Este documento é a referência funcional e matemática para implementação no backend de Performance.

---

## 2) Escopo e restrições
- **Não alterar** endpoint, payload ou regra de cálculo da `Weekly Agenda`.
- A `Weekly Agenda` segue como fonte operacional de acompanhamento semanal.
- `Performance Equipe` deve usar a **mesma semântica de capacidade de trabalho** (dias úteis, feriados, férias), mas com cálculo próprio para IPV.
- A visão individual deve ser derivada do **mesmo universo de normalização** da visão de equipe (evitar cálculo “isolado” que muda o score relativo).

---

## 3) Princípios de consonância

### 3.1 Universo único de cálculo
Para qualquer combinação de filtros (`year`, `quarter`, `seller` global):
1. calcular IPV de **todo o conjunto elegível**;
2. ordenar ranking;
3. na visão individual, apenas selecionar o vendedor dentro desse mesmo resultado.

> Regra: endpoint individual não pode recalcular normalização com universo reduzido a 1 vendedor.

**Contrato do universo filtrado (obrigatório):**
- universo de normalização = vendedores selecionados no filtro global com **pelo menos 1 semana elegível** (`EBD > 0`) no período;
- vendedor sem semana elegível pode retornar em `scorecard/comportamento` com status informativo, mas **não entra no ranking nem na normalização**;
- histórico só entra quando explicitamente selecionado pelo filtro global.

### 3.2 Funções únicas
As fórmulas de:
- normalização de resultado,
- eficiência de ciclo,
- score comportamental,
- fator de capacidade (feriado/férias)

precisam ficar em funções utilitárias únicas, reutilizadas em equipe e individual.

### 3.3 Transparência
A resposta da API deve expor metadados mínimos:
- `business_days_total`, `business_days_effective`;
- `holiday_days`, `vacation_days`;
- `capacity_factor`;
- `goal_hit_rate_meetings`, `goal_hit_rate_opps` (quando aplicável).

---

## 4) Modelo de capacidade (feriados + férias)

## 4.1 Definições
Para cada vendedor `v` e semana `w`:
- $BD_{w}$ = dias úteis da semana (seg-sex) excluindo feriados;
- $VAC_{v,w}$ = dias de férias/afastamento **somente dentro de $BD_w$** (nunca em fim de semana/feriado);
- $EBD_{v,w} = \max(0, BD_{w} - VAC_{v,w})$;
- fator de capacidade semanal:

$$
CF_{v,w} =
\begin{cases}
0, & \text{se } BD_w = 0\\
\frac{EBD_{v,w}}{BD_w}, & \text{caso contrário}
\end{cases}
$$

Para período `P` (ex.: quarter):

Considere a janela de elegibilidade do vendedor no período: $P_v$ (interseção entre período filtrado e janela ativa do vendedor: entrada/saída).

$$
CF_{v,P} = \frac{\sum_{w \in P_v} EBD_{v,w}}{\sum_{w \in P_v} BD_w}
$$

Definições derivadas por vendedor no período:
- $business\_days\_total = \sum_{w \in P_v} BD_w$ (não usar total corporativo do quarter);
- $business\_days\_effective = \sum_{w \in P_v} EBD_{v,w}$.

## 4.2 Regras de calendário
- Feriados nacionais e recessos corporativos devem estar em tabela de calendário (não hardcoded no cálculo).
- Férias/afastamentos por vendedor devem estar em tabela própria com `start_date`, `end_date`, `tipo`.
- Sobreposição de períodos não pode gerar contagem duplicada de dias.

## 4.3 Semanas sem capacidade
- Se $EBD_{v,w}=0$, semana entra como **semana não elegível para meta** (não penaliza “não bateu”).

---

## 5) Métricas de execução (consistência de meta)

## 5.1 Metas semanais base
Mesma lógica operacional já adotada:
- reuniões alvo por dia útil: `1.6`;
- novas oportunidades por dia útil: `0.8`.

Metas ajustadas por capacidade:

$$
GoalMeet_{v,w}=\text{round}(1.6 \times EBD_{v,w})
$$

$$
GoalOpp_{v,w}=\text{round}(0.8 \times EBD_{v,w})
$$

Decisão de consonância operacional:
- manter `round()` alinhado à semântica atual;
- registrar risco aceito de viés em semanas curtas (`EBD` pequeno), principalmente em `EBD=1`.

## 5.2 Critério de “meta batida”
Semana elegível: $EBD_{v,w} > 0$.
- `hit_meet_w = 1` se `meetings_w >= GoalMeet_v,w`, senão 0.
- `hit_opp_w = 1` se `new_opps_w >= GoalOpp_v,w`, senão 0.
- `hit_both_w = 1` se ambas batidas.

## 5.3 Indicadores de consistência no período
Para `N` semanas elegíveis:

$$
HitRateMeet_{v,P}=\frac{\sum hit\_meet_w}{N}
$$

$$
HitRateOpp_{v,P}=\frac{\sum hit\_opp_w}{N}
$$

$$
HitRateBoth_{v,P}=\frac{\sum hit\_both_w}{N}
$$

Adicionar também:
- `current_streak_both`;
- `best_streak_both`.

---

## 6) IPV — fórmula alvo

## 6.1 Estrutura
Manter estrutura de 3 pilares, com ajuste no pilar Comportamento para incluir consistência de execução:

$$
IPV = 0.40\cdot Resultado + 0.35\cdot Eficiencia + 0.25\cdot Comportamento
$$

## 6.2 Pilar Resultado (0–100)

$$
Resultado = 0.25\cdot DealsNorm + 0.75\cdot NetNorm
$$

- `DealsNorm` e `NetNorm` normalizados contra o **mesmo universo filtrado**.
- `Net <= 0` mantém gate de teto (ex.: IPV máx 20), conforme regra atual.

## 6.3 Pilar Eficiência (0–100)

$$
Eficiencia = 0.6\cdot WinRate + 0.4\cdot CycleEfficiency
$$

- `CycleEfficiency` permanece baseado na relação entre `ciclo_win` e `ciclo_loss`.

## 6.4 Pilar Comportamento (0–100)
Substituir composição para incorporar execução consistente:

$$
Comportamento = 0.40\cdot AtivScore + 0.30\cdot QualidadeProcesso + 0.30\cdot ExecConsistency
$$

Onde:
- `AtivScore`: intensidade de atividades **normalizada por capacidade** (não usar volume bruto do período);
- `QualidadeProcesso`: inverso de perdas evitáveis;
- `ExecConsistency`:

$$
ExecConsistency = 0.4\cdot HitRateMeet + 0.4\cdot HitRateOpp + 0.2\cdot HitRateBoth
$$

Forma mínima recomendada para `AtivScore`:

$$
activities\_per\_effective\_day = \frac{total\_activities}{\max(1, business\_days\_effective)}
$$

Depois aplicar cap e normalização para 0–100 em função dessa taxa.

Todos em escala 0–100.

---

## 7) Elegibilidade de vendedores

## 7.1 Ativo vs histórico
- Default em `Performance Equipe`: vendedores ativos.
- Ao selecionar filtro global de vendedores, respeitar seleção explícita (inclusive histórico).

## 7.2 Entrada/saída
- Semanas antes da entrada e após saída: não elegíveis para metas e consistência.
- Semanas elegíveis com $EBD=0$ por férias integrais: neutras para taxa de batimento.

---

## 8) Contrato de dados mínimo (backend)

## 8.1 Entradas necessárias
- tabela calendário com feriados/recessos;
- tabela de férias/afastamentos por vendedor;
- atividades e novas oportunidades por semana/vendedor;
- ganhos/perdas/pipeline atuais.

## 8.2 Saída adicional por vendedor
Além do payload atual de ranking/scorecard/comportamento, incluir:
- `businessDaysTotal`;
- `businessDaysEffective`;
- `holidayDays`;
- `vacationDays`;
- `hitRateMeetings`;
- `hitRateOpps`;
- `hitRateBoth`;
- `currentStreakBoth`;
- `bestStreakBoth`.

---

## 9) Regras de qualidade e validação

## 9.1 Testes de consonância obrigatórios
1. **Equipe vs Individual**: score do vendedor deve ser idêntico nas duas visões com mesmos filtros.
2. **Com/sem férias**: semana com férias totais não pode penalizar hit rate.
3. **Feriado nacional**: meta semanal deve reduzir proporcionalmente.
4. **Semanas sem dia útil**: excluir de elegibilidade.
5. **Gate NET <= 0**: respeitar teto definido.
6. **Férias atravessando quarter**: recorte correto por período (ex.: começa em Q1 e termina em Q2).
7. **Feriado + férias parcial na mesma semana**: `VAC` não pode contar dia já não útil por feriado.

## 9.2 Auditoria de cálculo
Persistir (ou logar) trilha por vendedor/semana:
- `BD_w`, `VAC_v,w`, `EBD_v,w`, metas ajustadas, hits semanais.

---

## 10) Plano de adoção (ordem recomendada)
1. Consolidar tabelas de calendário e férias.
2. Implementar camada de capacidade semanal (`CF`, `EBD`) no backend de Performance.
3. Implementar indicadores de consistência (`hit rates` e `streaks`).
4. Atualizar pilar Comportamento com `ExecConsistency`.
5. Garantir endpoint individual usando o mesmo universo de normalização da equipe.
6. Validar paridade com cenários de teste e publicar metadados no payload.

---

## 11) Decisões fechadas
- Feriados e férias entram no cálculo de Performance por capacidade efetiva.
- Weekly Agenda não será alterada.
- Indicador de execução deve priorizar “quantas vezes bateu meta” (consistência), não exibir só meta bruta semanal.
- Consonância entre equipe e individual é requisito não negociável para IPV.
