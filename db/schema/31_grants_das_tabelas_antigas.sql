-- ============================================
-- GRANTS DAS TABELAS ANTIGAS + search_path de normaliza_busca
-- ============================================
-- O `11_grants.sql` fechou `profiles` e `listings`, e todo arquivo posterior a
-- ele nasceu fechado — `propostas`, `card_alerts`, `subscriptions`,
-- `webhook_events` e `phone_verifications` não têm grant nenhum para `anon` nem
-- para `authenticated`. Ficaram de fora as tabelas criadas *antes* dele: as do
-- `02_cards.sql`, do `06_matches.sql` e do `07_terms_reports.sql`, que seguem
-- com o `grant all` que o Supabase concede por padrão — INSERT, UPDATE e
-- REFERENCES inclusive.
--
-- **Hoje isso não abre porta nenhuma, e foi medido**: com um JWT de participante
-- real, `insert` em `match_events`, `update` em `matches`, `insert` em
-- `term_acceptances`, em `cards` e em `match_participants` foram todos recusados.
-- Quem recusa é o RLS: as policies do `09_rls.sql` são todas `for select`, e uma
-- tabela com RLS ligado e sem policy de escrita não aceita escrita.
--
-- O problema é que essa é a *única* barreira, e ela é frágil no lugar errado.
-- Três policies deste mesmo schema são `for all` (`notifications`,
-- `push_subscriptions`, `gerencia proprios anuncios`), e trocar `for select` por
-- `for all` numa destas seis tabelas é o tipo de edição que se faz sem pensar —
-- ela parece conceder leitura a quem é participante e passa a conceder escrita
-- também. Com o grant fechado, o mesmo deslize não vira nada.
--
-- É o aviso que o próprio `11_grants.sql` termina fazendo, do outro lado: "quem
-- barra a escrita hoje é o GRANT". Aqui era o contrário — quem barrava era só a
-- policy —, e esta é a segunda camada que faltava.

-- --------------------------------------------
-- Catálogo: leitura pública, zero escrita
-- --------------------------------------------
-- O frontend lê `cards` direto pela anon key (web/src/hooks/useAnuncios.ts), e
-- a policy "catalogo leitura publica" do 10_hardening já diz que pode. O que
-- não pode é escrever: o catálogo é populado pelo job de sync, que conecta como
-- owner e não passa por aqui.
revoke all on cards from anon, authenticated;
grant select on cards to anon, authenticated;

-- --------------------------------------------
-- Matches: leitura de participante, zero escrita
-- --------------------------------------------
-- O SELECT volta porque as policies do `09_rls.sql` o pressupõem — elas limitam
-- a quem participa do match, e é essa a leitura declarada. Nenhuma tela usa isso
-- hoje (toda a troca passa pela API), mas revogar a leitura seria desfazer uma
-- decisão do 09 sem que este arquivo tenha motivo para tanto. A escrita, sim,
-- nunca foi declarada em lugar nenhum.
revoke all on matches            from anon, authenticated;
revoke all on match_participants from anon, authenticated;
revoke all on match_items        from anon, authenticated;

grant select on matches            to anon, authenticated;
grant select on match_participants to anon, authenticated;
grant select on match_items        to anon, authenticated;

-- --------------------------------------------
-- match_events: nada, e é o ponto
-- --------------------------------------------
-- O `10_hardening.sql` ligou o RLS aqui sem escrever policy nenhuma, de
-- propósito: é a trilha de auditoria da troca, e ninguém a lê pelo PostgREST.
-- O grant aberto contradizia essa decisão em silêncio.
revoke all on match_events from anon, authenticated;

-- --------------------------------------------
-- term_acceptances: leitura do próprio aceite, zero escrita
-- --------------------------------------------
-- Escrever aqui é o que o modal de isenção existe para impedir: o aceite é
-- gravado pela API, com o IP de quem aceitou, no mesmo passo que revela o
-- contato. Um INSERT direto pularia a única prova de que a pessoa leu o texto.
revoke all on term_acceptances from anon, authenticated;
grant select on term_acceptances to anon, authenticated;

-- --------------------------------------------
-- Tabela nova nasce fechada
-- --------------------------------------------
-- A causa de tudo acima: o Supabase deixa um `default privileges` de `ALL` em
-- `public` para `anon` e `authenticated`, então toda tabela criada aqui já nasce
-- escrevível e depende de alguém lembrar de revogar. Os arquivos 22 em diante
-- lembraram; os de julho não tinham como saber.
--
-- É a mesma inversão que o `core/auth.py` fez com o bloqueio de conta: em vez de
-- marcar uma a uma as que precisam ser fechadas — e um esquecimento abrir um
-- buraco calado —, fecha-se tudo e a exceção se declara. Esquecer passa a ser
-- seguro: uma tabela nova nasce sem grant e falha visivelmente na primeira
-- leitura, em vez de aceitar escrita sem ninguém notar.
--
-- A leitura do catálogo e a do perfil público continuam concedidas explicitamente
-- pelos arquivos que as declaram, que é onde a decisão deve estar escrita.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

-- ============================================
-- search_path de normaliza_busca
-- ============================================
-- O linter do Supabase reclama de função sem `search_path` fixo desde sempre, e
-- o `10_hardening.sql` já tratou a `reputacao()`. A `normaliza_busca` ficou de
-- fora porque nasceu depois dele, no `13_busca_cartas.sql`.
--
-- O corpo dela já qualifica o que importa (`extensions.unaccent` e o
-- `'extensions.unaccent'::regdictionary`), e `lower` mora em `pg_catalog`, que é
-- procurado sempre. Por isso `search_path = ''` não muda o resultado — muda só
-- quem pode influenciar a resolução dos nomes.
--
-- Vale mais aqui do que numa função comum: esta alimenta as colunas geradas
-- `cards.busca_pt` e `cards.busca_en`, que são `stored` e indexadas. Uma função
-- IMMUTABLE que devolvesse coisa diferente conforme o `search_path` de quem
-- escreve produziria índice divergindo da tabela — o tipo de defeito que não dá
-- erro, só devolve a carta errada.
--
-- `ALTER FUNCTION ... SET` é mudança de metadado: não reescreve a tabela e não
-- invalida as colunas geradas.
alter function public.normaliza_busca(text) set search_path = '';
