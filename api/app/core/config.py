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
    #
    # Era `contato@trocatcg.com.br` até 2026-08-14, e esse endereço falhava na
    # própria regra acima: o domínio **não é do projeto** — está registrado por
    # outra pessoa desde março de 2025. Uma caixa de terceiro é pior que nenhuma
    # aqui, porque o aviso chega em quem não pode agir. Passa a ser a caixa do
    # Eduardo, a mesma que os termos publicam, até o projeto ter endereço próprio.
    VAPID_SUBJECT: str = "mailto:eduardowav@icloud.com"

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
    # O token de teste começa com `TEST-` e o de produção com `APP_USR-`, **com
    # uma exceção que confunde**: dentro de uma conta de usuário de teste não
    # existe seção de credencial de teste, e a que ela chama de produção é a de
    # teste — a conta inteira é fictícia. Foi assim que o fluxo foi percorrido em
    # 2026-08-22. Na dúvida sobre um token, `GET /users/me` responde: usuário de
    # teste vem com a tag `test_user`.
    #
    # Não há mais id de plano aqui. Até 2026-08-22 existiam
    # `MERCADO_PAGO_PLANO_MENSAL` e `_ANUAL`, e eles saíram junto com a descoberta
    # de que assinatura ligada a plano exige `card_token_id` — ver o docstring de
    # `mercado_pago.criar_assinatura`. Menos duas variáveis para preencher errado
    # no dia de ligar, e some com elas o `back_url` que ficava preso no plano.
    MERCADO_PAGO_ACCESS_TOKEN: str = ""
    # O segredo da assinatura do webhook, gerado no painel junto com a URL. Sem
    # ele o receptor recusa tudo, de propósito: webhook de pagamento sem
    # validação é uma rota pública que promove qualquer um a PRO.
    MERCADO_PAGO_WEBHOOK_SECRET: str = ""
    # Quantos segundos de idade uma notificação pode ter e ainda ser aceita.
    # O `ts` da assinatura sempre esteve coberto pelo HMAC e nunca foi comparado
    # com o relógio — assinatura sobre o carimbo prova que ele não foi alterado,
    # não que ele é de agora. Cinco minutos cobrem com folga a retentativa do
    # provedor e o desvio de relógio entre as duas pontas. Zero desliga a
    # conferência, que é o que os testes usam para fixar um carimbo.
    MERCADO_PAGO_TOLERANCIA_SEGUNDOS: int = 300
    # Para onde o Mercado Pago devolve a pessoa depois do checkout. Não é o mesmo
    # que a origem do CORS: aqui é uma tela específica, e ela precisa existir.
    MERCADO_PAGO_BACK_URL: str = "http://localhost:5173/planos"

    # Segurança
    # **Sem default, e é decisão de segurança** (item 5 do bloco da seção 17).
    # Era `dev-job-secret`, publicado neste arquivo: bastava a variável faltar
    # num ambiente novo para as rotas `/internal/jobs/*` abrirem com um segredo
    # que qualquer um lê no repositório. No Render o valor vem de
    # `generateValue`, então o default nunca protegeu nada — só escondia o
    # buraco. Vazio, `_verifica_secret` recusa tudo com 503.
    JOB_SECRET: str = ""
    CORS_ORIGINS: str = "http://localhost:5173"

    # Termos. **Precisa bater com a `VERSAO` de `web/src/routes/Termos.tsx`** —
    # é este valor que vai para `term_acceptances`, e um default defasado grava
    # o aceite de uma versão que ninguém leu. Subiu em 2026-08-14 com a cláusula
    # da assinatura, e em 2026-08-15 com a isenção antes de revelar o contato.
    TERMOS_VERSAO: str = "2026-08-15"

    # Monitoramento de erro (item 15 da seção 17). Vazio é o estado normal: sem
    # DSN o `core/monitoramento.py` não inicializa nada e o app sobe igual.
    # Ninguém precisa de conta no Sentry para rodar isto na própria máquina.
    SENTRY_DSN: str = ""
    # Zero de propósito. O free tier são 5 mil eventos por mês e o rastreamento
    # de desempenho tira do mesmo balde que os erros — subir isto antes de ter
    # gente usando é gastar a cota de achar defeito com gráfico de latência.
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0
    # De qual deploy veio o erro. No Render vem preenchida pela plataforma
    # (`RENDER_GIT_COMMIT`); vazia, o Sentry agrupa todas as versões numa só e a
    # pergunta "isso começou hoje?" fica sem resposta.
    RELEASE: str = Field(default="", validation_alias="RENDER_GIT_COMMIT")

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
