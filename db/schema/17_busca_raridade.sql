-- ============================================
-- BUSCA — filtro por raridade, e o nome traduzido
-- ============================================
-- Com a 15 preenchendo `cards.raridade` e a 16 traduzindo os 36 valores da fonte
-- em 28 rótulos, o filtro que a documentação registrava como impossível passa a
-- ser possível. Duas mudanças:
--
--   1. `filtro_raridade` estreita por **rótulo** ("Comum"), não pela string da
--      fonte — assim uma escolha só pega as cartas que vieram como "Comum" e as
--      que vieram como "Common", que são a mesma coisa em blocos diferentes.
--   2. A coluna `raridade` do retorno passa a devolver o **rótulo**, não o valor
--      cru. Quem consome a busca não deveria precisar saber que existe um mapa,
--      nem descobrir "Rare Holo" numa tela em português.
--
-- Como na 14: a assinatura muda, então a versão de 5 argumentos precisa sair
-- antes. Duas sobrecargas com o mesmo nome deixam a chamada ambígua no PostgREST.

drop function if exists public.buscar_cartas(text, integer, integer, text, text);

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
language sql
stable
parallel safe
security invoker
set search_path = public, extensions
as $$
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
      (filtro_set is not null and t ~ '^\d{1,5}$') as por_numero
    from (select public.normaliza_busca(termo) as t) n
  ),
  achadas as (
    select
      c.id, c.external_id, c.set_code, c.numero,
      c.nome_pt, c.nome_en,
      -- O rótulo, com o valor cru como rede: raridade recém-inventada pela fonte
      -- entra no mapa com o próprio nome, mas se algo escapar é melhor mostrar
      -- "Rare Holo" do que um vazio.
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
    where (filtro_serie is null or s.serie_code = filtro_serie)
      and (filtro_set is null or c.set_code = filtro_set)
      and (filtro_raridade is null or r.rotulo = filtro_raridade)
      -- Raridade também dispensa o termo: "me mostre as Ilustração Rara de
      -- Evoluções Prismáticas" é uma pergunta legítima e sem nome no meio.
      and (
        length(e.t) >= 2
        or filtro_serie is not null
        or filtro_set is not null
        or filtro_raridade is not null
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
    numero
  limit greatest(limite, 0)
  offset greatest(deslocamento, 0)
$$;

grant execute on function
  public.buscar_cartas(text, integer, integer, text, text, text)
  to anon, authenticated;
