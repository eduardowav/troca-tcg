"""Os planos, como a tela precisa deles.

**Serve os limites que a regra realmente aplica**, lidos de `core/limites.py`, em
vez de deixar a tela repetir os números. A tela de planos é uma promessa
comercial: se ela disser "20 ofertas" e o backend barrar em 15, a diferença
aparece no pior momento possível — depois de alguém pagar. Com a rota, existe uma
fonte só, e mudar um teto é mudar uma linha em `limites.py`.

**`cobranca_ativa` vem junto** porque a tela muda de recado com ele: enquanto for
falso, `plano_vigente()` devolve PRO para todo mundo e a comparação é sobre o que
*vai* valer, não sobre o que vale. Anunciar "assine" num app onde ninguém esbarra
em limite nenhum seria vender o que já está na mão.

Pública e sem sessão: é tabela de preço. Quem ainda não tem conta pode olhar.

**O preço mora aqui desde 2026-08-22**, e este parágrafo dizia o contrário até
então: que o preço não era do backend e que na Fase C quem mandaria nele seria o
Mercado Pago. Deixou de ser verdade quando a assinatura passou a ser criada sem
plano associado — o valor viaja na chamada, e `PRECOS` em `core/limites.py` é o
dono. Ver o docstring de `mercado_pago.criar_pagamento_pix` para o porquê do fluxo.

Servir o preço junto dos limites é o mesmo argumento de cima, com consequência
pior: tela que promete R$ 19,90 e cobrança que debita outro valor não é um
desencontro de texto, é uma discussão que não se ganha depois de alguém pagar.
Ver seção 16 da doc.
"""

from dataclasses import asdict

from fastapi import APIRouter

from app.core.limites import COBRANCA_ATIVA, PLANOS, PRECOS

router = APIRouter(tags=["planos"])


@router.get("/planos")
async def planos() -> dict:
    return {
        "cobranca_ativa": COBRANCA_ATIVA,
        # `asdict` do dataclass: acrescentar um limite em `Limites` faz ele
        # aparecer aqui sem ninguém lembrar de vir mexer neste arquivo.
        "planos": {nome: asdict(limites) for nome, limites in PLANOS.items()},
        # Como texto, e não como número: `Decimal` vira float no JSON, e float de
        # dinheiro é o que faz "19.9" aparecer numa tela de preço. Quem formata
        # para "R$ 19,90" é a tela, que sabe a moeda de quem está olhando.
        "precos": {periodo: str(valor) for periodo, valor in PRECOS.items()},
    }
