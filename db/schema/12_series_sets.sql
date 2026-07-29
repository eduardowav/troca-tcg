-- ============================================
-- CATÁLOGO — séries (blocos) e sets (expansões)
-- ============================================
-- Até aqui o set vivia desnormalizado em `cards.set_code` / `cards.set_nome`: o
-- nome da expansão era repetido em cada carta e não havia onde guardar o resto
-- dos metadados (sigla oficial, data de lançamento, quantas cartas o set tem).
-- Com o bloco Escarlate & Violeta entrando são 26 sets e ~4.700 cartas, e o
-- catálogo japonês/chinês — próximo pedido — precisa de um lugar para a região
-- que não seja uma coluna repetida milhares de vezes. Esse lugar é `sets`.
--
-- A hierarquia é a da própria fonte (TCGdex): série (bloco) → set → carta.

-- --------------------------------------------
-- series: o bloco. 'sv' = Escarlate e Violeta, 'me' = Megaevolução.
-- --------------------------------------------
create table series (
  code        text primary key,             -- id na TCGdex (ex.: 'sv')
  nome        text not null,
  logo_url    text,
  criado_em   timestamptz not null default now()
);

-- --------------------------------------------
-- sets: a expansão.
-- --------------------------------------------
-- `sigla` é a abreviação oficial impressa na carta ('OBF', 'PRE'). É assim que o
-- jogador lê o código do canto — "OBF 125/197", não "SV03 125". A UI ainda mostra
-- o set_code; a sigla fica pronta para quando isso mudar.
create table sets (
  code           text primary key,          -- id na TCGdex (ex.: 'sv03')
  serie_code     text references series(code) on delete restrict,
  nome           text not null,
  sigla          text,                      -- abreviação oficial: 'OBF'
  total_oficial  integer,                   -- numerador impresso (197)
  total_impresso integer,                   -- com secretas (230)
  logo_url       text,
  simbolo_url    text,
  lancado_em     date,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index idx_sets_serie on sets (serie_code);

-- --------------------------------------------
-- Backfill dos sets que já existiam em `cards`
-- --------------------------------------------
-- `serie_code` é nullable só por causa daqui: as cartas já carregadas não
-- guardam a que bloco pertencem, e não dá para derivar do código ('mee' e 'mep'
-- são da série 'me', mas nenhuma regra de prefixo acerta os dois). O sync
-- preenche a série no primeiro run; depois disso, set sem série é anomalia.
insert into sets (code, nome)
select set_code, coalesce(max(set_nome), set_code)
from cards
group by set_code
on conflict (code) do nothing;

-- --------------------------------------------
-- cards passa a apontar para sets
-- --------------------------------------------
alter table cards
  add constraint cards_set_code_fkey
  foreign key (set_code) references sets (code) on delete restrict;

-- O nome do set agora tem dono único. Ninguém no frontend lia esta coluna (só
-- `set_code` aparece na UI), então a remoção não custa tela nenhuma.
alter table cards drop column set_nome;

-- --------------------------------------------
-- RLS e grants — mesmo regime do resto do catálogo
-- --------------------------------------------
-- Leitura pública (é o que permite montar filtros por bloco/expansão no app),
-- escrita só pela API, que conecta como owner e ignora RLS. Ver 10_hardening.sql
-- e 11_grants.sql para o porquê de o GRANT ser a trava de verdade, não a policy.
alter table series enable row level security;
alter table sets   enable row level security;

create policy "series leitura publica" on series for select using (true);
create policy "sets leitura publica"   on sets   for select using (true);

revoke all on series, sets from anon, authenticated;
grant select on series, sets to anon, authenticated;
