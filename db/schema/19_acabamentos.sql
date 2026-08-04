-- =====================================================================
-- 19 — Acabamentos: ligar o diferencial que o schema já previa
-- =====================================================================
-- `card_finishes` e `set_finish_rules` nasceram na 03 e ficaram **vazias**. O
-- resultado é que o app inteiro fingia que toda carta é `NORMAL`: os anúncios
-- existentes são 100% `finish_id = 1`, e o preço mostrado ignorava que a mesma
-- carta sai por US$ 0,13 em normal e US$ 0,22 em reverse. Num quadro de trocas
-- isso não é detalhe cosmético — acabamento é metade do que se negocia, e quem
-- combina "sua reverse pela minha normal" sem saber descobre no encontro, que é
-- o momento em que a troca fura.
--
-- Povoar isso card-a-card custaria dezesseis mil requisições. Não precisa:
-- `card_prices.tipo_tcgplayer` já diz, por evidência de mercado, quais
-- impressões existem — se a TCGplayer publica preço de `reverse-holofoil` para
-- uma carta, aquela carta foi impressa em reverse. O backfill inteiro sai de um
-- SELECT, sem rede.
--
-- O que a evidência de preço **não** cobre são os acabamentos especiais (Poké
-- Ball, Master Ball, Equipe Rocket): a TCGplayer não abre balde próprio para
-- eles, e nada no dado diz que uma carta de 151 tem padrão Master Ball. Esses
-- vêm por curadoria, em `set_finish_rules` — poucas linhas por set.
-- ---------------------------------------------------------------------

-- --------------------------------------------
-- 1. A ponte entre as duas taxonomias
-- --------------------------------------------
-- A `15_precos_tcgplayer.sql` guardou o balde da fonte cru de propósito: ele é
-- mais grosseiro que o nosso `finishes` e misturar os dois criaria bug de
-- interpretação. Mas alguém tem de saber que `reverse-holofoil` é o nosso
-- REVERSE, e esse alguém precisa ser **um só** — a mesma ponte serve para
-- descobrir acabamento a partir de preço (aqui embaixo) e para escolher a linha
-- de preço a partir do acabamento (no frontend, ao mostrar o valor da carta
-- anunciada). Duas cópias da tabela em lugares diferentes é como as duas telas
-- começam a discordar sobre quanto vale a mesma carta.
--
-- A ordem do array é ordem de preferência ao buscar preço: para NORMAL, a
-- `unlimited` antes da `1st-edition` pelo mesmo critério que `types.ts` já
-- usava — assumir a impressão mais comum, porque quase ninguém tem a 1st.
alter table finishes add column tipos_tcgplayer text[] not null default '{}';

comment on column finishes.tipos_tcgplayer is
  'Baldes de card_prices.tipo_tcgplayer que representam este acabamento, em '
  'ordem de preferência. Vazio = a fonte não separa preço para ele.';

update finishes set tipos_tcgplayer = '{normal,unlimited,1st-edition}'
  where codigo = 'NORMAL';
update finishes set tipos_tcgplayer = '{holofoil,unlimited-holofoil,1st-edition-holofoil}'
  where codigo = 'HOLO';
update finishes set tipos_tcgplayer = '{reverse-holofoil}'
  where codigo = 'REVERSE';

-- Os especiais herdam o balde da impressão de que derivam: padrão de Poké Ball
-- é uma reverse, vidro estilhaçado é uma holo. O número que sai daí **subestima**
-- — uma Master Ball não vale o preço da reverse comum, e é para isso que existe
-- `multiplicador`. Quem mostra o valor tem de dizer que é aproximação; a regra
-- ficou sendo "família ESPECIAL ⇒ preço aproximado", sem coluna nova.
update finishes set tipos_tcgplayer = '{reverse-holofoil}'
  where codigo in ('POKEBALL','MASTERBALL','QUICKBALL','LOVEBALL','FRIENDBALL',
                   'DUSKBALL','ROCKET','SHEEN');
update finishes set tipos_tcgplayer = '{holofoil}'
  where codigo in ('SHATTERED','COSMOS','CRACKEDICE');

-- --------------------------------------------
-- 1b. O nome que cabe num chip
-- --------------------------------------------
-- `nome_pt` foi escrito para ler numa linha de detalhe ("Normal (sem foil)",
-- "Master Ball reverse"). Num seletor de quatro opções dentro de um celular de
-- 390px, esses nomes quebram em duas linhas cada e o controle vira parede de
-- texto. O par curto+completo é o mesmo arranjo que as condições já usam
-- (`CONDICOES` em web/src/lib/anuncios.ts: `rotulo` no botão, `dica` no title) —
-- e mora no banco pelo mesmo motivo que a ponte de preço: um lugar só.
alter table finishes add column nome_curto text;

update finishes set nome_curto = case codigo
  when 'NORMAL'     then 'Normal'
  when 'HOLO'       then 'Holo'
  when 'REVERSE'    then 'Reverse'
  when 'POKEBALL'   then 'Poké Ball'
  when 'MASTERBALL' then 'Master Ball'
  when 'QUICKBALL'  then 'Quick Ball'
  when 'LOVEBALL'   then 'Love Ball'
  when 'FRIENDBALL' then 'Friend Ball'
  when 'DUSKBALL'   then 'Dusk Ball'
  when 'ROCKET'     then 'Equipe Rocket'
  when 'SHATTERED'  then 'Vidro'
  when 'COSMOS'     then 'Cosmos'
  when 'CRACKEDICE' then 'Cracked ice'
  when 'SHEEN'      then 'Sheen'
end;

alter table finishes alter column nome_curto set not null;

-- --------------------------------------------
-- 2. Backfill: o que a TCGplayer precifica, a carta tem
-- --------------------------------------------
-- Só as três famílias-base entram por aqui. SHEEN também aponta para
-- `reverse-holofoil`, e sem o recorte toda carta com reverse ganharia um
-- acabamento que ela provavelmente não tem — a ponte serve para ler preço, não
-- para inferir existência de acabamento especial.
--
-- `confirmado = true` porque preço publicado é evidência direta da impressão,
-- não palpite. É também o que põe a linha no índice parcial `idx_cf_carta`.
insert into card_finishes (card_id, finish_id, origem, confirmado)
select p.card_id, f.id, 'API', true
from card_prices p
join finishes f
  on p.tipo_tcgplayer = any (f.tipos_tcgplayer)
 and f.codigo in ('NORMAL', 'HOLO', 'REVERSE')
-- A mesma carta pode ter `normal` e `unlimited`, que caem no mesmo acabamento.
on conflict (card_id, finish_id) do nothing;

-- --------------------------------------------
-- 3. Curadoria por set — os acabamentos que preço nenhum revela
-- --------------------------------------------
-- `aplica_a` foi documentado na 03 com POKEMON_REGULAR/TREINADOR/ENERGIA, e
-- esses três são inavaliáveis: `cards` não guarda a categoria da carta (a 12
-- normalizou set e série, não supertipo). O vocabulário passa a ser o que dá
-- para decidir com o que existe na tabela:
--
--   TODOS          o set inteiro
--   COM_REVERSE    as cartas do set que já têm REVERSE — o recorte natural dos
--                  padrões de bola, que são todos variação de reverse
--   NUMERO:a-b     faixa do número impresso (só numéricos; promo tipo "TG01" fica fora)
--   RARIDADE:x     bate com cards.raridade, já em português na 16
create or replace function aplicar_regras_de_acabamento() returns integer
language plpgsql
set search_path = public
as $$
declare
  inseridos integer;
begin
  insert into card_finishes (card_id, finish_id, origem, confirmado)
  select c.id, r.finish_id, 'REGRA_SET', false
  from set_finish_rules r
  join cards c on c.set_code = r.set_code
  where case
    when r.aplica_a = 'TODOS' then true
    when r.aplica_a = 'COM_REVERSE' then exists (
      select 1 from card_finishes cf where cf.card_id = c.id and cf.finish_id = 3
    )
    when r.aplica_a like 'RARIDADE:%' then c.raridade = substring(r.aplica_a from 10)
    when r.aplica_a like 'NUMERO:%' then
      c.numero ~ '^[0-9]+$'
      and c.numero::integer between
            split_part(substring(r.aplica_a from 8), '-', 1)::integer
        and split_part(substring(r.aplica_a from 8), '-', 2)::integer
    else false
  end
  on conflict (card_id, finish_id) do nothing;

  get diagnostics inseridos = row_count;
  return inseridos;
end
$$;

comment on function aplicar_regras_de_acabamento() is
  'Materializa set_finish_rules em card_finishes. Idempotente: rodar de novo '
  'depois de cadastrar um set novo só acrescenta o que faltava.';

-- `confirmado = false` de propósito: regra de set é inferência sobre um set
-- inteiro, não evidência sobre aquela carta. O dia em que alguém abrir um
-- pacote e confirmar, vira CURADORIA/COMUNIDADE com confirmado = true.

-- 151 (MEW) é o caso que todo mundo conhece: as 165 cartas de Pokémon saíram
-- também em reverse com padrão de Poké Ball e de Master Ball. Os treinadores de
-- 166 em diante e as ilustrações especiais de 182+ não têm os padrões, daí a
-- faixa em vez de TODOS.
--
-- Esta lista é curadoria e cresce por set. Candidatos que ficaram de fora à
-- espera de confirmação de quem abre os pacotes: Evoluções Prismáticas (PRE) e
-- Rivais Predestinados (DRI, padrão Equipe Rocket). Errar para menos aqui é o
-- erro barato: falta um acabamento na lista de escolha, ninguém anuncia carta
-- que não existe.
insert into set_finish_rules (set_code, finish_id, aplica_a, observacao) values
  ('sv03.5', 10, 'NUMERO:1-165', '151 — padrão Poké Ball nas 165 de Pokémon'),
  ('sv03.5', 11, 'NUMERO:1-165', '151 — padrão Master Ball nas 165 de Pokémon')
on conflict (set_code, finish_id, aplica_a) do nothing;

select aplicar_regras_de_acabamento();

-- --------------------------------------------
-- 4. Grants — o mesmo regime do resto do catálogo
-- --------------------------------------------
-- As três tabelas nasceram antes da 11 e continuavam com o ALL que o Supabase
-- concede por padrão. Hoje só a RLS as segura (não há policy de escrita), o que
-- é uma trava a menos do que o resto do catálogo tem — ver 11_grants.sql.
-- Acabamento agora decide preço e decide match; escrita continua sendo só pela
-- API, que conecta como owner e ignora tanto policy quanto grant.
revoke all on finishes, card_finishes, set_finish_rules from anon, authenticated;

grant select on finishes, card_finishes, set_finish_rules to anon, authenticated;
