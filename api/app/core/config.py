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
