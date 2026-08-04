-- =====================================================================
-- 20 — Prazo que dá para esticar, e uma saída honesta para quem desistiu
-- =====================================================================
-- Duas faltas do mesmo lugar: o que acontece entre o aceite e o encontro.
--
-- **O prazo era uma parede.** Toda troca nasce com sete dias e some quando eles
-- acabam. Sete dias é o intervalo entre duas visitas à loja — quem combinou no
-- sábado e não conseguiu ir tem a troca desfeita antes da visita seguinte, e o
-- EXPIRADO que sobra é denominador da métrica-mãe. Não havia como dizer "ainda
-- estamos combinando".
--
-- **E não havia saída honesta.** O desfecho oferece "a troca aconteceu" e "a
-- pessoa não apareceu". Quem desistiu de boa-fé — vendeu a carta, mudou de
-- cidade, perdeu a vontade — só tinha dois caminhos: acusar o outro de um furo
-- que não houve, ou sumir. Sumir vira EXPIRADO, que conta contra os dois. O app
-- estava empurrando gente honesta para o pior dos desfechos.
-- ---------------------------------------------------------------------

-- --------------------------------------------
-- 1. CANCELADO: desistência declarada
-- --------------------------------------------
-- Status novo, e não um FURADO auto-declarado. A diferença é a decisão do
-- Eduardo (2026-08-04) e ela é sobre incentivo, não sobre semântica: quem avisa
-- antes não pode ser tratado como quem sumiu, senão ninguém avisa — e o app
-- perde a informação junto com a chance de devolver as cartas ao mercado.
--
-- Fica **fora do denominador da métrica-mãe** (CONCLUIDO/(CONCLUIDO+FURADO+
-- EXPIRADO)): uma troca desmarcada com antecedência não é um encontro que deu
-- errado, é um encontro que não chegou a ser marcado. O custo dela é
-- transparência, não punição — ver `trocas_desistidas` abaixo.
alter type match_status add value if not exists 'CANCELADO';

-- --------------------------------------------
-- 2. O contador que segura a honestidade
-- --------------------------------------------
-- Sem ele, desistir sairia de graça e viraria a rota de fuga de quem furou de
-- verdade: bastaria clicar em "não vou conseguir" no lugar de não aparecer, e os
-- números do app ficariam bonitos sem serem verdade. Com ele, a desistência
-- aparece ao lado da reputação de quem vai marcar um encontro com você — que é
-- exatamente quem precisa saber.
--
-- Fora da função `reputacao()` de propósito (04_profiles.sql): ela é a razão
-- entre concluídas e furadas, e misturar desistência ali seria dizer, de novo,
-- que desistir é furar.
alter table profiles add column trocas_desistidas integer not null default 0;

-- A migração 11 trocou o grant de tabela por grant de coluna em `profiles`, e
-- coluna nova nasce fora dele. Sem esta linha, a leitura pública do perfil
-- simplesmente não enxergaria o contador — e pior, um `.select('*')` passaria a
-- devolver 401 sem que ninguém entendesse por quê.
grant select (trocas_desistidas) on profiles to anon, authenticated;

-- --------------------------------------------
-- 3. Prorrogação com teto
-- --------------------------------------------
-- Duas, e o motivo do teto é o mesmo que justifica o prazo existir: se dá para
-- esticar sem fim, não há prazo — e uma troca que ninguém encerra fica ocupando
-- o par no feed para sempre, porque só existe um match por dupla de pessoas.
-- Três semanas é folga de sobra para duas visitas à loja darem errado.
alter table matches add column prorrogacoes smallint not null default 0
  check (prorrogacoes between 0 and 2);

comment on column matches.prorrogacoes is
  'Quantas vezes o prazo foi esticado. Teto de 2 — ver services/matching.prorrogar.';

-- Nota sobre `expira_em` numa troca CANCELADA, que é onde ele muda de sentido:
-- ali ele deixa de ser prazo e vira **carência**. O motor ressuscita match
-- EXPIRADO (o par volta ao feed como sugestão nova), e uma desistência que
-- reaparecesse no mesmo instante leria como o app ignorando a decisão que a
-- pessoa acabou de tomar. Desistir grava `expira_em = now() + 7 dias`, e o
-- `_gravar_match` só ressuscita CANCELADO depois dessa data. Uma semana depois,
-- a mesma troca volta a ser oferecida — porque desistência quase sempre é sobre
-- o momento, não sobre a carta.
