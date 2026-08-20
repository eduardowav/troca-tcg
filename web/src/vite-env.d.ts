/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_API_URL: string
  /** Chave pública VAPID. Ausente, o app não oferece o aviso no celular. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
  /** DSN do Sentry. Ausente, o SDK nem é baixado — ver `lib/erros.ts`. */
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
