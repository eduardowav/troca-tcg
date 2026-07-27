"""Exceções de domínio e handler padrão de erro.

Padrão de resposta (ver seção 10 da doc):
    {"erro": {"codigo": "SCREAMING_SNAKE", "mensagem": "...", "campo": "..."}}
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class RegraNegocio(Exception):
    """Erro esperado de regra de negócio.

    `codigo` em SCREAMING_SNAKE para o cliente tratar; `mensagem` em português,
    pronta para exibir; `campo` opcional aponta o campo do formulário.
    """

    def __init__(
        self,
        codigo: str,
        mensagem: str,
        *,
        campo: str | None = None,
        status_code: int = 400,
    ) -> None:
        self.codigo = codigo
        self.mensagem = mensagem
        self.campo = campo
        self.status_code = status_code
        super().__init__(mensagem)


async def regra_negocio_handler(_: Request, exc: RegraNegocio) -> JSONResponse:
    erro: dict[str, str] = {"codigo": exc.codigo, "mensagem": exc.mensagem}
    if exc.campo:
        erro["campo"] = exc.campo
    return JSONResponse(status_code=exc.status_code, content={"erro": erro})
