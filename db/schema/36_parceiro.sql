-- =====================================================================
-- 36 — Parceiro: PRO que não paga, e o registro do porquê
-- =====================================================================
-- Decisão do Eduardo em 2026-08-22, junto com a de ligar a cobrança já no
-- lançamento. Existem pessoas que precisam ter o PRO sem pagar por ele: loja
-- que patrocina, permuta de serviço, contrato. Até aqui isso só era possível
-- escrevendo `plano = 'PRO'` na mão — o que funciona e é indistinguível de
-- quem paga. Seis meses depois ninguém sabe mais quem é quem, e a pergunta
-- "quantos assinantes o app tem?" passa a ter duas respostas.
--
-- ## Uma coluna de motivo, e não um plano novo
--
-- O caminho óbvio seria um `plano = 'PARCEIRO'`. Foi descartado: os limites
-- seriam idênticos aos do PRO, então o valor novo obrigaria `PLANOS`,
-- `limites_de`, a tela e os testes a aprender um terceiro caso que se comporta
-- igual ao segundo. Regra de negócio duplicada é onde bug de plano nasce.
--
-- Aqui o `plano` continua `'PRO'` e **toda a regra de limites segue valendo sem
-- uma linha de código nova**. Esta coluna responde só a pergunta que faltava:
-- por que esta pessoa é PRO sem assinatura.
--
-- ## Por que texto livre em vez de um enum de motivos
--
-- Porque o motivo é um acordo com uma pessoa, não uma categoria do sistema.
-- "Loja Arena Card, patrocínio fechado em 03/2026, revisar em 03/2027" é o que
-- alguém precisa ler daqui a um ano. Um enum com `PATROCINIO | PERMUTA | OUTRO`
-- guardaria menos e obrigaria a manter a explicação de verdade noutro lugar —
-- que na prática é uma planilha que ninguém acha.
--
-- Nulo é o normal: a esmagadora maioria não é parceiro.
--
-- ## O que garante que essas contas nunca caem
--
-- Nada precisa garantir, e é essa a elegância. A queda de plano é feita pelo
-- job `encerrar_carencias`, cujo `where` exige `plano_expira_em is not null` —
-- e quem é parceiro não tem assinatura, logo nunca ganha carência. A conta fica
-- PRO até alguém apagar esta coluna de propósito.
--
-- Revogar é `set parceiro_motivo = null, plano = 'FREE'`. As duas juntas: a
-- coluna sozinha não rebaixa ninguém, porque quem manda no limite é o `plano`.

alter table profiles
  add column if not exists parceiro_motivo text;

comment on column profiles.parceiro_motivo is
  'Por que esta conta é PRO sem pagar (patrocínio, permuta, contrato). '
  'Nulo = não é parceiro. Não afeta limite nenhum: quem manda é profiles.plano.';

-- Só para achar os parceiros numa consulta de auditoria — "quem tem PRO sem
-- assinatura?". Parcial porque a coluna é nula em quase toda a tabela, e um
-- índice cheio de nulos é peso sem uso.
create index if not exists idx_profiles_parceiro
  on profiles (id)
  where parceiro_motivo is not null;
