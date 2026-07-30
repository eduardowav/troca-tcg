-- =====================================================================
-- 15 — Preço de referência da TCGplayer
-- =====================================================================
-- Por que preço entra num quadro de trocas: o que mais azeda troca nesta
-- comunidade não é condição da carta, é valor percebido. Quem sente que saiu
-- perdendo não reclama — simplesmente não aparece no encontro, e isso conta
-- como furo na métrica-mãe. Com as duas cartas lado a lado e um número em cada,
-- a assimetria fica visível antes do encontro, que é quando ainda dá para
-- negociar.
--
-- Fonte: TCGplayer, via TCGdex (`pricing.tcgplayer` no endpoint de carta única).
-- Só TCGplayer, por decisão do Eduardo — a Cardmarket vem na mesma resposta e é
-- ignorada de propósito, para não haver dois números discordando na tela.
--
-- **O valor é em dólar e fica em dólar.** Converter exigiria uma fonte de
-- câmbio, que vence junto e daria falsa precisão a um número que já é
-- estimativa. A tela diz de onde veio.
-- ---------------------------------------------------------------------

-- Uma linha por carta e acabamento: a mesma carta sai por US$ 0,13 em `normal`
-- e US$ 0,22 em `reverse-holofoil`, e mostrar um pelo outro seria mentir.
--
-- `tipo_tcgplayer` guarda o balde da fonte ('normal', 'holofoil',
-- 'reverse-holofoil', …) e **não** é o nosso `finishes`: aquele é a taxonomia
-- do produto, esta é a da TCGplayer, mais grosseira. Nomes separados de
-- propósito, pelo mesmo motivo que acabamento nunca se chama `variant` aqui.
create table card_prices (
  card_id             uuid not null references cards (id) on delete cascade,
  tipo_tcgplayer      text not null,
  moeda               char(3) not null default 'USD',
  baixo               numeric(10,2),   -- lowPrice: piso dos anúncios
  mercado             numeric(10,2),   -- marketPrice: é o número que o jogador lê
  fonte_atualizada_em timestamptz,     -- `updated` da TCGdex, não o nosso sync
  sincronizado_em     timestamptz not null default now(),
  primary key (card_id, tipo_tcgplayer)
);

-- Preço vence: diferente de nome e raridade, isto precisa de rodada periódica, e
-- é por `sincronizado_em` que o job decide o que reprocessar primeiro.
create index card_prices_sincronizado_em_idx on card_prices (sincronizado_em);

-- Marca de "já tentei esta carta", que é diferente de "esta carta tem preço":
-- boa parte do catálogo (promos, cartas só em PT, sets antigos) simplesmente não
-- existe na TCGplayer e nunca vai gerar linha em `card_prices`. Sem este
-- carimbo, o job varreria essas mesmas cartas em toda rodada e nunca chegaria ao
-- fim — são dezesseis mil requisições, uma por carta.
alter table cards add column precos_verificado_em timestamptz;

create index cards_precos_verificado_em_idx on cards (precos_verificado_em nulls first);

-- As duas colunas que ficaram para trás desde 02_cards.sql: `preco_ref` nasceu
-- como BRL "para equilibrar sugestões" e nunca foi escrita nem lida por
-- ninguém. Manter uma coluna de preço em real ao lado de uma tabela de preço em
-- dólar é convite a confusão — some, como `set_nome` sumiu na 12.
alter table cards
  drop column preco_ref,
  drop column preco_atualizado_em;

-- --------------------------------------------
-- RLS e grants — mesmo regime do resto do catálogo
-- --------------------------------------------
-- Leitura pública porque o frontend lê catálogo direto com a anon key; escrita
-- só pela API, que conecta como owner e ignora RLS. O GRANT é a trava de
-- verdade, não a policy — ver 10_hardening.sql e 11_grants.sql.
alter table card_prices enable row level security;

create policy "card_prices leitura publica" on card_prices for select using (true);

revoke all on card_prices from anon, authenticated;
grant select on card_prices to anon, authenticated;
