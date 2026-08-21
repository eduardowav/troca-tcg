"""A cotação do dólar, para o app poder mostrar preço em real.

**Fonte: PTAX do Banco Central**, pelo Olinda. Gratuita, sem chave, sem cota, e
oficial — o que importa aqui não é ser a cotação mais barata da internet, é ser
uma que ninguém precise defender. Ver `db/schema/35_cotacao.sql` para a decisão
de produto e a ressalva que ela carrega.

**Cotação de venda, e não a de compra.** O número existe para alguém estimar
quanto custaria repor a carta, e repor é comprar dólar, não vender.

**A PTAX não publica todo dia.** Sábado, domingo e feriado bancário devolvem
lista vazia, e às segundas de manhã o boletim do dia ainda não saiu. Por isso a
busca anda para trás até sete dias e guarda a data da fonte em `referencia`,
separada de `atualizado_em`: a tela precisa poder dizer que o câmbio é de sexta.

**Falha não apaga o que já existe.** Sem resposta útil, o job devolve
`{"mantida": 1}` e a linha anterior continua valendo. O contrário — zerar por não
ter conseguido falar com o Banco Central — tiraria o preço da tela de todo mundo
por causa de uma indisponibilidade de terceiro.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

URL = (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
    "CotacaoDolarDia(dataCotacao=@dataCotacao)"
)

#: Quantos dias andar para trás antes de desistir. Sete cobre feriado emendado
#: com fim de semana, que é a maior lacuna que o calendário bancário produz.
DIAS_PARA_TRAS = 7

#: A moeda de destino. Uma só hoje, e a constante existe para o dia em que não
#: for — o serviço inteiro já trabalha por moeda, não por "a cotação".
MOEDA = "BRL"


def _hoje() -> date:
    return datetime.now(UTC).date()


async def _buscar_no_bcb(cliente: httpx.AsyncClient, dia: date) -> Decimal | None:
    """A cotação de venda de um dia, ou None quando não houve boletim."""
    resposta = await cliente.get(
        URL,
        params={
            # A API quer a data em MM-DD-AAAA, entre aspas simples, no formato
            # OData. Mandar AAAA-MM-DD devolve 400 com uma mensagem que não
            # menciona a data.
            "@dataCotacao": f"'{dia.strftime('%m-%d-%Y')}'",
            "$top": "1",
            "$format": "json",
        },
    )
    resposta.raise_for_status()
    linhas = resposta.json().get("value") or []
    if not linhas:
        return None
    venda = linhas[0].get("cotacaoVenda")
    return Decimal(str(venda)) if venda else None


async def atualizar(session: AsyncSession) -> dict[str, object]:
    """Busca a cotação mais recente e guarda. Devolve o que aconteceu."""
    dia = _hoje()
    valor: Decimal | None = None
    referencia: date | None = None

    try:
        async with httpx.AsyncClient(timeout=20.0) as cliente:
            for _ in range(DIAS_PARA_TRAS + 1):
                valor = await _buscar_no_bcb(cliente, dia)
                if valor is not None:
                    referencia = dia
                    break
                dia = dia - timedelta(days=1)
    except httpx.HTTPError as erro:
        # Erro de rede não é erro do app: o número velho continua servindo, e
        # transformar isto em 500 faria o cron gritar por algo que se resolve
        # sozinho na próxima rodada.
        logger.warning("PTAX indisponível: %s", erro)
        return {"mantida": 1}

    if valor is None or referencia is None:
        logger.warning("PTAX sem boletim nos últimos %s dias", DIAS_PARA_TRAS)
        return {"mantida": 1}

    await session.execute(
        text("""
            insert into cotacoes (moeda, valor, referencia, atualizado_em)
            values (:moeda, :valor, :referencia, now())
            on conflict (moeda) do update
              set valor = excluded.valor,
                  referencia = excluded.referencia,
                  atualizado_em = now()
        """),
        {"moeda": MOEDA, "valor": valor, "referencia": referencia},
    )

    return {"moeda": MOEDA, "valor": float(valor), "referencia": referencia.isoformat()}
