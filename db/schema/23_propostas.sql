-- =====================================================================
-- 23 — Proposta: a troca que o matcher não consegue enxergar
-- =====================================================================
-- O motor de matching casa OFERTA com PROCURA. Isso exige que **os dois lados**
-- tenham declarado o que querem — e é aí que ele para. Boa parte das pessoas
-- não sabe o que quer: sabe reconhecer quando vê. Quem nunca preencheu o
-- PROCURA não aparece no feed de ninguém e não recebe feed nenhum, por mais
-- cartas que tenha cadastrado no OFERTA. No começo, sem densidade, isso é quase
-- todo mundo — o matcher é excelente e chega tarde.
--
-- A proposta é a porta de entrada que falta: B varre a vitrine (todo o OFERTA
-- da base), acha uma carta de A, e oferece algo do próprio OFERTA. A aceita,
-- recusa, ou **troca o que vem** — escolhe outra coisa do acervo de B e devolve.
-- Nenhum dos dois precisou adivinhar o que o outro procura.
--
-- Isto reverte uma decisão escrita. O comentário em services/matching.py
-- (`mais_cartas_do_parceiro`) diz que ver o acervo de alguém é consequência de
-- já ter dado match, "porque o produto é um quadro de trocas, não um diretório
-- de pessoas". A regra continua valendo para *pessoas* — não há busca por
-- usuário, não há mural, não há mensagem. O que abre é o acervo, por carta, que
-- já era público por policy desde o 09 ("le anuncios ativos"). A reversão é
-- consciente e o comentário de lá precisa ser reescrito junto deste arquivo.
--
-- ---------------------------------------------------------------------
-- POR QUE TABELA NOVA, E NÃO MAIS CAMPOS EM `matches`
-- ---------------------------------------------------------------------
-- Três impedimentos concretos, não preferência de estilo:
--
--   1. `matches.hash_grupo` é `unique` e vale por **par de pessoas** — veja
--      `_hash_grupo` em services/matching.py: `DIRETO:{a}:{b}`. Existe para
--      deduplicar sugestão automática, que é uma por dupla. Proposta é humana:
--      a mesma dupla negocia hoje e de novo semana que vem, legitimamente. O
--      unique brigaria com o produto.
--   2. `match_status` não tem estado de negociação e `match_items` não tem
--      rodada. Contraproposta é troca de itens *com histórico* — enfiar isso em
--      `match_items` põe coluna de rascunho na tabela que o feed lê em query
--      quente.
--   3. Convertendo só no aceite, todo o ciclo que já existe roda sem uma linha
--      nova: prazo e prorrogação (20), revelação de contato pós-aceite,
--      conclusão bilateral, CANCELADO, FURADO, denúncia (22), reputação.
--
-- A ponte é `propostas.match_id`: enquanto se negocia, nada existe em `matches`;
-- no aceite, nasce o match e a proposta vira histórico.
-- ---------------------------------------------------------------------

-- --------------------------------------------
-- 1. A origem fica registrada no match
-- --------------------------------------------
-- Sem isto, uma troca nascida de proposta seria indistinguível de uma sugerida
-- pelo motor, e as duas merecem texto diferente na tela: uma é "vocês dois têm
-- o que o outro procura", a outra é "você ofereceu e a pessoa topou". Também
-- separa as duas no dia em que formos medir qual caminho fecha mais troca —
-- que é a pergunta que decide se a vitrine fica.
--
-- `add value` não pode ter o valor novo *usado* na mesma transação que o criou
-- (Postgres). Por isso esta seção vai sozinha ao aplicar: no Supabase ela foi a
-- migração `23a_match_kind_proposta`, e todo o resto deste arquivo veio em
-- `23b_propostas`. Quem for reaplicar o schema do zero deve manter a mesma
-- separação — arquivo único num commit só faria o `create table` da seção 3
-- falhar se algum dia ele passar a referenciar 'PROPOSTA'.
alter type match_kind add value if not exists 'PROPOSTA';

-- --------------------------------------------
-- 2. Os estados da negociação
-- --------------------------------------------
-- Não existe estado "CONTRAPROPOSTA" de propósito. Contrapropor não muda a
-- situação da proposta — ela continua aberta —, muda apenas **de quem é a vez**.
-- Modelar isso como status geraria a pergunta impossível "aberta ou
-- contraproposta?" toda vez que o app precisasse listar o que está em aberto.
-- Vez e rodada são colunas; status é desfecho.
--
--   ABERTA   — em negociação, alguém deve resposta
--   ACEITA   — virou match; `match_id` preenchido
--   RECUSADA — a pessoa da vez disse não
--   RETIRADA — quem tinha a vez desistiu antes de o outro responder
--   EXPIRADA — ninguém respondeu no prazo
do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposta_status') then
    create type proposta_status as enum (
      'ABERTA','ACEITA','RECUSADA','RETIRADA','EXPIRADA'
    );
  end if;
end
$$;

-- --------------------------------------------
-- 3. A proposta
-- --------------------------------------------
create table if not exists propostas (
  id              uuid primary key default uuid_generate_v4(),
  -- quem abriu (o B da história: viu a carta na vitrine e ofereceu algo)
  autor_id        uuid not null references profiles(id) on delete cascade,
  -- o dono da carta desejada (o A)
  destinatario_id uuid not null references profiles(id) on delete cascade,
  status          proposta_status not null default 'ABERTA',

  -- Rodada 1 é a proposta; 2, 3 e 4 são contrapropostas. O teto de 4 é decisão
  -- do Eduardo (2026-08-07) e é sobre fechar troca: com duas idas e voltas de
  -- cada lado, quase toda negociação que tinha acordo possível acha o acordo.
  -- Acima disso não há chat interno para sustentar a conversa, e cada rodada
  -- custa um dia parado. Na rodada 4 só restam aceitar e recusar.
  rodada          smallint not null default 1 check (rodada between 1 and 4),

  -- De quem é a vez de responder. Alterna a cada rodada. É o que permite
  -- perguntar "o que está esperando por mim?" com um índice, em vez de deduzir
  -- da paridade da rodada — que quebraria no dia em que existir rodada pulada.
  vez_de          uuid not null references profiles(id),

  -- Preenchido só no aceite. `set null` e não `cascade`: se o match for apagado
  -- (exclusão de conta), a proposta some junto pelas FKs de perfil acima; o
  -- set null existe para o caso de o match ser removido sem levar as pessoas.
  match_id        uuid references matches(id) on delete set null,

  criada_em       timestamptz not null default now(),
  respondida_em   timestamptz,

  -- 72h, não os 7 dias do match. Prazo de match é o tempo de marcar um encontro
  -- presencial; prazo de proposta é o tempo de responder uma pergunta no
  -- celular. Sete dias aqui só produziria fila parada e vitrine com cartas
  -- travadas em negociação que ninguém vai responder. Reinicia a cada rodada.
  expira_em       timestamptz not null default now() + interval '72 hours',

  constraint proposta_dois_lados check (autor_id <> destinatario_id),
  constraint proposta_vez_valida check (vez_de in (autor_id, destinatario_id)),
  -- Um match por proposta. Sem isto, um retry malfeito do serviço criaria duas
  -- trocas do mesmo acordo e a métrica-mãe contaria a mesma troca duas vezes.
  constraint proposta_match_unico unique (match_id)
);

-- --------------------------------------------
-- 4. Os itens, rodada a rodada
-- --------------------------------------------
-- Toda rodada guarda os itens dela. O histórico é o que torna a contraproposta
-- legível ("você pediu X, ela ofereceu Y no lugar") e é o que a tela precisa
-- mostrar sem inventar.
--
-- A denormalização de `card_id`, `condicao` e `finish_id` copia o que
-- `match_items` já faz, e pelo mesmo motivo: o anúncio é volátil — a pessoa
-- apaga, edita, desativa — e um histórico que depende dele vira histórico que
-- se reescreve sozinho. `listing_id` fica junto, anulável, como o vínculo vivo:
-- serve para checar se a carta ainda está disponível *agora*, e vira null
-- quando o anúncio some, o que é exatamente o sinal de que a proposta caducou.
create table if not exists proposta_itens (
  id           uuid primary key default uuid_generate_v4(),
  proposta_id  uuid not null references propostas(id) on delete cascade,
  rodada       smallint not null check (rodada between 1 and 4),
  listing_id   uuid references listings(id) on delete set null,
  card_id      uuid not null references cards(id),
  de_user_id   uuid not null references profiles(id),
  para_user_id uuid not null references profiles(id),
  condicao     card_condition not null,
  finish_id    smallint not null references finishes(id),
  quantidade   smallint not null default 1 check (quantidade between 1 and 99),
  constraint proposta_item_dois_lados check (de_user_id <> para_user_id)
);

-- O mesmo anúncio não entra duas vezes na mesma rodada: quantidade é coluna,
-- não repetição de linha. Sem o unique, "2x a mesma carta" teria duas grafias
-- possíveis e a tela mostraria a carta duplicada em uma delas.
create unique index if not exists idx_proposta_item_unico
  on proposta_itens (proposta_id, rodada, listing_id)
  where listing_id is not null;

create index if not exists idx_proposta_itens_rodada
  on proposta_itens (proposta_id, rodada);

-- --------------------------------------------
-- 5. Item torto não entra
-- --------------------------------------------
-- Um item cujo `de_user_id` não seja um dos dois lados da proposta, ou cuja
-- rodada seja maior que a rodada corrente, é corrupção silenciosa: a tela
-- mostraria uma carta de terceiro dentro da negociação, ou um item de uma
-- rodada que ainda não aconteceu. Não dá para expressar isso em CHECK — CHECK
-- não enxerga outra tabela — nem em chave estrangeira composta, porque os itens
-- vão nas **duas** direções e uma FK só aponta para um sentido.
--
-- Trigger, então. O custo é aceitável porque escrita de proposta é rara (uma
-- por rodada, algumas por pessoa por dia), ao contrário de leitura de feed.
--
-- Tudo qualificado com `public.` porque o `set search_path = ''` logo abaixo é
-- o hardening que o 10 aplicou em `reputacao`: com o caminho vazio, nome sem
-- schema não resolve e a trigger falharia em tempo de execução, não de criação.
create or replace function proposta_item_coerente()
returns trigger language plpgsql as $$
declare
  p public.propostas%rowtype;
begin
  select * into p from public.propostas where id = new.proposta_id;

  if new.de_user_id not in (p.autor_id, p.destinatario_id)
     or new.para_user_id not in (p.autor_id, p.destinatario_id) then
    raise exception 'item de proposta com pessoa de fora da negociacao'
      using errcode = 'check_violation';
  end if;

  if new.rodada > p.rodada then
    raise exception 'item em rodada futura (% > %)', new.rodada, p.rodada
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

alter function public.proposta_item_coerente() set search_path = '';

drop trigger if exists trg_proposta_item_coerente on proposta_itens;
create trigger trg_proposta_item_coerente
  before insert or update on proposta_itens
  for each row execute function proposta_item_coerente();

-- --------------------------------------------
-- 6. Uma negociação aberta por dupla
-- --------------------------------------------
-- Este é o antiabuso principal, e ele é estrutural em vez de contado. Vitrine
-- aberta com proposta livre tem um desfecho previsível: a carta mais cobiçada
-- da cidade recebe quarenta propostas, o dono não dá conta, e desiste do app —
-- perdendo justamente o acervo que fazia a vitrine valer a pena.
--
-- Uma por dupla resolve sem contador e sem configuração: se B quer duas cartas
-- de A, elas vão na **mesma** proposta, que já é multi-item por desenho. E
-- evita o pior caso da contraproposta, que é duas negociações paralelas entre
-- as mesmas duas pessoas disputando as mesmas cartas.
--
-- `least/greatest` porque a direção não importa: se A já abriu com B, B não
-- abre outra com A — responde a que existe.
create unique index if not exists idx_proposta_uma_por_dupla
  on propostas (least(autor_id, destinatario_id), greatest(autor_id, destinatario_id))
  where status = 'ABERTA';

-- --------------------------------------------
-- 7. Índices de leitura
-- --------------------------------------------
-- "O que espera resposta minha" é a pergunta da tela, e a badge da aba nova sai
-- dela. Parcial em ABERTA porque histórico não aparece nessa lista.
create index if not exists idx_proposta_minha_vez
  on propostas (vez_de, expira_em) where status = 'ABERTA';

-- As duas pontas do histórico da pessoa, para a tela de propostas encerradas.
create index if not exists idx_proposta_autor
  on propostas (autor_id, criada_em desc);
create index if not exists idx_proposta_destinatario
  on propostas (destinatario_id, criada_em desc);

-- O job de expiração varre por aqui. Mesmo formato do `expirar_vencidos` de
-- matches: status + prazo, para não escanear histórico.
create index if not exists idx_proposta_vencendo
  on propostas (expira_em) where status = 'ABERTA';

-- --------------------------------------------
-- 8. O índice que a vitrine precisa
-- --------------------------------------------
-- Os índices do 05 servem ao matching: `idx_listings_matching` começa em
-- `card_id` porque a pergunta dele é "quem mais tem esta carta". A vitrine faz
-- a pergunta oposta — "o que apareceu de novo na base" — e nenhum índice
-- existente atende, o que hoje resultaria em seq scan da tabela mais quente do
-- app a cada abertura da aba nova.
create index if not exists idx_listings_vitrine
  on listings (criado_em desc)
  where ativo = true and tipo = 'OFERTA';

-- --------------------------------------------
-- 9. RLS e grants
-- --------------------------------------------
-- Mesma arquitetura das outras tabelas de usuário (ver 09, 10 e 11): escrita só
-- pela API, que conecta como owner e ignora RLS; PostgREST não escreve nada.
--
-- Aqui o grant importa mais do que de costume. Sem o revoke, um usuário logado
-- poderia inserir proposta direto pela anon key — forjando `autor_id`,
-- escapando do teto de rodadas, do "uma por dupla" e de qualquer limite que
-- viva em core/limites.py. As policies de select existem para o dia em que o
-- frontend leia direto; hoje quem barra é o grant.
alter table propostas      enable row level security;
alter table proposta_itens enable row level security;

drop policy if exists "ve propostas das quais participa" on propostas;
create policy "ve propostas das quais participa"
  on propostas for select using (
    auth.uid() in (autor_id, destinatario_id)
  );

drop policy if exists "ve itens das propostas das quais participa" on proposta_itens;
create policy "ve itens das propostas das quais participa"
  on proposta_itens for select using (
    exists (
      select 1 from propostas p
      where p.id = proposta_itens.proposta_id
        and auth.uid() in (p.autor_id, p.destinatario_id)
    )
  );

revoke all on propostas      from anon, authenticated;
revoke all on proposta_itens from anon, authenticated;

-- ---------------------------------------------------------------------
-- O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO FAZ
-- ---------------------------------------------------------------------
-- **Não toca em reputação.** `trocas_concluidas` e `trocas_furadas` continuam
-- saindo só do ciclo de vida do match. Recusar uma proposta não é furar uma
-- troca — é a resposta que o produto está pedindo, e cobrá-la faria as pessoas
-- pararem de responder, que é o oposto do que a vitrine existe para conseguir.
-- Proposta RECUSADA e EXPIRADA também ficam fora da métrica-mãe pelo mesmo
-- motivo que sugestão ignorada já fica (ver `expirar_vencidos`): não houve
-- encontro marcado, logo não houve encontro que deu errado.
--
-- **Não reserva a carta.** Um anúncio em negociação continua na vitrine e
-- continua casável pelo matcher. Reservar seria mentir sobre disponibilidade em
-- troco de nada: não há custódia, e a carta física está com a pessoa. Quem
-- fechar primeiro fecha; o outro lado vê o anúncio sumir e a proposta cai pelo
-- `listing_id` nulo.
--
-- **Não define o teto diário de propostas por pessoa.** Isso é limite de plano
-- e mora em app/core/limites.py, junto de `max_anuncios` — não em constraint,
-- que não sabe distinguir FREE de PRO.
