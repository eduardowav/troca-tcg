-- ============================================
-- BUSCA DE CARTAS
-- ============================================
-- Até aqui a busca era um `.ilike('%termo%').order('numero').limit(24)` montado
-- no frontend. Com 1047 cartas passava; com ~16 mil, não: "Charizard" tem 87
-- resultados e a tela mostrava 24 numa ordem que não é relevância nenhuma — o
-- número impresso na carta, como texto, que ainda por cima põe '10' antes de '2'.
--
-- O que muda aqui, tudo motivado por como o jogador realmente digita:
--
--   1. **Acento e caixa deixam de importar.** Ninguém escreve "Pokémon" com o é.
--   2. **Várias palavras não precisam ser contíguas.** A carta se chama "Pesquisa
--      de Professores"; quem digita "pesquisa professor" recebia zero. Os termos
--      viram um único padrão `%pesquisa%professor%`, que ainda usa índice.
--   3. **Erro de digitação não zera a busca.** "charizrd" cai na similaridade
--      trigram, sempre ranqueada depois de qualquer casamento literal.
--   4. **A ordem passa a ser relevância e depois recência.** Numa comunidade de
--      troca, a carta do bloco atual é a que se troca.

create extension if not exists unaccent with schema extensions;

-- --------------------------------------------
-- Normalização: minúsculas e sem acento
-- --------------------------------------------
-- `unaccent` é STABLE porque o dicionário pode ser recarregado em tempo de
-- execução. Fixando o dicionário na chamada o resultado é determinístico, e é
-- essa promessa (IMMUTABLE) que permite usar a função em coluna gerada e índice.
create or replace function public.normaliza_busca(txt text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, txt))
$$;

-- Colunas geradas: a normalização é paga uma vez na escrita, não a cada tecla
-- digitada por cada jogador. É o que torna o índice trigram utilizável — um
-- índice sobre `nome_pt` não serve para uma busca sobre `unaccent(nome_pt)`.
alter table cards
  add column busca_pt text generated always as (public.normaliza_busca(nome_pt)) stored,
  add column busca_en text generated always as (public.normaliza_busca(nome_en)) stored;

drop index if exists idx_cards_busca_pt;
drop index if exists idx_cards_busca_en;

create index idx_cards_busca_pt on cards using gin (busca_pt gin_trgm_ops);
create index idx_cards_busca_en on cards using gin (busca_en gin_trgm_ops);

-- --------------------------------------------
-- buscar_cartas(termo, limite, deslocamento)
-- --------------------------------------------
-- Devolve a carta já com a identidade do set junto (nome e sigla), porque é isso
-- que distingue 87 Charizards um do outro na tela. `total` é a contagem completa
-- do resultado, não da página — a janela é calculada antes do LIMIT — e serve
-- para o app dizer quantas cartas existem e se ainda há mais para mostrar.
--
-- security invoker de propósito: `cards` e `sets` já têm leitura pública, então a
-- função não precisa (nem deve) de privilégio maior que o de quem a chama.
create or replace function public.buscar_cartas(
  termo text,
  limite integer default 24,
  deslocamento integer default 0
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
      ) as padrao
    from (select public.normaliza_busca(termo) as t) n
  ),
  achadas as (
    select
      c.id, c.external_id, c.set_code, c.numero,
      c.nome_pt, c.nome_en, c.raridade, c.imagem_url,
      s.nome as set_nome, s.sigla as set_sigla,
      case
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
    where length(e.t) >= 2
      and (
        c.busca_pt like '%' || e.padrao || '%'
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

grant execute on function public.buscar_cartas(text, integer, integer)
  to anon, authenticated;
