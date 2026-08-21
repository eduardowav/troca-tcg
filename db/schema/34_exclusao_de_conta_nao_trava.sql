-- ============================================
-- EXCLUIR A CONTA — o direito da LGPD travado por duas foreign keys
-- ============================================
-- Medido em produção em 2026-08-21, com duas contas de teste que percorreram o
-- caminho normal do produto: `DELETE /v1/me` respondia **500**. O checklist de
-- lançamento marcava esse item como pronto desde 14/08 — e estava, no código.
-- O que ninguém tinha feito era apagar uma conta que **usou o app**.
--
-- `profiles.excluir_conta` apaga os matches da pessoa antes de apagar a linha
-- em `auth.users`, porque `match_items` e `match_events` apontam para `profiles`
-- sem ON DELETE. O que faltava é que **duas outras chaves apontam sem ON DELETE
-- para coisas que essa mesma exclusão derruba**:
--
--   term_acceptances.match_id -> matches   (NO ACTION)
--   propostas.vez_de          -> profiles  (NO ACTION)
--
-- A primeira quebra em quem já **revelou um contato**: o aceite da isenção é
-- gravado com o `match_id`, e o `delete from matches` esbarra nele. A segunda
-- quebra em quem já **negociou**: as propostas somem por cascade de `autor_id` /
-- `destinatario_id`, mas `vez_de` é conferida na mesma instrução e não há ordem
-- garantida entre as duas. Ou seja: as duas telas que mais provam que a pessoa
-- usou o app são as que a impediam de sair dele.
--
-- ## Por que SET NULL, e não apagar o aceite junto
--
-- O aceite da isenção é registro legal, e ele é de **duas** pessoas: cada lado
-- da troca grava o seu. Apagar por `match_id` levaria junto o aceite de quem
-- ficou — quem não pediu nada, e cujo registro é justamente a prova de que leu
-- o aviso antes de ver um contato. Com `set null`, o aceite de quem fica
-- sobrevive inteiro (usuário, contexto, versão, IP, data); o que ele perde é o
-- ponteiro para uma troca que deixou de existir. O aceite de quem sai continua
-- sumindo por cascade de `user_id`, como sempre.
--
-- `match_id` já é anulável desde o 07: o aceite de contexto `CADASTRO` nasce sem
-- troca nenhuma. Não é campo esticado para caber aqui.
--
-- A `propostas.vez_de` continua NO ACTION de propósito — uma proposta sem "de
-- quem é a vez" não é uma proposta. Quem resolve essa é o serviço, apagando as
-- propostas da pessoa antes, na mesma linha do que já fazia com os matches.

alter table term_acceptances
  drop constraint term_acceptances_match_id_fkey;

alter table term_acceptances
  add constraint term_acceptances_match_id_fkey
  foreign key (match_id) references matches(id) on delete set null;
