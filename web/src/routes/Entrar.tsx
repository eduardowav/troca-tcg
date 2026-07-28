import { motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Campo } from '@/components/ui/Campo'
import { Button } from '@/components/ui/Button'
import { mensagemAuth } from '@/lib/authMensagens'
import { cn } from '@/lib/cn'
import { usernameDisponivel } from '@/lib/perfil'
import { supabase } from '@/lib/supabase'

type Modo = 'entrar' | 'criar'
type Erros = Record<string, string>

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .email('E-mail inválido.')

const esquemaEntrar = z.object({
  email,
  senha: z.string().min(1, 'Informe sua senha.'),
})

const esquemaCriar = z.object({
  nome_exibicao: z
    .string()
    .trim()
    .min(2, 'Como querem te chamar na troca?')
    .max(60, 'No máximo 60 caracteres.'),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_]{3,20}$/,
      'De 3 a 20 caracteres: letras minúsculas, números ou _',
    ),
  email,
  senha: z.string().min(8, 'Use ao menos 8 caracteres.'),
  aceite: z
    .boolean()
    .refine((v) => v, 'É preciso aceitar os termos para criar a conta.'),
})

export default function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [erros, setErros] = useState<Erros>({})
  const [enviando, setEnviando] = useState(false)
  const [confirmarEmail, setConfirmarEmail] = useState<string | null>(null)

  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { de?: string } | null)?.de ?? '/'

  function trocarModo(novo: Modo) {
    setModo(novo)
    setErros({})
  }

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setErros({})

    if (modo === 'entrar') {
      const analise = esquemaEntrar.safeParse({
        email: form.get('email'),
        senha: form.get('senha'),
      })
      if (!analise.success) return setErros(paraErros(analise.error))

      setEnviando(true)
      const { error } = await supabase.auth.signInWithPassword({
        email: analise.data.email,
        password: analise.data.senha,
      })
      setEnviando(false)

      if (error) return setErros({ form: mensagemAuth(error.message) })
      navigate(destino, { replace: true })
      return
    }

    const analise = esquemaCriar.safeParse({
      nome_exibicao: form.get('nome_exibicao'),
      username: String(form.get('username') ?? '')
        .trim()
        .toLowerCase(),
      email: form.get('email'),
      senha: form.get('senha'),
      aceite: form.get('aceite') === 'on',
    })
    if (!analise.success) return setErros(paraErros(analise.error))
    const dados = analise.data

    setEnviando(true)
    if (!(await usernameDisponivel(dados.username))) {
      setEnviando(false)
      return setErros({ username: 'Esse @ já está em uso. Escolha outro.' })
    }

    // username/nome/aceite viajam no user_metadata: o perfil só nasce com um JWT
    // em mãos, e com confirmação de e-mail isso pode ser em outro aparelho.
    const { data, error } = await supabase.auth.signUp({
      email: dados.email,
      password: dados.senha,
      options: {
        data: {
          username: dados.username,
          nome_exibicao: dados.nome_exibicao,
          aceite_termos: true,
        },
      },
    })
    setEnviando(false)

    if (error) return setErros({ form: mensagemAuth(error.message) })
    if (data.session) {
      navigate(destino, { replace: true })
      return
    }
    setConfirmarEmail(dados.email)
  }

  if (confirmarEmail) {
    return <ConfirmeEmail email={confirmarEmail} />
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-12">
      <header>
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">
          {modo === 'entrar'
            ? 'Bem-vindo de volta.'
            : 'Sua conta no quadro de trocas.'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {modo === 'entrar'
            ? 'Entre para ver suas listas e seus matches.'
            : 'Leva um minuto. Depois é só montar Ofereço e Procuro.'}
        </p>
      </header>

      <Alternador modo={modo} onModo={trocarModo} />

      <form onSubmit={aoEnviar} noValidate className="mt-6 flex flex-col gap-4">
        {modo === 'criar' && (
          <>
            <Campo
              rotulo="Como querem te chamar"
              name="nome_exibicao"
              autoComplete="name"
              placeholder="Eduardo"
              erro={erros.nome_exibicao}
            />
            <Campo
              rotulo="Seu @ na comunidade"
              name="username"
              prefixo="@"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="eduardo_tcg"
              dica="É assim que os outros vão te achar."
              erro={erros.username}
            />
          </>
        )}

        <Campo
          rotulo="E-mail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="voce@email.com"
          erro={erros.email}
        />

        <Campo
          rotulo="Senha"
          name="senha"
          type="password"
          autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
          placeholder="••••••••"
          dica={modo === 'criar' ? 'Ao menos 8 caracteres.' : undefined}
          erro={erros.senha}
        />

        {modo === 'criar' && <AceiteTermos erro={erros.aceite} />}

        {erros.form && (
          <p
            role="alert"
            className="rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-alert)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-alert)_12%,transparent)] px-3.5 py-3 text-[14px] text-alert"
          >
            {erros.form}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={enviando}>
          {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </Button>
      </form>
    </div>
  )
}

/* ---------- Alternador Entrar / Criar conta ---------- */

function Alternador({
  modo,
  onModo,
}: {
  modo: Modo
  onModo: (m: Modo) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Entrar ou criar conta"
      className="mt-7 grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-edge bg-surface p-1"
    >
      {(['entrar', 'criar'] as const).map((m) => {
        const ativo = modo === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onModo(m)}
            className={cn(
              'relative h-9 rounded-[7px] text-[14px] font-medium',
              'transition-colors',
              ativo ? 'text-paper' : 'text-muted hover:text-paper',
            )}
          >
            {ativo && (
              <motion.span
                layoutId="aba-auth"
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                className="absolute inset-0 rounded-[7px] bg-surface-2 shadow-[var(--shadow-card)]"
              />
            )}
            <span className="relative">
              {m === 'entrar' ? 'Entrar' : 'Criar conta'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Aceite dos termos ---------- */

function AceiteTermos({ erro }: { erro?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="aceite"
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-volt)]"
          aria-invalid={erro ? true : undefined}
        />
        <span className="text-[14px] leading-relaxed text-muted">
          Li e aceito os{' '}
          <Link to="/termos" className="text-paper underline underline-offset-2">
            termos de uso
          </Link>
          . Entendo que o TrocaTCG apenas conecta pessoas — a troca acontece
          entre vocês, presencialmente, por conta e risco de cada um.
        </span>
      </label>
      {erro && (
        <p role="alert" className="text-[13px] text-alert">
          {erro}
        </p>
      )}
    </div>
  )
}

/* ---------- Confirmação de e-mail ---------- */

function ConfirmeEmail({ email }: { email: string }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-12 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-edge bg-surface">
        <span aria-hidden className="text-2xl">
          ✉️
        </span>
      </div>
      <h1 className="mt-5 text-[24px] leading-[1.15]">Confirme seu e-mail</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">
        Enviamos um link para <span className="text-paper">{email}</span>. Abra
        para ativar a conta — depois é só voltar aqui e entrar.
      </p>
      <p className="mt-6 text-[13px] text-faint">
        Não chegou? Confira o spam ou aguarde um minuto.
      </p>
    </div>
  )
}

/* ---------- Utilitário ---------- */

function paraErros(erro: z.ZodError): Erros {
  const saida: Erros = {}
  for (const problema of erro.errors) {
    const campo = String(problema.path[0] ?? 'form')
    saida[campo] ??= problema.message
  }
  return saida
}
