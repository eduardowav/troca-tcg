-- ============================================
-- BUSCA — a similaridade vira rede, e a carta sem imagem vai para o fim
-- ============================================
-- Dois defeitos achados pelo Eduardo usando o app em 2026-08-25.
--
-- ## "snorlax" trazia snom e snorunt
--
-- O `where` da 18 aceitava quatro caminhos, e o último era `busca_pt % termo` —
-- o operador de similaridade do pg_trgm. Ele existe para salvar erro de
-- digitação: quem escreve `charizrd` merece achar Charizard. Mas ele não sabe
-- que a busca deu certo sem ele, e entrava sempre.
--
-- Medido antes de mexer, com `snorlax`: **46 acertos** (32 exatos, 7 começando
-- com, 7 contendo) e **24 intrusos** de relevância 3. A pessoa que digitou o
-- nome certo, inteiro, e viu 24 cartas erradas embaixo.
--
-- A correção não é tirar a similaridade — é fazer dela **reserva**: só entra
-- quando nada mais casou. `charizrd` continua achando Charizard, porque ali não
-- há nenhum acerto para preferir.
--
-- O filtro vem **antes** do `count(*) over ()`. Depois, o total contaria as
-- linhas que a tela não mostra, e o "Mostrar mais" pediria uma página vazia.
--
-- ## A carta sem imagem abria a lista
--
-- 7% do catálogo não tem arte — 1.126 de 15.997, medido em 25/08, quase todas
-- promos (`swshp`, `smp`, `swsh4.5sv`). O `CartaThumb` já cai para nome e código
-- do set em vez de caixa quebrada, e isso continua certo: a carta existe, alguém
-- tem ela na mão, e escondê-la impediria essa pessoa de anunciar.
--
-- O que muda é a ordem. Dentro do mesmo bloco de relevância, quem não tem imagem
-- vai para o fim. Uma grade que abre com três retângulos de texto parece
-- catálogo quebrado, e o julgamento é sobre o app inteiro, não sobre a carta.
--
-- Isto **não** conserta o buraco do catálogo, só o disfarça com honestidade. O
-- conserto é o sync trazer as artes, e em 25/08 não deu para conferir se elas
-- existem na TCGdex: a API estava inalcançável daqui.

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
  ),
  -- Houve acerto de verdade? `bool_or` percorre `achadas` uma vez e devolve uma
  -- linha só, que o cross join replica de graça.
  houve_acerto as (select bool_or(relevancia < 3) as sim from achadas)
  select
    id, external_id, set_code, numero,
    nome_pt, nome_en, raridade, imagem_url,
    set_nome, set_sigla,
    count(*) over () as total
  from achadas
  cross join houve_acerto
  -- **A similaridade é rede, não resultado.** O `%` do pg_trgm aceita `snom` e
  -- `snorunt` para quem digitou `snorlax`: achado pelo Eduardo usando o app em
  -- 2026-08-25, com 46 acertos e 24 intrusos na mesma lista. Filtrado **antes**
  -- do `count(*) over ()`, senão o total conta o que a tela não mostra e o
  -- "Mostrar mais" pede uma página que não existe.
  where relevancia < 3 or not houve_acerto.sim
  order by
    relevancia,
    -- Carta sem imagem vai para o fim do seu próprio bloco de relevância. São
    -- 7% do catálogo (1.126 de 15.997 em 25/08), quase todas promos, e uma
    -- grade que abre com três retângulos de texto parece catálogo quebrado.
    -- Não some de ninguém: quem procura a promo que tem na mão continua
    -- achando, só que depois das que dá para ver.
    (imagem_url is null or imagem_url = ''),
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
