"""Schemas da vitrine — o acervo da base, alcançado por carta (seção 22 da doc).

A regra do contato continua valendo aqui, e por isso nenhum schema deste arquivo
tem onde guardá-lo: a vitrine é a porta de entrada de quem ainda não tem troca
nenhuma, ou seja, exatamente o público que ainda não passou por aceite mútuo.
O que estes schemas mostram — carta, condição, acabamento, @ e reputação — já é
leitura pública desde `09_rls.sql` ("le anuncios ativos") e `11_grants.sql`.

Cartas saem por `card_id`, como no resto da API: o catálogo é lido direto do
Supabase pelo cliente (ver `web/src/lib/types.ts`), e repetir nome e imagem em
cada linha do feed inflaria a resposta com dado que o app já tem em cache.
"""

from datetime import datetime

from pydantic import BaseModel


class CartaNaVitrine(BaseModel):
    """Uma carta que existe na base, com quanta gente a oferece.

    O feed é por **carta**, não por anúncio. Cinco pessoas oferecendo o mesmo
    Charizard são uma linha com `donos = 5`, não cinco linhas iguais — senão a
    carta mais comum da cidade empurraria todo o resto para fora da primeira
    página. Quem são os cinco é a pergunta seguinte, e ela tem rota própria
    (`/vitrine/carta/{card_id}`).
    """

    card_id: str
    donos: int
    #: O anúncio mais recente desta carta. É o que ordena o feed: a vitrine
    #: responde "o que apareceu de novo", não "o que é mais raro".
    mais_recente: datetime


class OfertaNaVitrine(BaseModel):
    """Quem tem uma carta, e em que estado.

    `listing_id` é o campo que faz esta tela virar proposta: os itens de uma
    proposta entram por anúncio, nunca por carta solta (ver seção 22.7). Sem ele
    a tela mostraria a carta e não teria o que enviar.

    Reputação vem junto pelo mesmo motivo de `ParticipanteResumo`: quem escolhe
    de quem pedir está decidindo com quem marcar um encontro. Contadores, não
    porcentagem — o denominador é o que deixa a pessoa julgar o número.
    """

    listing_id: str
    card_id: str
    username: str
    nome_exibicao: str
    condicao: str
    finish_id: int
    quantidade: int
    idioma: str
    trocas_concluidas: int = 0
    trocas_furadas: int = 0
    trocas_desistidas: int = 0


class CartaDoAcervo(BaseModel):
    """Uma carta do OFERTA de alguém, vista de fora.

    É a irmã de `CartaDoParceiro` (schemas/match.py) sem o gate de match: a
    mesma leitura, alcançada a partir de uma carta da vitrine em vez de a partir
    de uma troca já formada. As duas convivem de propósito — aquela recorta pelo
    match e serve à tela de troca; esta serve a quem ainda não tem troca alguma.

    A diferença que importa é o `listing_id`, que aquela não tem: esta lista é de
    onde saem os itens de uma proposta e de uma contraproposta.

    `reciproco` diz "isto está no seu Procuro" — é o que transforma uma lista de
    cartas em uma sugestão do que pedir.
    """

    listing_id: str
    card_id: str
    condicao: str
    finish_id: int
    quantidade: int
    prioridade: int
    reciproco: bool
