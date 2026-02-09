# 🔥 RAG EM AÇÃO: COMO A BUSCA VETORIAL POTENCIALIZA VENDAS

## 🎯 O QUE É O RAG (PARA NÃO-TÉCNICOS)

**RAG = Retrieval-Augmented Generation**

Pense no RAG como um "Google semântico" para seus deals:

**Google tradicional:**
- Busca por palavras-chave exatas
- "notebook Dell" encontra só se tiver "notebook" E "Dell"

**RAG (busca vetorial):**
- Busca por **significado** e **contexto**
- "notebook Dell" encontra também: "laptop corporativo marca Dell", "máquinas portáteis linha enterprise", etc.
- **Entende sinônimos, contexto e similaridade**

---

## 📊 NOSSA IMPLEMENTAÇÃO: `deal_embeddings`

### **O QUE TEMOS:**
- **2848 deals** (pipeline + ganhos + perdas)
- **768 dimensões** por deal (vetor Vertex AI)
- **Campo `content`:** Texto rico com história do deal

**Exemplo de `content` de um deal ganho:**
```
Deal GANHO: Migração Google Workspace para 500 usuários | 
Cliente: Banco ABC | 
Vendedor: Alex Araujo | 
Valor: R$ 500.000 | 
Ciclo: 45 dias | 
Fatores de Sucesso: POC técnico bem-sucedido, urgência fiscal, 
  champion forte na área de TI | 
Causa Raiz: Contrato atual expirando em 30 dias, necessidade 
  compliance LGPD | 
Lições Aprendidas: Follow-up semanal com C-level manteve deal 
  vivo durante aprovação legal. Envolver jurídico cedo foi crucial.
```

### **COMO FUNCIONA:**
1. **Embedding (Conversão):**
   - Texto → Vertex AI → Vetor de 768 números
   - Exemplo: `[0.23, -0.15, 0.87, ...]` (768 números)
   - **Números capturam significado semântico**

2. **Similaridade (Busca):**
   - Comparar vetores usando **cosseno**
   - Score 0-1 (0=diferente, 1=idêntico)
   - Exemplo: Deal X (pipeline) vs. Deals históricos → similaridade 0.87

3. **Ranking:**
   - Retornar top 5 deals mais similares
   - Usar como **contexto** para IA ou gerente

---

## 🎬 CASOS DE USO REAIS

### **Caso 1: Preparando 1:1 com Vendedor**

**Cenário:**
- Gerente vai fazer 1:1 com Alex
- Deal X: R$500k, parado há 60 dias, sem atividades

**SEM RAG:**
```
Gerente: "Alex, cadê o deal da IBM?"
Alex: "Tá no jurídico deles, aguardando aprovação."
Gerente: "Hmm, ok. E quando fecha?"
Alex: "Talvez Q2..."
[Gerente não tem dados para contestar]
```

**COM RAG:**
```
[Sistema busca: deals similares de Alex que fecharam ou perderam]

Resultado RAG:
1. Deal Similar Ganho (similarity 0.91):
   "IBM Watson 2025 | R$480k | Ciclo: 52 dias | 
    Lição: Após 45 dias parado no jurídico, agendamos reunião 
    direta com CFO que desbloqueou assinatura em 1 semana"

2. Deal Similar Perdido (similarity 0.85):
   "IBM Cloud 2024 | R$520k | Ciclo: 180 dias | 
    Perdido por: Deal ficou >90 dias no jurídico sem nossa ação. 
    Cliente comprou do concorrente que foi mais proativo."

Gerente: "Alex, vejo que você já ganhou um deal similar há 1 ano 
         com a IBM. O que desbloqueou na época foi reunião com CFO. 
         Você agendou essa reunião para o deal atual?"
Alex: "Não ainda, mas vou agendar agora."
Gerente: "Ótimo. Lembre-se que no deal de 2024 você perdeu após 
         180 dias de inação. Este deal já está há 60 dias parado. 
         Prazo: sexta para ter reunião agendada ou matamos o deal."
```

**Resultado:**
- ✅ Conversa baseada em DADOS, não em "achismos"
- ✅ Referência a padrões históricos
- ✅ Ação concreta com prazo

---

### **Caso 2: Identificando Padrões de Perda**

**Cenário:**
- 3 deals grandes (>R$500k) perdidos no Q1
- CEO pergunta: "Por que estamos perdendo deals grandes?"

**SEM RAG:**
```
Sales Ops manualmente:
1. Abre 3 Salesforce records
2. Lê notas de cada deal (30 min)
3. Tenta achar padrão (subjetivo)
4. Relatório: "Parece que preço foi um problema..."
[Análise fraca, não conclusiva]
```

**COM RAG:**
```
Query: "Buscar deals perdidos >R$500k em Q1 2026"

RAG retorna:
1. Deal A: "Perdido por Budget Cut em dezembro - CFO cortou 40% 
            do orçamento de TI após revisão fiscal"
2. Deal B: "Perdido por Timing - Cliente decidiu adiar compra 
            para Q2 após mudança de CEO"
3. Deal C: "Perdido por Budget Cut - Reestruturação eliminou 
            departamento comprador"

Padrão identificado: 2 de 3 deals = Budget Cut em dezembro/janeiro

Insight: "Deals grandes (>R$500k) têm 66% de chance de perda 
         se chegarem em dezembro sem estar fechados. 
         Recomendação: Acelerar fechamento de deals grandes 
         para antes de novembro para evitar Budget Freeze."

Gemini (usando RAG como contexto):
"ALERTA: Q4 2026 tem 5 deals >R$500k previstos para fechar em 
dezembro. Baseado em padrão histórico, 3 deles podem ser perdidos 
por Budget Cut. AÇÃO: Antecipar fechamento para outubro/novembro 
oferecendo desconto de early commitment de 5%."
```

**Resultado:**
- ✅ Padrão identificado objetivamente
- ✅ Recomendação acionável
- ✅ Prevenção proativa de perdas futuras

---

### **Caso 3: Coaching de Vendedor em Ramp-Up**

**Cenário:**
- Maria é vendedora nova (3 meses)
- Tem deal X similar a deals que outros já fecharam
- Ela não sabe qual estratégia usar

**SEM RAG:**
```
Maria: "Gerente, como eu fecho este deal de Google Workspace?"
Gerente: "Bem, normalmente você precisa fazer um POC técnico..."
[Resposta genérica, sem contexto específico deste cliente]
```

**COM RAG:**
```
[Sistema busca: deals similares que outros vendedores ganharam]

RAG retorna:
1. Alex Araujo - Deal Similar Ganho (similarity 0.89):
   "Google Workspace 500 users | R$450k | 
    Estratégia vencedora: 
    - Semana 1-2: POC técnico com time de TI (3 usuários piloto)
    - Semana 3: Workshop de migração com equipe do cliente
    - Semana 4: Reunião com CFO mostrando ROI (custo atual vs novo)
    - Semana 5: Proposta formal aprovada
    Lição: Champion no time de TI abriu portas para CFO. 
           Foco em compliance LGPD foi decisivo."

Gerente (usando contexto RAG):
"Maria, veja este deal que o Alex fechou. É praticamente idêntico 
ao seu. Ele usou esta estratégia de 5 semanas. Sugiro você seguir 
o mesmo playbook: POC técnico → Workshop → Reunião CFO. 
Quer que eu peça pro Alex fazer uma sessão de mentoria com você?"

Maria: "Perfeito! Vou agendar o POC amanhã seguindo o roteiro dele."
```

**Resultado:**
- ✅ Transferência de conhecimento automatizada
- ✅ Playbook concreto baseado em sucesso real
- ✅ Ramp-up acelerado de novos vendedores

---

## 🛠️ IMPLEMENTAÇÃO TÉCNICA (SIMPLIFICADA)

### **Query RAG Básica:**
```sql
-- Encontrar deals similares a um deal específico

WITH target_deal AS (
  -- Pegar embedding do deal que queremos comparar
  SELECT embedding
  FROM deal_embeddings
  WHERE Oportunidade = 'Deal X'
)

SELECT 
  Oportunidade,
  source,  -- pipeline | won | lost
  Conta,
  Vendedor,
  Gross,
  SUBSTR(content, 1, 300) as snippet,  -- Primeiros 300 chars
  
  -- Calcular similaridade cosseno
  (SELECT 
     SUM(a * b) / (SQRT(SUM(a*a)) * SQRT(SUM(b*b)))
   FROM UNNEST(embedding) a WITH OFFSET i
   JOIN UNNEST((SELECT embedding FROM target_deal)) b WITH OFFSET j
   ON i = j
  ) as similarity

FROM deal_embeddings
WHERE source IN ('won', 'lost')  -- Apenas histórico
  AND Vendedor = 'Alex Araujo'   -- Mesmo vendedor (opcional)
ORDER BY similarity DESC
LIMIT 5;
```

**Output:**
```
| Oportunidade      | similarity | snippet                          |
|-------------------|------------|----------------------------------|
| IBM Watson 2025   | 0.91       | Deal GANHO: IBM Watson...        |
| Google Cloud 2024 | 0.87       | Deal GANHO: Google Cloud...      |
| IBM Cloud 2024    | 0.85       | Deal PERDIDO: IBM Cloud...       |
| AWS Migration     | 0.82       | Deal GANHO: AWS Migration...     |
| Azure Enterprise  | 0.78       | Deal PERDIDO: Azure Enterprise...|
```

---

## 🎯 PERGUNTAS DE SABATINA GERADAS COM RAG

### **Como funciona:**
1. **Sistema identifica flags de risco** (regras determinísticas)
2. **RAG busca contexto histórico** (deals similares)
3. **IA gera perguntas específicas** (Gemini + contexto RAG)

### **Exemplo:**

**Deal Atual:**
- Oportunidade: "Google Workspace Enterprise"
- Valor: R$500k
- Dias no funil: 65
- Atividades: 0 (últimos 30 dias)
- Flag: SEM_ATIVIDADE

**RAG Context (histórico vendedor):**
- 2 deals similares PERDIDOS após >90 dias sem atividade
- 1 deal similar GANHO que foi recuperado com reunião urgente CEO

**Perguntas Geradas:**
```
❌ ATIVIDADE ZERO
Este deal está há 65 dias sem atividades. 
Histórico mostra que após 90 dias, chance de conversão cai 60%.
Perguntas:
- Qual é a data da próxima reunião AGENDADA (não "vou agendar")?
- O cliente está respondendo emails/ligações?
- Se não, este deal deveria ser marcado como PERDIDO?

📊 COMPARAÇÃO HISTÓRICA
Você perdeu 2 deals similares (Google Suite 2024, Google Cloud 2025) 
após deixá-los >90 dias parados.
Mas em 2023, você recuperou um deal similar agendando reunião 
urgente com CFO que desbloqueou em 1 semana.
Perguntas:
- Por que você não está aplicando a mesma estratégia de 2023?
- Qual é o bloqueio REAL deste deal?
- Você tentou escalar para C-level do cliente?

⚠️ AÇÃO IMEDIATA
Com base no padrão histórico:
- OPÇÃO 1: Agendar reunião urgente CFO/CEO até sexta
- OPÇÃO 2: Marcar deal como PERDIDO e focar em outros
Qual das duas você vai fazer?
```

**Resultado:**
- ✅ Perguntas impossíveis de "enrolar"
- ✅ Referência a padrões reais do vendedor
- ✅ Forçar decisão: KILL or COMMIT

---

## 💡 BOAS PRÁTICAS: USANDO RAG NA PRÁTICA

### **DO's (Faça):**

✅ **1. Use RAG para contextualizar conversas 1:1**
```
Antes: "Cadê o deal X?"
Depois: "Vejo que você já ganhou 3 deals similares. 
        O que foi diferente desta vez que está travado?"
```

✅ **2. Mostre contexto RAG para o vendedor**
```
"Olha só, você fechou um deal parecido em 45 dias no ano passado.
Vamos olhar o histórico juntos e ver o que funcionou."
[Abrir Pauta Semanal → Seção "Contexto RAG" → Ler junto]
```

✅ **3. Use RAG para treinar novos vendedores**
```
"Maria, você é nova. Estes 5 deals aqui são similares ao seu.
Analise o que os veteranos fizeram e replique a estratégia."
```

✅ **4. Identifique padrões sistêmicos**
```
Query RAG: "Deals perdidos por Budget Cut nos últimos 12 meses"
→ Padrão: 80% acontecem em dezembro/janeiro
→ Ação: Política de não deixar deals >R$500k para dezembro
```

✅ **5. Crie playbooks baseados em RAG**
```
1. Rodar query RAG: "Deals ganhos de Google Workspace"
2. Extrair padrões comuns (POC técnico, reunião CFO, etc.)
3. Documentar em Wiki: "Playbook Google Workspace"
4. Vendedores seguem playbook validado
```

### **DON'Ts (Não faça):**

❌ **1. NÃO ignore contexto RAG**
```
Vendedor: "Este deal é diferente, não dá pra comparar..."
Gerente: "Não. O RAG mostra 87% de similaridade. Por que você acha 
         que é diferente? Seja específico."
```

❌ **2. NÃO use RAG apenas para dashboards**
```
RAG não é "feature bacana de IA" para impressionar CEO.
É ferramenta de EXECUÇÃO diária em 1:1s.
```

❌ **3. NÃO confie 100% em RAG sem validar**
```
RAG pode retornar false positives (deals "similares" mas não são).
Sempre revisar top 3 resultados e confirmar relevância.
```

❌ **4. NÃO faça queries RAG muito genéricas**
```
Ruim: "Buscar deals de tecnologia"
Bom: "Buscar deals de Google Workspace >R$400k fechados por 
      Alex Araujo com ciclo <60 dias"
```

❌ **5. NÃO substitua análise humana por RAG**
```
RAG fornece CONTEXTO.
Decisão final (matar deal, escalar, etc.) é do gerente.
```

---

## 📊 MÉTRICAS DE SUCESSO DO RAG

### **Como medir se RAG está funcionando:**

| Métrica | Baseline (Sem RAG) | Target (Com RAG) |
|---------|-------------------|------------------|
| **Tempo de prep 1:1** | 30 min/vendedor | 10 min/vendedor |
| **Qualidade de perguntas** | Genéricas | Específicas+contexto |
| **Transferência conhecimento** | Ad-hoc (verbal) | Automatizada (RAG) |
| **Deals zumbis identificados** | ~60% (manual) | 100% (automatizado) |
| **Padrões de perda encontrados** | 1-2 por quarter | 5-10 por quarter |
| **Ramp-up novos vendedores** | 6 meses | 3 meses |

### **Como coletar feedback:**
```sql
-- Query: Quantas vezes RAG foi usado na semana?
SELECT 
  DATE_TRUNC(timestamp, WEEK) as semana,
  COUNT(*) as queries_rag,
  COUNT(DISTINCT user_id) as usuarios_unicos
FROM api_logs
WHERE endpoint = '/api/weekly-agenda'
  AND rag_results_count > 0
GROUP BY semana
ORDER BY semana DESC;
```

---

## 🚀 EVOLUÇÕES FUTURAS DO RAG

### **V1 (Atual):**
- ✅ Busca por similaridade de deal
- ✅ Retorna top 5 históricos
- ✅ Contexto manual (gerente lê)

### **V2 (Q2 2026):**
- 🔲 **Auto-summarization:** Gemini resume padrões de top 5 deals
- 🔲 **Perguntas dinâmicas:** IA gera perguntas baseadas em RAG context
- 🔲 **Notificações:** Alert quando deal atual diverge de padrão histórico

### **V3 (Q3 2026):**
- 🔲 **RAG multimodal:** Incluir transcrições de reuniões (Speech-to-Text)
- 🔲 **RAG de emails:** Análise de sentimento de comunicações cliente
- 🔲 **RAG preditivo:** "Próximos 3 passos sugeridos baseados em deals similares"

---

## 🎓 RECURSOS ADICIONAIS

### **Documentação Técnica:**
- [setup_rag_embeddings.sql](../bigquery/setup_rag_embeddings.sql)
- [insights_rag.py](../cloud-run/app/api/endpoints/insights_rag.py)

### **Papers e Referências:**
- [RAG: Retrieval-Augmented Generation (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401)
- [Vertex AI Text Embeddings](https://cloud.google.com/vertex-ai/docs/generative-ai/embeddings/get-text-embeddings)

### **Vídeos Internos:**
- "RAG 101: Como funciona" (15 min)
- "Usando RAG em 1:1s" (Demo 20 min)

---

## 💬 PERGUNTAS FREQUENTES

**P: RAG substitui análise humana?**  
R: Não. RAG fornece CONTEXTO rico para decisões mais informadas. Decisão final é sempre do gerente/vendedor.

**P: RAG funciona para vendedores novos sem histórico?**  
R: Sim. Pode buscar deals similares de OUTROS vendedores (não apenas do vendedor atual).

**P: E se RAG retornar deals irrelevantes?**  
R: Sempre revisar top 3 resultados. Se forem irrelevantes, ajustar query (adicionar filtros).

**P: Qual a latência de uma query RAG?**  
R: ~1-2 segundos (BigQuery + busca vetorial). Aceitável para uso em dashboards.

**P: Posso usar RAG fora de 1:1s?**  
R: Sim! Use para: training, playbooks, análise de padrões, forecasting, etc.

---

**Última atualização:** 2026-02-08  
**Versão:** 1.0  
**Mantido por:** Time de Sales Ops Xertica.ai  
**Feedback:** #sales-intelligence-rag
