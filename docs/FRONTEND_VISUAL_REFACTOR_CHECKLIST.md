# Checklist de Refatoração Visual (Dark/Light)

Data: 2026-02-22
Escopo: frontend principal (`public/index.html`) com preservação total de conteúdo e interações.

## 1) Sidebar e navegação
- [x] Navegação lateral com contraste consistente em dark/light
- [x] Estado ativo com destaque sem glow excessivo
- [x] Hover padronizado e sem deslocamentos agressivos

## 2) Header superior
- [x] Barra superior com leitura clara de timestamp
- [x] Botão de tema com visual consistente
- [x] Botão de refresh integrado ao novo sistema visual

## 3) Filtros globais
- [x] Container principal de filtros condensado e legível
- [x] Pills FY26 e toggle GROSS/NET unificados visualmente
- [x] Painel de filtros avançados com superfícies e bordas coerentes
- [x] Selects, datas e multi-select harmonizados em dark/light

## 4) Tabs e navegação de conteúdo
- [x] Tabs executivas com hierarquia clara e indicador ativo
- [x] Botões de subabas (Top Oportunidades) com estilo consistente
- [x] Mantido comportamento funcional de troca de abas

## 5) Cards e métricas
- [x] KPI cards com bordas/sombras premium e limpas
- [x] Redução de gradientes conflitantes
- [x] Paleta de status (cyan/green/red/warning) mantida com melhor equilíbrio

## 6) Tabelas e drilldowns
- [x] Tabelas com legibilidade reforçada (header/células/hover)
- [x] Drilldowns com backdrop e painel mais estáveis visualmente
- [x] Preservada interação de expansão e navegação

## 7) Charts e wrappers
- [x] Wrappers de gráficos alinhados ao novo padrão de superfície
- [x] Estados vazios e blocos auxiliares coerentes com o tema

## 8) Validação final de tema
- [x] Dark mode validado visualmente (contraste e hierarquia)
- [x] Light mode validado visualmente (contraste e profundidade)

## 9) Não regressão funcional
- [x] Sem remoção de informação existente
- [x] Sem remoção de métricas, blocos, abas e filtros
- [x] Sem alterações em `agenda-semanal-weekly.js` e `agenda-semanal.js`
