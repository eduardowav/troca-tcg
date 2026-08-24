-- ============================================
-- O PRO PASSA A SER COMPRADO POR PIX
-- ============================================
-- Decisão de 2026-08-23, tarde. A Fase C nasceu como assinatura recorrente no
-- Mercado Pago, e recorrência lá é cartão de crédito e mais nada: o
-- `POST /preapproval` **engole `payment_methods_allowed` em silêncio**, e a
-- assinatura volta sem o campo e com `payment_method_id: null`. Não há conserto
-- do nosso lado.
--
-- O público do TrocaTCG é de Belém e é jovem. Exigir cartão de crédito não é
-- cobrar caro, é cobrar de quem já tem banco — e a maior parte de quem troca
-- carta aqui paga por Pix. A escolha foi trocar a recorrência pelo acesso: o PRO
-- vira compra de tempo, paga por Pix avulso, que o Mercado Pago oferece pelo
-- `POST /v1/payments`.
--
-- **O que isso simplifica, e não é pouco.** Some a carência de 7 dias, que
-- existia porque cartão recusa; Pix ou entrou ou não entrou, e o app nunca
-- entrega serviço não pago. Some o cancelamento, e com ele o bug que retinha dez
-- meses de quem pagava o anual (corrigido em 22/08, agora impossível de
-- reintroduzir). Some a diferença entre "cancelou" e "falhou".
--
-- **O que isso custa:** não há renovação automática. Quem esquece de repagar
-- cai. É por isso que o aviso de vencimento vira parte do sistema, e não enfeite
-- — ver `TIPO_PRO_VENCENDO` em `services/notificacoes.py`.

-- --------------------------------------------
-- `plano_expira_em` muda de significado
-- --------------------------------------------
-- Era "fim da carência de 7 dias depois de a assinatura falhar", e nulo queria
-- dizer "não está caindo". Agora é **até quando o PRO comprado vale**, e nulo
-- quer dizer "não tem PRO comprado" — o estado de quem é FREE.
--
-- A coluna não muda de tipo nem de nome, e o job que a lê continua o mesmo: quem
-- passou da data cai para FREE e tem as ofertas excedentes aparadas. O que muda é
-- quem a escreve e por quê. Ver `services/pro.py`.
comment on column profiles.plano_expira_em is
  'Até quando o PRO comprado vale. Nulo = não tem PRO comprado.';

-- --------------------------------------------
-- Os pagamentos
-- --------------------------------------------
-- Uma linha por cobrança Pix gerada. **Não é um espelho de assinatura**: é o
-- registro de uma compra, e ela não tem estado que evolua para sempre — nasce
-- `pending`, vira `approved` ou morre vencida.
create table if not exists pro_pagamentos (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references profiles(id) on delete cascade,

  -- O id do pagamento no Mercado Pago. É por ele que se consulta o estado real
  -- quando a notificação chega, e é ele que o job de reconciliação usa.
  payment_id    text not null unique,

  -- `mensal` ou `anual`. Quanto tempo esta compra credita.
  periodo       text not null,

  -- Quanto foi cobrado, em reais. **Guardado, e não derivado de `PRECOS`.**
  -- Preço muda — há reajuste previsto para janeiro de 2027 —, e no dia da
  -- contestação o que importa é quanto foi cobrado naquele dia, não quanto o
  -- código cobra hoje.
  valor         numeric(10,2) not null,

  -- Espelho do status do Mercado Pago (`pending`, `approved`, `cancelled`,
  -- `rejected`). Texto e não enum, como em `subscriptions` e pelo mesmo motivo:
  -- é vocabulário de terceiro, e um valor novo do lado deles não pode derrubar
  -- um insert aqui.
  status        text not null default 'pending',

  -- O "copia e cola" do Pix, que é o que a tela mostra. Guardado porque a pessoa
  -- fecha a folha e volta: sem isto, voltar significaria gerar outra cobrança, e
  -- duas cobranças vivas para a mesma compra é o caminho de pagar duas vezes.
  --
  -- **Não é segredo.** Um payload Pix diz para quem vai o dinheiro e quanto —
  -- ele é feito para ser mostrado. Mesmo assim a tabela é fechada ao navegador,
  -- como todas as outras: quem serve é a API.
  qr_code       text,

  -- Quando o QR morre. Trinta minutos, e a escolha é de produto: quem abriu a
  -- tela vai pagar agora. Janela longa produz pagamento chegando dias depois,
  -- quando a pessoa já esqueceu que comprou.
  expira_em     timestamptz,

  -- Quando o dinheiro entrou. Nulo até entrar, e é o que separa a cobrança
  -- gerada da compra concluída.
  pago_em       timestamptz,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- A pergunta da tela: "esta pessoa tem cobrança viva?", da mais recente para a
-- mais antiga. É o que evita gerar QR novo em cima de um que ainda vale.
create index if not exists idx_pro_pagamentos_usuario
  on pro_pagamentos (user_id, criado_em desc);

-- E a do job de reconciliação, que varre o que ficou pendente.
create index if not exists idx_pro_pagamentos_pendentes
  on pro_pagamentos (status, criado_em)
  where status = 'pending';

-- --------------------------------------------
-- Fechada para o navegador
-- --------------------------------------------
-- Mesma regra de `subscriptions` e do `11_grants.sql`: escrita só pela API, que
-- conecta como owner e por isso ignora RLS e grants. A policy de leitura do dono
-- fica escrita porque descreve a intenção.
alter table pro_pagamentos enable row level security;
revoke all on pro_pagamentos from anon, authenticated;

drop policy if exists "le proprio pagamento" on pro_pagamentos;
create policy "le proprio pagamento"
  on pro_pagamentos for select using (auth.uid() = user_id);

-- --------------------------------------------
-- A `subscriptions` fica, e fica vazia
-- --------------------------------------------
-- Não é `drop table`. Ela guarda o que existiu no Mercado Pago enquanto o PRO
-- foi assinatura de cartão, e apagar isso é apagar o lastro do dia em que
-- alguém perguntar por uma cobrança de agosto de 2026. O app não escreve mais
-- nela; o comentário abaixo é o que impede alguém de voltar a escrever por
-- achar que a tabela ainda vale.
comment on table subscriptions is
  'Histórico. O PRO foi assinatura de cartão no Mercado Pago até 2026-08-23 e '
  'passou a ser compra por Pix — ver pro_pagamentos e db/schema/38. Nada '
  'escreve aqui.';
