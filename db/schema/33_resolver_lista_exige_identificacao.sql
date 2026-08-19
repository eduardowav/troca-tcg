-- ============================================
-- RESOLVER LISTA — a carta tem de ser dita, não adivinhada
-- ============================================
-- O 28 desmontava a linha em quantidade + sigla + número e, quando nada disso
-- vinha, caía na busca por nome. A tela então marcava o primeiro candidato. O
-- resultado, medido em 2026-08-18 contra o catálogo de produção:
--
--   'Charizard'              -> Charizard LOR:TG TG03   (chute entre 87)
--   '4x Pikachu'             -> Pikachu ASC 055         (chute)
--   'Charizard ex 125/197'   -> Charizard ex PAF 054    (CARTA ERRADA)
--   'Umbreon VMAX 215/203'   -> Umbreon VMAX BRS:TG TG23 (CARTA ERRADA)
--
-- As duas últimas são o caso grave, e não são "não achou": são achar outra
-- coisa com confiança. `125/197` é a notação impressa na própria carta, a que o
-- jogador tem na mão — e o 28 a jogava fora, porque o `/` não passava pelo
-- regex do número. A busca por nome então respondia sozinha, e o app marcava
-- uma Charizard diferente da que a pessoa tinha.
--
-- **Num app de troca isso não é erro de busca, é viagem perdida.** A carta
-- registrada é a que um desconhecido atravessa a cidade para buscar. Errar
-- silenciosamente aqui gasta o tempo de duas pessoas e queima a confiança que a
-- reputação leva meses para construir.
--
-- Duas mudanças, e a segunda é a que muda o comportamento:
--
-- 1. **`xxx/xxx` passa a ser lido.** O denominador é o `total_oficial` do set —
--    o número impresso na carta —, e o numerador **pode passar dele**: secret
--    rare é `215/203`. Casar por `<=` teria descartado exatamente as cartas mais
--    caras, que são as que mais aparecem numa lista de troca.
--
-- 2. **A função passa a dizer se identificou ou se apenas chutou**, na coluna
--    `identificada`. Quem consome decide o que fazer com isso; a tela do app
--    para de marcar sozinha o que não foi identificado.
--
-- O que **não** muda: a busca por nome continua devolvendo candidatos, e a
-- pessoa continua podendo escolher um deles. O que deixa de existir é a escolha
-- feita por ninguém.

drop function if exists public.resolver_lista(text[], integer);

create or replace function public.resolver_lista(
  termos text[],
  por_termo integer default 3
)
returns table (
  posicao integer,
  termo text,
  quantidade integer,
  -- Verdadeiro só quando a linha disse **qual** carta: sigla + número, ou a
  -- notação `xxx/xxx` da própria carta. Nome solto nunca identifica, por mais
  -- que a busca ache candidatos bons.
  identificada boolean,
  candidatos jsonb
)
language plpgsql
stable
parallel safe
security invoker
set search_path = public, extensions
as $$
begin
  -- Teto por chamada. A função é alcançável com a anon key, como toda a leitura
  -- de catálogo, e sem limite uma chamada com dez mil termos seria dez mil
  -- buscas trigram numa transação só.
  if coalesce(array_length(termos, 1), 0) > 200 then
    raise exception 'no máximo 200 linhas por vez';
  end if;

  por_termo := least(greatest(coalesce(por_termo, 3), 1), 5);

  return query
  with linhas as (
    select t.ord::integer as posicao, btrim(t.termo) as bruto
    from unnest(termos) with ordinality as t(termo, ord)
    where btrim(coalesce(t.termo, '')) <> ''
  ),
  partes as (
    select
      l.posicao,
      l.bruto,
      coalesce(
        nullif(substring(l.bruto from '^\s*(\d{1,2})\s*[xX]?\s+'), '')::integer,
        1
      ) as quantidade,
      -- Sigla + número no fim: "OBF 125", "LOR:TG TG03".
      upper(substring(l.bruto from '([A-Za-z][A-Za-z:]{1,9})\s+[A-Za-z]*\d{1,5}[A-Za-z]*\s*$'))
        as sigla,
      upper(substring(l.bruto from '\s([A-Za-z]*\d{1,5}[A-Za-z]*)\s*$'))
        as numero,
      -- A notação impressa na carta: "125/197". Aceita espaço em volta da barra
      -- porque a lista colada de um PDF costuma trazê-lo.
      substring(l.bruto from '(\d{1,4})\s*/\s*\d{1,4}\s*$') as barra_numero,
      substring(l.bruto from '\d{1,4}\s*/\s*(\d{1,4})\s*$')::integer as barra_total
    from linhas l
  ),
  limpas as (
    select
      p.posicao,
      p.bruto,
      p.quantidade,
      case when s.code is not null then s.code end as set_code,
      case when s.code is not null then p.numero end as numero,
      p.barra_numero,
      p.barra_total,
      -- O nome é o que sobra: sem a quantidade da frente e sem o código do fim
      -- (seja ele "OBF 125" ou "125/197").
      coalesce(
        nullif(
          btrim(
            regexp_replace(
              regexp_replace(
                regexp_replace(p.bruto, '^\s*\d{1,2}\s*[xX]?\s+', ''),
                '\s*\d{1,4}\s*/\s*\d{1,4}\s*$', '', 'i'
              ),
              case when s.code is not null
                then '\s+' || p.sigla || '\s+' || p.numero || '\s*$'
                else '$'
              end,
              '', 'i'
            )
          ),
          ''
        ),
        p.bruto
      ) as nome
    from partes p
    left join sets s
      on p.sigla is not null
     and (upper(s.sigla) = p.sigla or upper(s.code) = p.sigla)
  ),
  -- A carta apontada pela notação `xxx/xxx`, quando houver. Fica numa CTE
  -- própria porque é consultada duas vezes: para encabeçar os candidatos e para
  -- decidir a coluna `identificada`.
  --
  -- O nome entra como filtro, e não como ordenação: dois sets diferentes podem
  -- ter o mesmo `total_oficial`, e é o nome que desempata. Quem escreveu só
  -- "125/197", sem nome, não identificou carta nenhuma — identificou um número.
  por_barra as (
    select
      c.posicao,
      (
        select ca.id
        from cards ca
        join sets se on se.code = ca.set_code
        where c.barra_numero is not null
          and ltrim(upper(ca.numero), '0') = ltrim(c.barra_numero, '0')
          and coalesce(se.total_oficial, se.total_impresso) = c.barra_total
          and c.nome is not null
          and c.nome <> c.bruto
          and (
            public.normaliza_busca(ca.nome_pt) like
              '%' || public.normaliza_busca(c.nome) || '%'
            or public.normaliza_busca(ca.nome_en) like
              '%' || public.normaliza_busca(c.nome) || '%'
          )
        limit 1
      ) as card_id
    from limpas c
  )
  select
    c.posicao,
    c.bruto as termo,
    c.quantidade,
    -- Identificada por sigla+número, ou pela notação da carta. As duas formas
    -- que o Eduardo definiu em 2026-08-18, e nenhuma outra.
    (c.set_code is not null and c.numero is not null) or b.card_id is not null
      as identificada,
    coalesce(
      (
        select jsonb_agg(x.carta order by x.ordem)
        from (
          -- 1º) a carta apontada por sigla + número.
          select 0 as ordem, to_jsonb(k) as carta
          from (
            select
              ca.id, ca.external_id, ca.set_code, ca.numero, ca.nome_pt,
              ca.nome_en, ca.raridade, ca.imagem_url,
              se.nome as set_nome, se.sigla as set_sigla
            from cards ca
            join sets se on se.code = ca.set_code
            where c.set_code is not null
              and ca.set_code = c.set_code
              and upper(ltrim(ca.numero, '0')) = ltrim(c.numero, '0')
            limit 1
          ) k

          union all

          -- 2º) a carta apontada por `xxx/xxx`, quando a sigla não veio.
          select 1 as ordem, to_jsonb(k) as carta
          from (
            select
              ca.id, ca.external_id, ca.set_code, ca.numero, ca.nome_pt,
              ca.nome_en, ca.raridade, ca.imagem_url,
              se.nome as set_nome, se.sigla as set_sigla
            from cards ca
            join sets se on se.code = ca.set_code
            where b.card_id is not null
              and ca.id = b.card_id
              and c.set_code is null
          ) k

          union all

          -- 3º) o resto, por nome, na ordem que a `buscar_cartas` já devolve.
          --     O que já entrou acima não se repete.
          select b2.ordem + 1, b2.carta
          from (
            select
              row_number() over () as ordem,
              to_jsonb(x) - 'total' as carta,
              x.id
            from public.buscar_cartas(c.nome, por_termo, 0) x
          ) b2
          where b2.id is distinct from b.card_id
            and not exists (
              select 1 from cards ca
              where c.set_code is not null
                and ca.set_code = c.set_code
                and upper(ltrim(ca.numero, '0')) = ltrim(c.numero, '0')
                and ca.id = b2.id
            )
        ) x
      ),
      '[]'::jsonb
    ) as candidatos
  from limpas c
  join por_barra b on b.posicao = c.posicao;
end;
$$;

grant execute on function public.resolver_lista(text[], integer) to anon, authenticated;
