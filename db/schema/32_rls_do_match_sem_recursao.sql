-- ============================================
-- A REDE DE SEGURANÇA DO MATCH, QUE NUNCA SEGUROU NADA
-- ============================================
-- As três policies de leitura do `09_rls.sql` — "ve proprios matches", "ve
-- propria participacao" e "ve itens dos proprios matches" — não funcionam desde
-- que foram escritas. Qualquer `select` nas três tabelas pela anon key responde:
--
--     infinite recursion detected in policy for relation "match_participants"
--
-- A causa está na policy do meio. Ela protege `match_participants` com uma
-- subconsulta *na própria* `match_participants`, e avaliar essa subconsulta
-- exige avaliar a policy de novo, sem fim. As outras duas caem junto porque as
-- duas consultam `match_participants` para saber quem participa.
--
-- Nada quebrou em produção porque nenhuma tela lê estas tabelas direto: toda a
-- troca passa pela API, que conecta como owner e não é submetida a RLS. Ou seja,
-- a "rede de segurança caso alguém acesse o Postgres direto" que o cabeçalho do
-- `09_rls.sql` promete era, nas três tabelas do match, um erro 500 — e um erro
-- 500 é uma proteção por acidente, que some no dia em que alguém arruma o
-- sintoma sem entender a causa.
--
-- Descoberto em 2026-08-18, exercitando as policies com um JWT de participante
-- real em vez de as lendo. É a mesma lição do item 7 da ordem de execução:
-- conferir proteção por leitura do arquivo é o mesmo que não conferir.

-- --------------------------------------------
-- Quem quebra o laço
-- --------------------------------------------
-- `security definer` roda como o dono da tabela, e o dono não é submetido a RLS
-- — então a consulta a `match_participants` daqui de dentro não dispara a policy
-- que a chamou. É o padrão que o Supabase documenta para exatamente este caso.
--
-- `search_path = ''` pelo mesmo motivo do `10_hardening.sql`, e aqui não é
-- higiene: uma função `security definer` roda com os privilégios do dono, então
-- um `search_path` que quem chama controla é um caminho para executar código
-- como postgres. Todos os nomes ficam qualificados.
--
-- `stable` permite ao planejador chamá-la uma vez por linha em vez de uma vez
-- por referência, e `auth.uid()` não muda durante a consulta.
create or replace function public.participa_do_match(m uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match_participants mp
    where mp.match_id = m
      and mp.user_id = (select auth.uid())
  )
$$;

-- Quem pode chamar. `revoke from public` primeiro porque função nasce com
-- EXECUTE para todo mundo, e uma função `security definer` aberta é pior que uma
-- tabela aberta. Perguntar "eu participo deste match?" só devolve informação
-- sobre quem pergunta, então `anon` e `authenticated` podem.
revoke all on function public.participa_do_match(uuid) from public;
grant execute on function public.participa_do_match(uuid) to anon, authenticated;

-- --------------------------------------------
-- As três policies, agora sem o laço
-- --------------------------------------------
drop policy if exists "ve proprios matches" on matches;
create policy "ve proprios matches"
  on matches for select using (public.participa_do_match(id));

drop policy if exists "ve propria participacao" on match_participants;
create policy "ve propria participacao"
  on match_participants for select using (public.participa_do_match(match_id));

drop policy if exists "ve itens dos proprios matches" on match_items;
create policy "ve itens dos proprios matches"
  on match_items for select using (public.participa_do_match(match_id));
