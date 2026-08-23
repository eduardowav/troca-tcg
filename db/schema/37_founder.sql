-- =====================================================================
-- 37 — Selo: quem é reconhecido no perfil, começando pelo FOUNDER
-- =====================================================================
-- Decisão do Eduardo em 2026-08-23. O FOUNDER é para ele e para quem ajudou a
-- construir o app antes de existir usuário. **Não se compra**, e essa é a
-- característica que o define — não há tela, rota nem preço que o conceda.
--
-- ## Por que não é um plano
--
-- O pedido nasceu como "um plano novo, FOUNDER". Não é, e a diferença importa:
-- os limites são os mesmos do PRO. Um terceiro valor em `plano` obrigaria
-- `PLANOS`, `limites_de`, a rota `/planos`, a tela e os testes a aprender um
-- caso que se comporta igual ao segundo — exatamente o que `36_parceiro.sql`
-- descartou há um dia, pelo mesmo motivo. Regra de plano duplicada é onde bug
-- de plano nasce.
--
-- O que o FOUNDER é, de verdade, é **identidade**: uma marca que as outras
-- pessoas veem no perfil. Por isso mora numa coluna própria, e o acesso PRO
-- continua vindo de onde já vinha — `plano = 'PRO'` com `parceiro_motivo`
-- preenchido, o mecanismo do 36. As duas coisas são independentes de propósito:
-- é possível ser FOUNDER e não ser PRO, e vice-versa. Quem manda no limite é o
-- `plano`, sempre; esta coluna não afeta permissão nenhuma.
--
-- ## Uma coluna, e não uma tabela de selos
--
-- O Eduardo tem outros selos em mente ("os selos de nome"). A tabela
-- `profile_badges` que aquilo vai pedir — vários selos por pessoa, cada um com
-- data e motivo — não é o que hoje se sabe o suficiente para desenhar, e
-- construí-la agora significaria adivinhar o formato dos selos que ainda não
-- existem. Uma coluna com um selo atende o caso real de hoje e migra para a
-- tabela em uma passada, quando as regras dos outros selos estiverem claras.
--
-- O `check` é deliberado, ao contrário do texto livre do `parceiro_motivo`: lá o
-- conteúdo é um acordo com uma pessoa, aqui é vocabulário do sistema, e a tela
-- desenha a partir dele. Selo novo é uma linha nesta lista — e é bom que exija
-- passar por aqui, porque cada valor novo é um desenho novo na interface.
--
-- ## Como se concede e como se tira
--
--   update profiles
--      set selo = 'FOUNDER',
--          plano = 'PRO',
--          parceiro_motivo = 'Fundador — ajudou antes do lançamento'
--    where username = 'fulano';
--
-- Revogar o selo é `set selo = null`. Isso **não** rebaixa o plano: quem tirar o
-- selo e quiser tirar o PRO junto precisa dizer as duas coisas, como no 36.
--
-- Ninguém cai sozinho: a queda de plano é do job `encerrar_carencias`, cujo
-- `where` exige `plano_expira_em is not null`, e quem nunca assinou não tem
-- carência.

alter table profiles
  add column if not exists selo text;

alter table profiles
  drop constraint if exists profiles_selo_check;

alter table profiles
  add constraint profiles_selo_check
  check (selo is null or selo in ('FOUNDER'));

comment on column profiles.selo is
  'Selo de reconhecimento exibido no perfil público. Nulo = sem selo. '
  'Não concede permissão nenhuma: quem manda no limite é profiles.plano. '
  'Ver 37_founder.sql.';

-- Para a consulta de auditoria "quem tem selo?". Parcial porque a coluna é nula
-- em quase toda a tabela, e índice cheio de nulo é peso sem uso — mesmo
-- raciocínio do índice de parceiro no 36.
create index if not exists idx_profiles_selo
  on profiles (selo)
  where selo is not null;
