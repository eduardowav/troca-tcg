-- =====================================================================
-- 21 — Os anúncios que diziam "Normal" porque ninguém perguntou
-- =====================================================================
-- Consequência direta da 19, e ela só apareceu com o app aberto: **29 dos 42
-- anúncios ativos declaravam um acabamento que a carta nunca teve.** Todos
-- `finish_id = 1`, todos de antes de existir seletor — quem cadastrou um
-- Charizard ex Ilustração Rara Especial não escolheu "Normal", o padrão do
-- schema escolheu por ele, e aquela carta só existe em holo.
--
-- O sintoma na tela era o til do preço aparecendo em quase toda troca: a carta
-- anunciada como normal não tem linha de preço normal, então o app caía na
-- impressão comum e — corretamente — avisava que o número era aproximado. O
-- aviso estava certo; o dado é que estava errado.
--
-- A correção usa **a mesma regra que a API passou a usar** para quem omite o
-- campo (services/listings._resolver_acabamentos): Normal quando a carta tem,
-- senão o primeiro na ordem do catálogo. Não é decidir pelo usuário — é aplicar
-- a decisão que o app tomou por ele quando não tinha como perguntar, agora que
-- ele sabe o que a carta é.
-- ---------------------------------------------------------------------

update listings l
   set finish_id = (
     select cf.finish_id
     from card_finishes cf
     join finishes f on f.id = cf.finish_id and f.ativo
     where cf.card_id = l.card_id
     -- Normal primeiro quando existe; senão a ordem de exibição do catálogo.
     order by (cf.finish_id <> 1), f.ordem
     limit 1
   )
 where exists (select 1 from card_finishes cf where cf.card_id = l.card_id)
   and not exists (
     select 1 from card_finishes cf
     where cf.card_id = l.card_id and cf.finish_id = l.finish_id
   );

-- Os itens de troca são um retrato do anúncio no momento em que o match nasceu.
-- Só as trocas **em aberto** são corrigidas: numa troca já encerrada o retrato é
-- histórico, e reescrever histórico é o que a métrica-mãe não pode permitir.
update match_items mi
   set finish_id = (
     select cf.finish_id
     from card_finishes cf
     join finishes f on f.id = cf.finish_id and f.ativo
     where cf.card_id = mi.card_id
     order by (cf.finish_id <> 1), f.ordem
     limit 1
   )
  from matches m
 where m.id = mi.match_id
   and m.status in ('SUGERIDO', 'PENDENTE', 'ACEITO')
   and exists (select 1 from card_finishes cf where cf.card_id = mi.card_id)
   and not exists (
     select 1 from card_finishes cf
     where cf.card_id = mi.card_id and cf.finish_id = mi.finish_id
   );
