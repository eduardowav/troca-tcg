-- ============================================
-- RESOLVER LISTA — o catálogo respondendo a muitos nomes de uma vez
-- ============================================
-- O cadastro em massa (Fase B da seção 16) é colar a lista que o jogador já
-- tem escrita em algum lugar — no bloco de notas, no post do grupo — e o app
-- reconhecer as cartas. Uma busca por linha seriam cinquenta requisições e
-- cinquenta viagens de rede para uma tela só; isto é uma.
--
-- Não há motor novo de busca aqui: cada termo passa pela `buscar_cartas` do 13,
-- com toda a inteligência que já mora lá (acento, ordem das palavras, erro de
-- digitação, relevância). O que esta função acrescenta é a forma — um pacote
-- por linha, com os candidatos em ordem — e o que a lista colada tem e a caixa
-- de busca não tem: **quantidade na frente e código do set no fim**.
--
-- `4x Charizard ex OBF 125` é como o jogador escreve, e é o formato que os
-- geradores de decklist cospem. Nenhuma das três partes sobrevive a uma busca
-- literal: "4x" e "125" não estão no nome, e "OBF" é sigla de set, não palavra
-- da carta. Por isso a linha é desmontada aqui, no mesmo lugar em que é
-- resolvida — quem colar a lista pelo app ou por qualquer outro cliente recebe
-- o mesmo entendimento.
--
-- `security invoker`, como a `buscar_cartas`: `cards` e `sets` já têm leitura
-- pública, e uma função de catálogo não deve carregar privilégio que quem chama
-- não tem.

create or replace function public.resolver_lista(
  termos text[],
  por_termo integer default 3
)
returns table (
  posicao integer,
  termo text,
  quantidade integer,
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
  -- buscas trigram numa transação só. Duzentas linhas já é uma coleção inteira
  -- colada de uma vez — e o cliente corta em lotes se precisar de mais.
  if coalesce(array_length(termos, 1), 0) > 200 then
    raise exception 'no máximo 200 linhas por vez';
  end if;

  -- `por_termo` é preso entre 1 e 5: quem chama não escolhe fazer a busca
  -- devolver o catálogo inteiro por linha.
  por_termo := least(greatest(coalesce(por_termo, 3), 1), 5);

  return query
  with linhas as (
    select
      t.ord::integer as posicao,
      btrim(t.termo) as bruto
    from unnest(termos) with ordinality as t(termo, ord)
    -- Linha vazia não vira busca: colar uma lista traz linha em branco no meio,
    -- e termo vazio faria a `buscar_cartas` varrer o catálogo por nada.
    where btrim(coalesce(t.termo, '')) <> ''
  ),
  partes as (
    select
      l.posicao,
      l.bruto,
      -- Quantidade: "4x", "4 x", "4" no começo da linha. O `x` é opcional
      -- porque metade das listas não o escreve, e o limite de dois dígitos
      -- evita comer o "151" de um nome de set colado sem sigla.
      coalesce(
        nullif(substring(l.bruto from '^\s*(\d{1,2})\s*[xX]?\s+'), '')::integer,
        1
      ) as quantidade,
      -- Código do set no fim: "OBF 125", "PAF 054", "LOR:TG TG03". A sigla tem
      -- de estar coberta pelo `sets` real — validar contra a tabela, e não
      -- contra um padrão, é o que impede "Iron Valiant 1" de virar busca pelo
      -- set "IRON".
      upper(substring(l.bruto from '([A-Za-z][A-Za-z:]{1,9})\s+[A-Za-z]*\d{1,5}[A-Za-z]*\s*$')) as sigla,
      upper(substring(l.bruto from '\s([A-Za-z]*\d{1,5}[A-Za-z]*)\s*$')) as numero
    from linhas l
  ),
  limpas as (
    select
      p.posicao,
      p.bruto,
      p.quantidade,
      case when s.code is not null then s.code end as set_code,
      case when s.code is not null then p.numero end as numero,
      -- O nome é o que sobra: sem a quantidade da frente e sem o código do fim.
      -- Se a limpeza comer tudo (uma linha que era só "OBF 125"), o nome volta
      -- a ser a linha inteira, e a busca por nome simplesmente não acha nada —
      -- o casamento por código já resolveu.
      coalesce(
        nullif(
          btrim(
            regexp_replace(
              regexp_replace(p.bruto, '^\s*\d{1,2}\s*[xX]?\s+', ''),
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
  )
  select
    c.posicao,
    c.bruto as termo,
    c.quantidade,
    -- `[]` e não nulo quando nada casa: a tela distingue "não achei" de "não
    -- perguntei", e um nulo aqui obrigaria toda leitura a tratar os dois casos.
    coalesce(
      (
        select jsonb_agg(x.carta order by x.ordem)
        from (
          -- A carta apontada pelo código vem primeiro, sempre. Quem escreveu
          -- "OBF 125" disse qual das 87 Charizards quer, e nenhuma relevância
          -- de texto sabe mais do que isso. Zeros à esquerda não separam: o
          -- catálogo grava "054" e o jogador escreve "54".
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

          -- Depois, os candidatos por nome, na ordem que a `buscar_cartas` já
          -- devolve (relevância, depois recência) — `row_number() over ()` é o
          -- que carrega essa ordem para cá. O que já entrou pelo código não se
          -- repete.
          select b.ordem, b.carta
          from (
            select
              row_number() over () as ordem,
              to_jsonb(x) - 'total' as carta,
              x.id
            from public.buscar_cartas(c.nome, por_termo, 0) x
          ) b
          where not exists (
            select 1 from cards ca
            where c.set_code is not null
              and ca.set_code = c.set_code
              and upper(ltrim(ca.numero, '0')) = ltrim(c.numero, '0')
              and ca.id = b.id
          )
        ) x
      ),
      '[]'::jsonb
    ) as candidatos
  from limpas c;
end;
$$;

-- A leitura de catálogo é pública, como a busca. Escrita nenhuma acontece aqui.
grant execute on function public.resolver_lista(text[], integer) to anon, authenticated;
