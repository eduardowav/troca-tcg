-- ============================================
-- MATCHES
-- ============================================
create table matches (
  id         uuid primary key default uuid_generate_v4(),
  tipo       match_kind not null,
  status     match_status not null default 'SUGERIDO',
  score      numeric(6,2) not null default 0,
  hash_grupo text not null,        -- dedup: evita sugerir o mesmo match 2x
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz not null default now() + interval '7 days',
  unique (hash_grupo)
);

create index idx_matches_status on matches (status, expira_em);

create table match_participants (
  match_id     uuid not null references matches(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  posicao      smallint not null,          -- 0,1,2 — ordem no ciclo
  respondeu_em timestamptz,
  aceitou      boolean,
  confirmou_conclusao boolean not null default false,
  primary key (match_id, user_id)
);

create index idx_mp_usuario on match_participants (user_id, match_id);

create table match_items (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  card_id       uuid not null references cards(id),
  de_user_id    uuid not null references profiles(id),
  para_user_id  uuid not null references profiles(id),
  condicao      card_condition not null,
  finish_id     smallint not null references finishes(id),
  check (de_user_id <> para_user_id)
);

create index idx_mi_match on match_items (match_id);

create table match_events (
  id        uuid primary key default uuid_generate_v4(),
  match_id  uuid not null references matches(id) on delete cascade,
  user_id   uuid references profiles(id),
  evento    text not null,      -- CRIADO, ACEITO, RECUSADO, CONCLUIDO, NOSHOW
  payload   jsonb,
  criado_em timestamptz not null default now()
);
