import { useMutation } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { NaoAfiliacao } from '@/components/Isencao'
import { usePerfil } from '@/hooks/usePerfil'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePlanos } from '@/hooks/usePlanos'
import { useDesligarPush, useEstadoPush, useLigarPush } from '@/hooks/usePush'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { estaInstalado } from '@/lib/instalacao'
import { excluirConta, type Perfil } from '@/lib/perfil'
import { sair } from '@/stores/auth'
import { definirTema, useTema } from '@/stores/tema'

/**
 * Configurações gerais, no formato do frame `pokeswap-settings`: grupos com
 * título em mono e fichas de largura inteira, uma por linha.
 *
 * **O que o arquivo tem e esta tela não.** O frame lista Change Password, Dark
 * Mode, Language, Clear Cache, Notifications e Version. Destes existem dois: o
 * tema e, desde o Web Push, os avisos no celular. Não há segundo idioma e não há
 * cache que a pessoa precise limpar — um interruptor que não interrompe nada é
 * pior que a ausência dele, porque a pessoa toca, nada muda, e passa a duvidar
 * do resto da tela.
 *
 * Ficou o que existe: os avisos, a aparência, editar o perfil, ler os termos,
 * sair e apagar a conta. As duas últimas vieram do fim da tela de perfil, que é
 * onde estavam soltas.
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

      {perfil?.bloqueado && <ContaBloqueada />}

      <Grupo titulo="Conta">
        <Ficha para="/perfil/editar">Editar perfil</Ficha>
        <Plano perfil={perfil} />
      </Grupo>

      <Grupo titulo="App">
        <AvisoNoCelular />
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

      {/* A não-afiliação precisa estar alcançável de dentro do app, e não só na
          página pública — quem já entrou nunca mais volta à Home. Aqui é o fim
          da única tela que a pessoa abre para "ver as coisas do app", ao lado do
          link dos termos. */}
      <NaoAfiliacao className="mt-10 text-faint" />
    </div>
  )
}

/**
 * Avisos no celular — o interruptor do Web Push.
 *
 * O aviso chega com o app fechado: quem entrega é o serviço de push do sistema,
 * e o service worker acorda para desenhá-lo. É o que resolve a proposta que
 * vence em 72 horas sem ninguém abrir o app.
 *
 * **Três estados que não são "ligado e desligado".** Sem suporte, a linha vira
 * instrução em vez de controle — e no iPhone a instrução é específica: lá o push
 * só existe com o app instalado na tela de início, então oferecer um interruptor
 * a quem está no Safari em aba seria prometer o que o sistema não entrega.
 * Negado é um beco: uma permissão recusada não pode ser pedida de novo por
 * código, só nas configurações do sistema, e dizer isso é a única coisa útil a
 * fazer.
 *
 * O toque tem de partir da pessoa — os navegadores recusam o pedido de permissão
 * fora de um gesto —, e é por isso que isto é um interruptor e não algo que o
 * app liga sozinho na primeira abertura.
 */
function AvisoNoCelular() {
  const { data: estado, isPending } = useEstadoPush()
  const ligarPush = useLigarPush()
  const desligarPush = useDesligarPush()

  if (isPending) return null

  if (estado === 'indisponivel') {
    // Instalado e mesmo assim sem push: o navegador não entrega, e não há o que
    // fazer nem para onde ir. A linha vira aviso, sem seta e sem controle.
    if (estaInstalado()) {
      return (
        <Ficha valor="Indisponível" controle={<span aria-hidden />}>
          Avisos no celular
          <span className="mt-1 block font-corpo text-[13px] leading-relaxed text-apagado">
            Este navegador não entrega avisos do sistema. A caixa de
            notificações do app continua funcionando.
          </span>
        </Ficha>
      )
    }

    // Falta instalar — e aí existe caminho. A linha vira porta para `/instalar`
    // em vez de repetir aqui, apertado, um passo a passo que tem tela própria.
    return (
      <Ficha para="/instalar" valor="Instale o app">
        Avisos no celular
        <span className="mt-1 block font-corpo text-[13px] leading-relaxed text-apagado">
          No iPhone, o aviso só chega com o app na tela de início. Veja o passo a
          passo.
        </span>
      </Ficha>
    )
  }

  const negado = estado === 'negado'
  const ligado = estado === 'ligado'
  const mexendo = ligarPush.isPending || desligarPush.isPending

  return (
    <>
      <Ficha
        valor={negado ? 'Bloqueado' : ligado ? 'Ligado' : 'Desligado'}
        controle={
          <Interruptor
            ligado={ligado}
            rotulo="Avisos no celular"
            desabilitado={negado || mexendo}
            onMudar={(quer) => {
              const acao = quer ? ligarPush : desligarPush
              acao.mutate(undefined, {
                onSuccess: (novo) => {
                  if (novo === 'negado') {
                    toast.error(
                      'Você bloqueou os avisos para este site. Dá para liberar nas configurações do navegador.',
                    )
                  } else if (novo === 'ligado') {
                    toast.success('Pronto. Os avisos chegam mesmo com o app fechado.')
                  }
                },
                onError: () =>
                  toast.error('Não foi possível mudar os avisos agora.'),
              })
            }}
          />
        }
      >
        Avisos no celular
      </Ficha>

      {negado && (
        <p className="font-corpo text-[13px] leading-relaxed text-apagado">
          Os avisos estão bloqueados para este site. Só dá para liberar nas
          configurações do navegador — o app não pode pedir de novo.
        </p>
      )}
    </>
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
  desabilitado,
  onMudar,
}: {
  ligado: boolean
  rotulo: string
  /** Permissão negada pelo sistema, ou uma mudança em andamento. */
  desabilitado?: boolean
  onMudar: (ligado: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      onClick={() => onMudar(!ligado)}
      className={cn(
        'relative h-8 w-14 shrink-0 rounded-[var(--radius-controle)] border-2 border-tinta transition-colors',
        ligado ? 'bg-azul' : 'bg-papel',
        desabilitado && 'opacity-45',
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

/**
 * O plano da conta — e é aqui que mora o estado "você é PRO" (item 8 da Fase C).
 *
 * **O valor da direita conta a verdade do dia, não a coluna do banco.** Enquanto
 * `cobranca_ativa` for falso, `plano_vigente()` devolve PRO para todo mundo e o
 * `profiles.plano` de quase todos diz FREE — mostrar "Free" nesse estado seria a
 * tela contradizendo o app, que não está limitando nada. Por isso o rótulo é
 * "Liberado" até a cobrança ligar: é o que está valendo, sem prometer assinatura
 * que ninguém tem.
 */
function Plano({ perfil }: { perfil?: Perfil | null }) {
  const { data } = usePlanos()

  const valor = !data
    ? undefined
    : !data.cobranca_ativa
      ? 'Liberado'
      : perfil?.plano === 'PRO'
        ? 'Pro'
        : 'Free'

  return (
    <Ficha para="/planos" valor={valor}>
      Plano
    </Ficha>
  )
}

/**
 * O aviso de conta bloqueada.
 *
 * Existe porque, sem ele, o bloqueio seria um app que simplesmente para de
 * funcionar: cada ação devolveria 403 e a pessoa concluiria que quebrou — e a
 * reação natural a um app quebrado é criar outra conta, que é o oposto do que o
 * bloqueio quer.
 *
 * Diz as duas coisas que ainda são possíveis, e é de propósito que a segunda
 * seja apagar a conta: reter os dados de quem foi bloqueado transformaria uma
 * punição de comunidade em retenção de dado pessoal.
 *
 * Fica em Configurações, e não numa faixa em toda tela: quem foi bloqueado
 * esbarra no 403 na primeira ação, e a mensagem da API já diz o que houve. Aqui
 * é onde a pessoa vem entender e resolver, não onde ela precisa ser lembrada.
 */
function ContaBloqueada() {
  return (
    <div
      role="alert"
      className="mt-6 rounded-[var(--radius-cartela)] border-2 border-alerta bg-alerta-fraco p-5"
    >
      <h2 className="font-titulo text-[18px] font-black text-alerta">
        Sua conta está bloqueada
      </h2>
      <p className="mt-2 font-corpo text-[15px] leading-relaxed text-tinta">
        Ela foi bloqueada por descumprir os termos de uso, e por isso você não
        consegue anunciar cartas, enviar propostas nem aceitar trocas.
      </p>
      <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
        Você ainda pode ver seu perfil e apagar sua conta. Se achar que houve
        engano, fale com{' '}
        <a
          href="mailto:eduardowav@icloud.com"
          className="text-tinta underline underline-offset-2"
        >
          eduardowav@icloud.com
        </a>
        .
      </p>
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
