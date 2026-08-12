import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { CartaThumb } from '@/components/carta/CartaThumb'
import { Button } from '@/components/ui/Button'
import { useMarcaOculta } from '@/hooks/useMundo'
import { importarAnuncios } from '@/lib/anuncios'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import {
  emLinhas,
  type LinhaResolvida,
  MAX_LINHAS,
  resolverLista,
} from '@/lib/listaColada'
import type { ListingKind } from '@/lib/types'

/**
 * Colar a lista — o cadastro em massa da Fase B (seção 16).
 *
 * Quem troca já tem a lista escrita em algum lugar: o post do grupo, o bloco de
 * notas, o exportador de deck. Cadastrar carta por carta é redigitar o que já
 * existe. É o melhor portão que este app tem para o PRO justamente por isso —
 * não limita **quanto** se cadastra (a mesma lista entra uma a uma no FREE, sem
 * teto de vezes), limita o **trabalho**. Cobrar por conveniência, nunca por
 * participação.
 *
 * **Duas etapas, e a segunda é conferir — não escolher.** Reconhecer cinquenta
 * cartas e pedir que a pessoa escolha cinquenta vezes seria devolver o trabalho
 * que ela veio evitar. Cada linha já vem com um candidato marcado (o do código
 * do set, quando ela escreveu um; senão o primeiro da busca), e trocar é um
 * toque nas poucas em que a busca errou.
 *
 * **O que não casou fica à vista e não entra.** Linha sem candidato não vira
 * carta silenciosamente nem trava o resto: ela aparece com o texto original,
 * pode ser corrigida no campo e reconhecida de novo, ou fica de fora.
 */
export default function ColarLista() {
  useMarcaOculta()

  const [params] = useSearchParams()
  const navegar = useNavigate()
  const queryClient = useQueryClient()

  // A lista colada vai inteira para uma das duas listas. Perguntar por linha
  // seria transformar cinquenta cartas em cinquenta perguntas — e ninguém cola
  // Ofereço e Procuro no mesmo texto.
  const [tipo, setTipo] = useState<ListingKind>(
    params.get('tipo') === 'PROCURA' ? 'PROCURA' : 'OFERTA',
  )
  const [texto, setTexto] = useState('')
  const [linhas, setLinhas] = useState<LinhaResolvida[] | null>(null)

  const reconhecer = useMutation({
    mutationFn: () => resolverLista(emLinhas(texto)),
    onSuccess: setLinhas,
    onError: () =>
      toast.error('Não foi possível ler a lista agora. Tente de novo.'),
  })

  const importar = useMutation({
    mutationFn: () =>
      importarAnuncios(
        (linhas ?? [])
          .filter((l) => l.escolhida)
          .map((l) => ({
            card_id: l.escolhida!.id,
            tipo,
            quantidade: l.quantidade,
          })),
      ),
    onSuccess: async ({ cadastradas }) => {
      await queryClient.invalidateQueries({ queryKey: ['anuncios'] })
      toast.success(
        cadastradas === 1
          ? '1 carta cadastrada.'
          : `${cadastradas} cartas cadastradas.`,
      )
      navegar('/minhas-cartas', { replace: true })
    },
    onError: (erro) =>
      toast.error(
        erro instanceof ApiError
          ? erro.message
          : 'Não foi possível cadastrar a lista agora.',
      ),
  })

  const total = emLinhas(texto).length
  const reconhecidas = (linhas ?? []).filter((l) => l.escolhida).length
  const perdidas = (linhas ?? []).length - reconhecidas

  function trocar(posicao: number, indice: number) {
    setLinhas((atual) =>
      (atual ?? []).map((l) =>
        l.posicao === posicao ? { ...l, escolhida: l.candidatos[indice] } : l,
      ),
    )
  }

  function mudarQuantidade(posicao: number, quantidade: number) {
    setLinhas((atual) =>
      (atual ?? []).map((l) => (l.posicao === posicao ? { ...l, quantidade } : l)),
    )
  }

  function descartar(posicao: number) {
    setLinhas((atual) => (atual ?? []).filter((l) => l.posicao !== posicao))
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pt-5 pb-32">
      <div className="flex items-center gap-3">
        <Link
          to="/minhas-cartas"
          aria-label="Voltar para minhas cartas"
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <h1 className="font-titulo text-[24px] leading-none font-black text-tinta">
          Colar lista
        </h1>
      </div>

      {linhas === null ? (
        <>
          <p className="mt-4 font-corpo text-[15px] leading-relaxed text-apagado">
            Cole a lista que você já tem escrita — uma carta por linha. O app
            reconhece quantidade na frente e código do set no fim, do jeito que
            o jogador escreve.
          </p>

          <Exemplo />

          <Alternador tipo={tipo} onTipo={setTipo} />

          <label className="mt-4 block">
            <span className="font-dado text-[11px] uppercase text-apagado">
              Sua lista
            </span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              spellCheck={false}
              placeholder={'4x Charizard ex OBF 125\n2 Pikachu\nPesquisa de Professores'}
              className="mt-1.5 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-3 font-corpo text-[15px] leading-relaxed text-tinta placeholder:text-apagado/60"
            />
          </label>

          <p className="mt-1.5 font-dado text-[11px] uppercase text-apagado">
            {total === 0
              ? `Até ${MAX_LINHAS} linhas por vez`
              : `${total} ${total === 1 ? 'linha' : 'linhas'}${
                  total > MAX_LINHAS ? ` — as primeiras ${MAX_LINHAS}` : ''
                }`}
          </p>

          <Button
            className="mt-5"
            variant="primary"
            size="lg"
            loading={reconhecer.isPending}
            disabled={total === 0 || reconhecer.isPending}
            onClick={() => reconhecer.mutate()}
          >
            Reconhecer cartas
          </Button>
        </>
      ) : (
        <>
          <p className="mt-4 font-corpo text-[15px] leading-relaxed text-apagado">
            Confira antes de cadastrar. O que o app não reconheceu fica de fora —
            e você pode voltar e corrigir a linha.
          </p>

          {perdidas > 0 && (
            <p className="mt-3 rounded-[var(--radius-controle)] border-2 border-ambar bg-ambar-fraco px-4 py-3 font-corpo text-[14px] leading-relaxed text-ambar">
              {perdidas === 1
                ? '1 linha não bateu com nenhuma carta do catálogo.'
                : `${perdidas} linhas não bateram com nenhuma carta do catálogo.`}{' '}
              Elas não entram. Escrever o nome como está na carta, ou o código do
              set (por exemplo <span className="font-dado">OBF 125</span>),
              costuma resolver.
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-2">
            {linhas.map((linha) => (
              <Linha
                key={linha.posicao}
                linha={linha}
                onTrocar={(i) => trocar(linha.posicao, i)}
                onQuantidade={(q) => mudarQuantidade(linha.posicao, q)}
                onDescartar={() => descartar(linha.posicao)}
              />
            ))}
          </ul>

          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4">
            <div className="mx-auto flex w-full max-w-xl items-center gap-3 rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela p-3 shadow-[var(--shadow-duro)]">
              <p className="min-w-0 flex-1 font-dado text-[12px] leading-snug text-apagado">
                <span className="font-bold text-tinta">{reconhecidas}</span>{' '}
                {reconhecidas === 1 ? 'carta' : 'cartas'} para{' '}
                {tipo === 'OFERTA' ? 'Ofereço' : 'Procuro'}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLinhas(null)}
                disabled={importar.isPending}
              >
                Voltar
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={importar.isPending}
                disabled={reconhecidas === 0 || importar.isPending}
                onClick={() => importar.mutate()}
              >
                Cadastrar
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * O exemplo é a explicação.
 *
 * Descrever em prosa os formatos aceitos ("quantidade opcional, sigla opcional,
 * número opcional") custa três linhas que ninguém lê. Três linhas de lista de
 * verdade dizem o mesmo e já mostram o que colar.
 */
function Exemplo() {
  return (
    <pre className="mt-4 overflow-x-auto rounded-[var(--radius-controle)] border-2 border-dashed border-tinta/30 bg-papel p-3 font-dado text-[12px] leading-relaxed text-apagado">
      4x Charizard ex OBF 125{'\n'}2 Pikachu{'\n'}Pesquisa de Professores
    </pre>
  )
}

function Alternador({
  tipo,
  onTipo,
}: {
  tipo: ListingKind
  onTipo: (t: ListingKind) => void
}) {
  return (
    <div className="mt-5">
      <span className="font-dado text-[11px] uppercase text-apagado">
        A lista inteira vai para
      </span>
      <div className="mt-1.5 flex gap-2">
        {(['OFERTA', 'PROCURA'] as const).map((valor) => (
          <button
            key={valor}
            type="button"
            aria-pressed={tipo === valor}
            onClick={() => onTipo(valor)}
            className={cn(
              'flex-1 rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-2.5',
              'font-titulo text-[14px] font-black uppercase transition-shadow',
              tipo === valor
                ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            {valor === 'OFERTA' ? 'Ofereço' : 'Procuro'}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Uma linha da conferência.
 *
 * A carta escolhida ocupa a linha inteira; o que a pessoa escreveu fica em
 * miúdo embaixo, porque é o que ela usa para reconhecer a própria linha quando
 * a busca acertou a carta errada. Os outros candidatos só aparecem quando ela
 * pede — três miniaturas por linha em cinquenta linhas seria uma parede.
 */
function Linha({
  linha,
  onTrocar,
  onQuantidade,
  onDescartar,
}: {
  linha: LinhaResolvida
  onTrocar: (indice: number) => void
  onQuantidade: (quantidade: number) => void
  onDescartar: () => void
}) {
  const [abertas, setAbertas] = useState(false)
  const carta = linha.escolhida

  return (
    <li
      className={cn(
        'rounded-[var(--radius-controle)] border-2 p-3',
        carta
          ? 'border-tinta bg-cartela shadow-[var(--shadow-duro-xs)]'
          : 'border-dashed border-tinta/40 bg-papel',
      )}
    >
      <div className="flex items-center gap-3">
        {carta ? (
          <CartaThumb carta={carta} className="w-10 shrink-0 border-2 border-tinta" />
        ) : (
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-dashed border-tinta/40 font-titulo text-[16px] font-black text-apagado"
          >
            ?
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-corpo text-[15px] font-medium text-tinta">
            {carta ? (carta.nome_pt ?? carta.nome_en) : 'Não encontrada'}
          </p>
          <p className="truncate font-dado text-[11px] uppercase text-apagado">
            {carta
              ? `${carta.set_sigla ?? carta.set_code} ${carta.numero} · ${linha.termo}`
              : linha.termo}
          </p>
        </div>

        {carta ? (
          <label className="shrink-0">
            <span className="sr-only">Quantidade</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              value={linha.quantidade}
              onChange={(e) =>
                onQuantidade(
                  Math.min(Math.max(Number(e.target.value) || 1, 1), 99),
                )
              }
              className="h-9 w-14 rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-papel px-2 text-center font-dado text-[13px] text-tinta"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={onDescartar}
            className="shrink-0 rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-cartela px-2.5 py-1.5 font-dado text-[11px] font-bold uppercase text-tinta"
          >
            Tirar
          </button>
        )}
      </div>

      {linha.candidatos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => setAbertas((v) => !v)}
            aria-expanded={abertas}
            className="mt-2 font-corpo text-[13px] font-medium text-azul underline underline-offset-2"
          >
            {abertas ? 'Fechar' : 'Não é essa carta?'}
          </button>

          {abertas && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {linha.candidatos.map((candidata, i) => (
                <li key={candidata.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onTrocar(i)
                      setAbertas(false)
                    }}
                    aria-pressed={candidata.id === carta?.id}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-[var(--radius-etiqueta)]',
                      'border-2 border-tinta px-2 py-1.5 text-left',
                      candidata.id === carta?.id
                        ? 'bg-meu'
                        : 'bg-papel hover:shadow-[var(--shadow-duro-xs)]',
                    )}
                  >
                    <CartaThumb
                      carta={candidata}
                      className="w-7 shrink-0 border-2 border-tinta"
                    />
                    <span className="min-w-0 flex-1 truncate font-corpo text-[13px] text-tinta">
                      {candidata.nome_pt ?? candidata.nome_en}
                    </span>
                    <span className="shrink-0 font-dado text-[11px] uppercase text-apagado">
                      {candidata.set_sigla ?? candidata.set_code} {candidata.numero}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  )
}
