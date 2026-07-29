import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/Button'
import { Campo } from '@/components/ui/Campo'
import { usePerfil } from '@/hooks/usePerfil'
import { ApiError } from '@/lib/api'
import {
  atualizarPerfil,
  type Perfil,
  type PerfilEdicao,
  usernameDisponivel,
} from '@/lib/perfil'
import { formatarTelefone, telefoneSchema } from '@/lib/telefone'
import { sair } from '@/stores/auth'

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
})

export default function PerfilTela() {
  const { data: perfil, isPending } = usePerfil()

  if (isPending || !perfil) {
    return (
      <Moldura>
        <div className="mt-8 h-40 animate-pulse rounded-card bg-surface" />
      </Moldura>
    )
  }

  return (
    <Moldura>
      <header className="pt-10">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-3 text-[28px] leading-[1.1]">Seu perfil</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          É assim que a comunidade te vê. O telefone é a exceção: só quem fecha
          troca com você enxerga.
        </p>
      </header>

      <Reputacao perfil={perfil} />
      <Formulario perfil={perfil} />

      <div className="mt-10 border-t border-edge-soft pt-6">
        <button
          onClick={sair}
          className="text-[14px] text-muted underline underline-offset-4 hover:text-paper"
        >
          Sair da conta
        </button>
        <p className="mt-4 text-[13px] leading-relaxed text-faint">
          Quer apagar sua conta? Veja como em{' '}
          <Link to="/termos" className="underline underline-offset-2">
            termos e privacidade
          </Link>
          .
        </p>
      </div>
    </Moldura>
  )
}

/** Reputação é pública e não editável — é o que sustenta a confiança. */
function Reputacao({ perfil }: { perfil: Perfil }) {
  const total = perfil.trocas_concluidas + perfil.trocas_furadas

  return (
    <dl className="mt-7 grid grid-cols-3 gap-3">
      <Placar
        rotulo="Reputação"
        valor={perfil.reputacao != null ? `${perfil.reputacao}%` : '—'}
        dica={total === 0 ? 'sem trocas ainda' : `${total} troca(s)`}
      />
      <Placar
        rotulo="Concluídas"
        valor={String(perfil.trocas_concluidas)}
        cor="text-offer"
      />
      <Placar
        rotulo="Furadas"
        valor={String(perfil.trocas_furadas)}
        cor="text-alert"
      />
    </dl>
  )
}

function Placar({
  rotulo,
  valor,
  dica,
  cor = 'text-paper',
}: {
  rotulo: string
  valor: string
  dica?: string
  cor?: string
}) {
  return (
    <div className="rounded-card border border-edge bg-surface p-3.5">
      <dt className="text-[12px] text-muted">{rotulo}</dt>
      <dd className={`mt-1 text-[22px] font-bold tabular-nums ${cor}`}>
        {valor}
      </dd>
      {dica && <p className="mt-0.5 text-[11px] text-faint">{dica}</p>}
    </div>
  )
}

function Formulario({ perfil }: { perfil: Perfil }) {
  const [erros, setErros] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const salvar = useMutation({
    mutationFn: (dados: PerfilEdicao) => atualizarPerfil(dados),
    onSuccess: (novo) => {
      queryClient.setQueryData(['perfil'], novo)
      toast.success('Perfil atualizado.')
    },
    onError: (erro) => {
      const api = erro instanceof ApiError ? erro : null
      if (api?.campo) return setErros({ [api.campo]: api.message })
      toast.error(api?.message ?? 'Não foi possível salvar agora.')
    },
  })

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
    })
    if (!analise.success) {
      const saida: Record<string, string> = {}
      for (const p of analise.error.errors) {
        saida[String(p.path[0] ?? 'form')] ??= p.message
      }
      return setErros(saida)
    }
    const dados = analise.data

    // Só manda o que mudou: PATCH parcial, e evita gastar a checagem de @ à toa.
    const mudou: PerfilEdicao = {}
    if (dados.nome_exibicao !== perfil.nome_exibicao) {
      mudou.nome_exibicao = dados.nome_exibicao
    }
    if (dados.telefone !== perfil.contato_visivel) {
      mudou.contato_visivel = dados.telefone
    }
    if (dados.username !== perfil.username) {
      if (!(await usernameDisponivel(dados.username))) {
        return setErros({ username: 'Esse @ já está em uso. Escolha outro.' })
      }
      mudou.username = dados.username
    }

    if (Object.keys(mudou).length === 0) {
      return toast.success('Nada mudou por aqui.')
    }
    salvar.mutate(mudou)
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="mt-8 flex flex-col gap-4">
      <Campo
        rotulo="Como querem te chamar"
        name="nome_exibicao"
        defaultValue={perfil.nome_exibicao}
        autoComplete="name"
        erro={erros.nome_exibicao}
      />
      <Campo
        rotulo="Seu @ na comunidade"
        name="username"
        prefixo="@"
        defaultValue={perfil.username}
        autoCapitalize="none"
        spellCheck={false}
        dica="Mudar o @ muda como te encontram. O antigo fica livre para outra pessoa."
        erro={erros.username}
      />
      <Campo
        rotulo="Seu WhatsApp"
        name="telefone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel"
        defaultValue={perfil.contato_visivel ?? ''}
        placeholder="(91) 98765-4321"
        dica="Só aparece para quem fechar troca com você."
        erro={erros.telefone}
        onChange={(e) => {
          e.currentTarget.value = formatarTelefone(e.currentTarget.value)
        }}
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={salvar.isPending}
      >
        Salvar alterações
      </Button>
    </form>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5">
      {children}
    </div>
  )
}
