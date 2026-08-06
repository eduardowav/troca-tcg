import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Campo } from '@/components/ui/Campo'
import { useMarcaOculta, useMundo } from '@/hooks/useMundo'
import { usePerfil } from '@/hooks/usePerfil'
import { ApiError } from '@/lib/api'
import {
  atualizarPerfil,
  type Perfil,
  type PerfilEdicao,
  usernameDisponivel,
} from '@/lib/perfil'
import { formatarTelefone, telefoneSchema } from '@/lib/telefone'

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

/**
 * Os campos editáveis do perfil, em tela própria.
 *
 * Saíram do fim da tela de perfil por decisão do Eduardo. Lá o formulário ficava
 * embaixo da ficha e do histórico, e quem entrava para conferir a reputação
 * rolava por cima de três caixas de texto que não tinha vindo mexer. Agora o
 * perfil mostra, esta tela edita — e o botão "Editar Perfil" da ficha, que antes
 * só rolava a página, leva de verdade a algum lugar.
 */
export default function EditarPerfil() {
  useMundo('brutal')
  useMarcaOculta()

  const { data: perfil, isPending } = usePerfil()

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pt-5 pb-10">
      <div className="flex items-center gap-3">
        <Link
          to="/perfil"
          aria-label="Voltar para o perfil"
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <h1 className="font-titulo text-[24px] leading-none font-black text-tinta">
          Editar perfil
        </h1>
      </div>

      <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
        É assim que a comunidade te vê. O telefone é a exceção: só quem fecha
        troca com você enxerga.
      </p>

      {isPending || !perfil ? (
        <div className="mt-6 h-64 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
      ) : (
        <Formulario perfil={perfil} />
      )}
    </div>
  )
}

function Formulario({ perfil }: { perfil: Perfil }) {
  const [erros, setErros] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()
  const navegar = useNavigate()

  const salvar = useMutation({
    mutationFn: (dados: PerfilEdicao) => atualizarPerfil(dados),
    onSuccess: (novo) => {
      queryClient.setQueryData(['perfil'], novo)
      toast.success('Perfil atualizado.')
      // Volta para o perfil: salvar é o fim da tarefa que trouxe a pessoa aqui,
      // e ficar parado num formulário já salvo convida a salvar de novo.
      navegar('/perfil')
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
      toast.success('Nada mudou por aqui.')
      return navegar('/perfil')
    }
    salvar.mutate(mudou)
  }

  return (
    <form onSubmit={aoEnviar} noValidate className="mt-6 flex flex-col gap-4">
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

      <button
        type="submit"
        disabled={salvar.isPending}
        className="mt-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-azul py-3.5 font-titulo text-[15px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro-sm)] disabled:opacity-45 disabled:shadow-none"
      >
        {salvar.isPending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </form>
  )
}
