-- ============================================
-- NOTIFICAÇÕES
-- ============================================
create table notifications (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references profiles(id) on delete cascade,
  tipo      text not null,      -- NOVO_MATCH, CARTA_PROCURADA, MATCH_ACEITO,
                                -- LEMBRETE_CONFIRMACAO, MATCH_EXPIRADO
  titulo    text not null,
  corpo     text not null,
  link      text,
  lida      boolean not null default false,
  criado_em timestamptz not null default now()
);

create index idx_notif_usuario on notifications (user_id, lida, criado_em desc);

create table push_subscriptions (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid not null references profiles(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  criado_em timestamptz not null default now()
);
