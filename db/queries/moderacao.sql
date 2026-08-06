-- =====================================================================
-- Moderação de denúncias — o runbook
-- =====================================================================
-- Não é schema. Nada aqui roda no deploy: é o que uma pessoa executa no SQL
-- Editor do Supabase quando vai ler denúncias. Fica versionado porque a decisão
-- de quem lê e com que contexto é parte do produto, e um punhado de queries
-- salvo no navegador de uma pessoa só não é isso.
--
-- **Por que não há tela nem rota.** A API grava denúncia e não lê nenhuma; o 22
-- revoga `anon` e `authenticated` da tabela. Ler é privilégio de quem tem a
-- connection string, e é de propósito: a fila da moderação contém o relato de
-- alguém sobre outra pessoa, que é o dado mais sensível do app. Construir um
-- painel para ele antes de existir a primeira denúncia seria construir superfície
-- de ataque para uma tabela vazia. Quando a fila crescer a ponto de o SQL Editor
-- incomodar, o caminho já está desenhado: uma rota atrás do `X-Job-Secret`, no
-- padrão de `api/app/routers/internal.py`.
--
-- **O que a moderação pode fazer.** Menos do que parece, e isso é decisão de
-- produto, não limitação. Reputação não se mexe daqui: ela sobe e desce pelos
-- desfechos do match, que exigem os dois lados (`api/app/services/matching.py`).
-- Se a moderação pudesse derrubar o número de alguém, a denúncia viraria arma —
-- é a mesma razão pela qual denunciar não mexe em nada por si só. A única ação
-- forte é `bloqueado = true` (seção 5), que é grave e binária de propósito.
--
-- **Rode uma seção por vez.** As seções 1 a 4 leem; a 5 escreve. No SQL Editor
-- não há transação entre execuções — selecione o trecho e rode só ele. Os
-- `update` da seção 5 vêm com placeholder que não casa com nada, então o pior
-- caso de um "run" no arquivo inteiro é zero linha afetada, mas não conte com
-- isso depois de você ter colado um id de verdade ali.
-- ---------------------------------------------------------------------


-- --------------------------------------------
-- 1. A fila
-- --------------------------------------------
-- O que ainda não foi resolvido, mais antigo primeiro — quem esperou mais espera
-- há mais tempo. Usa `idx_denuncia_pendente` (22_denuncias.sql).
--
-- Os contadores do denunciado vêm junto porque mudam como o relato se lê: uma
-- acusação de furo contra quem tem 40 trocas concluídas e nenhuma furada pede
-- outra dose de ceticismo que a mesma acusação contra quem tem 2 de 5. É a mesma
-- lógica do denominador exposto no perfil público.
select
  r.id            as denuncia_id,
  r.criado_em,
  r.motivo,
  r.descricao,
  autor.username  as quem_relatou,
  alvo.username   as sobre_quem,
  alvo.trocas_concluidas,
  alvo.trocas_furadas,
  alvo.trocas_desistidas,
  reputacao(alvo) as reputacao_do_alvo,
  alvo.bloqueado,
  r.match_id
from user_reports r
join profiles autor on autor.id = r.autor_id
join profiles alvo  on alvo.id  = r.denunciado_id
where not r.resolvido
order by r.criado_em;


-- --------------------------------------------
-- 2. O contexto: que troca era essa
-- --------------------------------------------
-- Cole o `denuncia_id` da seção 1. Devolve uma linha por carta que ia trocar de
-- mão, com quem dava e quem recebia.
--
-- É o que separa moderar de arbitrar. "NAO_APARECEU" solto é a palavra de um
-- contra a do outro; com os itens à vista dá para ver se havia uma Master Ball
-- de um lado e um reverse comum do outro — e uma troca torta explica muita
-- desistência que chegou aqui como furo.
select
  mi.de_user_id = r.denunciado_id as e_do_denunciado,
  de.username    as dava,
  para.username  as recebia,
  c.nome_pt      as carta,
  c.set_code,
  c.numero,
  f.nome_pt      as acabamento,
  mi.condicao
from user_reports r
join match_items mi on mi.match_id = r.match_id
join profiles de    on de.id   = mi.de_user_id
join profiles para  on para.id = mi.para_user_id
join cards c        on c.id    = mi.card_id
join finishes f     on f.id    = mi.finish_id
where r.id = '00000000-0000-0000-0000-000000000000'  -- ← cole o denuncia_id
order by de.username, c.nome_pt;


-- --------------------------------------------
-- 3. O que aconteceu, em ordem
-- --------------------------------------------
-- A linha do tempo do match: quem aceitou, quando, quem confirmou conclusão,
-- quem desistiu. `match_events` é append-only (10_hardening.sql), então isto é
-- o mais perto de um registro imparcial que existe — nenhum dos dois lados
-- consegue reescrevê-lo depois de brigar.
--
-- Repare no intervalo entre o aceite e a denúncia. Denúncia que chega horas
-- depois do aceite, antes de qualquer encontro possível, costuma ser sobre
-- conduta na conversa — não sobre o encontro que ainda nem tinha data.
select
  e.criado_em,
  e.evento,
  quem.username as quem,
  e.payload
from user_reports r
join match_events e on e.match_id = r.match_id
left join profiles quem on quem.id = e.user_id
where r.id = '00000000-0000-0000-0000-000000000000'  -- ← cole o denuncia_id
order by e.criado_em;

-- E o estado dos participantes agora, que os eventos não dão de relance.
select
  p.username,
  mp.aceitou,
  mp.respondeu_em,
  mp.confirmou_conclusao,
  m.status,
  m.expira_em,
  m.prorrogacoes
from user_reports r
join matches m             on m.id  = r.match_id
join match_participants mp on mp.match_id = m.id
join profiles p            on p.id  = mp.user_id
where r.id = '00000000-0000-0000-0000-000000000000'  -- ← cole o denuncia_id
order by mp.posicao;


-- --------------------------------------------
-- 4. Reincidência — dos dois lados
-- --------------------------------------------
-- Cole o `sobre_quem` da seção 1 (o @, não o id).
--
-- As duas metades importam, e a segunda mais do que parece. Quem foi denunciado
-- por cinco pessoas diferentes é um padrão; quem denunciou cinco pessoas
-- diferentes também é, e o app não tem outro lugar onde esse segundo padrão
-- apareça. Uma denúncia é um relato, não um veredito — vale para as duas
-- direções da conta.
select
  'foi denunciado' as papel,
  r.criado_em, r.motivo, r.resolvido,
  outro.username as a_outra_parte,
  r.descricao
from user_reports r
join profiles alvo  on alvo.id  = r.denunciado_id
join profiles outro on outro.id = r.autor_id
where alvo.username = 'coloque_o_arroba_aqui'  -- ← sem o @

union all

select
  'denunciou' as papel,
  r.criado_em, r.motivo, r.resolvido,
  outro.username as a_outra_parte,
  r.descricao
from user_reports r
join profiles autor on autor.id = r.autor_id
join profiles outro on outro.id = r.denunciado_id
where autor.username = 'coloque_o_arroba_aqui'  -- ← o mesmo @

order by criado_em desc;


-- --------------------------------------------
-- 5. Decidir
-- --------------------------------------------
-- Marcar como lida. `resolvido` quer dizer "uma pessoa leu e decidiu", não "o
-- denunciado foi punido" — a maioria das denúncias se resolve sem nenhuma ação,
-- e é assim mesmo.
--
-- Limitação conhecida: a tabela não guarda *o que* foi decidido, nem quando, nem
-- por quem — `resolvido` é um booleano e nada mais. Com volume real isso vira
-- problema (a segunda denúncia sobre a mesma pessoa chega sem saber como a
-- primeira terminou). O acerto é uma migração com `resolvido_em`, `resolvido_por`
-- e `nota`, e ela deve vir junto com a primeira leva de denúncias de verdade, não
-- antes: hoje não há decisão nenhuma para registrar.
update user_reports
set resolvido = true
where id = '00000000-0000-0000-0000-000000000000';  -- ← cole o denuncia_id

-- O caso grave. Bloquear tira a pessoa do matcher e do perfil público de uma vez
-- (`api/app/services/matching.py`, `profiles.perfil_publico`) — ela deixa de ser
-- sugerida, deixa de ser encontrável, e as trocas que já existem não somem.
--
-- Não é reversível sozinho: quem bloqueia é quem desbloqueia, e não há tela para
-- nenhum dos dois. Reserve para o que não tem volta — fraude declarada, ameaça,
-- uso do app para vender de forma sistemática. Furar uma troca não é isso; para
-- isso serve a reputação, que já cai sozinha.
update profiles
set bloqueado = true
where username = 'coloque_o_arroba_aqui';  -- ← sem o @

-- Desfazer, se for o caso.
-- update profiles set bloqueado = false where username = 'coloque_o_arroba_aqui';
