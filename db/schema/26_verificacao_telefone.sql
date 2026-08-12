-- ============================================
-- VERIFICAÇÃO DE TELEFONE — construída e desligada
-- ============================================
-- O código de uso único que prova que o WhatsApp declarado é mesmo da pessoa.
-- Nada disto está ligado no app: não há tela, o cadastro segue sem pedágio, e
-- a API recusa o envio enquanto não houver credencial da Cloud API da Meta
-- (`services/whatsapp.ativo()`). Decisão do Eduardo em 2026-08-12 — o desenho e
-- o porquê estão no bloco "Cadastro sem verificação" da seção 17 da doc.
--
-- Quando ligar, o pedido do código **não** fica no cadastro: fica no primeiro
-- aceite de troca, que é quando o número é revelado à outra pessoa e quando
-- quem está do lado de cá já tem motivo para completar.

-- --------------------------------------------
-- 1. O carimbo, no perfil
-- --------------------------------------------
-- Data e não booleano: "verificado quando?" responde às duas perguntas, e a
-- segunda vai importar no dia em que o número puder ser trocado — trocar o
-- número zera o carimbo, e saber desde quando ele valia é o que permite dizer
-- se a troca aconteceu antes ou depois de um encontro combinado.
alter table profiles
  add column if not exists contato_verificado_em timestamptz;

-- --------------------------------------------
-- 2. Os códigos
-- --------------------------------------------
create table if not exists phone_verifications (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references profiles(id) on delete cascade,

  -- Só dígitos, com DDD e sem o 55. É o número normalizado, não o que a pessoa
  -- digitou: o mesmo telefone escrito de três jeitos tem de bater no mesmo teto
  -- diário, senão o limite se contorna trocando parêntese por espaço.
  telefone       text not null check (telefone ~ '^[0-9]{10,11}$'),

  -- SHA-256 do código. O código em claro não é gravado em lugar nenhum: ele
  -- existe na memória do processo, vai para o WhatsApp e morre ali. Um dump do
  -- banco — que hoje sai cifrado, mas ainda assim — não entrega a ninguém a
  -- chave de verificar o número dos outros.
  codigo_hash    text not null,

  expira_em      timestamptz not null,
  -- Cada tentativa errada conta. No teto, o código morre e é preciso pedir
  -- outro: sem isso, seis dígitos caem por força bruta em minutos.
  tentativas     smallint not null default 0,
  confirmado_em  timestamptz,
  criado_em      timestamptz not null default now()
);

-- As duas perguntas que o serviço faz, e nenhuma outra: "qual é o último código
-- desta pessoa?" (conferir, e medir a espera entre envios) e "quantos códigos
-- este número recebeu hoje?" — o teto que segue o telefone, não a conta, porque
-- criar conta é de graça e o número é o recurso escasso.
create index if not exists idx_verificacao_usuario
  on phone_verifications (user_id, criado_em desc);
create index if not exists idx_verificacao_telefone
  on phone_verifications (telefone, criado_em desc);

-- --------------------------------------------
-- 3. Fechada dos dois lados
-- --------------------------------------------
-- Nem o dono lê esta tabela. Em `push_subscriptions` uma policy de leitura do
-- dono ficou de pé para o dia em que uma tela listasse os aparelhos; aqui não
-- há tela possível — o que a linha guarda é hash e contagem de tentativa, e
-- devolver isso ao navegador só ajudaria quem estivesse tentando adivinhar.
-- Quem escreve e lê é a API, que conecta como owner e ignora RLS.
alter table phone_verifications enable row level security;
revoke all on phone_verifications from anon, authenticated;
