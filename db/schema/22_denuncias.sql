-- =====================================================================
-- 22 — A denúncia sai do papel
-- =====================================================================
-- `user_reports` existe desde o 07 e nunca recebeu uma linha: não havia rota
-- nem tela. Era schema morto, e schema morto envelhece mal — a tabela foi
-- desenhada antes de existir ciclo de vida de match, antes de CANCELADO e antes
-- de `trocas_desistidas`. Este arquivo a acerta com o produto que ficou de pé.
--
-- A decisão que organiza o resto: **toda denúncia nasce de um match**. O
-- `match_id` era opcional e passa a ser obrigatório. Três razões:
--
--   1. É a única porta de entrada que existe. Neste app não dá para interagir
--      com quem você não cruzou — não há mensagem, não há mural, não há busca
--      por pessoa. Sem match não houve o que denunciar.
--   2. É o antiabuso de graça. Sem o vínculo, um usuário logado poderia iterar
--      @s e denunciar a base inteira; com ele, denunciar alguém custa ter dado
--      match com a pessoa, e match não se fabrica sozinho.
--   3. Dá contexto a quem modera. "NAO_APARECEU" solto é a palavra de um contra
--      a do outro; preso ao match, vem com `match_events`, com os itens e com o
--      histórico dos dois lados.
-- ---------------------------------------------------------------------

-- --------------------------------------------
-- 1. Denúncia sem match deixa de ser possível
-- --------------------------------------------
-- O `on delete cascade` acompanha a obrigatoriedade: uma denúncia órfã não
-- poderia mais existir, e a FK sem cascade impediria apagar o match. Vale notar
-- que excluir a conta apaga os matches (services/profiles.excluir_conta) e
-- portanto leva junto as denúncias daquela troca — é o comportamento certo para
-- a LGPD, e a moderação séria de conta bloqueada acontece antes disso.
delete from user_reports where match_id is null;

alter table user_reports
  drop constraint if exists user_reports_match_id_fkey;

alter table user_reports
  alter column match_id set not null,
  add constraint user_reports_match_id_fkey
    foreign key (match_id) references matches(id) on delete cascade;

-- --------------------------------------------
-- 2. Os motivos viram contrato
-- --------------------------------------------
-- Estavam num comentário ao lado de `text`, o que é o mesmo que não estarem: um
-- typo no cliente virava um motivo novo e a moderação passaria a agrupar por um
-- campo que não agrupa. Check em vez de enum de propósito — a lista vai mudar
-- com o que a comunidade trouxer, e mexer num check é um comando; `alter type`
-- não volta atrás sem recriar o tipo.
-- drop antes do add porque constraint não aceita `if not exists`: sem isto o
-- arquivo só roda uma vez, e os outros deste diretório são reexecutáveis.
alter table user_reports
  drop constraint if exists user_reports_motivo_valido;

alter table user_reports
  add constraint user_reports_motivo_valido check (motivo in (
    'NAO_APARECEU',    -- combinou e não apareceu
    'USO_PARA_VENDA',  -- usou o app para vender, não para trocar
    'CARTA_DIFERENTE', -- a carta não era a anunciada (estado, acabamento, edição)
    'CONDUTA',         -- tratamento abusivo
    'OUTRO'
  ));

-- --------------------------------------------
-- 3. Uma denúncia por pessoa por troca
-- --------------------------------------------
-- Sem isto, o botão vira megafone: clicar dez vezes gera dez linhas, e a fila da
-- moderação passa a medir insistência em vez de incidência. Uma por troca é o
-- suficiente — o segundo clique tem 409 e o app diz que já recebemos.
create unique index if not exists idx_denuncia_uma_por_troca
  on user_reports (autor_id, match_id);

-- A fila da moderação lê por aqui: o que ainda não foi resolvido, mais antigo
-- primeiro, porque quem esperou mais espera há mais tempo.
create index if not exists idx_denuncia_pendente
  on user_reports (criado_em) where not resolvido;

-- --------------------------------------------
-- 4. Ninguém lê denúncia pelo PostgREST
-- --------------------------------------------
-- A policy do 09 concede insert a quem for o autor, e nada mais — não há policy
-- de select, então ler já era impossível. O revoke é a camada de baixo (ver
-- 11_grants.sql): o PostgREST checa o GRANT antes da policy, e o Supabase
-- concede ALL por padrão. Escrita continua sendo só pela API, que conecta como
-- owner; sem isto, um usuário logado poderia inserir denúncia direto, forjando
-- `motivo` e escapando da checagem de participação que vive no serviço.
revoke all on user_reports from anon, authenticated;
