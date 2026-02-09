# Performance Endpoint - Índice de Performance do Vendedor (IPV)

## Visão Geral

O endpoint `/api/performance` calcula o **Índice de Performance do Vendedor (IPV)**, uma métrica de 0-100 que avalia vendedores em 3 pilares:

### Fórmula do IPV

```
IPV = Resultado (40%) + Eficiência (35%) + Comportamento (25%)
```

#### 1. Resultado (40%)
- **Deals Ganhos** (50%): Número de deals fechados (normalizado)
- **Revenue Gerado** (50%): Valor total de Gross gerado (normalizado)

#### 2. Eficiência (35%)
- **Win Rate** (60%): Percentual de vitórias vs total de deals
- **Eficiência de Ciclo** (40%): Comparação do ciclo de vendas win vs loss

#### 3. Comportamento (25%)
- **Atividades em Wins** (60%): Quantidade de atividades registradas nos deals ganhos
- **Qualidade do Processo** (40%): Inverso da % de perdas evitáveis (menos perdas evitáveis = melhor)

---

## Endpoints Disponíveis

### 1. Performance Geral
```bash
GET /api/performance
```

**Parâmetros (opcionais):**
- `year` (string): Ano fiscal (ex: "2026")
- `quarter` (string): Quarter 1-4 
- `seller` (string): Nome do vendedor ou múltiplos separados por vírgula

**Exemplo:**
```bash
curl "http://localhost:8080/api/performance?year=2026&quarter=1"
```

**Resposta:**
```json
{
  "success": true,
  "timestamp": "2026-02-08T14:45:22.157957",
  "filters": { "year": "2026", "quarter": "1", "seller": null },
  "total_vendedores": 11,
  "ranking": [
    {
      "rank": 1,
      "vendedor": "Denilson Goes",
      "ipv": 49.0,
      "resultado": 50.4,
      "eficiencia": 53.9,
      "comportamento": 40.0,
      "winRate": 23.2,
      "grossGerado": 8280.8,
      "netGerado": 993.7
    }
  ],
  "scorecard": [
    {
      "vendedor": "Denilson Goes",
      "winRate": 23.2,
      "totalGanhos": 22,
      "totalPerdas": 73,
      "cicloMedioWin": 30.0,
      "cicloMedioLoss": 234.9,
      "ticketMedio": 251942.67,
      "grossGerado": 8280.8,
      "netGerado": 993.7
    }
  ],
  "comportamento": [
    {
      "vendedor": "Denilson Goes",
      "ativMediaWin": 0,
      "ativMediaLoss": 1.5,
      "principalCausaPerda": "Má Qualificação e Abandono (Falta de Engajamento)",
      "principalFatorSucesso": "Inércia da Base Instalada e Necessidade Crítica"
    }
  ],
  "metadata": {
    "ipv_formula": "Resultado (40%) + Eficiência (35%) + Comportamento (25%)",
    "resultado": "Deals ganhos (50%) + Revenue gerado (50%)",
    "eficiencia": "Win Rate (60%) + Eficiência de Ciclo (40%)",
    "comportamento": "Atividades em Wins (60%) + Qualidade do Processo (40%)"
  }
}
```

### 2. Performance de um Vendedor Específico
```bash
GET /api/performance/seller/{seller_name}
```

**Exemplo:**
```bash
curl "http://localhost:8080/api/performance/seller/Gabriel%20Leick?year=2026&quarter=1"
```

**Resposta:**
```json
{
  "success": true,
  "vendedor": "Gabriel Leick",
  "performance": {
    "rank": 4,
    "vendedor": "Gabriel Leick",
    "ipv": 33.9,
    "resultado": 25.1,
    "eficiencia": 37.5,
    "comportamento": 43.0,
    "winRate": 5.7,
    "grossGerado": 435041.04,
    "netGerado": -7816.08
  },
  "scorecard": {
    "vendedor": "Gabriel Leick",
    "winRate": 5.7,
    "totalGanhos": 2,
    "totalPerdas": 33,
    "cicloMedioWin": 101.0,
    "cicloMedioLoss": 156.1,
    "ticketMedio": 661525.85,
    "grossGerado": 435041.04,
    "netGerado": -7816.08
  },
  "comportamento": {
    "vendedor": "Gabriel Leick",
    "ativMediaWin": 2.5,
    "ativMediaLoss": 2.8,
    "principalCausaPerda": "Má Qualificação e Abandono do Deal",
    "principalFatorSucesso": "Conformidade Legal (Status de Parceiro Autorizado)"
  },
  "filters": {
    "year": "2026",
    "quarter": "1",
    "seller": "Gabriel Leick"
  }
}
```

---

## Exemplos de Uso

### Filtrar por Ano
```bash
curl "http://localhost:8080/api/performance?year=2026"
```

### Filtrar por Quarter
```bash
curl "http://localhost:8080/api/performance?year=2026&quarter=2"
```

### Filtrar por Vendedor
```bash
curl "http://localhost:8080/api/performance?seller=Alex%20Araujo"
```

### Múltiplos Vendedores
```bash
curl "http://localhost:8080/api/performance?seller=Alex%20Araujo,Carlos%20Moll"
```

### Todos os Vendedores (sem filtros)
```bash
curl "http://localhost:8080/api/performance"
```

---

## Integração com Frontend

### JavaScript (Fetch API)
```javascript
// Carregar performance de Q1 2026
async function loadPerformance() {
  const response = await fetch('/api/performance?year=2026&quarter=1');
  const data = await response.json();
  
  // Renderizar ranking IPV
  const ranking = data.ranking;
  ranking.forEach((seller, idx) => {
    console.log(`#${idx+1} ${seller.vendedor}: IPV=${seller.ipv}`);
  });
  
  // Renderizar scorecard
  const scorecard = data.scorecard;
  // ... renderizar tabelas
  
  // Renderizar comportamento
  const comportamento = data.comportamento;
  // ... renderizar diagnóstico
}
```

### Atualizar o HTML Existente

O endpoint já retorna os dados no formato esperado pela estrutura HTML existente em `public/index.html`:

**Tabelas a atualizar:**
- `#fsr-ipv-table` - Ranking IPV
- `#fsr-performance-active-body` - Scorecard de Performance
- `#fsr-behavior-active-body` - Diagnóstico de Comportamento

---

## Notas Técnicas

### Fonte de Dados
- **Tabela de Vitórias**: `operaciones-br.sales_intelligence.closed_deals_won`
- **Tabela de Perdas**: `operaciones-br.sales_intelligence.closed_deals_lost`
- **Pipeline Ativo**: `operaciones-br.sales_intelligence.pipeline`

### Normalização
- Os scores de **Resultado** são normalizados relativamente entre todos os vendedores retornados
- Vendedor com mais deals ganhos = 100 pontos em deals
- Vendedor com mais revenue = 100 pontos em revenue

### Valores Default
- Vendedores sem wins nem losses: IPV mínimo = 10
- Comportamento base = 40 pontos (sem dados de atividades)

---

## Status HTTP

- `200 OK` - Sucesso
- `404 Not Found` - Vendedor não encontrado (endpoint individual)
- `500 Internal Server Error` - Erro no cálculo ou no BigQuery

---

## Changelog

**v1.0.0** (2026-02-08)
- ✅ Endpoint `/api/performance` criado
- ✅ Endpoint `/api/performance/seller/{name}` criado
- ✅ Cálculo de IPV implementado (3 pilares)
- ✅ Filtros por year, quarter, seller
- ✅ Integração com BigQuery
- ✅ Dados de ranking, scorecard e comportamento
