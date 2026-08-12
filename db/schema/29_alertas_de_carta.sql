-- ============================================
-- ALERTA DE CARTA — "avise quando aparecer"
-- ============================================
-- Fase B da monetização (seção 16), item 5. Nasce do vazio: a pessoa busca uma
-- carta, ninguém oferece, e hoje a tela não tem o que dizer além de "nenhum
-- resultado". O alerta é a resposta — ela pede para ser avisada, e o app avisa
-- quando alguém puser aquela carta no Ofereço.
--
-- **Por que não é a mesma coisa que o Procuro.** O Procuro é declaração pública
-- que alimenta o matcher, e o aviso que existe hoje (`CARTA_PROCURADA`, job
-- `notify-wanted`) corre no sentido contrário: avisa **quem oferece** que
-- passaram a procurar a carta dele. Ninguém avisa quem procura que a carta
-- apareceu, porque sem reciprocidade o matcher não cria match nenhum — e é
-- exatamente esse o buraco. O alerta cobre a espera de um lado só.
--
-- Recurso do PRO: é conveniência e alcance (a vigilância contínua do catálogo),
-- não participação. O portão está em `core/limites.alerta_carta`.

create table if not exists card_alerts (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references profiles(id) on delete cascade,
  card_id    uuid not null references cards(id) on delete cascade,

  -- Acabamento opcional: quem quer *aquela* reverse pede a reverse; quem quer a
  -- carta aceita qualquer uma. Nulo é o caso comum e por isso é o padrão — a
  -- pessoa que busca no vazio quase nunca está pensando em acabamento.
  finish_id  smallint references finishes(id),

  criado_em  timestamptz not null default now(),

  -- Um alerta por pessoa e carta. O acabamento fica fora da chave de propósito:
  -- dois alertas da mesma carta, um pedindo reverse e outro qualquer, seriam
  -- dois avisos para a mesma novidade.
  unique (user_id, card_id)
);

-- A pergunta do job é sempre "quem espera esta carta?".
create index if not exists idx_alertas_carta on card_alerts (card_id);
-- E a da tela, "o que eu estou esperando?", em ordem de pedido.
create index if not exists idx_alertas_usuario on card_alerts (user_id, criado_em desc);

-- --------------------------------------------
-- Fechada para o navegador
-- --------------------------------------------
-- Quem lê e escreve é a API, que conecta como owner: criar alerta passa pelo
-- portão de plano, e portão que mora no cliente não é portão. A policy de
-- leitura do dono fica escrita porque descreve a intenção — no dia em que a
-- lista de alertas virar tela lida direto do Postgres, basta o `grant select`.
alter table card_alerts enable row level security;
revoke all on card_alerts from anon, authenticated;

drop policy if exists "le proprios alertas" on card_alerts;
create policy "le proprios alertas"
  on card_alerts for select using (auth.uid() = user_id);
