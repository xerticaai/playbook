# 🧪 GUIA DE TESTES - VALIDAÇÃO DE KPIs

## 🎯 OBJETIVO
Testar cada cenário do dashboard e documentar OS VALORES EXATOS que aparecem na tela e no console. Com isso, vamos identificar precisamente onde estão os bugs.

---

## 📋 PREPARAÇÃO

### 1. Abra o Dashboard
**URL:** https://x-gtm.web.app

### 2. Abra o Console do Navegador
- **Chrome/Edge:** Pressione `F12` ou `Ctrl+Shift+J`
- **Firefox:** Pressione `F12` ou `Ctrl+Shift+K`
- **Safari:** `Cmd+Option+C`

### 3. Configure o Console
- Clique na aba **"Console"**
- Se necessário, limpe os logs antigos (ícone 🚫 ou `Ctrl+L`)

### 4. Observe os Loaders ✨
Você deve ver:
- Logo Xertica animada (inicial)
- Mini loader no canto ao trocar filtros

---

## 🧪 CENÁRIO 1: BASELINE (SEM FILTROS)

### Configuração dos Filtros:
```
Quarter:  (vazio/Todos)
Vendedor: Todos os Vendedores
Ano:      Todos
Mês:      Todos
```

### O que anotar:

#### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________
  Deals: ______ deals abertos
  Net:   $____________

Pipeline (Período Filtrado):
  Valor: $____________
  Deals: ______ deals no período
  Net:   $____________

Previsão Sales Specialist:
  Valor: $____________
  Deals: ______ deals curados
  Net:   $____________

Previsão Ponderada IA:
  Valor: $____________
  Confiança: _____%
  Net:   $____________

Deals ≥50% Confiança IA:
  Valor: $____________
  Deals: ______
  Net:   $____________

Deals Fechados:
  Valor: $____________
  Deals: ______ deals ganhos
  Net:   $____________

Taxa de Conversão:
  Taxa: _____%
  Razão: ______/______

Vendedores Ativos:
  Número: ______
```

#### 🔍 LOGS DO CONSOLE:
Cole aqui os logs que começam com:
- `[KPI] Pipeline Total:`
- `[CALC] Pipeline calculado:`
- `[CALC] Confiança média final:`
- `[CALC] Forecast ponderado:`
- `[CALC] Fechados no Quarter:`
- `[DATA] wonAgg disponível:`
- `[DATA] lostAgg disponível:`
- `[CALC] Conversão do Quarter:`
- `[CALC] Ganhas - Gross:`
- `[CALC] Perdidas - Gross:`

```
(Cole os logs aqui)
```

#### ✅ VALORES ESPERADOS (para validação):
```
Pipeline Total: $74,158,469 (268 deals)
Deals Fechados: $109,849,113 (506 deals)
Taxa de Conversão: ~50% (506 won / 1006 total)
Vendedores Ativos: 10
```

---

## 🧪 CENÁRIO 2: Q1 2026 (Janeiro-Março)

### Configuração dos Filtros:
```
Quarter:  Q1 (Jan-Mar)
Vendedor: Todos os Vendedores
Ano:      2026
Mês:      (deixe vazio - auto-selecionado pelo quarter)
```

### ⏱️ Observe:
- Tempo que demora para carregar (em segundos)
- Aparece o mini loader?
- Algum erro no console?

### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________
  Deals: ______ deals abertos
  
Pipeline (Período Filtrado):
  Valor: $____________
  Deals: ______ deals no período

Deals Fechados:
  Valor: $____________
  Deals: ______ deals ganhos

Taxa de Conversão:
  Taxa: _____%
  Razão: ______/______
```

### 🔍 LOGS DO CONSOLE:
Cole aqui especialmente:
- `[FILTER] Período selecionado:`
- `[FILTER] Aplicando filtro:`
- `[CALC] Pipeline calculado:`
- `[CALC] Fechados no Quarter:`
- `[CALC] Ganhas - Gross:`

```
(Cole os logs aqui)
```

#### ⚠️ O que validar:
- **Pipeline Total** deve continuar sendo $74.1M (não muda com filtro!)
- **Pipeline Filtrado** deve mostrar apenas deals do Q1 2026
- **Deals Fechados** deve mostrar apenas closed em Jan-Mar 2026

---

## 🧪 CENÁRIO 3: Q2 2026 (Abril-Junho) - PROBLEMA CONHECIDO

### Configuração dos Filtros:
```
Quarter:  Q2 (Abr-Jun)
Vendedor: Todos os Vendedores
Ano:      2026
Mês:      (deixe vazio)
```

### ⚠️ BUGS ESPERADOS:
- Pipeline Total pode mostrar $0 (ERRADO!)
- Deals Fechados: $315,900 mas "0 deals ganhos" (INCONSISTENTE!)

### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________  (deve ser $74.1M SEMPRE)
  Deals: ______ deals abertos
  
Pipeline (Período Filtrado):
  Valor: $____________  (esperado: ~$33.5M com 103 deals)
  Deals: ______ deals no período

Deals Fechados:
  Valor: $____________  (esperado: $315,900)
  Deals: ______ deals ganhos  (esperado: 1 deal)
  Net:   $____________  (esperado: -$22,113)

Taxa de Conversão:
  Taxa: _____%
```

### 🔍 LOGS DO CONSOLE:
**SUPER IMPORTANTE** - cole TODOS os logs, especialmente:
- `[FILTER] Quarter atual:`
- `[FILTER] Aplicando filtro:`
- `[CALC] Pipeline calculado:`
- `[CALC] Fechados no Quarter:`
- `[CALC] Ganhas - Gross:`
- `[DATA] wonAgg disponível:`
- `[CALC] Conversão do Quarter:`

```
(Cole TODOS os logs aqui)
```

#### 📊 VALORES CONFIRMADOS NO BIGQUERY:
```
Pipeline Q2 2026: 103 deals → $33,548,257 gross
Closed Won Q2 2026: 1 deal → $315,900 gross (Net: -$22,113)
```

---

## 🧪 CENÁRIO 4: FILTRO POR VENDEDOR (Alex Araujo)

### Configuração dos Filtros:
```
Quarter:  (vazio)
Vendedor: Alex Araujo  ← SELECIONE NO DROPDOWN
Ano:      Todos
Mês:      Todos
```

### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________  (deve ser $74.1M - total geral)
  
Pipeline (Período Filtrado):
  Valor: $____________  (esperado: ~$21M com 90 deals)
  Deals: ______ deals no período

Deals Fechados:
  Valor: $____________
  Deals: ______ deals ganhos

Vendedores Ativos:
  Número: ______  (deve ser 1 - apenas Alex)
```

### 🔍 LOGS DO CONSOLE:
Cole especialmente:
- `[REP FILTER] Vendedor selecionado:`
- `[REP FILTER] Dados do vendedor:`
- `[FILTER] Aplicando filtro:`

```
(Cole os logs aqui)
```

#### 📊 VALORES CONFIRMADOS NO BIGQUERY:
```
Alex Araujo Pipeline: 90 deals → $21,039,251 gross
Alex Araujo Closed Won: 7 deals
```

---

## 🧪 CENÁRIO 5: COMBINADO (Q1 + Alex Araujo)

### Configuração dos Filtros:
```
Quarter:  Q1 (Jan-Mar)
Vendedor: Alex Araujo
Ano:      2026
Mês:      (vazio)
```

### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________  (deve ser $74.1M sempre)
  
Pipeline (Período Filtrado):
  Valor: $____________  (Alex no Q1 2026)
  Deals: ______ deals no período

Deals Fechados:
  Valor: $____________
  Deals: ______ deals ganhos

Taxa de Conversão:
  Taxa: _____%

Vendedores Ativos:
  Número: ______  (deve ser 1)
```

### 🔍 LOGS DO CONSOLE:
```
(Cole os logs aqui)
```

#### 📊 DADOS DA API (já confirmados):
```
Alex Araujo + month=1: 3 closed won deals
```

---

## 🧪 CENÁRIO 6: Q3 2026 (Julho-Setembro) - TESTE DE VAZIO

### Configuração dos Filtros:
```
Quarter:  Q3 (Jul-Set)
Vendedor: Todos
Ano:      2026
Mês:      (vazio)
```

### ⚠️ EXPECTATIVA:
Provavelmente não terá dados (Q3 ainda não aconteceu em fev/2026).
Queremos ver como o dashboard se comporta com dados vazios.

### 📊 VALORES NA TELA:
```
Pipeline Total:
  Valor: $____________  (deve ser $74.1M sempre!)
  
Pipeline (Período Filtrado):
  Valor: $____________  (esperado: $0)
  Deals: ______ deals no período

Deals Fechados:
  Valor: $____________  (esperado: $0)
  Deals: ______ deals ganhos

Mensagem de estado vazio aparece? SIM / NÃO
```

### 🔍 LOGS DO CONSOLE:
```
(Cole os logs aqui)
```

---

## ⏱️ PERFORMANCE

Para CADA cenário acima, anote:

### Tempo de Carregamento:
```
Cenário 1 (Baseline): _____ segundos
Cenário 2 (Q1): _____ segundos
Cenário 3 (Q2): _____ segundos
Cenário 4 (Alex Araujo): _____ segundos
Cenário 5 (Q1 + Alex): _____ segundos
Cenário 6 (Q3): _____ segundos
```

### Loaders:
- Loader inicial (logo Xertica) aparece? SIM / NÃO
- Mini loader ao trocar filtros aparece? SIM / NÃO
- Animações suaves? SIM / NÃO
- Interface trava durante loading? SIM / NÃO

---

## 🐛 BUGS E INCONSISTÊNCIAS

### Anote qualquer comportamento estranho:

#### Valores zerados quando não deveriam:
```
(Descreva aqui)
```

#### Contadores inconsistentes:
```
Exemplo: "$315,900" mas "0 deals ganhos"
(Descreva aqui)
```

#### Erros no console:
```
(Cole erros em vermelho aqui)
```

#### Requests HTTP 422:
```
(Cole URLs que falharam)
```

#### Demora excessiva:
```
(Descreva cenários lentos)
```

---

## ✅ CHECKLIST FINAL

Após completar todos os cenários:

- [ ] Cenário 1: Baseline testado
- [ ] Cenário 2: Q1 2026 testado
- [ ] Cenário 3: Q2 2026 testado (bug conhecido)
- [ ] Cenário 4: Alex Araujo testado
- [ ] Cenário 5: Q1 + Alex testado
- [ ] Cenário 6: Q3 2026 testado
- [ ] Performance anotada
- [ ] Bugs documentados
- [ ] Console logs copiados

---

## 📤 COMO ENVIAR OS RESULTADOS

**Opção 1:** Cole tudo aqui no chat (pode ser longo, ok!)

**Opção 2:** Salve em arquivo .txt e cole por partes

**Opção 3:** Tire screenshots + console logs em texto

---

## 💡 DICAS

### Console muito poluído?
```javascript
// Cole isso no console para filtrar:
console.clear();
// Depois recarregue a página
```

### Copiar console logs:
1. Clique com botão direito no console
2. "Save as..." ou "Copy all"
3. Ou selecione os logs relevantes e Ctrl+C

### Ver requests HTTP:
- Aba "Network" do DevTools
- Filtre por "Fetch/XHR"
- Veja chamadas para `sales-intelligence-api`

---

## 🎯 PRÓXIMO PASSO

Depois que você me passar os resultados dos testes, EU vou:

1. **Analisar** todos os valores e logs
2. **Identificar** exatamente onde estão os bugs no código
3. **Documentar** os fixes necessários
4. **Implementar** correções precisas
5. **Validar** novamente com você

Bora começar? 🚀

**Comece pelo Cenário 1 (Baseline)** - é o mais importante!
