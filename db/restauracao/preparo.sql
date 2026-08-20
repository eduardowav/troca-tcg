-- ============================================
-- PREPARO DO BANCO DESCARTÁVEL
-- ============================================
-- Roda **antes** do `pg_restore`, num Postgres 17 vazio (o serviço do runner do
-- GitHub Actions), para que ele consiga receber um dump do Supabase.
--
-- O que falta num Postgres de fábrica não é dado nem esquema: são os **papéis**.
-- O dump traz `GRANT ... TO anon`, `CREATE POLICY ... TO authenticated` e o dono
-- de cada objeto do `auth`. Papel que não existe faz cada uma dessas linhas
-- falhar — e é justamente essa camada (os grants de coluna do 11_grants.sql, as
-- policies do 09_rls.sql) que a conferência precisa provar que voltou.
--
-- Sem isto o caminho mais fácil seria restaurar com `--no-acl`, que engole os
-- erros calando os grants. Um restore assim sobe o app com os dados certos e a
-- proteção errada: `contato_visivel` legível por qualquer um com a anon key.
-- Preferimos criar os papéis e restaurar a permissão junto.
--
-- Papéis sem `LOGIN` e sem senha de propósito: aqui eles existem para receber
-- privilégio, não para conectar. O banco vive alguns minutos e é jogado fora.
do $$
declare
  papel text;
begin
  foreach papel in array array[
    -- Os três que o PostgREST usa, e os únicos que aparecem no `db/schema`.
    'anon', 'authenticated', 'service_role',
    -- Os de infraestrutura do Supabase. Não são citados pelo nosso esquema, mas
    -- são donos de objetos dos esquemas `auth`, `storage` e `realtime`, que vêm
    -- no mesmo dump.
    'authenticator', 'dashboard_user', 'pgbouncer',
    'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin',
    'supabase_read_only_user', 'supabase_realtime_admin',
    'supabase_etl_admin', 'supabase_replication_admin',
    'pgsodium_keyholder', 'pgsodium_keyiduser', 'pgsodium_keymaker'
  ] loop
    if not exists (select 1 from pg_roles where rolname = papel) then
      execute format('create role %I nologin', papel);
    end if;
  end loop;
end
$$;

-- O `postgres` do serviço já é superusuário e é quem restaura. O `--no-owner` do
-- `pg_restore` faz tudo nascer dele; o que importa provar não é quem é dono, é
-- quem tem permissão.
