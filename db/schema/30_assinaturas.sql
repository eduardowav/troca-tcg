-- ============================================
-- ASSINATURA DO PRO — Mercado Pago
-- ============================================
-- Fase C da monetização (seção 16), item 7. O que entra aqui é o lastro local do
-- que acontece no Mercado Pago: a assinatura que a pessoa autorizou lá, e a
-- lembrança de quais notificações já foram tratadas.
--
-- **`profiles.plano` continua sendo a verdade do app.** Nenhuma regra de negócio
-- vai perguntar ao Mercado Pago se alguém é PRO — `core/limites.plano_vigente()`
-- lê a coluna, e é o webhook que a mantém. Consultar o provedor a cada chamada
-- amarraria o app inteiro à disponibilidade dele: uma instabilidade de um lado
-- viraria queda de plano do outro.
--
-- **Nada aqui é escrito pelo navegador.** Quem escreve é a API, como em
-- `card_alerts` e `push_subscriptions`. Assinatura que o cliente pudesse alterar
-- não é assinatura, é honra.

-- --------------------------------------------
-- A carência da queda de plano
-- --------------------------------------------
-- Quando a assinatura deixa de estar autorizada (cartão recusado, Pix não pago,
-- cancelamento), a pessoa **não** cai na hora: são 7 dias com os limites do PRO,
-- que é tempo de resolver o pagamento. Nulo quer dizer "não está caindo" — é o
-- estado de quem é FREE desde sempre e o de quem tem assinatura em dia.
alter table profiles
  add column if not exists plano_expira_em timestamptz;

comment on column profiles.plano_expira_em is
  'Fim da carência do PRO após a assinatura falhar. Nulo = não está caindo.';

-- --------------------------------------------
-- A assinatura
-- --------------------------------------------
create table if not exists subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references profiles(id) on delete cascade,

  -- O id do `preapproval` no Mercado Pago. É a chave de tudo: é por ele que se
  -- consulta o estado real, se cancela e se reconcilia.
  preapproval_id  text not null unique,

  -- Espelho do status do Mercado Pago (`pending`, `authorized`, `paused`,
  -- `cancelled`). Guardado como texto e não como enum de propósito: é vocabulário
  -- de terceiro, e um valor novo do lado deles não pode derrubar um insert aqui.
  status          text not null default 'pending',

  -- `mensal` ou `anual`. Não é o preço — o preço mora no plano lá, e repetir
  -- valor em dois lugares é como a tela e o backend passam a discordar.
  periodo         text not null,

  -- Quando o Mercado Pago diz que cobra de novo. Serve ao job de reconciliação,
  -- que é quem cobre a notificação perdida.
  proxima_cobranca_em timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- A pergunta de toda tela é "qual a assinatura desta pessoa?", da mais recente
-- para a mais antiga: quem cancelou e voltou tem duas linhas, e a que vale é a
-- última. O histórico fica — assinatura apagada é conversa perdida no dia da
-- contestação.
create index if not exists idx_assinaturas_usuario
  on subscriptions (user_id, criado_em desc);

-- E a do job de reconciliação, que varre por status.
create index if not exists idx_assinaturas_status
  on subscriptions (status);

-- --------------------------------------------
-- As notificações já tratadas
-- --------------------------------------------
-- O Mercado Pago reenvia a mesma notificação quando não recebe 200 a tempo, e
-- reenviar é o comportamento certo dele. O que não pode é o mesmo aviso ser
-- processado duas vezes — sem esta tabela, um reenvio de "assinatura autorizada"
-- é inofensivo, mas um de troca de status corre lado a lado com o primeiro e a
-- ordem de chegada decide o plano da pessoa.
--
-- A chave é o id da *notificação*, não o do recurso: o mesmo `preapproval` gera
-- muitos avisos legítimos ao longo da vida, e deduplicar por recurso engoliria
-- mudanças de estado de verdade.
create table if not exists webhook_events (
  id           text primary key,
  topico       text not null,
  recurso_id   text,
  recebido_em  timestamptz not null default now()
);

-- Limpeza: o que interessa é a janela de reenvio, não o arquivo eterno.
create index if not exists idx_webhook_events_recebido
  on webhook_events (recebido_em);

-- --------------------------------------------
-- Fechadas para o navegador
-- --------------------------------------------
-- Mesma regra do `11_grants.sql`: escrita só pela API, que conecta como owner e
-- por isso ignora RLS e grants. A policy de leitura do dono fica escrita porque
-- descreve a intenção — o dia em que a tela de Configurações ler a assinatura
-- direto do Postgres precisa só do `grant select`.
alter table subscriptions enable row level security;
revoke all on subscriptions from anon, authenticated;

drop policy if exists "le propria assinatura" on subscriptions;
create policy "le propria assinatura"
  on subscriptions for select using (auth.uid() = user_id);

-- `webhook_events` não tem dono e não interessa a ninguém de fora: é registro de
-- operação. Sem policy nenhuma, e sem grant nenhum.
alter table webhook_events enable row level security;
revoke all on webhook_events from anon, authenticated;
