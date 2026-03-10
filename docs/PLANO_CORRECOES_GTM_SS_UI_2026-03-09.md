# Plano de Correcao GTM + SS + UI (2026-03-09)

## Escopo solicitado

1. Corrigir classificacao `CONTA NOMEADA` / `CONTA NAO NOMEADA` para refletir atualizacoes da aba `Contas_Nomeadas`.
2. Corrigir falso negativo de elegibilidade SS (caso com composicao de servicos marcado como "somente plataforma").
3. Corrigir UI com tag duplicada (`funil longo`) e tags com underscore (`funil_longo`).
4. Remover exibicao de `Status GTM` no card de oportunidade.
5. Padronizar exibicao de nomes SS (ex.: `Gabriele Oliveira`, `Emilio`) no mesmo estilo dos BDMs.

## Implementacao aplicada

### Backend Apps Script

Arquivo: `appscript/ShareCode.gs`

- `getContaNomeadaMatchForGtm_`
- Ajustado matching para contemplar variacoes de nome juridico (ex.: `LTDA`, `S/A`, `EIRELI`, `ME`, `EPP`, etc.) e ruido de pontuacao.
- Mantido match exato atual e adicionado match por chave normalizada.
- Melhorado match por inclusao parcial para comparar tambem a chave normalizada.

- `evaluateSalesSpecialistGovernance`
- Ampliado criterio de elegibilidade de tipo para considerar tambem sinais vindos da oportunidade (`products`, `productFamily`, `commercialFamily`, `servicesModel`), alem da aba SS.
- Regex de elegibilidade expandida com termos de servico/implementacao/suporte para evitar falso negativo de "somente plataforma" em cenarios mistos.

### Frontend

Arquivo: `public/scripts/agenda-semanal-weekly.js`

- `renderBusinessContextTags`
- Removida a tag visual `Status GTM`.
- Mantidas tags de `Perfil Cliente`, `Status Cliente` e `SS Envolvido`.

- `extractDealRiskTags`
- Dedupe por chave normalizada (`normalizeRiskTagKey`) para evitar duplicidades como `funil longo` + `funil_longo`.
- Humanizacao de labels para substituir underscores/hifens por texto legivel.

- Padronizacao de nomes
- Novo formatter para nomes de pessoas (Title Case) aplicado em:
  - cabecalho de vendedor (BDM/CS),
  - nomes na secao de Sales Specialist,
  - owner dentro de cards da secao SS,
  - campo `SS Envolvido` quando a fonte trouxer nomes.

## Checklist de validacao

- [ ] Reprocessar pipeline no Apps Script (fluxo OPEN) e validar oportunidade com conta em `Contas_Nomeadas` alterada recentemente.
- [ ] Validar caso `PCDT-130863--GurIA` para confirmar `ELEGIVEL` quando houver composicao de servicos.
- [ ] Abrir pauta semanal e verificar que `Status GTM` nao aparece nos chips de contexto.
- [ ] Confirmar ausencia de duplicidade `funil longo` / `funil_longo` no card.
- [ ] Confirmar padrao visual de nomes para `Gabriele Oliveira` e `Emilio` em todas as secoes SS.

## Riscos residuais

- Se a fonte enviar novos formatos de descricao de servico fora do padrao atual, pode ser necessario ampliar novamente os termos de elegibilidade.
- Se houver outras telas alem da `agenda-semanal-weekly.js` exibindo as mesmas tags, os mesmos ajustes podem precisar ser replicados nesses pontos.
