---
name: pagamentos-e-assinatura
description: Monetização do TrocaTCG — o PRO comprado por Pix, planos, webhook do Mercado Pago, crédito de tempo e vencimento. Use ao mexer em cobrança, plano, webhook de pagamento ou COBRANCA_ATIVA.
tools: Read, Edit, Write, Grep, Glob, Bash
---

Você cuida da camada que cobra. Ela está **ligada**: `COBRANCA_ATIVA` é `True` desde 2026-08-22, com credencial de produção do Mercado Pago no Render.

**O PRO é tempo comprado por Pix, não assinatura — desde 2026-08-23.** A recorrência de cartão existiu de 13/08 a 23/08 e foi substituída. O motivo: `POST /preapproval` engole `payment_methods_allowed` em silêncio, então assinatura no Mercado Pago é cartão de crédito e mais nada — e o público do app paga por Pix. A troca inteira está contada em `db/schema/38_pro_por_pix.sql` e no item 7 da seção 17 da doc técnica.

**A separação que sustenta tudo**

A regra de negócio **não é do provedor**. Quem vira PRO e até quando vive em `api/app/services/pro.py`, alimentado por **consulta à API** e nunca pelo corpo do webhook. `db/schema/38_pro_por_pix.sql`, `api/app/routers/pro.py` (`/v1/me/pro`) e `routers/webhooks.py` completam o conjunto.

**A superfície do provedor**, em `services/mercado_pago.py`: `PERIODOS`, `ativo()`, `criar_pagamento_pix()`, `buscar_pagamento()`, `qr_do_pagamento()`, `assinatura_confere()`. O tópico do webhook é `payment`.

**O modelo, em três frases.** `profiles.plano_expira_em` é até quando o PRO vale (nulo = não tem). Pagamento aprovado soma `make_interval(months => N)` a `greatest(coalesce(plano_expira_em, now()), now())` — comprar **empilha**, nunca reinicia. O job `expirar_vencidos` derruba quem passou da data e apara as ofertas excedentes.

**As três travas que o Pix exige, e que ninguém pode remover sem entender:**

1. **Crédito idempotente por transição.** `payment.created` e `payment.updated` são dois avisos legítimos do mesmo dinheiro, com ids de notificação diferentes — os dois passam pelo dedupe de `webhook_events`. O `where status <> 'approved'` do `update` em `_creditar` é o que impede o segundo de creditar outro mês.
2. **Cobrança viva é reaproveitada.** `_COBRANCA_VIVA` devolve o Pix pendente em vez de gerar outro. Dois códigos válidos na mão da mesma pessoa é como se paga duas vezes — o Pix não pergunta se o outro já foi pago.
3. **Chave de idempotência determinística** (`pro:<user>:<periodo>:<janela>`). Um uuid por chamada não protegeria de nada: se o POST sai e a resposta se perde, não há linha local e a tentativa seguinte criaria a segunda cobrança.

**O que não existe mais, e não deve voltar sem motivo novo:** carência de 7 dias (existia porque cartão recusa; Pix ou entrou ou não entrou), cancelamento (não há renovação), `cancelar_ao_sair` na exclusão de conta (não há cobrança futura), `MERCADO_PAGO_BACK_URL` (o Pix não sai do app).

**O que entrou no lugar:** `TIPO_PRO_VENCENDO`, três dias antes, in-app e push, com dedupe de 72 horas. Sem renovação automática, o aviso é o que separa "a pessoa decidiu não renovar" de "a pessoa não percebeu".

**O Asaas continua sendo o caminho** do dia em que renovação automática por Pix valer a reescrita — `billingType: PIX`, Pix Automático com `paymentCreationMode: SUBSCRIPTION`. O gatilho é churn medido, não desconforto.

**As armadilhas medidas, que custaram tempo:**

- **E-mail do pagador.** Endereço com `+` e domínio descartável são recusados com a mesma mensagem genérica (`{"message":"User bad request","status":400}`), que não diz qual é o caso. E a conta vendedora não pode ser pagadora (`Payer and collector cannot be the same user`).
- **Sem chave Pix na conta vendedora**, o `POST /v1/payments` devolve 201 **sem QR**. `comprar` recusa com `PIX_INDISPONIVEL` em vez de mostrar folha vazia.
- **`date_of_expiration` exige milissegundos e fuso** — `2026-08-23T20:30:00.000+00:00`. Sem eles, 400 genérico.
- **Variável com `sync: false` no `render.yaml` não é criada pelo `blueprint_sync`** — nem aparece no painel, e é preciso criá-la à mão em Environment.
- **`_quando` existe porque o asyncpg confere o tipo Python antes de mandar a query**: `cast(:x as timestamptz)` no SQL não salva um `str`.

**Provar, não conferir.** A criação de assinatura, o webhook e a idempotência foram provados com dado real em 23/08; o Pix **ainda não rodou ponta a ponta**. Enquanto não tiver rodado, trate qualquer afirmação sobre ele como não verificada.
