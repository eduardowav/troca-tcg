-- ============================================
-- HARDENING DE SEGURANÇA (Supabase / PostgREST)
-- ============================================
-- O Supabase expõe todas as tabelas do schema `public` via PostgREST para a chave
-- `anon` (que vive no frontend). As tabelas de catálogo e o log de eventos ficaram
-- sem RLS no schema original da doc — o que as deixaria abertas a leitura/escrita
-- por qualquer um com a chave pública. A API usa `service_role` (ignora RLS), então:
--   - catálogo: leitura pública, escrita bloqueada (só a API popula);
--   - match_events: log interno, sem política (só service_role acessa).

-- Catálogo: leitura pública (é o que torna a troca possível), escrita só via API.
alter table cards            enable row level security;
alter table finishes         enable row level security;
alter table card_finishes    enable row level security;
alter table set_finish_rules enable row level security;

create policy "catalogo leitura publica"        on cards            for select using (true);
create policy "finishes leitura publica"         on finishes         for select using (true);
create policy "card_finishes leitura publica"    on card_finishes    for select using (true);
create policy "set_finish_rules leitura publica" on set_finish_rules for select using (true);

-- match_events: log interno. Sem política = só service_role (a API) acessa.
alter table match_events enable row level security;

-- Hardening do linter: fixa o search_path da função de reputação.
alter function public.reputacao(public.profiles) set search_path = '';
