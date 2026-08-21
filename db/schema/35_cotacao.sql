-- =====================================================================
-- 35 — Cotação do dólar, para quem prefere ler preço em real
-- =====================================================================
-- O `15_precos_tcgplayer.sql` decidiu que o preço é em dólar e fica em dólar,
-- porque converter "exigiria uma fonte de câmbio, que vence junto e daria falsa
-- precisão a um número que já é estimativa". A decisão foi revista pelo Eduardo
-- em 2026-08-21, e a razão é de produto: quem julga se uma troca é justa julga
-- em real, e obrigar a pessoa a converter de cabeça é empurrar para ela a conta
-- que o app pode fazer.
--
-- **A ressalva da decisão antiga continua de pé, e por isso a tela é explícita:**
-- preço da TCGplayer convertido não é preço brasileiro. A Liga Pokémon costuma
-- cobrar bem mais que a conversão do dólar, e quem lê "R$ 312" precisa saber que
-- aquilo é um preço americano vestido de real. A tela diz "convertido do dólar"
-- ao lado, e o dólar continua sendo a opção — quem quiser a fonte crua, escolhe.
--
-- ## Uma linha por moeda, e não um histórico
--
-- O que a tela precisa é "quanto vale um dólar agora". Guardar série histórica
-- seria construir para uma pergunta que ninguém faz aqui — e, no dia em que
-- alguém fizer, a série está no Banco Central, não neste banco.
--
-- `referencia` é a data da cotação **na fonte**, e não o instante em que o job
-- rodou: a PTAX de sábado é a de sexta, e as duas coisas precisam ser
-- distinguíveis para a tela poder envelhecer o número com honestidade.

create table cotacoes (
  -- A moeda de destino. 'BRL' é a única hoje; a chave é a moeda, e não um id,
  -- porque a pergunta é sempre "quanto vale o dólar em X" — nunca "me dá a
  -- linha 7".
  moeda         char(3) primary key,
  -- Quantos reais um dólar compra. Seis casas porque a PTAX publica cinco e
  -- arredondar na entrada é perder precisão que não custa nada guardar.
  valor         numeric(12, 6) not null check (valor > 0),
  referencia    date not null,
  atualizado_em timestamptz not null default now()
);

-- Mesmo regime do catálogo: leitura pública porque o frontend lê direto com a
-- anon key, escrita só pela API, que conecta como owner e ignora RLS. O GRANT é
-- a trava de verdade, não a policy — ver 10_hardening.sql e 11_grants.sql.
alter table cotacoes enable row level security;

create policy "cotacoes leitura publica" on cotacoes for select using (true);

revoke all on cotacoes from anon, authenticated;
grant select on cotacoes to anon, authenticated;
