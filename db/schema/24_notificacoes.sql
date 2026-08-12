-- ============================================
-- NOTIFICAÇÕES — leitura pelo dono, escrita só pela API, Realtime ligado
-- ============================================
-- A tabela `notifications` nasceu no 08 e ficou parada até a Fase 6. Ligá-la
-- exige três coisas que o 08 não fez: acertar a policy, acertar o grant e pôr a
-- tabela na publicação que o Realtime escuta.
--
-- A diferença desta tabela para as outras é que aqui o frontend **lê direto**.
-- Em todo o resto do app a regra é "o PostgREST não toca em nada" (ver 11 e 23);
-- aqui a leitura direta é o produto: é o Supabase Realtime que faz a badge
-- acender sem polling, e ele entrega a linha ao navegador pelo mesmo caminho do
-- PostgREST. Escrita continua sendo só da API, que conecta como owner.

-- --------------------------------------------
-- 1. Policy: só o dono, e só leitura
-- --------------------------------------------
-- A policy do 09 era `for all using (auth.uid() = user_id)`. Com `for all` e sem
-- `with check`, o Postgres reaproveita o `using` como check de escrita — não há
-- buraco aberto, mas a policy concede mais do que a arquitetura quer conceder, e
-- o dia em que alguém der `grant insert` para `authenticated` sem reler isto,
-- qualquer pessoa passa a poder forjar notificação para si mesma. Trocar por
-- `for select` deixa a intenção escrita na policy, não na ausência de um grant.
drop policy if exists "ve proprias notificacoes" on notifications;

create policy "le proprias notificacoes"
  on notifications for select using (auth.uid() = user_id);

-- --------------------------------------------
-- 2. Grants: select para quem está logado, nada de escrita
-- --------------------------------------------
-- Marcar como lida passa pela API (`POST /me/notifications/read`), e não por um
-- update direto: é lá que mora a regra de que só se marca o que é seu. Sem o
-- grant de update, a policy acima é a única porta e ela é de leitura.
revoke all on notifications from anon, authenticated;
grant select on notifications to authenticated;

-- `anon` fica de fora de propósito: notificação é de alguém, e quem não entrou
-- não é ninguém ainda.

-- --------------------------------------------
-- 3. Realtime
-- --------------------------------------------
-- O Realtime só publica tabela que esteja na publicação `supabase_realtime`, e
-- o `add table` estoura se ela já estiver lá — daí o bloco idempotente, para o
-- arquivo poder rodar de novo num banco que já o recebeu.
--
-- O filtro por usuário é do lado do cliente (`user_id=eq.<id>`), mas quem
-- garante o isolamento é a policy de cima: `postgres_changes` aplica RLS com o
-- token de quem assinou, então uma inscrição sem filtro não entrega a
-- notificação de outra pessoa.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- --------------------------------------------
-- 4. Índice da badge
-- --------------------------------------------
-- O `idx_notif_usuario` do 08 é (user_id, lida, criado_em desc) e serve à lista.
-- A contagem de não lidas é a consulta mais frequente do app — ela roda em toda
-- abertura de tela — e é sempre `lida = false`. O índice parcial cobre só essas
-- linhas, que são poucas por definição: quem lê esvazia o índice.
create index if not exists idx_notif_nao_lidas
  on notifications (user_id, criado_em desc)
  where lida = false;
