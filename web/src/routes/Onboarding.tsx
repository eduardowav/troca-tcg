import NumberFlow from '@number-flow/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  AcoesBrutal,
  BotaoListaBrutal,
  CelulaBrutal,
  GradeBrutal,
} from '@/components/brutal/Cartas'
import { BotaoBrutal, Cartela } from '@/components/brutal/Pecas'
import { CartaThumb } from '@/components/carta/CartaThumb'
import { FiltroCatalogo } from '@/components/carta/FiltroCatalogo'
import { useCardSearch } from '@/hooks/useCardSearch'
import { useDebounced } from '@/hooks/useDebounced'
import { useMundo } from '@/hooks/useMundo'
import { criarAnunciosEmLote } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  type Carta,
  type FiltrosBusca,
  nomeCarta,
  SEM_FILTRO,
  temFiltro,
} from '@/lib/types'
import { contar, type Selecao, useOnboarding } from '@/stores/onboarding'

export default function Onboarding() {
  useMundo('brutal')
  const [termo, setTermo] = useState('')
  const [filtros, setFiltros] = useState<FiltrosBusca>(SEM_FILTRO)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const busca = useDebounced(termo, 250)
  const {
    cartas: resultados,
    total,
    carregando,
    temMais,
    carregarMais,
    carregandoMais,
    atalho,
    ativa,
  } = useCardSearch(busca, filtros)

  const selecoes = useOnboarding((s) => s.selecoes)
  const { total: totalSelecionado } = contar(selecoes)

  return (
    // A grade quer a tela inteira no desktop; o texto e os controles, não —
    // linha longa demais cansa de ler e barra de busca de 1200px é grotesca.
    // Daí a coluna de `max-w-xl` por cima de um container largo.
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] 2xl:max-w-[120rem] flex-col px-5 pb-32">
      <div className="w-full max-w-xl">
        <Cabecalho total={totalSelecionado} />

        <BuscaCartas termo={termo} onTermo={setTermo} />

        {/* Mesmo botão da busca: três seletores abertos aqui competiriam com a
            grade, que é o assunto da tela — e quem chega no onboarding busca
            pelo nome, não filtra expansão. */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            className={cn(
              'inline-flex items-center gap-2 rounded-[var(--radius-controle)] border-2 border-tinta px-4 py-2',
              'font-titulo text-[13px] font-extrabold uppercase transition-shadow',
              temFiltro(filtros)
                ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            Filtros
            <span aria-hidden className="font-dado text-[11px]">
              {filtrosAbertos ? '▲' : '▼'}
            </span>
          </button>
          {temFiltro(filtros) && (
            <button
              type="button"
              onClick={() => setFiltros(SEM_FILTRO)}
              className="ml-2 font-corpo text-[13px] font-medium text-azul underline underline-offset-2"
            >
              Limpar
            </button>
          )}
          {filtrosAbertos && (
            <Cartela className="mt-3 p-3">
              <FiltroCatalogo filtros={filtros} onFiltros={setFiltros} />
            </Cartela>
          )}
        </div>

        {atalho && (
          <p role="status" className="mt-2 font-corpo text-[13px] text-apagado">
            Lendo como carta{' '}
            <span className="font-dado text-tinta">{atalho.numero}</span> de{' '}
            <span className="font-medium text-tinta">{atalho.set.nome}</span>.
          </p>
        )}
      </div>

      <div className="mt-5 flex-1">
        {!ativa ? (
          <EstadoVazio temSelecoes={totalSelecionado > 0} />
        ) : carregando ? (
          <ListaSkeleton />
        ) : resultados && resultados.length > 0 ? (
          <>
            <Contagem mostrando={resultados.length} total={total} />
            <GradeBrutal>
              {resultados.map((carta) => (
                <CartaEscolhivel key={carta.id} carta={carta} />
              ))}
            </GradeBrutal>
            {temMais && (
              <button
                onClick={() => carregarMais()}
                disabled={carregandoMais}
                className="mt-4 w-full"
              >
                <BotaoBrutal className="w-full justify-center">
                  {carregandoMais ? 'Carregando…' : 'Mostrar mais'}
                </BotaoBrutal>
              </button>
            )}
          </>
        ) : (
          <SemResultados termo={busca} comFiltro={temFiltro(filtros)} />
        )}
      </div>

      <BandejaSelecao total={totalSelecionado} />
    </div>
  )
}

/* ---------- Cabeçalho + progresso ---------- */

function Cabecalho({ total }: { total: number }) {
  return (
    <header className="pt-8">
      <h1 className="font-titulo text-[26px] leading-[1.1] font-black text-tinta lg:text-[30px]">
        Comece pela carta que você mais quer.
      </h1>
      <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
        Tudo que você colocar aqui fica disponível para troca. Monte suas listas
        de <strong className="font-bold text-tinta">Ofereço</strong> e{' '}
        <strong className="font-bold text-tinta">Procuro</strong> — o app acha
        com quem trocar. Uma carta já basta para começar; o resto você acrescenta
        quando quiser.
      </p>

      {/* Contagem só aparece depois da 1ª escolha: com a lista vazia ela não
          informa nada, e um "0" fixo no alto da tela lê como cobrança. */}
      {total > 0 && (
        <p role="status" className="mt-5 font-corpo text-[14px] text-apagado">
          <NumberFlow value={total} className="font-titulo font-black text-tinta" />{' '}
          {total === 1 ? 'carta escolhida' : 'cartas escolhidas'}
        </p>
      )}
    </header>
  )
}

/* ---------- Campo de busca ---------- */

function BuscaCartas({
  termo,
  onTermo,
}: {
  termo: string
  onTermo: (v: string) => void
}) {
  return (
    <div className="sticky top-3 z-20 mt-6">
      <div className="relative">
        <IconeBusca className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-apagado" />
        <input
          value={termo}
          onChange={(e) => onTermo(e.target.value)}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Busque: Pikachu, Umbreon, Pesquisa…"
          aria-label="Buscar carta pelo nome"
          className={cn(
            'h-13 w-full rounded-[var(--radius-controle)] pl-11 pr-4',
            'bg-cartela font-corpo text-[16px] text-tinta placeholder:text-apagado',
            'border-2 border-tinta shadow-[var(--shadow-duro-xs)]',
            'transition-colors focus:border-tinta focus:outline-none',
          )}
        />
      </div>
    </div>
  )
}

/* ---------- Célula de resultado ---------- */

function CartaEscolhivel({ carta }: { carta: Carta }) {
  const alternar = useOnboarding((s) => s.alternar)
  const tipo = useOnboarding((s) => s.selecoes[carta.id]?.tipo)

  return (
    <CelulaBrutal carta={carta} destaque={tipo}>
      <AcoesBrutal>
        <BotaoListaBrutal
          tipo="OFERTA"
          ativo={tipo === 'OFERTA'}
          onClick={() => alternar(carta, 'OFERTA')}
        />
        <BotaoListaBrutal
          tipo="PROCURA"
          ativo={tipo === 'PROCURA'}
          onClick={() => alternar(carta, 'PROCURA')}
        />
      </AcoesBrutal>
    </CelulaBrutal>
  )
}

/* ---------- Contagem ---------- */

function Contagem({ mostrando, total }: { mostrando: number; total: number }) {
  if (total <= mostrando) return null
  return (
    <p role="status" className="mb-3 font-dado text-[12px] uppercase text-apagado">
      Mostrando {mostrando} de {total} cartas
    </p>
  )
}

/* ---------- Estados ---------- */

function EstadoVazio({ temSelecoes }: { temSelecoes: boolean }) {
  return (
    <div className="flex flex-col items-center px-6 pt-10 text-center">
      <div className="grid place-items-center rounded-2xl border-2 border-tinta bg-cartela p-4">
        <IconeBusca className="size-6 text-tinta" />
      </div>
      <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
        {temSelecoes
          ? 'Continue adicionando — quanto maior a lista, mais rápido o match aparece.'
          : 'Busque pelo nome, ou escolha uma expansão para navegar carta a carta.'}
      </p>
    </div>
  )
}

function SemResultados({
  termo,
  comFiltro,
}: {
  termo: string
  comFiltro: boolean
}) {
  return (
    <div className="px-6 pt-10 text-center">
      <p className="font-titulo text-[17px] font-bold text-tinta">
        {termo ? `Nenhuma carta para “${termo}”.` : 'Nenhuma carta aqui.'}
      </p>
      <p className="mt-2 font-corpo text-[14px] text-apagado">
        {comFiltro
          ? 'Talvez esteja em outra expansão — tente limpar o filtro.'
          : 'Tente outro nome — em português ou inglês.'}
      </p>
    </div>
  )
}

function ListaSkeleton() {
  return (
    <ul
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      aria-hidden
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex flex-col gap-2 rounded-[var(--radius-cartela)] border-2 border-tinta p-2"
        >
          <div className="aspect-[2.5/3.5] w-full animate-pulse rounded-[10px] bg-meu" />
          <div className="space-y-1.5 px-0.5">
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-meu" />
            <div className="h-2.5 w-4/5 animate-pulse rounded bg-meu" />
          </div>
          <div className="h-9 animate-pulse rounded-[var(--radius-controle)] bg-meu" />
        </li>
      ))}
    </ul>
  )
}

/* ---------- Bandeja de seleção (sticky) ---------- */

function BandejaSelecao({ total }: { total: number }) {
  const selecoes = useOnboarding((s) => s.selecoes)
  const remover = useOnboarding((s) => s.remover)
  const lista = Object.values(selecoes)
  const { salvar, salvando } = useSalvarListas(lista)

  return (
    <AnimatePresence>
      {total > 0 && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          exit={{ y: 80 }}
          transition={{ type: 'spring', stiffness: 300, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-tinta bg-cartela"
        >
          <div className="mx-auto w-full max-w-[100rem] px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] 2xl:max-w-[120rem]">
            {/* Agrupado por lista, com um rótulo em mono antes de cada grupo.
                No playmat cada carta levava um anel colorido — verde-água para
                Ofereço, âmbar para Procuro —, e essas duas cores não existem no
                mundo novo: aqui azul é ação e âmbar é raridade. Rotular o grupo
                diz a mesma coisa sem gastar cor, e ainda funciona para quem não
                distingue as duas. */}
            <ul className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
              {(['OFERTA', 'PROCURA'] as const).flatMap((t) => {
                const doTipo = lista.filter((s) => s.tipo === t)
                if (!doTipo.length) return []
                return [
                  <li
                    key={`r-${t}`}
                    className="shrink-0 rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu px-2 py-1 font-dado text-[10px] font-bold uppercase text-tinta"
                  >
                    {t === 'OFERTA' ? 'Ofereço' : 'Procuro'} {doTipo.length}
                  </li>,
                  ...doTipo.map(({ carta }) => (
                    <li key={carta.id} className="relative shrink-0">
                      <CartaThumb
                        carta={carta}
                        className="w-10 rounded-[var(--radius-imagem)] border-2 border-tinta"
                      />
                      <button
                        onClick={() => remover(carta.id)}
                        aria-label={`Remover ${nomeCarta(carta)}`}
                        className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border-2 border-tinta bg-cartela font-dado text-[11px] leading-none text-tinta"
                      >
                        ×
                      </button>
                    </li>
                  )),
                ]
              })}
            </ul>

            {/* A bandeja só existe com ao menos uma carta escolhida, então o
                botão nunca precisa estar travado: a 1ª carta já conclui. */}
            <button
              onClick={salvar}
              disabled={salvando}
              className="w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-azul py-3.5 font-titulo text-[15px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro-sm)] disabled:opacity-45 disabled:shadow-none"
            >
              {salvando ? 'Salvando suas listas…' : 'Ver meus matches'}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Persistência do lote ---------- */

/**
 * Manda as seleções para POST /me/listings/bulk — o único write, já autenticado.
 *
 * O onboarding ainda não pergunta condição nem acabamento, então vai o padrão do
 * schema: NM e finish NORMAL (id 1). O upsert da API é idempotente, então repetir
 * o envio depois de um erro de rede não duplica nada.
 */
function useSalvarListas(lista: Selecao[]) {
  const limpar = useOnboarding((s) => s.limpar)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () =>
      criarAnunciosEmLote(
        lista.map(({ carta, tipo }) => ({ card_id: carta.id, tipo })),
      ),
    onSuccess: async () => {
      limpar()
      // O bulk também marca onboarding_ok; o perfil em cache ficou velho.
      await queryClient.invalidateQueries({ queryKey: ['perfil'] })
      navigate('/pronto', { replace: true })
    },
    onError: (erro) => {
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível salvar suas listas. Tente de novo.',
      )
    },
  })

  return { salvar: () => mutation.mutate(), salvando: mutation.isPending }
}

/* ---------- Ícone ---------- */

function IconeBusca({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  )
}
