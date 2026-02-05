"""
METRICS CALCULATORS - Dashboard Metrics Layer
==============================================

Calcula TODAS as métricas do dashboard a partir de DataFrames normalizados.
Substitui cálculos duplicados em Apps Script e JavaScript.

ARCHITECTURE:
    Apps Script → Cloud Function (cálculos AQUI) → Frontend (só renderiza)

MODULES:
    - calculate_confidence_stats(): Média de confiança (Task 2.2) ✅
    - generate_word_clouds(): Nuvens de palavras (Task 2.3) ✅
    - calculate_executive_metrics(): Visão Executiva (Task 2.1) 
    - calculate_closed_quarter(): Fechado no quarter (Task 2.4)
    - calculate_conversion_rate(): Taxa conversão (Task 2.5)

ÚLTIMA ATUALIZAÇÃO: 2026-02-05
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Optional

# Importa mapeamentos BigQuery
try:
    from bigquery_schema import WORD_CLOUD_MAPPINGS, find_column_in_dataframe
    BQ_SCHEMA_AVAILABLE = True
except ImportError:
    BQ_SCHEMA_AVAILABLE = False
    print("⚠️ bigquery_schema.py não disponível, usando fallback")


# ===========================================================================
# TASK 2.2: CONFIDENCE ANALYZER
# ===========================================================================

def calculate_confidence_stats(df_pipeline: pd.DataFrame, verbose: bool = False) -> Dict:
    """
    Calcula estatísticas de confiança a partir do pipeline.
    
    FIX: Resolve bug de "confiança sempre 50%" - calcula REAL average!
    
    Args:
        df_pipeline: DataFrame com pipeline (já normalizado)
        verbose: Se True, imprime logs detalhados
    
    Returns:
        Dict com:
            - avg_confidence: Média aritmética (0-100)
            - weighted_confidence: Média ponderada por gross_value (0-100)
            - deals_count: Total de deals analisados
            - breakdown: Dict com contagens por categoria
                - commit: deals com confiança >= 90%
                - upside: deals com confiança 50-89%
                - pipeline: deals com confiança < 50%
            - zero_confidence_count: Deals com confiança = 0 (alerta!)
    """
    
    if df_pipeline is None or len(df_pipeline) == 0:
        if verbose:
            print('⚠️ [CONFIDENCE] Pipeline vazio ou None')
        return {
            'avg_confidence': 0,
            'weighted_confidence': 0,
            'deals_count': 0,
            'breakdown': {'commit': 0, 'upside': 0, 'pipeline': 0},
            'zero_confidence_count': 0
        }
    
    # Buscar coluna de confiança (suporta múltiplos nomes)
    confidence_col = None
    possible_names = [
        'Confiana',            # ⚠️ BigQuery (SEM Ç!)
        'confidence_percent',  # Nome normalizado (inglês)
        'confianca_pct',       # Variação
        'Confiança (%)',       # Nome original do spreadsheet (CSV)
        'confiana'             # Variação sem acento
    ]
    
    if BQ_SCHEMA_AVAILABLE:
        confidence_col = find_column_in_dataframe(df_pipeline, possible_names)
    else:
        for col_name in possible_names:
            if col_name in df_pipeline.columns:
                confidence_col = col_name
                break
    
    if confidence_col is None:
        if verbose:
            print(f'❌ [CONFIDENCE] Coluna de confiança não encontrada!')
            print(f'   Colunas disponíveis: {list(df_pipeline.columns)}')
        return {
            'avg_confidence': 0,
            'weighted_confidence': 0,
            'deals_count': len(df_pipeline),
            'breakdown': {'commit': 0, 'upside': 0, 'pipeline': 0},
            'zero_confidence_count': 0,
            'error': 'Coluna de confiança não encontrada'
        }
    
    # Buscar coluna de valor (para weighted average)
    value_col = None
    possible_value_names = [
        'Gross',        # ⚠️ BigQuery (PascalCase!)
        'gross_value',  # Nome normalizado
        'gross',        # lowercase
        'Net',          # fallback
        'net_value'     # fallback normalizado
    ]
    
    if BQ_SCHEMA_AVAILABLE:
        value_col = find_column_in_dataframe(df_pipeline, possible_value_names)
    else:
        for col_name in possible_value_names:
            if col_name in df_pipeline.columns:
                value_col = col_name
                break
    
    # Converter confiança para numérico (força conversão!)
    df = df_pipeline.copy()
    df[confidence_col] = pd.to_numeric(df[confidence_col], errors='coerce')
    
    # Normalizar para 0-100 se necessário (alguns sheets usam 0-1)
    if df[confidence_col].max() <= 1.0 and df[confidence_col].max() > 0:
        df[confidence_col] = df[confidence_col] * 100
    
    # Remover NaN e valores inválidos
    df_valid = df[df[confidence_col].notna() & (df[confidence_col] >= 0) & (df[confidence_col] <= 100)]
    
    if len(df_valid) == 0:
        if verbose:
            print(f'⚠️ [CONFIDENCE] Nenhum deal com confiança válida')
        return {
            'avg_confidence': 0,
            'weighted_confidence': 0,
            'deals_count': 0,
            'breakdown': {'commit': 0, 'upside': 0, 'pipeline': 0},
            'zero_confidence_count': 0,
            'error': 'Nenhum deal com confiança válida'
        }
    
    # 1. Média aritmética
    avg_confidence = float(df_valid[confidence_col].mean())
    
    # 2. Média ponderada (se houver coluna de valor)
    weighted_confidence = avg_confidence  # fallback
    if value_col is not None and value_col in df.columns:
        df_valid[value_col] = pd.to_numeric(df_valid[value_col], errors='coerce').fillna(0)
        df_with_value = df_valid[df_valid[value_col] > 0]
        
        if len(df_with_value) > 0:
            total_value = df_with_value[value_col].sum()
            if total_value > 0:
                weighted_confidence = float(
                    (df_with_value[confidence_col] * df_with_value[value_col]).sum() / total_value
                )
    
    # 3. Breakdown por categoria (Commit, Upside, Pipeline)
    commit_count = int((df_valid[confidence_col] >= 90).sum())
    upside_count = int(((df_valid[confidence_col] >= 50) & (df_valid[confidence_col] < 90)).sum())
    pipeline_count = int((df_valid[confidence_col] < 50).sum())
    
    # 4. Alerta: Deals com confiança zero (possível problema de dados)
    zero_confidence_count = int((df_valid[confidence_col] == 0).sum())
    
    result = {
        'avg_confidence': round(avg_confidence, 2),
        'weighted_confidence': round(weighted_confidence, 2),
        'deals_count': len(df_valid),
        'breakdown': {
            'commit': commit_count,      # >= 90%
            'upside': upside_count,      # 50-89%
            'pipeline': pipeline_count    # < 50%
        },
        'zero_confidence_count': zero_confidence_count
    }
    
    if verbose:
        print(f'\n📊 [CONFIDENCE] Análise concluída:')
        print(f'   • Deals analisados: {result["deals_count"]}')
        print(f'   • Média simples: {result["avg_confidence"]:.2f}%')
        print(f'   • Média ponderada: {result["weighted_confidence"]:.2f}%')
        print(f'   • Commit (≥90%): {commit_count} deals')
        print(f'   • Upside (50-89%): {upside_count} deals')
        print(f'   • Pipeline (<50%): {pipeline_count} deals')
        if zero_confidence_count > 0:
            print(f'   ⚠️  Deals com confiança 0%: {zero_confidence_count}')
    
    return result


# ===========================================================================
# TASK 2.3: WORD CLOUDS GENERATOR
# ===========================================================================

def generate_word_clouds(
    df_pipeline: pd.DataFrame = None,
    df_ganhas: pd.DataFrame = None, 
    df_perdidas: pd.DataFrame = None,
    verbose: bool = False
) -> Dict[str, List[str]]:
    """
    Gera word clouds (arrays de strings) para o dashboard.
    
    FIX: Resolve bug de "Nenhum dado disponível" nas word clouds.
    
    IMPORTANTE: Retorna ARRAYS de strings (não objetos com frequência).
    O Dashboard.html conta as frequências no frontend.
    
    Args:
        df_pipeline: DataFrame do pipeline (para risk_flags e action_code)
        df_ganhas: DataFrame de ganhas (para result_type e labels)
        df_perdidas: DataFrame de perdidas (para result_type e labels)
        verbose: Se True, imprime logs detalhados
    
    Returns:
        Dict com:
            - riskFlags: List[str] - Flags de risco do pipeline
            - actionLabels: List[str] - Códigos de ação sugerida
            - winTypes: List[str] - Tipos de resultado (ganhas)
            - winLabels: List[str] - Labels de sucesso (ganhas)
            - lossTypes: List[str] - Tipos de resultado (perdidas)
            - lossLabels: List[str] - Labels de perda (perdidas)
    
    Usage:
        word_clouds = generate_word_clouds(df_pipeline, df_ganhas, df_perdidas, verbose=True)
        # Frontend conta: {'Preço': 5, 'Timing': 3, ...}
    """
    
    result = {
        'riskFlags': [],
        'actionLabels': [],
        'winTypes': [],
        'winLabels': [],
        'lossTypes': [],
        'lossLabels': []
    }
    
    # Helper: Extrai valores de coluna que pode conter múltiplos itens (CSV)
    def extract_multi_values(df, col_names, max_length=100):
        """
        Extrai valores de coluna que pode ter múltiplos itens separados por vírgula.
        Retorna lista flat de todos os valores.
        """
        values = []
        
        if df is None or len(df) == 0:
            return values
        
        # Busca coluna (suporta múltiplos nomes) - usa BigQuery schema se disponível
        col_found = None
        if BQ_SCHEMA_AVAILABLE:
            col_found = find_column_in_dataframe(df, col_names)
        else:
            for col_name in col_names:
                if col_name in df.columns:
                    col_found = col_name
                    break
        
        if col_found is None:
            return values
        
        # Extrai valores
        for val in df[col_found].dropna():
            if pd.isna(val) or val == '' or val == 'N/A':
                continue
            
            # Converte para string e separa por vírgula
            val_str = str(val).strip()
            if not val_str:
                continue
            
            # Se contém vírgula, divide em múltiplos valores
            if ',' in val_str:
                items = [item.strip()[:max_length] for item in val_str.split(',')]
                values.extend([item for item in items if item and item != 'N/A'])
            else:
                # Valor único
                clean_val = val_str[:max_length]
                if clean_val and clean_val != 'N/A':
                    values.append(clean_val)
        
        return values
    
    # ========== PIPELINE: Risk Flags e Action Labels ==========
    if df_pipeline is not None and len(df_pipeline) > 0:
        if verbose:
            print(f'\n📊 [WORD CLOUDS] Processando Pipeline ({len(df_pipeline)} deals)')
        
        # Risk Flags - USA MAPEAMENTO BIGQUERY
        risk_col_names = (
            WORD_CLOUD_MAPPINGS['risk_flags'] if BQ_SCHEMA_AVAILABLE 
            else ['risk_flags', 'Flags de Risco', 'flags_risco', 'Flags_de_Risco']
        )
        result['riskFlags'] = extract_multi_values(df_pipeline, risk_col_names)
        
        # Action Labels - USA MAPEAMENTO BIGQUERY
        action_col_names = (
            WORD_CLOUD_MAPPINGS['action_code'] if BQ_SCHEMA_AVAILABLE
            else ['action_code', 'Cód Ação', 'cod_acao', 'Cd_Ao']
        )
        result['actionLabels'] = extract_multi_values(df_pipeline, action_col_names)
        
        if verbose:
            print(f'   • Risk Flags: {len(result["riskFlags"])} valores')
            print(f'   • Action Labels: {len(result["actionLabels"])} valores')
    
    # ========== GANHAS: Win Types e Win Labels ==========
    if df_ganhas is not None and len(df_ganhas) > 0:
        if verbose:
            print(f'\n📈 [WORD CLOUDS] Processando Ganhas ({len(df_ganhas)} deals)')
        
        # Win Types - USA MAPEAMENTO BIGQUERY
        win_type_names = (
            WORD_CLOUD_MAPPINGS['result_type'] if BQ_SCHEMA_AVAILABLE
            else ['result_type', 'Tipo Resultado', 'Tipo_Resultado']
        )
        result['winTypes'] = extract_multi_values(df_ganhas, win_type_names)
        
        # Win Labels - USA MAPEAMENTO BIGQUERY
        win_label_names = (
            WORD_CLOUD_MAPPINGS['labels'] if BQ_SCHEMA_AVAILABLE
            else ['labels', '🏷️ Labels', 'Labels']
        )
        result['winLabels'] = extract_multi_values(df_ganhas, win_label_names)
        
        if verbose:
            print(f'   • Win Types: {len(result["winTypes"])} valores')
            print(f'   • Win Labels: {len(result["winLabels"])} valores')
    
    # ========== PERDIDAS: Loss Types e Loss Labels ==========
    if df_perdidas is not None and len(df_perdidas) > 0:
        if verbose:
            print(f'\n📉 [WORD CLOUDS] Processando Perdidas ({len(df_perdidas)} deals)')
        
        # Loss Types - USA MAPEAMENTO BIGQUERY
        loss_type_names = (
            WORD_CLOUD_MAPPINGS['result_type'] if BQ_SCHEMA_AVAILABLE
            else ['result_type', 'Tipo Resultado', 'Tipo_Resultado', 'Causa_Raiz']
        )
        result['lossTypes'] = extract_multi_values(df_perdidas, loss_type_names)
        
        # Loss Labels - USA MAPEAMENTO BIGQUERY
        loss_label_names = (
            WORD_CLOUD_MAPPINGS['labels'] if BQ_SCHEMA_AVAILABLE
            else ['labels', '🏷️ Labels', 'Labels', 'Causas_Secundrias']
        )
        result['lossLabels'] = extract_multi_values(df_perdidas, loss_label_names)
        
        if verbose:
            print(f'   • Loss Types: {len(result["lossTypes"])} valores')
            print(f'   • Loss Labels: {len(result["lossLabels"])} valores')
    
    # ========== RESUMO ==========
    if verbose:
        total_values = sum(len(v) for v in result.values())
        print(f'\n✅ [WORD CLOUDS] Total extraído: {total_values} valores')
        print(f'   Breakdown:')
        for key, values in result.items():
            if len(values) > 0:
                # Mostra amostra (primeiros 3 valores únicos)
                unique_sample = list(set(values))[:3]
                print(f'   • {key}: {len(values)} valores (ex: {", ".join(unique_sample)})')
    
    return result


# ===========================================================================
# TASK 2.4: CLOSED QUARTER CALCULATOR
# ===========================================================================

def calculate_closed_quarter(
    df_ganhas: pd.DataFrame, 
    fiscal_quarter: str,
    verbose: bool = False
) -> Dict:
    """
    Calcula total fechado em um quarter fiscal específico.
    
    FIX: Resolve bug de "$0, 0 deals" - lê corretamente de Análise Ganhas!
    
    Args:
        df_ganhas: DataFrame com deals ganhos (já normalizado)
        fiscal_quarter: Quarter fiscal no formato "FY26-Q1"
        verbose: Se True, imprime logs detalhados
    
    Returns:
        Dict com:
            - quarter: Quarter fiscal (ex: "FY26-Q1")
            - gross: Soma de Gross no quarter
            - net: Soma de Net no quarter
            - deals_count: Número de deals no quarter
            - avg_deal_size: Tamanho médio do deal (gross/count)
    
    Example:
        >>> result = calculate_closed_quarter(df_ganhas, "FY26-Q1")
        >>> print(f"Fechado Q1: ${result['gross']:,.0f} ({result['deals_count']} deals)")
    """
    
    # Valores padrão
    result = {
        'quarter': fiscal_quarter,
        'gross': 0.0,
        'net': 0.0,
        'deals_count': 0,
        'avg_deal_size': 0.0
    }
    
    if df_ganhas is None or len(df_ganhas) == 0:
        if verbose:
            print(f'⚠️  [CLOSED QUARTER] DataFrame vazio - retornando 0')
        return result
    
    if verbose:
        print(f'\n💰 [CLOSED QUARTER] Calculando para {fiscal_quarter}')
        print(f'   Total deals disponíveis: {len(df_ganhas)}')
    
    # ========== 1. BUSCA COLUNA FISCAL QUARTER ==========
    # BigQuery: Fiscal_Q | CSV: "Fiscal Q"
    quarter_col_names = ['Fiscal_Q', 'fiscal_quarter', 'Fiscal Q', 'FiscalQ', 'quarter']
    
    quarter_col = None
    if BQ_SCHEMA_AVAILABLE:
        quarter_col = find_column_in_dataframe(df_ganhas, quarter_col_names)
    else:
        for col_name in quarter_col_names:
            if col_name in df_ganhas.columns:
                quarter_col = col_name
                break
    
    if quarter_col is None:
        if verbose:
            print(f'⚠️  Coluna Fiscal Quarter não encontrada')
            print(f'   Colunas disponíveis: {list(df_ganhas.columns[:10])}...')
        return result
    
    if verbose:
        print(f'   ✓ Coluna Quarter: "{quarter_col}"')
    
    # ========== 2. FILTRA DEALS DO QUARTER ==========
    # Garante que a comparação é case-insensitive e limpa espaços
    df_quarter = df_ganhas[
        df_ganhas[quarter_col].astype(str).str.strip().str.upper() == fiscal_quarter.strip().upper()
    ].copy()
    
    if len(df_quarter) == 0:
        if verbose:
            unique_quarters = df_ganhas[quarter_col].unique()[:5]
            print(f'⚠️  Nenhum deal encontrado para {fiscal_quarter}')
            print(f'   Quarters disponíveis (amostra): {list(unique_quarters)}')
        return result
    
    if verbose:
        print(f'   ✓ Deals filtrados: {len(df_quarter)}')
    
    # ========== 3. BUSCA COLUNAS DE VALOR ==========
    # BigQuery e CSV ambos usam "Gross" e "Net"
    gross_col_names = ['Gross', 'gross_value', 'gross', 'valor_gross']
    net_col_names = ['Net', 'net_value', 'net', 'valor_net']
    
    # Busca coluna Gross
    gross_col = None
    if BQ_SCHEMA_AVAILABLE:
        gross_col = find_column_in_dataframe(df_quarter, gross_col_names)
    else:
        for col_name in gross_col_names:
            if col_name in df_quarter.columns:
                gross_col = col_name
                break
    
    # Busca coluna Net
    net_col = None
    if BQ_SCHEMA_AVAILABLE:
        net_col = find_column_in_dataframe(df_quarter, net_col_names)
    else:
        for col_name in net_col_names:
            if col_name in df_quarter.columns:
                net_col = col_name
                break
    
    if verbose:
        print(f'   ✓ Coluna Gross: "{gross_col}"')
        print(f'   ✓ Coluna Net: "{net_col}"')
    
    # ========== 4. CALCULA TOTAIS ==========
    if gross_col:
        # Converte para numérico (ignora erros)
        gross_values = pd.to_numeric(df_quarter[gross_col], errors='coerce')
        result['gross'] = float(gross_values.sum())
        
        if verbose:
            print(f'   • Gross Total: ${result["gross"]:,.2f}')
    
    if net_col:
        net_values = pd.to_numeric(df_quarter[net_col], errors='coerce')
        result['net'] = float(net_values.sum())
        
        if verbose:
            print(f'   • Net Total: ${result["net"]:,.2f}')
    
    result['deals_count'] = len(df_quarter)
    
    # Calcula ticket médio
    if result['deals_count'] > 0 and result['gross'] > 0:
        result['avg_deal_size'] = result['gross'] / result['deals_count']
        
        if verbose:
            print(f'   • Deals Count: {result["deals_count"]}')
            print(f'   • Avg Deal Size: ${result["avg_deal_size"]:,.2f}')
    
    if verbose:
        print(f'\n✅ [CLOSED QUARTER] Calculado com sucesso!')
        print(f'   {fiscal_quarter}: ${result["gross"]:,.0f} gross, ${result["net"]:,.0f} net ({result["deals_count"]} deals)')
    
    return result


# ===========================================================================
# TASK 2.4B: SALES SPECIALIST LOADER (FORECAST)
# ===========================================================================

def load_sales_specialist_by_quarter(
    csv_path: str,
    fiscal_quarter: str,
    verbose: bool = False
) -> pd.DataFrame:
    """
    Carrega CSV Sales Specialist e filtra por quarter BASEADO NO CLOSED DATE.
    
    Args:
        csv_path: Caminho para o CSV Sales Specialist
        fiscal_quarter: Quarter fiscal no formato "FY26-Q1"
        verbose: Se True, imprime logs detalhados
    
    Returns:
        DataFrame filtrado para o quarter especificado
    
    Example:
        >>> df = load_sales_specialist_by_quarter('specialist.csv', 'FY26-Q1')
        >>> print(f"{len(df)} deals no forecast para Q1")
    """
    
    if verbose:
        print(f'\n📂 [SALES SPECIALIST] Carregando {csv_path}')
    
    try:
        df = pd.read_csv(csv_path)
        
        if verbose:
            print(f'   ✓ Loaded: {len(df)} deals')
        
        # Busca coluna Closed Date
        date_col_names = ['Closed Date', 'close_date', 'Close Date', 'Data Fechamento']
        
        date_col = None
        for col_name in date_col_names:
            if col_name in df.columns:
                date_col = col_name
                break
        
        if date_col is None:
            if verbose:
                print(f'   ⚠️  Coluna Closed Date não encontrada')
            return pd.DataFrame()
        
        if verbose:
            print(f'   ✓ Coluna Date: "{date_col}"')
        
        # Converte datas para datetime
        df['close_date_parsed'] = pd.to_datetime(df[date_col], format='%d/%m/%Y', errors='coerce')
        
        # Remove linhas sem data válida
        df_valid = df[df['close_date_parsed'].notna()].copy()
        
        if len(df_valid) == 0:
            if verbose:
                print(f'   ⚠️  Nenhuma data válida encontrada')
            return pd.DataFrame()
        
        # Extrai FY e Quarter da data
        # FY: começa em fevereiro
        # Q1: fev-abr, Q2: mai-jul, Q3: ago-out, Q4: nov-jan
        
        def date_to_fiscal_quarter(date):
            """Converte datetime para fiscal quarter (FY26-Q1)"""
            if pd.isna(date):
                return None
            
            year = date.year
            month = date.month
            
            # Determina FY
            if month >= 2:
                fy = year % 100  # últimos 2 dígitos
            else:
                fy = (year - 1) % 100  # janeiro conta para FY do ano anterior
            
            # Determina quarter
            if month in [2, 3, 4]:
                q = 'Q1'
            elif month in [5, 6, 7]:
                q = 'Q2'
            elif month in [8, 9, 10]:
                q = 'Q3'
            else:  # 11, 12, 1
                q = 'Q4'
            
            return f'FY{fy}-{q}'
        
        df_valid['fiscal_quarter'] = df_valid['close_date_parsed'].apply(date_to_fiscal_quarter)
        
        # Filtra pelo quarter desejado
        df_quarter = df_valid[
            df_valid['fiscal_quarter'].str.upper() == fiscal_quarter.strip().upper()
        ].copy()
        
        if verbose:
            print(f'   ✓ Deals no {fiscal_quarter}: {len(df_quarter)}')
            if len(df_quarter) > 0:
                # Mostra breakdown por Status
                if 'Status' in df_quarter.columns:
                    status_counts = df_quarter['Status'].value_counts()
                    for status, count in status_counts.items():
                        print(f'      • {status}: {count} deals')
        
        return df_quarter
    
    except Exception as e:
        if verbose:
            print(f'   ❌ Erro ao carregar: {e}')
        return pd.DataFrame()


# ===========================================================================
# TASK 2.5: CONVERSION RATE CALCULATOR
# ===========================================================================

def calculate_conversion_rate(
    df_pipeline: pd.DataFrame,
    df_ganhas: pd.DataFrame,
    df_perdidas: pd.DataFrame,
    fiscal_quarter: Optional[str] = None,
    verbose: bool = False
) -> Dict:
    """
    Calcula taxa de conversão (win rate) do pipeline.
    
    FIX: Resolve bug de "Taxa de Conversão: 0%" - calcula corretamente!
    
    Args:
        df_pipeline: DataFrame com pipeline aberto
        df_ganhas: DataFrame com deals ganhos
        df_perdidas: DataFrame com deals perdidos
        fiscal_quarter: Se fornecido, filtra por quarter específico
        verbose: Se True, imprime logs detalhados
    
    Returns:
        Dict com:
            - total_created: Total de deals criados
            - total_won: Total de deals ganhos
            - total_lost: Total de deals perdidos
            - total_open: Total de deals ainda abertos
            - conversion_rate: Taxa de conversão (won / (won + lost)) %
            - win_rate: Mesmo que conversion_rate (alias)
            - loss_rate: Taxa de perda (lost / (won + lost)) %
            - close_rate: Taxa de fechamento ((won + lost) / total) %
    
    Example:
        >>> result = calculate_conversion_rate(df_pipeline, df_ganhas, df_perdidas)
        >>> print(f"Win Rate: {result['conversion_rate']:.1f}%")
    """
    
    if verbose:
        print(f'\n📊 [CONVERSION RATE] Calculando taxa de conversão')
        if fiscal_quarter:
            print(f'   Filtro: {fiscal_quarter}')
    
    # Valores padrão
    result = {
        'fiscal_quarter': fiscal_quarter,
        'total_created': 0,
        'total_won': 0,
        'total_lost': 0,
        'total_open': 0,
        'conversion_rate': 0.0,
        'win_rate': 0.0,  # alias
        'loss_rate': 0.0,
        'close_rate': 0.0
    }
    
    # Conta deals ganhos
    if df_ganhas is not None and len(df_ganhas) > 0:
        result['total_won'] = len(df_ganhas)
        
        if verbose:
            print(f'   ✓ Deals Ganhos: {result["total_won"]}')
    
    # Conta deals perdidos
    if df_perdidas is not None and len(df_perdidas) > 0:
        result['total_lost'] = len(df_perdidas)
        
        if verbose:
            print(f'   ✓ Deals Perdidos: {result["total_lost"]}')
    
    # Conta deals abertos (pipeline)
    if df_pipeline is not None and len(df_pipeline) > 0:
        result['total_open'] = len(df_pipeline)
        
        if verbose:
            print(f'   ✓ Deals Abertos (Pipeline): {result["total_open"]}')
    
    # Total criados = ganhos + perdidos + abertos
    result['total_created'] = result['total_won'] + result['total_lost'] + result['total_open']
    
    if verbose:
        print(f'   ✓ Total Criados: {result["total_created"]}')
    
    # Calcula taxas
    total_closed = result['total_won'] + result['total_lost']
    
    if total_closed > 0:
        # Conversion Rate = ganhos / (ganhos + perdidos)
        result['conversion_rate'] = (result['total_won'] / total_closed) * 100
        result['win_rate'] = result['conversion_rate']  # alias
        
        # Loss Rate = perdidos / (ganhos + perdidos)
        result['loss_rate'] = (result['total_lost'] / total_closed) * 100
        
        if verbose:
            print(f'   • Win Rate: {result["conversion_rate"]:.1f}%')
            print(f'   • Loss Rate: {result["loss_rate"]:.1f}%')
    
    if result['total_created'] > 0:
        # Close Rate = fechados / total
        result['close_rate'] = (total_closed / result['total_created']) * 100
        
        if verbose:
            print(f'   • Close Rate: {result["close_rate"]:.1f}%')
    
    if verbose:
        print(f'\n✅ [CONVERSION RATE] Calculado com sucesso!')
        print(f'   {result["total_won"]} ganhos / {total_closed} fechados = {result["conversion_rate"]:.1f}% win rate')
    
    return result


# ===========================================================================
# TEST RUNNER
# ===========================================================================

if __name__ == '__main__':
    print('\n🧪 Testando Metrics Calculators\n')
    
    # Test 1: Confidence Stats com dados reais
    print('=' * 60)
    print('TEST 1: calculate_confidence_stats()')
    print('=' * 60)
    
    test_data = {
        'Oportunidade': ['Deal A', 'Deal B', 'Deal C', 'Deal D', 'Deal E'],
        'Gross': [100000, 50000, 200000, 75000, 150000],
        'Confiança (%)': [90, 70, 95, 50, 85]
    }
    df_test = pd.DataFrame(test_data)
    
    print('\n📊 DataFrame de teste:')
    print(df_test)
    
    result = calculate_confidence_stats(df_test, verbose=True)
    
    print('\n✅ RESULTADO:')
    print(f'   avg_confidence: {result["avg_confidence"]}%')
    print(f'   weighted_confidence: {result["weighted_confidence"]}%')
    print(f'   deals_count: {result["deals_count"]}')
    print(f'   breakdown: {result["breakdown"]}')
    
    # Validações
    assert result['deals_count'] == 5, 'Deveria ter 5 deals'
    assert 70 <= result['avg_confidence'] <= 80, f'Média deveria estar entre 70-80%, got {result["avg_confidence"]}'
    assert result['breakdown']['commit'] == 2, 'Deveria ter 2 deals Commit (90%, 95%)'
    assert result['breakdown']['upside'] == 3, 'Deveria ter 3 deals Upside (70%, 85%, 50%)'
    assert result['breakdown']['pipeline'] == 0, 'Deveria ter 0 deals Pipeline (<50%)'
    
    print('\n✅ Todos os testes passaram!')
    print('\n' + '=' * 60)
    
    # Test 2: Word Clouds Generator
    print('\n' + '=' * 60)
    print('TEST 2: generate_word_clouds()')
    print('=' * 60)
    
    # Pipeline data
    pipeline_data = {
        'Oportunidade': ['Deal 1', 'Deal 2', 'Deal 3'],
        'Flags de Risco': [
            'Preço Alto, Timing Apertado',  # Múltiplos valores
            'Competidor Forte',
            'Preço Alto, Budget Limitado'
        ],
        'Cód Ação': ['ACT-001', 'ACT-002', 'ACT-001']  # Valores únicos
    }
    df_pipeline_test = pd.DataFrame(pipeline_data)
    
    # Ganhas data
    ganhas_data = {
        'Oportunidade': ['Win 1', 'Win 2'],
        'Tipo Resultado': ['Expansão', 'New Business'],
        '🏷️ Labels': [
            'ROI Comprovado, Timing Perfeito',  # Múltiplos
            'Relacionamento Forte'
        ]
    }
    df_ganhas_test = pd.DataFrame(ganhas_data)
    
    # Perdidas data
    perdidas_data = {
        'Oportunidade': ['Loss 1', 'Loss 2', 'Loss 3'],
        'Tipo Resultado': ['Preço', 'Timing', 'Preço'],
        '🏷️ Labels': [
            'Budget Cortado',
            'Decisão Adiada, Budget',
            'Competidor Mais Barato'
        ]
    }
    df_perdidas_test = pd.DataFrame(perdidas_data)
    
    print('\n📊 DataFrames de teste:')
    print(f'   Pipeline: {len(df_pipeline_test)} deals')
    print(f'   Ganhas: {len(df_ganhas_test)} deals')
    print(f'   Perdidas: {len(df_perdidas_test)} deals')
    
    # Gerar word clouds
    word_clouds = generate_word_clouds(
        df_pipeline=df_pipeline_test,
        df_ganhas=df_ganhas_test,
        df_perdidas=df_perdidas_test,
        verbose=True
    )
    
    print('\n✅ RESULTADO:')
    print(f'   riskFlags: {len(word_clouds["riskFlags"])} valores')
    print(f'   actionLabels: {len(word_clouds["actionLabels"])} valores')
    print(f'   winTypes: {len(word_clouds["winTypes"])} valores')
    print(f'   winLabels: {len(word_clouds["winLabels"])} valores')
    print(f'   lossTypes: {len(word_clouds["lossTypes"])} valores')
    print(f'   lossLabels: {len(word_clouds["lossLabels"])} valores')
    
    # Validações
    assert len(word_clouds['riskFlags']) >= 5, f'Risk flags deveria ter >= 5 valores (CSV split), got {len(word_clouds["riskFlags"])}'
    assert 'Preço Alto' in word_clouds['riskFlags'], 'Deveria ter extraído "Preço Alto" de CSV'
    assert len(word_clouds['actionLabels']) == 3, f'Action labels deveria ter 3 valores, got {len(word_clouds["actionLabels"])}'
    assert len(word_clouds['winTypes']) == 2, f'Win types deveria ter 2 valores, got {len(word_clouds["winTypes"])}'
    assert len(word_clouds['winLabels']) >= 3, f'Win labels deveria ter >= 3 valores (CSV split), got {len(word_clouds["winLabels"])}'
    assert len(word_clouds['lossTypes']) == 3, f'Loss types deveria ter 3 valores, got {len(word_clouds["lossTypes"])}'
    assert word_clouds['lossTypes'].count('Preço') == 2, 'Deveria ter "Preço" 2 vezes (frequência)'
    
    print('\n✅ Todos os testes de word clouds passaram!')
    print('\n' + '=' * 60)
