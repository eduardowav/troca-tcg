-- ============================================
-- BUSCA — o plano volta a usar o índice
-- ============================================
-- Sintoma: a busca por nome levava ~245 ms, e a documentação anunciava ~16 ms.
-- Ninguém tinha medido de novo depois da 14.
--
-- O que a investigação achou, medindo em vez de supondo:
--
--   * o corpo da função, rodado solto como statement preparado: **2,6 ms**;
--   * a mesma coisa chamada pela função: **245 ms**;
--   * removendo a cláusula `SET` da declaração: **2,8 ms**;
--   * trocando por outro `SET` qualquer (`set jit = off`): **266 ms**.
--
-- Ou seja, não era o `search_path`, era **haver um `SET`**. Uma função SQL com
-- cláusula `SET` não pode ser *inlined* na consulta que a chama. Sem inlining, o
-- corpo é planejado uma vez com o parâmetro desconhecido — e um índice GIN de
-- trigrama só serve para `like '%' || x || '%'` quando o planejador **enxerga o
-- texto**, porque é dele que os trigramas são extraídos. Com `$1` opaco, não há
-- trigrama para procurar, e sobra varredura sequencial em 16 mil linhas.
--
-- O caminho fácil seria largar o `SET search_path`, e aí a função voltaria a ser
-- inlined. Mas essa cláusula é o endurecimento que a 10 adotou, e trocar
-- segurança por milissegundos é um mau negócio quando existe uma terceira opção.
--
-- A terceira opção é esta: plpgsql com `EXECUTE ... USING`. O `EXECUTE` monta um
-- plano *one-shot* a cada chamada, já com o valor real no lugar do parâmetro —
-- é exatamente a informação que faltava ao planejador. Mede 3,6 a 5,2 ms,
-- conforme o termo, e a cláusula `SET` continua onde estava.
--
-- ⚠️ O texto do SQL é **constante** aqui: nada do que o usuário digita entra na
-- string. Os seis argumentos viajam por `USING`, como parâmetros, que é o que
-- mantém isto imune a injeção. Se algum dia alguém precisar concatenar algo
-- neste corpo, tem de passar por `quote_literal`/`format(%L)` — ou a busca vira
-- uma porta aberta.

create or replace function public.buscar_cartas(
  termo text,
  limite integer default 24,
  deslocamento integer default 0,
  filtro_serie text default null,
  filtro_set text default null,
  filtro_raridade text default null
)
returns table (
  id uuid,
  external_id text,
  set_code text,
  numero text,
  nome_pt text,
  nome_en text,
  raridade text,
  imagem_url text,
  set_nome text,
  set_sigla text,
  total bigint
)
language plpgsql
stable
parallel safe
security invoker
set search_path = public, extensions
as $fn$
begin
  return query execute $q$
  with entrada as (
    select
      t,
      array_to_string(
        array(
          select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
          from unnest(regexp_split_to_array(t, '\s+')) as p
          where p <> ''
        ),
        '%'
      ) as padrao,
      ($5 is not null and t ~ '^\d{1,5}$') as por_numero
    from (select public.normaliza_busca($1) as t) n
  ),
  achadas as (
    select
      c.id, c.external_id, c.set_code, c.numero,
      c.nome_pt, c.nome_en,
      coalesce(r.rotulo, c.raridade) as raridade,
      c.imagem_url,
      s.nome as set_nome, s.sigla as set_sigla,
      case
        when e.por_numero then 0
        when c.busca_pt = e.t or c.busca_en = e.t then 0        -- nome exato
        when c.busca_pt like e.padrao || '%'
          or c.busca_en like e.padrao || '%' then 1             -- começa com
        when c.busca_pt like '%' || e.padrao || '%'
          or c.busca_en like '%' || e.padrao || '%' then 2      -- contém
        else 3                                                  -- parecido (typo)
      end as relevancia,
      greatest(
        similarity(coalesce(c.busca_pt, ''), e.t),
        similarity(c.busca_en, e.t)
      ) as semelhanca,
      s.lancado_em,
      nullif(regexp_replace(c.numero, '\D', '', 'g'), '')::integer as numero_ord
    from cards c
    join sets s on s.code = c.set_code
    left join raridades r on r.fonte = c.raridade
    cross join entrada e
    where ($4 is null or s.serie_code = $4)
      and ($5 is null or c.set_code = $5)
      and ($6 is null or r.rotulo = $6)
      and (
        length(e.t) >= 2
        or $4 is not null
        or $5 is not null
        or $6 is not null
      )
      and (
        e.t = ''
        or (
          e.por_numero
          and nullif(regexp_replace(c.numero, '\D', '', 'g'), '')::integer
              = e.t::integer
        )
        or c.busca_pt like '%' || e.padrao || '%'
        or c.busca_en like '%' || e.padrao || '%'
        or c.busca_pt % e.t
        or c.busca_en % e.t
      )
  )
  select
    id, external_id, set_code, numero,
    nome_pt, nome_en, raridade, imagem_url,
    set_nome, set_sigla,
    count(*) over () as total
  from achadas
  order by
    relevancia,
    (case when relevancia = 3 then semelhanca end) desc nulls first,
    lancado_em desc nulls last,
    numero_ord nulls last,
    numero,
    -- Desempate final, e não é enfeite: `sv10.5w` e `sv10.5b` saíram no mesmo
    -- dia e ambas têm uma carta 087, então as quatro chaves acima empatam e a
    -- ordem entre elas ficava a critério do plano. Com paginação por offset,
    -- ordem instável faz o "Mostrar mais" repetir ou pular carta. Foi trocar o
    -- plano para o problema aparecer — ele já estava aqui.
    id
  limit greatest($2, 0)
  offset greatest($3, 0)
  $q$
  using termo, limite, deslocamento, filtro_serie, filtro_set, filtro_raridade;
end;
$fn$;

grant execute on function
  public.buscar_cartas(text, integer, integer, text, text, text)
  to anon, authenticated;
