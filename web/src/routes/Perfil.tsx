import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { MinhasTrocas } from '@/components/perfil/MinhasTrocas'
import { Button } from '@/components/ui/Button'
import { Campo } from '@/components/ui/Campo'
import { usePerfil } from '@/hooks/usePerfil'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  atualizarPerfil,
  excluirConta,
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
      {/* Logo depois dos contadores, e antes do formulário: é a lista que dá
          nome aos números de cima. Editar o @ pode esperar. */}
      <MinhasTrocas />
      <Formulario perfil={perfil} />

      <div className="mt-10 border-t border-edge-soft pt-6">
        <button
          onClick={sair}
          className="text-[14px] text-muted underline underline-offset-4 hover:text-paper"
        >
          Sair da conta
        </button>
      </div>

      <ExcluirConta perfil={perfil} />
    </Moldura>
  )
}

/** Reputação é pública e não editável — é o que sustenta a confiança. */
function Reputacao({ perfil }: { perfil: Perfil }) {
  const total = perfil.trocas_concluidas + perfil.trocas_furadas
  // A desistência não entra na razão da reputação, e o placar dela só aparece
  // depois da primeira: um "0" fixo ao lado dos outros números sugeriria que
  // existe algo a vigiar aí, e para quase todo mundo não existe.
  const desistencias = perfil.trocas_desistidas ?? 0

  return (
    <dl
      className={cn(
        'mt-7 grid gap-3',
        desistencias > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
      )}
    >
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
      {desistencias > 0 && (
        <Placar
          rotulo="Desmarcadas"
          valor={String(desistencias)}
          dica="avisadas antes"
        />
      )}
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

/**
 * Exclusão de conta.
 *
 * A fricção é proporcional ao estrago: fica recolhida atrás de um link, e para
 * confirmar é preciso digitar o próprio @. Um "tem certeza?" seria clicado no
 * automático; digitar o @ obriga a ler o que está escrito.
 */
function ExcluirConta({ perfil }: { perfil: Perfil }) {
  const [aberto, setAberto] = useState(false)
  const [confirmacao, setConfirmacao] = useState('')

  const excluir = useMutation({
    mutationFn: () => excluirConta(),
    onSuccess: async () => {
      toast.success('Conta apagada. Obrigado por ter usado o TrocaTCG.')
      // Encerra a sessão: o token continuaria válido até expirar, e sem conta
      // do outro lado o app entraria num limbo de "perfil não encontrado".
      await sair()
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível apagar a conta agora.',
      ),
  })

  if (!aberto) {
    return (
      <div className="mt-8 mb-4">
        <button
          onClick={() => setAberto(true)}
          className="text-[13px] text-faint underline underline-offset-4 hover:text-alert"
        >
          Apagar minha conta
        </button>
      </div>
    )
  }

  const confere = confirmacao.trim().toLowerCase() === perfil.username

  return (
    <div className="mt-8 mb-4 rounded-card border border-[color-mix(in_oklab,var(--color-alert)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-alert)_8%,transparent)] p-5">
      <p className="text-[15px] font-medium text-alert">Apagar sua conta</p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Some tudo: perfil, suas listas de Ofereço e Procuro, e as trocas em
        aberto. Quem já trocou com você mantém a reputação dele. Não dá para
        desfazer.
      </p>

      <label className="mt-4 block text-[13px] text-muted">
        Digite <span className="text-paper">{perfil.username}</span> para
        confirmar
        <input
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
          className="mt-1.5 h-11 w-full rounded-[var(--radius-control)] border border-edge bg-surface-2 px-3 text-[15px] text-paper"
        />
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          variant="ghost"
          size="md"
          block
          disabled={!confere}
          loading={excluir.isPending}
          onClick={() => excluir.mutate()}
          className="text-alert hover:text-alert"
        >
          Apagar definitivamente
        </Button>
        <Button
          variant="subtle"
          size="md"
          block
          disabled={excluir.isPending}
          onClick={() => {
            setAberto(false)
            setConfirmacao('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5">
      {children}
    </div>
  )
}
