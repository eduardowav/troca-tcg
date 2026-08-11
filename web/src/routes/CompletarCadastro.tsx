import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Campo } from '@/components/ui/Campo'
import { ApiError } from '@/lib/api'
import { criarPerfil, usernameDisponivel } from '@/lib/perfil'
import { CampoTelefone, CampoUsuario } from '@/routes/Entrar'
import { telefoneSchema } from '@/lib/telefone'
import { sair, useAuth } from '@/stores/auth'

const esquema = z.object({
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
  telefone: telefoneSchema,
  aceite: z
    .boolean()
    .refine((v) => v, 'É preciso aceitar os termos para usar o TrocaTCG.'),
})

/**
 * Conta autenticada que ainda não tem perfil.
 *
 * Acontece quando o @ escolhido no cadastro foi tomado nesse meio-tempo, ou
 * quando o cadastro veio de um caminho sem metadata (link mágico, provedor
 * externo). É a única porta de entrada que falta antes do onboarding.
 */
export default function CompletarCadastro() {
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const emailDaConta = useAuth((s) => s.session?.user.email)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setErros({})

    const analise = esquema.safeParse({
      nome_exibicao: form.get('nome_exibicao'),
      username: String(form.get('username') ?? '')
        .trim()
        .toLowerCase(),
      telefone: form.get('telefone'),
      aceite: form.get('aceite') === 'on',
    })
    if (!analise.success) {
      const saida: Record<string, string> = {}
      for (const p of analise.error.errors) {
        saida[String(p.path[0] ?? 'form')] ??= p.message
      }
      return setErros(saida)
    }

    setEnviando(true)
    if (!(await usernameDisponivel(analise.data.username))) {
      setEnviando(false)
      return setErros({ username: 'Esse @ já está em uso. Escolha outro.' })
    }

    try {
      await criarPerfil({
        username: analise.data.username,
        nome_exibicao: analise.data.nome_exibicao,
        aceite_termos: true,
        contato_visivel: analise.data.telefone,
      })
      await queryClient.invalidateQueries({ queryKey: ['perfil'] })
      navigate('/', { replace: true })
    } catch (erro) {
      const api = erro instanceof ApiError ? erro : null
      setErros(
        api?.campo
          ? { [api.campo]: api.message }
          : { form: api?.message ?? 'Não foi possível criar seu perfil.' },
      )
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-12">
      <header>
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">Falta só o seu nome.</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          {emailDaConta ? (
            <>
              Sua conta <span className="text-paper">{emailDaConta}</span> está
              ativa — só falta como você aparece para a comunidade.
            </>
          ) : (
            'Sua conta está ativa — só falta como você aparece para a comunidade.'
          )}
        </p>
      </header>

      <form onSubmit={aoEnviar} noValidate className="mt-7 flex flex-col gap-4">
        <Campo
          rotulo="Como querem te chamar"
          name="nome_exibicao"
          autoComplete="name"
          placeholder="Seu Nome"
          erro={erros.nome_exibicao}
        />
        <CampoUsuario erro={erros.username} />
        <CampoTelefone erro={erros.telefone} />

        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              name="aceite"
              className="mt-0.5 size-5 shrink-0 accent-[var(--color-volt)]"
            />
            <span className="text-[14px] leading-relaxed text-muted">
              Li e aceito os{' '}
              <Link
                to="/termos"
                className="text-paper underline underline-offset-2"
              >
                termos de uso
              </Link>
              . O TrocaTCG apenas conecta pessoas — a troca acontece entre
              vocês, presencialmente.
            </span>
          </label>
          {erros.aceite && (
            <p role="alert" className="text-[13px] text-alert">
              {erros.aceite}
            </p>
          )}
        </div>

        {erros.form && (
          <p
            role="alert"
            className="rounded-[var(--radius-controle)] border border-[color-mix(in_oklab,var(--color-alert)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-alert)_12%,transparent)] px-3.5 py-3 text-[14px] text-alert"
          >
            {erros.form}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" block loading={enviando}>
          Continuar
        </Button>

        <button
          type="button"
          onClick={sair}
          className="mx-auto text-[13px] text-muted underline underline-offset-2 hover:text-paper"
        >
          Sair desta conta
        </button>
      </form>
    </div>
  )
}
