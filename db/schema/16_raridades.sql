-- =====================================================================
-- 16 — Raridade: um nome só, e uma ordem
-- =====================================================================
-- A varredura da 15 preencheu `cards.raridade` em 100% do catálogo, mas do jeito
-- que a fonte devolve — e a fonte devolve **no idioma da resposta**. Como os
-- blocos anteriores a Black & White só existem no endpoint inglês, o catálogo
-- ficou com 36 valores distintos onde deveria haver bem menos: "Comum" e
-- "Common" são a mesma raridade, "Rara Holo" e "Rare Holo" também, e
-- "Rare Secreta" mistura os dois idiomas numa string só.
--
-- Para exibir isso é feio; para **filtrar** é inviável — o seletor listaria a
-- mesma raridade duas vezes e cada opção acharia metade das cartas.
--
-- A saída é um mapa de tradução, não uma coluna nova em `cards`: `cards.raridade`
-- continua sendo exatamente o que a fonte disse (é dado de origem, e o job
-- reescreve), e a tela lê o rótulo daqui. Mapa é dado, então uma raridade nova
-- amanhã é uma linha inserida, não um deploy.
-- ---------------------------------------------------------------------

create table raridades (
  fonte  text primary key,       -- exatamente como a TCGdex devolveu
  rotulo text    not null,       -- o que a pessoa lê, em português
  ordem  smallint not null       -- do mais comum ao mais raro, para ordenar
);

-- `ordem` agrupa: valores iguais são raridades que ninguém hierarquiza entre si.
-- Promo fica antes de tudo por não ser um degrau de raridade — é origem da carta.
insert into raridades (fonte, rotulo, ordem) values
  ('Promo',                      'Promo',                       5),

  ('Comum',                      'Comum',                      10),
  ('Common',                     'Comum',                      10),

  ('Incomum',                    'Incomum',                    20),
  ('Uncommon',                   'Incomum',                    20),

  ('Rara',                       'Rara',                       30),
  ('Rare',                       'Rara',                       30),

  ('Rara Holo',                  'Rara Holo',                  35),
  ('Rare Holo',                  'Rara Holo',                  35),

  ('Rara Holo V',                'Rara Holo V',                40),
  ('Rara Holo VMAX',             'Rara Holo VMAX',             41),
  ('Rara Holo VSTAR',            'Rara Holo VSTAR',            42),

  -- Raridades de época: cada uma existiu num bloco só e não se compara com as
  -- outras, então dividem a mesma faixa.
  ('Rare PRIME',                 'Rara PRIME',                 45),
  ('Rare Holo LV.X',             'Rara Holo LV.X',             45),
  ('LEGEND',                     'LEGEND',                     45),
  ('Rara Preto e Branco',        'Rara Preto e Branco',        45),
  ('Rara Radiante',              'Rara Radiante',              45),
  ('ACE SPEC Raro',              'ACE SPEC Raro',              45),
  ('Raras Incríveis',            'Rara Incrível',              45),
  -- Nome próprio do subconjunto de Celebrations; traduzir daria "Coleção", que
  -- é palavra proibida no produto (o domínio aqui é troca, não coleção).
  ('Classic Collection',         'Classic Collection',         45),

  ('Rara Dupla',                 'Rara Dupla',                 50),

  ('Ultra Rara',                 'Ultra Rara',                 60),
  ('Ultra Rare',                 'Ultra Rara',                 60),
  ('Brilhante Ultra Rara',       'Brilhante Ultra Rara',       61),

  ('Shiny rara',                 'Shiny Rara',                 65),
  ('Shiny rare',                 'Shiny Rara',                 65),
  ('Shiny rara V',               'Shiny Rara V',               66),
  ('Shiny rara VMAX',            'Shiny Rara VMAX',            67),

  ('Ilustração Rara',            'Ilustração Rara',            70),
  ('Ilustração Rara Especial',   'Ilustração Rara Especial',   75),
  ('Arte Completa de Treinador', 'Arte Completa de Treinador', 75),

  ('Rare Secreta',               'Rara Secreta',               80),
  ('Secret Rare',                'Rara Secreta',               80),

  ('Hiper rara',                 'Hiper Rara',                 90),
  ('Mega Hiper Raro',            'Mega Hiper Rara',            91);

-- A fonte devolve a string "None" para 40 cartas, o que não é uma raridade —
-- é a ausência dela viajando como texto. Sem isso, "None" viraria opção de
-- filtro.
update cards set raridade = null where raridade = 'None';

-- Com a FK, uma raridade que a fonte inventar amanhã não entra em `cards` sem
-- passar por aqui — e o job de preço/raridade cadastra a desconhecida sozinho,
-- com o próprio nome e ordem 99, para nunca falhar a sincronização por causa
-- disso. Ver `api/app/jobs/catalog/precos.py`.
alter table cards
  add constraint cards_raridade_fkey
  foreign key (raridade) references raridades (fonte);

create index cards_raridade_idx on cards (raridade);

-- --------------------------------------------
-- RLS e grants — mesmo regime do resto do catálogo
-- --------------------------------------------
alter table raridades enable row level security;

create policy "raridades leitura publica" on raridades for select using (true);

revoke all on raridades from anon, authenticated;
grant select on raridades to anon, authenticated;
