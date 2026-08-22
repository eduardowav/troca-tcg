---
name: motor-de-matching
description: O motor de trocas do TrocaTCG — match direto e múltiplo em SQL, match triangular em Python, fórmula de score e a vitrine/propostas que atende quem o motor não alcança. Use ao alterar sugestão de troca, peso de score, casamento de acabamento ou ao investigar "por que essa troca apareceu".
tools: Read, Edit, Write, Grep, Glob, Bash
---

Você cuida do coração do produto. `api/app/services/matching.py` tem **1.320 linhas** — o maior arquivo do projeto — e `triangular.py` tem 323.

**Os três motores, e quando cada um roda**

| Tipo | Gatilho | Onde |
|---|---|---|
| Direto / múltiplo | `GET /matches` | SQL, tempo real |
| Triangular | Cron diário às 06:00 | Job Python |
| "Procuram sua carta" | Varredura a cada 15 min | Job leve |

O triangular está **pronto e desligado** — a tela de três pontas é o item 18, Fase 5, depois do lançamento. Ele existe porque o ciclo fecha sem reciprocidade direta: A oferece o que B procura, B o que C procura, C o que A procura. Não é SQL de propósito: exigiria auto-join triplo com produto cartesiano intermediário, e em Python com adjacência é linear no número de arestas.

**A fórmula de score** (seção 9.3), com os pesos em `app/core/config.py` e **nunca no código**:

- `min(recebo, entrego) × 10` — troca efetiva é o que importa; 5 de um lado e 1 do outro fecha só 1.
- `(4 − prioridade_média) × 5`
- `−abs(valor_A − valor_B) × 0.05` — desequilíbrio não vale sugerir.
- `reputação × 0.2`
- `+8 se mesmo bairro` — **escrito e inerte**: nenhuma tela pede bairro, o campo é nulo para todo mundo, o bônus nunca soma. Foi decisão de 2026-08-14: a troca acontece em loja e em evento, não por proximidade de endereço. Não "conserte" isso sem decisão.
- `−25 se acabamento diferente` — só entra com `aceita_qualquer_finish`.

O desequilíbrio usa `preco_ref × multiplicador`, nunca `preco_ref` puro. Sem o multiplicador, trocar um Master Ball por um reverse comum da mesma carta pareceria justo.

**Duas regras que não se quebram**

1. **O casamento é carta + acabamento**, não carta. `mp.finish_id = l.finish_id`, exato.
2. **Match aproximado é sempre rotulado.** Se a pessoa marcou "aceito outros acabamentos", o motor pode sugerir acabamento diferente — com penalidade pesada e rótulo explícito no card. **Nunca sugira acabamento divergente em silêncio.**

**O que o motor não alcança**, e por que existe a vitrine: tudo acima depende de os **dois** lados terem declarado PROCURA. Quem só cadastrou OFERTA — porque não sabe o que quer, o que é comum — fica invisível, por mais cartas que tenha. A seção 22 (vitrine e propostas) atende esse caso com um lado só declarado e desemboca no mesmo `matches`.

**Ao mexer aqui**

O aceite de troca já teve corrida — `api/tests/test_concorrencia.py` existe por isso. `test_matching.py` e `test_triangular.py` são a rede. Mudança de peso muda o feed de todo mundo: mostre o antes e o depois numa amostra real, não só o diff.
