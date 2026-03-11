# Plano Mestre de Visualizacao Frontend X-Sales

Data: 2026-03-10
Status: Planejamento executivo pronto para implantacao
Objetivo: evoluir toda a visualizacao do frontend mantendo coerencia total com o brandbook atual, sem regressao funcional e com substituicao progressiva de mocks por dados reais.

## 1. Principios inegociaveis

1. Coerencia estrita com o brandbook (dark/light, glass, paleta por dominio).
2. Nao quebrar fluxos existentes ja ativos em producao.
3. Troca gradual de mocks por feature flags e fallback seguro.
4. Performance e legibilidade acima de efeitos visuais excessivos.
5. Sem divergencia de UX entre paginas do mesmo ecossistema.

## 2. Escopo global de telas

1. Hub
2. Sales
3. Executivo
4. Marketing
5. Automacao
6. Admin
7. Estados transversais: loading, empty, erro, sem permissao, fallback

## 3. Estado atual consolidado

1. Sales:
- Integrada com endpoints v2 por persona.
- Fallback legado e demo ainda existem por resiliencia.

2. Executivo:
- Estrutura visual pronta, mas com blocos ainda estaticos.
- Tabelas com mensagens de placeholder para API.

3. Marketing:
- Estrutura visual consistente, com cards e placeholders "Em breve" em blocos de grafico.

4. Automacao:
- Estrutura visual pronta, dados majoritariamente estaticos.

5. Admin:
- Fluxo funcional de gestao de acessos pronto e coerente com o tema.

## 4. Arquitetura visual alvo

## 4.1 Tokens e temas

1. Consolidar tokens unicos (bg, text, glass, border, glow) em fonte unica.
2. Garantir que cada pagina consuma os mesmos tokens sem sobrescritas locais conflitantes.
3. Formalizar mapa de cores por dominio:
- Executivo: cyan
- Sales: green
- Automacao/Data: pink
- Marketing: orange support sem quebrar base cyan/green/pink
- Admin: cyan com status semanticos

## 4.2 Sistema de componentes visuais

1. Header padrao de modulo (logo, trilha, badge de contexto, acoes).
2. KPI card padrao (titulo, valor, variacao, icone, estado).
3. Tabela padrao (cabecalho, hover, estado vazio, paginacao futura).
4. Card de grafico padrao (titulo, subtitulo, legenda, CTA, fallback).
5. Empty/Loading/Error padrao para todas as telas.

## 4.3 Microinteracoes

1. Hover e brilho com intensidade controlada por tema.
2. Animacoes curtas e funcionais (entrada, transicao de tab, skeleton).
3. Remover variacoes excessivas por pagina que nao agregam leitura.

## 5. Plano de substituicao de mocks por pagina

## 5.1 Sales

1. Manter fallback legado ativo por seguranca operacional.
2. Reduzir fallback demo para cenarios explicitamente controlados:
- erro de API
- ambiente sem dados
- modo diagnostico
3. Registrar estado de origem de dados na UI (v2, legado, demo).

## 5.2 Executivo

1. Substituir placeholders de tabela por endpoints reais agregados.
2. Ligar cards de pipeline total, forecast e risco em dados consolidados.
3. Implantar hierarquia de risco e stale deals com semantica visual do brandbook.

## 5.3 Marketing

1. Trocar blocos "Em breve" por componentes conectados ao backend.
2. Unificar leitura de funil e atribuicao em cards/graficos no mesmo padrao Sales.
3. Preservar acento de cor de marketing sem quebrar sistema de tema global.

## 5.4 Automacao

1. Trocar listas estaticas por dados reais de jobs, logs e alertas.
2. Definir matriz de severidade visual com classes semanticas unicas.
3. Padronizar tabelas com comportamento igual ao modulo Admin.

## 5.5 Hub

1. Revisar consistencia de cards de entrada (icones, glow, CTA, densidade).
2. Garantir que estado de permissao e navegação reflita governanca atual.
3. Ajustar ritmo de animacao para manter premium sem ruido.

## 6. Ondas de implantacao

## Onda 0 - Baseline visual e governanca (1 dia)

1. Congelar tokens e padroes de componentes.
2. Definir checklist de regressao visual por tela.
3. Definir matriz de estados (loading/empty/error/no-access).

Criterio de aceite:
- Um guideline unico aprovado para todas as paginas.

## Onda 1 - Dados reais em Executivo e Marketing (2-3 dias)

1. Remover placeholders de API nas duas telas.
2. Conectar cards e tabelas prioritarias.
3. Garantir performance e estados de erro.

Criterio de aceite:
- Nenhum "Em breve" em blocos de metricas principais.

## Onda 2 - Dados reais em Automacao + padronizacao final Hub (2 dias)

1. Conectar jobs/logs/alertas.
2. Revisar Hub para coerencia final de entrada entre modulos.
3. Ajustar linguagem visual para consistencia total.

Criterio de aceite:
- Nenhuma tela core dependente de mock estatico para exibicao principal.

## Onda 3 - Hardening e excelencia visual (1-2 dias)

1. Teste cruzado dark/light em todas as telas.
2. Refino de responsividade desktop/mobile.
3. Auditoria de acessibilidade basica (contraste e foco navegavel).

Criterio de aceite:
- Frontend visualmente consistente ponta a ponta.

## 7. Matriz de qualidade obrigatoria

1. Coerencia de tokens e cores por dominio.
2. Contraste minimo aceitavel em dark e light.
3. Nenhum estado vazio sem mensagem e CTA.
4. Nenhum bloco principal sem origem de dados identificavel.
5. Sem regressao no fluxo de autenticacao/autorizacao.

## 8. Riscos e mitigacoes

1. Risco: discrepancia de dados entre endpoints.
- Mitigacao: contrato tipado e estado de fallback explicito.

2. Risco: inconsistencias visuais por CSS legado residual.
- Mitigacao: consolidacao por tokens e component wrappers.

3. Risco: regressao de performance com efeitos visuais.
- Mitigacao: limitar blur/shadow em mobile e audit de paint.

## 9. Definicao de pronto (DoD)

1. Todas as telas core sem placeholders de negocio.
2. Mock apenas como fallback tecnico controlado.
3. Design consistente com brandbook em dark/light.
4. Estados de erro e vazio padronizados.
5. Checklist visual e funcional aprovado.

## 10. Proximo passo de execucao

1. Iniciar Onda 0 imediatamente.
2. Entregar primeiro pacote incremental: padrao global de estados + baseline Executivo.
3. Seguir para Onda 1 com substituicao dos placeholders de maior impacto.
