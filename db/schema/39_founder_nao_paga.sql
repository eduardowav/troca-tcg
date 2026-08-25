-- 39 — O FOUNDER não paga e não vence.
--
-- Decisão do Eduardo em 2026-08-25. Até aqui o selo era só desenho: quem o
-- tinha ganhava o PRO na mão, por `update`, e o plano seguia a mesma regra de
-- todo mundo — a data em `plano_expira_em` mandava, e o `expirar_vencidos`
-- derrubava para FREE quando ela passava.
--
-- **Isso tinha data marcada para dar errado.** A conta do Eduardo comprou o PRO
-- de verdade em 2026-08-24, por R$ 14,90, para provar o Pix ponta a ponta. A
-- compra gravou `plano_expira_em = 2026-09-24`, e o `parceiro_motivo` dele
-- tinha sido zerado no mesmo teste — para a tela desenhar o botão de comprar,
-- que ela esconde de parceiro. Em 24/09 o job derrubaria o dono do projeto para
-- FREE, com o selo de fundador intacto no perfil. O selo dizendo uma coisa e o
-- plano fazendo outra.
--
-- ## Por que o selo, e não mais uma coluna
--
-- `parceiro_motivo` já existe e já significa "tem o PRO sem pagar" — ver
-- `36_parceiro.sql`. Ele continua, e continua sendo o caminho de patrocínio,
-- permuta e contrato: acordos com prazo, que um dia acabam.
--
-- O FOUNDER é outra coisa, e a diferença não é de grau. Patrocínio é uma
-- relação comercial que se encerra; ter ajudado a construir o app antes de ele
-- existir é um fato passado, e fato passado não expira. Guardar isso como mais
-- um `parceiro_motivo` seria escrever num campo de acordo vigente algo que não
-- é acordo nem é vigente — e deixaria a regra "não paga" dependendo de alguém
-- lembrar de preencher duas colunas.
--
-- Com o selo como fonte, conceder o FOUNDER é um `update` só, e ele já carrega
-- tudo: o selo no perfil, o plano que não cai e a venda que não é oferecida.
--
-- ## O que muda no código, e onde
--
-- Três consultas em `services/pro.py` passam a ignorar quem tem o selo:
-- `expirar_vencidos` (não derruba), o aviso de vencimento (não avisa de um
-- prazo que não existe) e o `pode_renovar` da `situacao` (não oferece renovação
-- a quem não paga). E `comprar` recusa antes de gerar o Pix — a tela já
-- escondia o botão, mas esconder botão não é fechar rota, e cobrar de um
-- fundador seria o pior lugar possível para essa distinção falhar.
--
-- ## O estado que esta migração conserta
--
-- `plano_expira_em = null` é o que quer dizer "não vence". A coluna já
-- significava isso para quem nunca comprou; aqui ela passa a significar isso
-- também para quem tem o selo, e o `plano = 'PRO'` garante que ninguém fique
-- com selo de fundador e teto de conta grátis.
--
-- Não apaga histórico de pagamento: `pro_pagamentos` fica intacta. O Eduardo
-- pagou R$ 14,90 de verdade em 24/08, e a linha que prova isso continua lá.

update profiles
   set plano = 'PRO',
       plano_expira_em = null
 where selo = 'FOUNDER'
   and (plano is distinct from 'PRO' or plano_expira_em is not null);
