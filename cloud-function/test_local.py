#!/usr/bin/env python3
"""
Script de teste local da Cloud Function ANTES do deploy.

Executa sales_intelligence_engine() localmente e valida estrutura da resposta.
Garante que Dashboard.html receberá todos os dados necessários.

USO:
    python3 test_local.py

VALIDA:
    ✅ Estrutura cloudAnalysis completa
    ✅ Executive metrics (pipeline_all, pipeline_fy26, pipeline_by_quarter)
    ✅ Sales Specialist (commit/upside breakdown)
    ✅ Sem erros de execução
"""

import sys
import json
from main import sales_intelligence_engine

def test_cloud_function():
    """Testa Cloud Function localmente"""
    
    print("=" * 80)
    print("🧪 TESTE LOCAL: CLOUD FUNCTION")
    print("=" * 80)
    
    # Simula request do Apps Script
    class MockRequest:
        def get_json(self, silent=False):
            return {
                'filters': {
                    'quarter': 'FY26-Q1',
                    'seller': None,
                    'minValue': None
                },
                'source': 'bigquery'
            }
    
    try:
        print("\n1️⃣  Executando sales_intelligence_engine()...")
        result = sales_intelligence_engine(MockRequest())
        
        # Parse result (pode ser tuple ou dict)
        if isinstance(result, tuple):
            data, status_code = result
            print(f"✅ Execução concluída (HTTP {status_code})\n")
            
            if status_code != 200:
                print(f"❌ ERRO: Status code {status_code}")
                print(f"   Response: {data}")
                return False
        else:
            data = result
            print("✅ Execução concluída sem erros\n")
        
        # Valida status
        if data.get('status') != 'success':
            print(f"❌ ERRO: Status '{data.get('status')}' em vez de 'success'")
            if 'error' in data:
                print(f"   Erro: {data['error']}")
            return False
        
        print("2️⃣  Validando estrutura da resposta...")
        
        # Valida estrutura de alto nível
        required_keys = ['status', 'pipeline_analysis', 'closed_analysis', 'conversion_rate', 'aggregations']
        for key in required_keys:
            if key not in data:
                print(f"   ❌ ERRO: Chave '{key}' ausente na resposta")
                return False
            print(f"   ✅ {key}")
        
        print("\n3️⃣  Validando EXECUTIVE metrics (pipeline_analysis)...")
        
        pipeline = data.get('pipeline_analysis', {})
        executive_keys = ['pipeline_all', 'pipeline_fy26', 'pipeline_by_quarter', 'high_confidence']
        
        if 'executive' not in pipeline:
            print("   ❌ ERRO: 'executive' ausente em pipeline_analysis")
            return False
        
        executive = pipeline['executive']
        for key in executive_keys:
            if key not in executive:
                print(f"   ❌ ERRO: 'executive.{key}' ausente")
                return False
            print(f"   ✅ executive.{key}")
            
            # Valida sub-estrutura
            if key in ['pipeline_all', 'pipeline_fy26', 'high_confidence']:
                metric = executive[key]
                if not all(k in metric for k in ['gross', 'net', 'deals_count']):
                    print(f"      ⚠️  AVISO: {key} sem gross/net/deals_count")
                else:
                    print(f"      → Gross: ${metric['gross']:,.2f}, Net: ${metric['net']:,.2f}, Deals: {metric['deals_count']}")
        
        # Valida quarters
        quarters = executive.get('pipeline_by_quarter', {})
        expected_quarters = ['FY26-Q1', 'FY26-Q2', 'FY26-Q3', 'FY26-Q4']
        print("\n   Validando quarters:")
        for q in expected_quarters:
            if q in quarters:
                qdata = quarters[q]
                print(f"      ✅ {q}: ${qdata.get('gross', 0):,.2f}, {qdata.get('deals_count', 0)} deals")
            else:
                print(f"      ⚠️  {q}: ausente (pode ser normal se não houver deals)")
        
        print("\n4️⃣  Validando SALES SPECIALIST (closed_analysis)...")
        
        closed = data.get('closed_analysis', {})
        if 'closed_quarter' not in closed:
            print("   ❌ ERRO: 'closed_quarter' ausente em closed_analysis")
            return False
        
        closed_quarter = closed['closed_quarter']
        if 'forecast_specialist' not in closed_quarter:
            print("   ❌ ERRO: 'forecast_specialist' ausente em closed_quarter")
            return False
        
        forecast = closed_quarter['forecast_specialist']
        specialist_keys = ['enabled', 'gross', 'net', 'deals_count', 
                          'commit_gross', 'commit_net', 'commit_deals',
                          'upside_gross', 'upside_net', 'upside_deals']
        
        for key in specialist_keys:
            if key not in forecast:
                print(f"   ❌ ERRO: 'forecast_specialist.{key}' ausente")
                return False
        
        print(f"   ✅ forecast_specialist completo")
        print(f"      → Enabled: {forecast['enabled']}")
        print(f"      → Total: ${forecast['gross']:,.2f}, {forecast['deals_count']} deals")
        print(f"      → Commit: ${forecast['commit_gross']:,.2f}, {forecast['commit_deals']} deals")
        print(f"      → Upside: ${forecast['upside_gross']:,.2f}, {forecast['upside_deals']} deals")
        
        print("\n5️⃣  Validando CONVERSION RATE...")
        
        conversion = data.get('conversion_rate', {})
        # Estrutura pode variar dependendo se metrics_calculators está disponível
        # Aceita tanto 'win_rate' quanto 'conversion_rate' como keys válidas
        
        if not conversion:
            print("   ⚠️  AVISO: conversion_rate vazio (metrics_calculators pode não estar disponível)")
        else:
            print(f"   ✅ conversion_rate presente")
            if 'win_rate' in conversion:
                print(f"      → Win Rate: {conversion['win_rate']}%")
            if 'conversion_rate' in conversion:
                print(f"      → Conversion Rate: {conversion['conversion_rate']}%")
        
        print("\n6️⃣  Validando AGGREGATIONS...")
        
        aggregations = data.get('aggregations', {})
        agg_keys = ['by_seller_profile', 'by_quarter', 'by_seller_quarter', 'by_forecast_category', 'war_targets']
        
        for key in agg_keys:
            if key not in aggregations:
                print(f"   ❌ ERRO: 'aggregations.{key}' ausente")
                return False
        
        print(f"   ✅ aggregations completo")
        print(f"      → {len(aggregations['by_seller_profile'])} seller profiles")
        print(f"      → {len(aggregations['by_quarter'])} quarters")
        print(f"      → {len(aggregations['war_targets'])} war targets")
        
        print("\n" + "=" * 80)
        print("🎉 TODOS OS TESTES PASSARAM!")
        print("=" * 80)
        print("\n📋 RESUMO:")
        print("   ✅ Estrutura completa")
        print("   ✅ Executive metrics OK")
        print("   ✅ Sales Specialist breakdown OK")
        print("   ✅ Conversion rate OK")
        print("   ✅ Aggregations OK")
        print("\n✈️  PRONTO PARA DEPLOY!")
        print("\nComandos:")
        print("   1. Deploy: gcloud functions deploy sales-intelligence-engine \\")
        print("              --runtime python39 --trigger-http --allow-unauthenticated \\")
        print("              --entry-point sales_intelligence_engine --memory 512MB --timeout 60s")
        print("   2. Atualizar Apps Script com DashboardCode.gs e Dashboard.html")
        print("   3. Executar dashboard e validar visualmente")
        
        return True
        
    except Exception as e:
        print(f"\n❌ ERRO NA EXECUÇÃO:")
        print(f"   {type(e).__name__}: {e}")
        
        import traceback
        print("\n📊 TRACEBACK COMPLETO:")
        traceback.print_exc()
        
        return False

if __name__ == '__main__':
    success = test_cloud_function()
    sys.exit(0 if success else 1)
