import { useMutation } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { usePerfil } from '@/hooks/usePerfil'
import { useMarcaOculta } from '@/hooks/useMundo'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { excluirConta, type Perfil } from '@/lib/perfil'
import { sair } from '@/stores/auth'
import { definirTema, useTema } from '@/stores/tema'

/**
 * Configurações gerais, no formato do frame `pokeswap-settings`: grupos com
 * título em mono e fichas de largura inteira, uma por linha.
 *
 * **O que o arquivo tem e esta tela não.** O frame lista Change Password, Dark
 * Mode, Language, Clear Cache, Notifications e Version. Destes, só o tema
 * existe: não há segundo idioma, não há cache que a pessoa precise limpar, e
 * notificação é a Fase 6. Um interruptor que não interrompe nada é pior que a
 * ausência dele — a pessoa toca, nada muda, e passa a duvidar do resto da tela.
 *
 * Ficou o que existe: a aparência, editar o perfil, ler os termos, sair e apagar
 * a conta. As duas últimas vieram do fim da tela de perfil, que é onde estavam
 * soltas.
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

      <Grupo titulo="App">
        <ModoEscuro />
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

/**
 * Modo escuro, no formato do arquivo: uma ficha com interruptor à direita.
 *
 * **O terceiro estado não sumiu, virou o valor da linha.** O arquivo desenha um
 * interruptor de duas posições, e duas posições não cabem "seguir o sistema" —
 * que é o padrão, e o único estado que a pessoa perde para sempre se o primeiro
 * toque o apagar. A saída é a mesma que o arquivo já usa em Language: a linha
 * tem um valor à direita. Enquanto ninguém tocou, ele diz "Sistema" e o
 * interruptor mostra o que está valendo agora; depois de tocado, diz "Ligado" ou
 * "Desligado" e aparece o caminho de volta, logo abaixo.
 *
 * O link de volta só existe quando há para onde voltar. Sempre visível, ele
 * anunciaria um estado que já está ativo.
 */
function ModoEscuro() {
  const tema = useTema((s) => s.tema)
  const escuro = useTema((s) => s.efetivo) === 'escuro'

  return (
    <>
      <Ficha
        valor={tema === 'sistema' ? 'Sistema' : escuro ? 'Ligado' : 'Desligado'}
        controle={
          <Interruptor
            ligado={escuro}
            rotulo="Modo escuro"
            onMudar={(v) => definirTema(v ? 'escuro' : 'claro')}
          />
        }
      >
        Modo escuro
      </Ficha>

      {/* O caminho de volta é uma etiqueta, não um link sublinhado.
          ------------------------------------------------------------------
          Sublinhado é vocabulário de texto corrido, e aqui isto não é uma
          menção no meio de um parágrafo: é um controle, e neste mundo todo
          controle tem borda, degrau e some ao ser apertado. Do tamanho de um
          selo porque é o que ele é — desfaz um toque, não compete com a linha
          de cima.

          Alinhado à direita, embaixo do interruptor: ele desfaz o que o
          interruptor fez, e à esquerda pareceria pertencer ao rótulo. */}
      {tema !== 'sistema' && (
        <button
          type="button"
          onClick={() => definirTema('sistema')}
          className={cn(
            'self-end rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-cartela',
            'px-2.5 py-1.5 font-dado text-[11px] font-bold uppercase text-tinta',
            'shadow-[var(--shadow-duro-xs)] transition-[box-shadow,transform]',
            'hover:shadow-[var(--shadow-duro-sm)]',
            'active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
          )}
        >
          Seguir o sistema
        </button>
      )}
    </>
  )
}

/**
 * O interruptor, com a geometria do mundo e não a do arquivo.
 *
 * O frame desenha a pílula arredondada de sempre — a mesma de qualquer app de
 * ajustes. Aqui ela é de canto duro: neste mundo, o raio é vocabulário. Uma
 * pílula perfeitamente redonda no meio de uma tela de bordas grossas e degraus
 * retos lê como peça emprestada de outro lugar, e foi exatamente o que aconteceu
 * quando a tela inteira virou pílula.
 *
 * O botão de dentro carrega o degrau. É o que faz o interruptor parecer uma peça
 * física deslizando num trilho, e não uma cor mudando: no claro ele projeta
 * sombra sobre a pista, como as outras peças projetam sobre o papel.
 *
 * É um `<button>` com `role="switch"`, e não um `<input type=checkbox>`
 * disfarçado: o desenho não tem nada de caixa de marcar, e leitor de tela
 * anuncia "interruptor, ligado" em vez de "caixa de seleção, marcada".
 *
 * Desliza por `translate-x` em vez de trocar de lado no layout — assim o
 * movimento é do compositor e a linha não é recalculada a cada toque.
 */
function Interruptor({
  ligado,
  rotulo,
  onMudar,
}: {
  ligado: boolean
  rotulo: string
  onMudar: (ligado: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onMudar(!ligado)}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-[var(--radius-controle)] border-2 border-tinta transition-colors',
        ligado ? 'bg-azul' : 'bg-papel',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-0.5 left-0.5 size-6 rounded-[var(--radius-etiqueta)]',
          'border-2 border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]',
          'transition-transform duration-200 ease-out',
          ligado ? 'translate-x-6' : 'translate-x-0',
        )}
      />
    </button>
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

/**
 * A linha de ajuste: largura inteira, borda de 2px e degrau.
 *
 * **Canto duro, não pílula.** O frame desenha estas fichas totalmente
 * arredondadas, e copiar isso custou caro: com todas as linhas em pílula, a tela
 * inteira perdeu o brutalismo de uma vez — o raio é metade da linguagem, tanto
 * quanto a borda preta. O que se copia do arquivo é a estrutura (grupos com
 * título em mono, fichas de largura inteira, valor à direita); a geometria é
 * deste mundo. Decisão do Eduardo, vendo as duas.
 *
 * **A seta `›` volta só onde há para onde ir.** Ela quer dizer "isto abre outra
 * tela": em "Sair da conta" e no modo escuro, mentia. Antes ela estava em todas
 * as linhas; agora nas que navegam, que é a metade em que ela sempre esteve
 * certa.
 *
 * `valor` é a coluna da direita — no arquivo é o "Português" de Language. Serve
 * para a linha dizer em que estado está sem precisar de uma segunda linha.
 */
function Ficha({
  children,
  para,
  onClick,
  valor,
  controle,
}: {
  children: ReactNode
  para?: string
  onClick?: () => void
  valor?: ReactNode
  controle?: ReactNode
}) {
  const classe =
    'flex w-full items-center justify-between gap-3 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-4 py-3.5 text-left font-corpo text-[15px] font-medium text-tinta shadow-[var(--shadow-duro-xs)] transition-shadow hover:shadow-[var(--shadow-duro)]'

  const direita = (valor || controle || para) && (
    <span className="flex shrink-0 items-center gap-3">
      {valor && (
        <span className="font-dado text-[13px] text-apagado">{valor}</span>
      )}
      {controle}
      {para && (
        <span aria-hidden className="font-dado text-[13px] text-apagado">
          ›
        </span>
      )}
    </span>
  )

  // Com controle próprio a linha não é clicável: dois alvos sobrepostos — a
  // linha e o interruptor — dariam um toque na borda que liga e um no meio que
  // não faz nada. Quem decide é o interruptor.
  if (controle) {
    return (
      <div className={classe}>
        <span>{children}</span>
        {direita}
      </div>
    )
  }

  const conteudo = (
    <>
      <span>{children}</span>
      {direita}
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
        {/* Vermelho de contorno, não de preenchimento.
            ------------------------------------------------------------------
            O vermelho cheio fica reservado ao botão que **executa** — o
            "Apagar definitivamente", depois de digitar o @. Se os dois fossem
            iguais, o primeiro toque pareceria o último, e a tela perderia a
            escada que ela existe para ter.

            O fundo é cartela e não `alerta-fraco`: sobre o vermelho fraco, o
            texto vermelho dá 3,9:1 e reprova no piso AA que o DESIGN.md fixa
            (é 15px em negrito, abaixo do tamanho que dispensaria). Sobre a
            cartela dá 4,8:1 no claro e 6,5:1 no escuro. */}
        <button
          onClick={() => setAberto(true)}
          className={cn(
            'flex w-full items-center justify-between gap-3',
            'rounded-[var(--radius-controle)] border-2 border-alerta bg-cartela',
            'px-4 py-3.5 text-left font-titulo text-[15px] font-black uppercase text-alerta',
            'shadow-[var(--shadow-duro-xs)] transition-[box-shadow,transform]',
            'hover:shadow-[var(--shadow-duro)]',
            'active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
          )}
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
