-- ============================================
-- USUÁRIOS
-- ============================================
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  username           text not null unique
                       check (username ~ '^[a-z0-9_]{3,20}$'),
  nome_exibicao      text not null,
  cidade             text not null default 'Belém',
  bairro             text,
  avatar_url         text,
  bio                text check (char_length(bio) <= 200),
  contato_visivel    text,                   -- revelado só após aceite mútuo
  trocas_concluidas  integer not null default 0,
  trocas_furadas     integer not null default 0,
  plano              text not null default 'FREE',
  onboarding_ok      boolean not null default false,
  bloqueado          boolean not null default false,
  criado_em          timestamptz not null default now(),
  ultimo_acesso_em   timestamptz
);

-- Reputação calculada, não armazenada: evita inconsistência
create or replace function reputacao(p profiles)
returns numeric language sql immutable as $$
  select case
    when p.trocas_concluidas + p.trocas_furadas = 0 then null
    else round(
      p.trocas_concluidas::numeric
      / (p.trocas_concluidas + p.trocas_furadas) * 100, 0)
  end
$$;

create index idx_profiles_cidade on profiles (cidade, bairro);
