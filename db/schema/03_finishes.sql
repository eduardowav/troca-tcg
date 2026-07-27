-- ============================================
-- ACABAMENTOS (finishes)
-- ============================================
-- Tabela de referência, não enum: cada set novo pode introduzir padrões inéditos
-- (Poké Ball, Master Ball, Quick Ball, Love Ball, Team Rocket...). Adicionar um
-- acabamento novo custa um INSERT, não uma migração. Ver seção 8 da doc.
create table finishes (
  id            smallint primary key,
  codigo        text not null unique,        -- 'MASTERBALL'
  nome_pt       text not null,               -- 'Master Ball reverse'
  nome_en       text not null,
  familia       text not null,               -- BASE | REVERSE | ESPECIAL
  multiplicador numeric(4,2) not null default 1.00,  -- peso de valor relativo
  ordem         smallint not null default 0, -- ordem de exibição na UI
  ativo         boolean not null default true
);

insert into finishes (id, codigo, nome_pt, nome_en, familia, multiplicador, ordem) values
  (1,  'NORMAL',     'Normal (sem foil)',   'Non-holo',            'BASE',      1.00, 10),
  (2,  'HOLO',       'Holo',                'Holofoil',            'BASE',      2.00, 20),
  (3,  'REVERSE',    'Reverse holo',        'Reverse holo',        'REVERSE',   1.50, 30),
  (10, 'POKEBALL',   'Poké Ball reverse',   'Poke Ball pattern',   'ESPECIAL',  4.00, 40),
  (11, 'MASTERBALL', 'Master Ball reverse', 'Master Ball pattern', 'ESPECIAL', 12.00, 50),
  (12, 'QUICKBALL',  'Quick Ball reverse',  'Quick Ball pattern',  'ESPECIAL',  4.00, 60),
  (13, 'LOVEBALL',   'Love Ball reverse',   'Love Ball pattern',   'ESPECIAL',  4.00, 61),
  (14, 'FRIENDBALL', 'Friend Ball reverse', 'Friend Ball pattern', 'ESPECIAL',  4.00, 62),
  (15, 'DUSKBALL',   'Dusk Ball reverse',   'Dusk Ball pattern',   'ESPECIAL',  4.00, 63),
  (16, 'ROCKET',     'Equipe Rocket',       'Team Rocket pattern', 'ESPECIAL',  5.00, 64),
  (20, 'SHATTERED',  'Vidro estilhaçado',   'Shattered glass',     'ESPECIAL',  3.00, 70),
  (21, 'COSMOS',     'Cosmos holo',         'Cosmos holo',         'ESPECIAL',  3.00, 71),
  (22, 'CRACKEDICE', 'Cracked ice',         'Cracked ice holo',    'ESPECIAL',  2.50, 72),
  (23, 'SHEEN',      'Sheen',               'Sheen holo',          'REVERSE',   1.20, 73);

-- Quais acabamentos existem para cada carta.
-- Sem isso, o app deixaria alguém anunciar um Master Ball
-- de uma carta que nunca foi impressa nesse padrão.
create table card_finishes (
  card_id     uuid not null references cards(id) on delete cascade,
  finish_id   smallint not null references finishes(id),
  origem      text not null default 'REGRA_SET',
              -- REGRA_SET | API | CURADORIA | COMUNIDADE
  confirmado  boolean not null default false,
  primary key (card_id, finish_id)
);

create index idx_cf_carta on card_finishes (card_id) where confirmado = true;

-- Regras por set: a base do povoamento automático
create table set_finish_rules (
  id          serial primary key,
  set_code    text not null,
  finish_id   smallint not null references finishes(id),
  aplica_a    text not null default 'TODOS',
              -- TODOS | POKEMON_REGULAR | TREINADOR | ENERGIA | RARIDADE:<x>
  observacao  text,
  unique (set_code, finish_id, aplica_a)
);
