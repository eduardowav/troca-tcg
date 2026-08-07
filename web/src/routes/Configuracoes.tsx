import { useMutation } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { usePerfil } from '@/hooks/usePerfil'
import { useMarcaOculta } from '@/hooks/useMundo'
import { ApiError } from '@/lib/api'
import { excluirConta, type Perfil } from '@/lib/perfil'
import { sair } from '@/stores/auth'

/**
 * Configurações gerais, no formato do frame `pokeswap-settings`: grupos com
 * título em mono e fichas de largura inteira, uma por linha.
 *
 * **O que o arquivo tem e esta tela não.** O frame lista Change Password, Dark
 * Mode, Language, Clear Cache, Notifications e Version. Nenhum existe no
 * produto: não há tema claro/escuro (o app é um mundo só), não há segundo idioma,
 * não há cache que a pessoa precise limpar, e notificação é a Fase 6. Um
 * interruptor que não interrompe nada é pior que a ausência dele — a pessoa toca,
 * nada muda, e passa a duvidar do resto da tela.
 *
 * Ficou o que existe: editar o perfil, ler os termos, sair e apagar a conta. As
 * duas últimas vieram do fim da tela de perfil, que é onde estavam soltas.
 */
export default function Configuracoes() {
  useMarcaOculta()

  const { data: perfil } = usePerfil()

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
          Configurações
        </h1>
      </div>

      <Grupo titulo="Conta">
        <Ficha para="/perfil/editar">Editar perfil</Ficha>
      </Grupo>

      <Grupo titulo="Sobre">
        <Ficha para="/termos">Termos e privacidade</Ficha>
      </Grupo>

      <Grupo titulo="Sessão">
        {/* Sair é reversível — entra de novo e está tudo lá. Por isso leva a
            moldura comum, e não o vermelho, que fica reservado ao que não
            volta. */}
        <Ficha onClick={sair}>Sair da conta</Ficha>
      </Grupo>

      {perfil && <ExcluirConta perfil={perfil} />}
    </div>
  )
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="font-dado text-[11px] uppercase text-apagado">{titulo}</h2>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Ficha({
  children,
  para,
  onClick,
}: {
  children: ReactNode
  para?: string
  onClick?: () => void
}) {
  const classe =
    'flex w-full items-center justify-between gap-3 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 py-3.5 text-left font-corpo text-[15px] font-medium text-tinta shadow-[var(--shadow-duro-xs)] transition-shadow hover:shadow-[var(--shadow-duro)]'

  const conteudo = (
    <>
      {children}
      <span aria-hidden className="font-dado text-[13px] text-apagado">
        ›
      </span>
    </>
  )

  return para ? (
    <Link to={para} className={classe}>
      {conteudo}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={classe}>
      {conteudo}
    </button>
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
      <div className="mt-10">
        <button
          onClick={() => setAberto(true)}
          className="font-corpo text-[13px] text-apagado underline underline-offset-2 hover:text-alerta"
        >
          Apagar minha conta
        </button>
      </div>
    )
  }

  const confere = confirmacao.trim().toLowerCase() === perfil.username

  return (
    <div className="mt-10 rounded-[var(--radius-cartela)] border-2 border-alerta bg-alerta-fraco p-5 shadow-[var(--shadow-duro)]">
      <p className="font-titulo text-[16px] font-black text-alerta">
        Apagar sua conta
      </p>
      <p className="mt-2 font-corpo text-[14px] leading-relaxed text-tinta">
        Some tudo: perfil, suas listas de Ofereço e Procuro, e as trocas em
        aberto. Quem já trocou com você mantém a reputação dele. Não dá para
        desfazer.
      </p>

      <label className="mt-4 block font-dado text-[11px] uppercase text-apagado">
        Digite <span className="text-tinta">{perfil.username}</span> para
        confirmar
        <input
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoCapitalize="none"
          spellCheck={false}
          className="mt-1.5 h-11 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-3 font-corpo text-[15px] text-tinta"
        />
      </label>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          disabled={!confere || excluir.isPending}
          onClick={() => excluir.mutate()}
          className="rounded-[var(--radius-controle)] border-2 border-tinta bg-alerta py-3 font-titulo text-[15px] font-black uppercase text-cartela shadow-[var(--shadow-duro-xs)] disabled:opacity-45 disabled:shadow-none"
        >
          {excluir.isPending ? 'Apagando…' : 'Apagar definitivamente'}
        </button>
        <button
          type="button"
          disabled={excluir.isPending}
          onClick={() => {
            setAberto(false)
            setConfirmacao('')
          }}
          className="rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela py-3 font-titulo text-[15px] font-black uppercase text-tinta"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
