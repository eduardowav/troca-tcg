-- ============================================
-- TERMOS E ISENÇÃO
-- ============================================
create table term_acceptances (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references profiles(id) on delete cascade,
  contexto    text not null,       -- 'CADASTRO' | 'REVELACAO_CONTATO'
  versao      text not null,       -- '2026-07-01'
  match_id    uuid references matches(id),
  ip          inet,
  aceito_em   timestamptz not null default now()
);

create index idx_termos_usuario on term_acceptances (user_id, contexto);

-- ============================================
-- DENÚNCIAS
-- ============================================
create table user_reports (
  id            uuid primary key default uuid_generate_v4(),
  autor_id      uuid not null references profiles(id) on delete cascade,
  denunciado_id uuid not null references profiles(id) on delete cascade,
  match_id      uuid references matches(id),
  motivo        text not null,     -- NAO_APARECEU, USO_PARA_VENDA,
                                   -- CARTA_DIFERENTE, CONDUTA, OUTRO
  descricao     text,
  resolvido     boolean not null default false,
  criado_em     timestamptz not null default now(),
  check (autor_id <> denunciado_id)
);
