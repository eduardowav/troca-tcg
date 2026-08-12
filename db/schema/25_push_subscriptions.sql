-- ============================================
-- INSCRIÇÕES DE PUSH — escrita e leitura só pela API
-- ============================================
-- A tabela nasceu no 08 e ficou parada até o Web Push. Ligá-la não exige nada
-- do PostgREST: ao contrário de `notifications` (ver o 24), aqui o frontend
-- **não** lê nada — ele fala com `POST /me/push-subscription` e pronto. Quem
-- guarda e apaga é a API, que conecta como owner.
--
-- Esta migração é a metade de `push_subscriptions` do item "miúdos" da varredura
-- de segurança de 2026-08-11: a policy do 09 era `for all` sem `with check`, e a
-- tabela nunca recebeu o `revoke` que `profiles`, `listings` e `propostas`
-- receberam. Não havia buraco — sem grant, a policy nunca chegava a ser
-- consultada —, mas a defesa em profundidade estava desigual, e o dia em que
-- alguém der `grant insert` para `authenticated` sem reler isto, qualquer pessoa
-- passa a poder inscrever o próprio navegador em nome de outra.

-- --------------------------------------------
-- 1. Grants: nada para quem vem pelo navegador
-- --------------------------------------------
revoke all on push_subscriptions from anon, authenticated;

-- --------------------------------------------
-- 2. Policy: leitura do dono, e só
-- --------------------------------------------
-- Fica de pé mesmo sem grant nenhum, e é de propósito: é ela que descreve a
-- intenção. Se um dia a tabela precisar ser lida direto — uma tela que liste
-- "os aparelhos onde você recebe aviso" —, o `grant select` sozinho já bastará,
-- sem ninguém precisar reconstruir a regra de quem pode ver o quê.
drop policy if exists "gerencia propria inscricao push" on push_subscriptions;

create policy "le propria inscricao push"
  on push_subscriptions for select using (auth.uid() = user_id);

-- --------------------------------------------
-- 3. Índice do envio
-- --------------------------------------------
-- Todo push começa por "quais aparelhos são desta pessoa". O 08 criou só o
-- unique de `endpoint`, que serve ao upsert da inscrição e não a esta pergunta.
create index if not exists idx_push_usuario
  on push_subscriptions (user_id);
