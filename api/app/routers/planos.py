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

O que **não** mora aqui é o preço. Ele não é regra de negócio do backend hoje —
nenhum código decide nada com ele — e na Fase C quem passa a mandar nele é o
Mercado Pago, não este arquivo. Ver seção 16 da doc.
"""

from dataclasses import asdict

from fastapi import APIRouter

from app.core.limites import COBRANCA_ATIVA, PLANOS

router = APIRouter(tags=["planos"])


@router.get("/planos")
async def planos() -> dict:
    return {
        "cobranca_ativa": COBRANCA_ATIVA,
        # `asdict` do dataclass: acrescentar um limite em `Limites` faz ele
        # aparecer aqui sem ninguém lembrar de vir mexer neste arquivo.
        "planos": {nome: asdict(limites) for nome, limites in PLANOS.items()},
    }
