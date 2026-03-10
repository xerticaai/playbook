Sales Ops - Documentação de Regras de Negócio (Q1 2026)

Versão: 1.0 (Atualizado até 04/03/2026)
Objetivo: Fornecer contexto lógico e matemático para implementação de dashboards, painéis e automações no sistema.

1. Classificação e Filtros Base (Core Data)

1.1. Perfil GTM (Go-To-Market)

O sistema deve avaliar cada oportunidade e classificar se ela pertence ao GTM aprovado.

Dentro do GTM (Aprovado): Industria IN ('Gobierno', 'Corporate', 'Enterprise', 'Educativo')

Fora do GTM (Bloqueado/Alerta): Industria IN ('Mid Market', 'SB', 'SMB', 'Digital Natives') OR (Produto == 'GWS' AND Licencas < 500)

Ação do Sistema: Se uma oportunidade é criada fora do GTM e não está na lista de Contas Nomeadas, o sistema deve disparar um alerta visual (flag de aprovação pendente).

1.2. Contas Nomeadas vs. Novas

Base Instalada (Manutenção/Upsell): Contas listadas (ex: Sebrae, SMART-RJ, PRODERJ, MTI).

New Business (Targets): Contas alvo (ex: MPDFT, TJGO, FEAM MG, PROCERGS).

Lógica de Dashboard: Os dashboards (ex: "Resumo do Quarter") devem permitir drill-down cruzando Tipo de Conta (Nomeada vs GTM) com Status do Cliente (Base vs New).

2. Métricas e KPIs Comerciais (Scorecards)

2.1. Atividades Realizadas

Gatilho de Contagem: Só contabiliza atividades com o campo Tipo == 'REUNIÃO'.

A Regra dos 15 Dias (Ciclo de Cobertura): * O sistema deve calcular a percentagem de contas nomeadas do vendedor que tiveram pelo menos 1 atividade ('REUNIÃO') nos últimos 15 dias.

Meta: 100% de cobertura no ciclo.

2.2. Oportunidades Geradas

Data-Alvo: Oportunidades criadas na semana anterior (CreatedDate).

Regra de Validade (Close Date): * Para Vendas (BDMs): CloseDate deve ser <= Q+5.

Para CS: CloseDate deve ser <= Q+6.

Valor: Contabilizadas sempre com base no campo $ Net Revenue.

2.3. Oportunidades Estagnadas (Limpeza de Funil)

Regra 90/30: Oportunidades que estão > 90 dias na mesma fase E não possuem atividades registadas há > 30 dias devem gerar um alerta.

Exceção de GWS (Renovações): * Lógica: IF (Produto == 'GWS' AND Tipo == 'Renovação') -> Ignorar na regra de estagnação 90/30.

Novo Gatilho: Para estas oportunidades, gerar um alerta automático para o CS (ex: Alex) apenas quando faltarem 90 dias para a data de renovação.

2.4. Pipeline e Booking

Pipeline Aberto: Filtrar apenas oportunidades onde StageName >= 'Proposta' E CloseDate dentro do Quarter atual.

Booking Incremental: Contabiliza contratos fechados (Closed-Won), separados em 3 subcategorias (Plataforma, Serviços, Soluções).

A Regra da Ata vs Funil Real:

O sistema deve procurar um campo booleano (checkbox) chamado Oportunidade de Faturação.

Contratos gigantes (guarda-chuva) não devem ser somados ao Booking do Quarter. Apenas oportunidades "filhas" com a flag Oportunidade de Faturação = TRUE devem ser consideradas para os gráficos de Booking e atingimento.

3. A Matemática das Comissões (Compensation)

3.1. Net Revenue Incremental (A Base)

A métrica central não é mais o "Booking", mas sim o "Net Gerado".

Visão Operacional L10 (Painel de Atingimento):

Deve mostrar Net Faturado Total e Net Faturado Novo (Incremental).

Regras de Exclusão (Expurgo):

Excluir pagamentos recorrentes.

Excluir faturamentos onde a flag Refaturamento == TRUE (Notas canceladas e reemitidas).

Excluir ganhos derivados de Rebates ou Deployment Vouchers (São receita da companhia, não entram na cota do vendedor).

3.2. A Geração do Pool de Comissão

O Acelerador de Meta:

Se Atingimento de Cota < 80%: Taxa = 0%.

Se Atingimento de Cota entre 80% e 100%: Taxa = 5% (sobre Plataforma, Serviços e Soluções).

Se Atingimento de Cota > 100%: Taxa = 10% para Serviços/Soluções E Taxa = 5% para Plataforma.

Cálculo: Pool = (Net_Plat * Taxa_Plat) + (Net_ServSol * Taxa_ServSol).

3.3. O Rateio do Pool (As Fatias)

Retenção da Empresa: A empresa retém sempre 30% do Pool. Apenas 70% é distribuído entre BDM e SS.

A Tropa de Elite (Sales Specialist - SS):

Elegibilidade: O SS só comissiona se a oportunidade tiver > $50.000 de Net Revenue em Serviços e Soluções.

Gatilho de Sistema: O rateio só acontece se o campo Gerente de Conta estiver preenchido com o nome do SS.

Rateio: Se elegível e presente -> SS recebe 80% do Pool Partilhado; BDM recebe 20% do Pool Partilhado. Se o BDM atuar sozinho -> BDM recebe 100% do Pool Partilhado (que corresponde a 70% do Pool Total).

O Guardião (Customer Success - CS):

Bónus Fixo (Multiplicador): Bloqueado/Liberado pelo NRR (Net Revenue Retention). Retenção (incluindo Renovações e Transfer Tokens) deve ser >= 95%. Se for < 95%, o bónus salarial é bloqueado E anula possíveis comissões de Engagement.

Comissão Variável (Upsell): Se o CS gerar uma venda nova, atua como "BDM" na regra de rateio, recebendo 20% do pool de vendas gerado pelo negócio.

3.4. Regras de Pagamento

Cash Collection: O pagamento da comissão está condicionado ao pagamento da fatura pelo cliente.

A Regra dos 120 Dias: Se Data_Pagamento_Fatura > (Data_Emissao_Fatura + 120 dias) -> Flag Comissao_Suspensa = TRUE. Requer aprovação manual da Diretoria para liberar o pagamento.

4. Oportunidades de Automação (Integrações e N8N)

Anti Zero-Booking: Script que verifica às quintas-feiras às 17h todos os BDMs onde Booking_Week == 0 e envia um ping via API (Slack/Google Chat).

Automação N8N (Processo Diodesk/Hand-off):

Gatilho: Quando oportunidade = Closed-Won.

Ação: O N8N deve processar o template unificado do vendedor, gerando simultaneamente o pedido de faturamento no ERP e a criação do esqueleto do "Atestado" no repositório de contratos.

Auditoria de Atestados: Relatório mensal/semanal cruzando a lista de contratos faturados com a presença (ou falta) de um documento classificado como "Atestado" no CRM.