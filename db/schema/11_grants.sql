-- ============================================
-- GRANTS DO POSTGREST (anon / authenticated)
-- ============================================
-- O 10_hardening.sql cuidou das *policies*. Falta a camada de baixo: os GRANTs.
-- O Supabase concede ALL em todas as tabelas de `public` para `anon` e
-- `authenticated` por padrão, e o PostgREST checa o GRANT antes da policy. Com
-- grant de tabela inteira, duas coisas quebravam a arquitetura documentada:
--
--   1. `contato_visivel` era legível por qualquer um com a anon key — viola a
--      regra de que contato só aparece após o aceite mútuo (04_profiles.sql).
--   2. `authenticated` tinha UPDATE em profiles e ALL em listings. Somado às
--      policies `auth.uid() = id` / `auth.uid() = user_id`, qualquer usuário
--      logado podia escrever direto pelo PostgREST, sem passar pela API:
--        - forjar reputação (trocas_concluidas / trocas_furadas);
--        - se desbloquear (bloqueado = false) ou se promover (plano);
--        - criar anúncios ignorando os limites de app/core/limites.py.
--
-- A regra é: **escrita só pela API**, que conecta como owner (asyncpg) e por isso
-- ignora RLS e estes grants. O frontend, com a anon key, só lê — hoje apenas
-- `profiles.username` (checagem de @) e o catálogo `cards`.
--
-- Detalhe do Postgres que torna o revoke de coluna sozinho inútil: privilégio de
-- tabela cobre todas as colunas, então `revoke select (contato_visivel)` é um
-- no-op enquanto existir SELECT de tabela. É preciso revogar a tabela e
-- reconceder coluna a coluna.

-- --------------------------------------------
-- profiles: leitura pública menos o contato, zero escrita
-- --------------------------------------------
revoke all on profiles from anon, authenticated;

grant select (
  id,
  username,
  nome_exibicao,
  cidade,
  bairro,
  avatar_url,
  bio,
  trocas_concluidas,
  trocas_furadas,
  plano,
  onboarding_ok,
  bloqueado,
  criado_em,
  ultimo_acesso_em
) on profiles to anon, authenticated;

-- --------------------------------------------
-- listings: leitura (a policy já limita a ativo = true), zero escrita
-- --------------------------------------------
revoke all on listings from anon, authenticated;

grant select on listings to anon, authenticated;

-- Pegadinha para quem for mexer no frontend: com grant por coluna, um
-- `.select('*')` em profiles pela anon key passa a devolver 401, porque o `*` do
-- PostgREST expande para colunas que incluem contato_visivel. Sempre listar as
-- colunas explicitamente, como faz web/src/lib/perfil.ts.

-- As policies "edita proprio perfil" e "gerencia proprios anuncios" continuam
-- existindo de propósito: sem GRANT elas não concedem nada, e ficam prontas caso
-- algum dia o frontend passe a escrever direto. Quem barra a escrita hoje é o
-- GRANT — se alguém reconceder a tabela inteira, o buraco volta.
