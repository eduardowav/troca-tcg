"""Configuração da aplicação via variáveis de ambiente (pydantic-settings)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Banco
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # Catálogo
    TCGDEX_BASE_URL: str = "https://api.tcgdex.net/v2"
    TCGDEX_IDIOMA: str = "pt"

    # E-mail / push
    RESEND_API_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    # O `sub` do VAPID: quem o serviço de push procura se algo der errado do
    # nosso lado. Tem de ser mailto: ou https:, e não pode ser inventado — é o
    # contato que o Google e a Apple usam antes de bloquear um remetente.
    VAPID_SUBJECT: str = "mailto:contato@trocatcg.com.br"

    # WhatsApp (verificação de número) — Cloud API da Meta.
    #
    # Vazio é o estado de hoje: sem chip registrado e sem conta na Meta, o
    # `services/whatsapp.ativo()` devolve False e o código só vai para o log.
    # `VERIFICACAO_TELEFONE_ATIVA` é outra coisa, e as duas são independentes de
    # propósito: esta liga o *recurso* (o roteador para de responder 503), as de
    # cima ligam o *envio*. Em desenvolvimento se liga a primeira e se lê o
    # código no log, sem celular nem custo.
    WHATSAPP_TOKEN: str = ""
    WHATSAPP_PHONE_ID: str = ""
    WHATSAPP_TEMPLATE: str = "codigo_trocatcg"
    WHATSAPP_TEMPLATE_IDIOMA: str = "pt_BR"
    VERIFICACAO_TELEFONE_ATIVA: bool = False

    # Match triangular (Fase B da seção 16). O motor está pronto e testado; o
    # que falta é a tela — toda a interface de troca é escrita para duas pessoas
    # e duas cartas, e um match de três chegaria nela torto. Ligar antes disso
    # seria estrear o carro-chefe quebrado. O cron já chama o job; desligado,
    # ele responde sem tocar no banco.
    TRIANGULAR_ATIVO: bool = False

    # Mercado Pago — assinatura do PRO (Fase C da seção 16).
    #
    # Vazio é o estado de hoje, e nesse estado `mercado_pago.ativo()` é falso: as
    # rotas de assinatura respondem 503 e nada sai daqui. Mesmo padrão do push
    # sem chave VAPID e do WhatsApp sem chip.
    #
    # O token de teste começa com `TEST-`, o de produção com `APP_USR-`. Os ids
    # de plano **não** são os mesmos nos dois ambientes: plano de teste e plano
    # de produção são objetos diferentes, criados com credenciais diferentes.
    MERCADO_PAGO_ACCESS_TOKEN: str = ""
    MERCADO_PAGO_PLANO_MENSAL: str = ""
    MERCADO_PAGO_PLANO_ANUAL: str = ""
    # O segredo da assinatura do webhook, gerado no painel junto com a URL. Sem
    # ele o receptor recusa tudo, de propósito: webhook de pagamento sem
    # validação é uma rota pública que promove qualquer um a PRO.
    MERCADO_PAGO_WEBHOOK_SECRET: str = ""
    # Para onde o Mercado Pago devolve a pessoa depois do checkout. Não é o mesmo
    # que a origem do CORS: aqui é uma tela específica, e ela precisa existir.
    MERCADO_PAGO_BACK_URL: str = "http://localhost:5173/planos"

    # Segurança
    JOB_SECRET: str = "dev-job-secret"
    CORS_ORIGINS: str = "http://localhost:5173"

    # Termos
    TERMOS_VERSAO: str = "2026-07-01"

    # Ambiente
    ENVIRONMENT: str = Field(default="development")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
