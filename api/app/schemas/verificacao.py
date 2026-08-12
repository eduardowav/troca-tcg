"""Contratos da verificação de número. Ver `services/verificacao_telefone.py`."""

from datetime import datetime

from pydantic import BaseModel, Field


class CodigoPedido(BaseModel):
    """O número a verificar.

    Vem no corpo em vez de sair do perfil porque o mesmo endpoint serve para
    confirmar o número que já está lá e para trocar de número — e trocar sem
    confirmar não existe neste fluxo.
    """

    telefone: str = Field(min_length=8, max_length=24)


class CodigoEnviado(BaseModel):
    expira_em: datetime
    #: Quando o botão "reenviar" volta a valer. Sai do servidor para a tela não
    #: precisar adivinhar com o relógio do aparelho, que pode estar errado.
    reenviar_em: datetime


class CodigoConferido(BaseModel):
    codigo: str = Field(min_length=4, max_length=12)


class SituacaoVerificacao(BaseModel):
    telefone: str | None
    verificado_em: datetime | None
    #: Se o envio de verdade está configurado. Falso em desenvolvimento, onde o
    #: código vai para o log — a tela usa isto para não prometer uma mensagem
    #: que não vai chegar a celular nenhum.
    disponivel: bool
