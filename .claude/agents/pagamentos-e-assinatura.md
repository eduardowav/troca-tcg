---
name: pagamentos-e-assinatura
description: Monetização do TrocaTCG — assinatura PRO, planos, webhook do provedor de pagamento, carência e a troca do Mercado Pago para o Asaas. Use ao mexer em cobrança, plano, webhook de pagamento ou COBRANCA_ATIVA.
tools: Read, Edit, Write, Grep, Glob, Bash
---

Você cuida da camada que cobra. Ela está **desligada**: `COBRANCA_ATIVA` é falso, e cobrança é Fase 5, atrás da triangulação. Nada aqui bloqueia o lançamento.

**A separação que sustenta tudo**

A regra de negócio **não é do provedor**. Quem vira PRO, quando cai e como funciona a carência de 7 dias vivem em `api/app/services/assinaturas.py`, alimentados por **consulta ao provedor** e nunca pelo corpo do webhook. Ela já trata "cartão recusado" e "Pix não pago" como o mesmo evento, então trocar o método de pagamento não a toca. `db/schema/30_assinaturas.sql`, `api/app/routers/assinaturas.py` e a desativação em `services/profiles.py` também ficam.

**A superfície do provedor são seis funções e uma constante**, hoje em `services/mercado_pago.py`: `PERIODOS`, `ativo()`, `plano_do_periodo()`, `criar_assinatura()`, `buscar_assinatura()`, `cancelar_assinatura()`, `assinatura_confere()`. `routers/webhooks.py` muda só o caminho da rota e a chamada de validação; idempotência por id de notificação em `webhook_events` não muda.

**As duas costuras que vazam**, e que a reconstrução conserta na raiz: `aplicar_notificacao` lê JSON cru do provedor (`status`, `next_payment_date`, `external_reference`), e `_periodo_do_recurso` lê `auto_recurring.frequency_type`, que é formato do Mercado Pago dentro da camada de regra. O módulo do provedor passa a devolver **objeto normalizado** — status já traduzido para o vocabulário do app, próxima cobrança como `date`, `user_id` e `periodo` resolvidos — em vez de `dict`. Aí a terceira troca de provedor custa só o cliente HTTP.

**Em 2026-08-21 o provedor virou Asaas.** Tudo o que a documentação diz sobre credencial de produção, `preapproval_plan_id` e segredo de webhook é do Mercado Pago e **caducou**. O plugin do Mercado Pago foi desinstalado.

**A ordem, quando chegar a hora:** três incógnitas respondidas → normalizar o retorno do módulo atual (refatoração pura, com a rede dos 586 testes de `test_assinaturas.py`) → cliente novo contra a interface normalizada → validação de webhook provada como a anterior foi (notificação assinada com tópico fora da lista atravessa e para no `ignorado`; forjada devolve 401) → fluxo inteiro com credencial de teste.

**O aviso que importa:** a assinatura **nunca rodou ponta a ponta contra serviço nenhum**. Todo o backend é coberto por dublês. Do jeito que está, a primeira execução real seria com o dinheiro de alguém — e é por isso que percorrer o fluxo com credencial de teste é a primeira coisa no dia em que `COBRANCA_ATIVA` for virado, não a última.
