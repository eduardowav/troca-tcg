-- ============================================
-- BUSCA — filtro por série, expansão e número
-- ============================================
-- A 13 resolveu *ordenar* 16 mil cartas. Falta *estreitar*: o jogador que quer a
-- Umbreon de Evoluções Prismáticas não deveria ter de reconhecê-la no meio de 33
-- Umbreons, e quem está montando lista de um set só não deveria precisar
-- adivinhar um nome para começar.
--
-- Três coisas mudam:
--
--   1. `filtro_serie` e `filtro_set` estreitam o resultado.
--   2. **O termo deixa de ser obrigatório** quando há filtro. Escolher uma
--      expansão e navegar as 180 cartas dela é um uso legítimo — hoje a tela
--      exigia digitar duas letras antes de mostrar qualquer coisa.
--   3. Com uma expansão escolhida, um termo só de dígitos casa com o **número
--      impresso**: escolher OBF e digitar 125 leva direto à carta. Fora desse
--      caso o número não entra na busca — "125" sem filtro traria uma carta 125
--      de cada uma das 112 expansões, que não ajuda ninguém.
--
-- A assinatura muda, então a versão de 3 argumentos precisa sair: duas
-- sobrecargas com o mesmo nome deixam a chamada por RPC ambígua no PostgREST.

drop function if exists public.buscar_cartas(text, integer, integer);

create or replace function public.buscar_cartas(
  termo text,
  limite integer default 24,
  deslocamento integer default 0,
  filtro_serie text default null,
  filtro_set text default null
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
      -- O jogador pode digitar '%' ou '_'; para o LIKE são curingas. Sem escapar,
      -- buscar por '%' devolveria o catálogo inteiro. Os espaços viram '%', então
      -- "pesquisa professor" acha "Pesquisa de Professores".
      array_to_string(
        array(
          select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')
          from unnest(regexp_split_to_array(t, '\s+')) as p
          where p <> ''
        ),
        '%'
      ) as padrao,
      -- Só vira busca por número com expansão escolhida. O limite de 5 dígitos
      -- é o que impede um termo absurdo de estourar o ::integer.
      (filtro_set is not null and t ~ '^\d{1,5}$') as por_numero
    from (select public.normaliza_busca(termo) as t) n
  ),
  achadas as (
    select
      c.id, c.external_id, c.set_code, c.numero,
      c.nome_pt, c.nome_en, c.raridade, c.imagem_url,
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
      -- Ordenação natural do número impresso: '2' antes de '10', e 'TG01' pelo 1.
      nullif(regexp_replace(c.numero, '\D', '', 'g'), '')::integer as numero_ord
    from cards c
    join sets s on s.code = c.set_code
    cross join entrada e
    where (filtro_serie is null or s.serie_code = filtro_serie)
      and (filtro_set is null or c.set_code = filtro_set)
      -- Sem filtro, ainda é preciso um termo: devolver 16 mil cartas por engano
      -- seria pior que não devolver nada.
      and (length(e.t) >= 2 or filtro_serie is not null or filtro_set is not null)
      and (
        e.t = ''
        or (
          e.por_numero
          and nullif(regexp_replace(c.numero, '\D', '', 'g'), '')::integer
              = e.t::integer
        )
        or c.busca_pt like '%' || e.padrao || '%'
        or c.busca_en like '%' || e.padrao || '%'
        -- `%` é o operador de similaridade do pg_trgm e usa o mesmo índice GIN.
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
    -- só o balde 3 (parecido) se ordena por semelhança; nos outros todos empatam
    -- em null e a decisão cai para a recência logo abaixo.
    (case when relevancia = 3 then semelhanca end) desc nulls first,
    lancado_em desc nulls last,   -- o bloco atual é o que se troca
    numero_ord nulls last,
    numero
  limit greatest(limite, 0)
  offset greatest(deslocamento, 0)
$$;

grant execute on function public.buscar_cartas(text, integer, integer, text, text)
  to anon, authenticated;

-- --------------------------------------------
-- Índices para o modo "navegar a expansão"
-- --------------------------------------------
-- Com filtro e sem termo não há trigram para usar: o plano vira varredura por
-- set. `cards(set_code, numero)` já existe desde a 02.
create index if not exists idx_sets_lancamento on sets (lancado_em desc nulls last);
