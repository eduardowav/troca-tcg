-- ============================================
-- CONFERÊNCIA DA RESTAURAÇÃO
-- ============================================
-- Roda **depois** do `pg_restore`, no banco descartável, e é o que transforma
-- "o comando não deu erro" em "o backup restaura". Item 14 da ordem de execução
-- (seção 17): a única linha do backup que nunca tinha sido exercitada.
--
-- Cada bloco levanta exceção ao encontrar problema, e o `psql` roda com
-- `ON_ERROR_STOP=1` — falhar aqui reprova o job.
--
-- A lista de tabelas não está escrita aqui: chega em `:tabelas`, montada pelo
-- workflow a partir dos `create table` de `db/schema/*.sql`. Tabela nova no
-- esquema entra na conferência sozinha; uma lista copiada à mão envelheceria no
-- primeiro `create table` e ninguém perceberia.
--
-- **Por que conferir permissão, e não só dado.** Restaurar é fácil de fazer pela
-- metade: `pg_restore --no-acl` devolve todas as linhas e nenhum `GRANT`. O app
-- sobe, o feed funciona, e `profiles.contato_visivel` volta legível pela anon
-- key — o buraco que o 11_grants.sql fechou, reaberto em silêncio no pior dia
-- possível. Os blocos 4 e 5 abaixo existem por causa disso.

-- --------------------------------------------
-- 1. Toda tabela do esquema voltou
-- --------------------------------------------
do $$
declare
  tabela text;
  faltando text[] := '{}';
begin
  foreach tabela in array string_to_array(:'tabelas', ',') loop
    if to_regclass('public.' || quote_ident(tabela)) is null then
      faltando := faltando || tabela;
    end if;
  end loop;

  if array_length(faltando, 1) is not null then
    raise exception 'tabelas ausentes na restauração: %', array_to_string(faltando, ', ');
  end if;

  raise notice 'ok — % tabelas do esquema restauradas',
    array_length(string_to_array(:'tabelas', ','), 1);
end
$$;

-- --------------------------------------------
-- 2. As tabelas que nunca podem estar vazias
-- --------------------------------------------
-- Tabela criada e vazia é o desfecho silencioso de um restore que trouxe só o
-- esquema — e é exatamente o que sai de um dump feito com `--schema-only` por
-- engano. O catálogo é a maior massa do banco; `profiles` e `auth.users` provam
-- que os dados de gente vieram junto, sem que a contagem apareça no log.
do $$
declare
  alvo text;
  linhas bigint;
begin
  foreach alvo in array array[
    'public.cards', 'public.finishes', 'public.card_finishes',
    'public.series', 'public.sets', 'public.raridades',
    'public.profiles', 'auth.users'
  ] loop
    execute format('select count(*) from %s', alvo) into linhas;
    if linhas = 0 then
      raise exception 'restauração trouxe % vazia', alvo;
    end if;
  end loop;

  raise notice 'ok — catálogo, perfis e contas com linhas';
end
$$;

-- --------------------------------------------
-- 3. RLS ligado onde o 09_rls.sql liga
-- --------------------------------------------
do $$
declare
  tabela text;
  sem_rls text[] := '{}';
  sem_policy text[] := '{}';
begin
  foreach tabela in array array[
    'profiles', 'listings', 'matches', 'match_participants', 'match_items',
    'notifications', 'push_subscriptions', 'term_acceptances', 'user_reports'
  ] loop
    if not (select relrowsecurity from pg_class
             where oid = ('public.' || quote_ident(tabela))::regclass) then
      sem_rls := sem_rls || tabela;
    end if;
    if not exists (select 1 from pg_policies
                    where schemaname = 'public' and tablename = tabela) then
      sem_policy := sem_policy || tabela;
    end if;
  end loop;

  if array_length(sem_rls, 1) is not null then
    raise exception 'RLS desligado depois do restore em: %',
      array_to_string(sem_rls, ', ');
  end if;
  if array_length(sem_policy, 1) is not null then
    raise exception 'sem policy depois do restore em: %',
      array_to_string(sem_policy, ', ');
  end if;

  raise notice 'ok — RLS e policies de volta nas 9 tabelas de usuário';
end
$$;

-- --------------------------------------------
-- 4. O contato continua fora do alcance da anon key
-- --------------------------------------------
-- A regra do produto: contato só aparece depois do aceite mútuo, e quem o
-- entrega é a API. `contato_visivel` legível pelo PostgREST derruba essa regra
-- sem passar por linha nenhuma de código nosso.
do $$
begin
  if has_column_privilege('anon', 'public.profiles', 'contato_visivel', 'select') then
    raise exception 'anon voltou com SELECT em profiles.contato_visivel';
  end if;
  if has_column_privilege('authenticated', 'public.profiles', 'contato_visivel', 'select') then
    raise exception 'authenticated voltou com SELECT em profiles.contato_visivel';
  end if;

  -- E o lado positivo do mesmo grant: o que o frontend lê tem de continuar
  -- legível, senão a checagem de @ e o perfil público quebram.
  if not has_column_privilege('anon', 'public.profiles', 'username', 'select') then
    raise exception 'anon perdeu o SELECT de profiles.username no restore';
  end if;

  raise notice 'ok — grant por coluna de profiles preservado';
end
$$;

-- --------------------------------------------
-- 5. Escrita continua só pela API
-- --------------------------------------------
-- As policies `auth.uid() = id` e `auth.uid() = user_id` existem, mas quem barra
-- a escrita direta pelo PostgREST é o GRANT (ver o fim do 11_grants.sql). Se o
-- restore trouxer a policy e perder o revoke, qualquer pessoa logada volta a
-- poder forjar reputação, se desbloquear e se promover a PRO.
do $$
declare
  papel text;
  operacao text;
begin
  foreach papel in array array['anon', 'authenticated'] loop
    foreach operacao in array array['insert', 'update', 'delete'] loop
      if has_table_privilege(papel, 'public.profiles', operacao) then
        raise exception '% voltou com % em profiles', papel, upper(operacao);
      end if;
      if has_table_privilege(papel, 'public.listings', operacao) then
        raise exception '% voltou com % em listings', papel, upper(operacao);
      end if;
    end loop;
  end loop;

  if not has_table_privilege('anon', 'public.listings', 'select') then
    raise exception 'anon perdeu o SELECT de listings no restore';
  end if;

  raise notice 'ok — escrita direta pelo PostgREST continua fechada';
end
$$;

-- --------------------------------------------
-- 6. As funções que o app chama por nome
-- --------------------------------------------
-- `buscar_cartas` e `resolver_lista` são chamadas por RPC: sumiram no restore, a
-- busca e o cadastro de lista morrem — e morrem com erro de "função não existe",
-- que ninguém liga a um backup de meses atrás.
do $$
declare
  funcao text;
  faltando text[] := '{}';
begin
  foreach funcao in array array[
    'buscar_cartas', 'resolver_lista', 'normaliza_busca', 'participa_do_match'
  ] loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = funcao
    ) then
      faltando := faltando || funcao;
    end if;
  end loop;

  if array_length(faltando, 1) is not null then
    raise exception 'funções ausentes na restauração: %',
      array_to_string(faltando, ', ');
  end if;

  raise notice 'ok — funções de busca e de lista de volta';
end
$$;
