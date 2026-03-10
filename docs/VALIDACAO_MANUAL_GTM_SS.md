# Correcao em Lote de Status (GTM + SS)

## Objetivo

Corrigir todas as linhas atuais da aba OPEN de uma vez, sem usar prefixo `MANUAL:` e sem manter override permanente.

Depois da correcao, o autosync continua normal para novas atualizacoes.

## Onde foi implementado

Arquivo: `appscript/ShareCode.gs`

- Funcao principal: `corrigirGovernancaGtmSsEmLote()`
- Motor GTM: `evaluateGtmComplianceForItem_`
- Motor SS: `evaluateSalesSpecialistGovernance`

## Como usar

Execute no Apps Script:

- `corrigirGovernancaGtmSsEmLote()`

A funcao recalcula e grava diretamente nas colunas existentes da aba `🎯 Análise Forecast IA`.

## Colunas atualizadas

- `Perfil_Cliente`
- `Status_GTM`
- `Motivo_Status_GTM`
- `Flag_Aprovacao_Previa`
- `Status_Cliente` (se existir)
- `Sales_Specialist_Envolvido`
- `Elegibilidade_SS`
- `Justificativa_Elegibilidade_SS`
- `Status_Governanca_SS`

## Observacoes

- Nao usa marcador em celula.
- Nao depende de tabela separada.
- O fluxo antigo de prefixo manual foi descontinuado.
