-- ============================================
-- ANÚNCIOS DE TROCA — o coração do sistema
-- ============================================
-- Toda linha aqui é uma carta disponível para troca ou procurada.
-- Não existe carta "guardada": se está cadastrada, está em negociação.
create table listings (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  card_id     uuid not null references cards(id),
  tipo        listing_kind not null,
  quantidade  smallint not null default 1 check (quantidade between 1 and 99),
  condicao    card_condition not null default 'NM',
  finish_id   smallint not null references finishes(id),
  idioma      char(2) not null default 'pt',
  prioridade  smallint not null default 2 check (prioridade between 1 and 3),
  -- quando true no PROCURA, o matcher pode sugerir acabamento diferente
  -- (com penalidade e rótulo explícito). Ver seção 8.6 da doc.
  aceita_qualquer_finish boolean not null default false,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (user_id, card_id, tipo, condicao, finish_id, idioma)
);

-- Índices que sustentam o matching. Sem eles, a query degrada rápido.
-- O acabamento entra no índice: o matching casa carta E acabamento.
create index idx_listings_matching on listings (card_id, finish_id, tipo, user_id)
  where ativo = true;
create index idx_listings_usuario  on listings (user_id, tipo)
  where ativo = true;
