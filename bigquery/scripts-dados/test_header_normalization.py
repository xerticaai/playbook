#!/usr/bin/env python3
"""
Script para testar normalização de headers e comparar com BigQuery schema
"""
import unicodedata
import re

# Headers reais das abas
PIPELINE_HEADERS = [
    "Run ID", "Oportunidade", "Conta", "Perfil", "Produtos", "Vendedor", "Gross", "Net",
    "Fase Atual", "Forecast SF", "Fiscal Q", "Data Prevista", "Ciclo (dias)", "Dias Funil",
    "Atividades", "Atividades (Peso)", "Mix Atividades", "Idle (Dias)", "Qualidade Engajamento",
    "Forecast IA", "Confiança (%)", "Motivo Confiança", "MEDDIC Score", "MEDDIC Gaps",
    "MEDDIC Evidências", "BANT Score", "BANT Gaps", "BANT Evidências", "Justificativa IA",
    "Regras Aplicadas", "Incoerência Detectada", "Perguntas de Auditoria IA", "Flags de Risco",
    "Gaps Identificados", "Cód Ação", "Ação Sugerida", "Risco Principal", "# Total Mudanças",
    "# Mudanças Críticas", "Mudanças Close Date", "Mudanças Stage", "Mudanças Valor",
    "🚨 Anomalias Detectadas", "Velocity Predição", "Velocity Detalhes", "Território Correto?",
    "Vendedor Designado", "Estado/Cidade Detectado", "Fonte Detecção", "Calendário Faturação",
    "Valor Reconhecido Q1", "Valor Reconhecido Q2", "Valor Reconhecido Q3", "Valor Reconhecido Q4",
    "🕐 Última Atualização"
]

WON_HEADERS = [
    "Run ID", "Oportunidade", "Conta", "Perfil Cliente", "Vendedor", "Gross", "Net",
    "Portfólio", "Segmento", "Família Produto", "Status", "Fiscal Q", "Data Fechamento",
    "Ciclo (dias)", "Produtos", "📝 Resumo Análise", "🎯 Causa Raiz", "✨ Fatores Sucesso",
    "Tipo Resultado", "Qualidade Engajamento", "Gestão Oportunidade", "-", "💡 Lições Aprendidas",
    "# Atividades", "Ativ. 7d", "Ativ. 30d", "Distribuição Tipos", "Período Pico",
    "Cadência Média (dias)", "# Total Mudanças", "# Mudanças Críticas", "Mudanças Close Date",
    "Mudanças Stage", "Mudanças Valor", "Campos + Alterados", "Padrão Mudanças",
    "Freq. Mudanças", "# Editores", "🏷️ Labels", "🕐 Última Atualização"
]

LOST_HEADERS = [
    "Run ID", "Oportunidade", "Conta", "Perfil Cliente", "Vendedor", "Gross", "Net",
    "Portfólio", "Segmento", "Família Produto", "Status", "Fiscal Q", "Data Fechamento",
    "Ciclo (dias)", "Produtos", "📝 Resumo Análise", "🎯 Causa Raiz", "⚠️ Causas Secundárias",
    "Tipo Resultado", "Evitável?", "🚨 Sinais Alerta", "Momento Crítico", "💡 Lições Aprendidas",
    "# Atividades", "Ativ. 7d", "Ativ. 30d", "Distribuição Tipos", "Período Pico",
    "Cadência Média (dias)", "# Total Mudanças", "# Mudanças Críticas", "Mudanças Close Date",
    "Mudanças Stage", "Mudanças Valor", "Campos + Alterados", "Padrão Mudanças",
    "Freq. Mudanças", "# Editores", "🏷️ Labels", "🕐 Última Atualização"
]

SALES_SPEC_HEADERS = [
    "Account Name", "Perfil", "Opportunity Name", "Meses Fat.", "GTM 2026",
    "Booking Total ($)Gross", "Booking Total ($) Net", "Status", "Vendedor", "Status",
    "Billing Quarter ($)", "Billing Quarter ($)", "Closed Date"
]

def normalize_header(header: str) -> str:
    """Normaliza header seguindo a mesma lógica do Apps Script"""
    normalized = header.strip()
    
    # Caso especial: campo vazio ou só símbolos
    if not normalized or normalized in ['-', '_', '.', '#']:
        return ''
    
    # Remover emojis
    normalized = re.sub(
        r'[\U0001F300-\U0001F9FF]|[\U00002600-\U000026FF]|[\U00002700-\U000027BF]|'
        r'[\U0001F000-\U0001F6FF]|[\U0001F900-\U0001F9FF]|[\U0001FA00-\U0001FAFF]',
        '', normalized
    )
    normalized = normalized.strip()
    
    # Remover acentos
    normalized = ''.join(
        c for c in unicodedata.normalize('NFD', normalized)
        if unicodedata.category(c) != 'Mn'
    )
    
    # Remover caracteres especiais (mantém apenas letras, números, espaços, underscores e hífens)
    normalized = re.sub(r'[^a-zA-Z0-9\s_-]', '', normalized)
    
    # Substituir espaços por underscores
    normalized = re.sub(r'\s+', '_', normalized)
    
    # Remover underscores duplicados
    normalized = re.sub(r'_+', '_', normalized)
    
    # Remover underscores no início e fim
    normalized = normalized.strip('_')
    
    return normalized

def test_normalization(headers, table_name):
    """Testa normalização de headers"""
    print(f"\n{'='*80}")
    print(f"📋 {table_name}")
    print(f"{'='*80}")
    
    normalized_headers = []
    for i, header in enumerate(headers, 1):
        normalized = normalize_header(header)
        if normalized:  # Pular headers vazios
            normalized_headers.append(normalized)
            print(f"{i:2}. {header:40} → {normalized}")
        else:
            print(f"{i:2}. {header:40} → [VAZIO - SERÁ IGNORADO]")
    
    print(f"\n✅ Total de colunas: {len(normalized_headers)}")
    
    # Detectar duplicatas
    duplicates = {}
    for h in normalized_headers:
        duplicates[h] = duplicates.get(h, 0) + 1
    
    dupes = [(k, v) for k, v in duplicates.items() if v > 1]
    if dupes:
        print(f"\n⚠️  ATENÇÃO: Headers duplicados detectados:")
        for header, count in dupes:
            print(f"   - {header}: {count}x")
    
    return normalized_headers

if __name__ == "__main__":
    print("🔍 Testando normalização de headers para BigQuery\n")
    
    pipeline_normalized = test_normalization(PIPELINE_HEADERS, "🎯 Pipeline (Análise Forecast IA)")
    won_normalized = test_normalization(WON_HEADERS, "📈 Closed Deals Won (Análise Ganhas)")
    lost_normalized = test_normalization(LOST_HEADERS, "📉 Closed Deals Lost (Análise Perdidas)")
    sales_normalized = test_normalization(SALES_SPEC_HEADERS, "📊 Sales Specialist")
    
    print("\n" + "="*80)
    print("📊 RESUMO")
    print("="*80)
    print(f"Pipeline:       {len(pipeline_normalized)} colunas")
    print(f"Won:            {len(won_normalized)} colunas")
    print(f"Lost:           {len(lost_normalized)} colunas")
    print(f"Sales Spec:     {len(sales_normalized)} colunas")
    print("\n✅ Normalização testada com sucesso!")
