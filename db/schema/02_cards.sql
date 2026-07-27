-- ============================================
-- CATÁLOGO — Pokémon TCG
-- ============================================
-- Sem tabela de jogos: a v1 é exclusivamente Pokémon.
-- Para adicionar um segundo jogo no futuro:
--   alter table cards add column jogo text not null default 'pokemon';
--   alter table cards drop constraint cards_external_id_key;
--   alter table cards add unique (jogo, external_id);
-- Uma migração, sem refatoração de código.

create table cards (
  id            uuid primary key default uuid_generate_v4(),
  external_id   text not null unique,        -- id no TCGdex (ex.: 'sv3-125')
  set_code      text not null,
  set_nome      text,
  numero        text not null,
  nome_pt       text,                        -- nome em português (Copag)
  nome_en       text not null,               -- fallback e busca cruzada
  raridade      text,
  imagem_url    text,                        -- URL externa, nunca binário
  preco_ref     numeric(10,2),               -- BRL, só para equilibrar sugestões
  preco_atualizado_em timestamptz,
  criado_em     timestamptz not null default now()
);

-- Busca trigram nos dois idiomas: o jogador brasileiro digita
-- "Pesquisa do Professor", não "Professor's Research".
create index idx_cards_busca_pt on cards using gin (nome_pt gin_trgm_ops);
create index idx_cards_busca_en on cards using gin (nome_en gin_trgm_ops);
create index idx_cards_set      on cards (set_code, numero);
