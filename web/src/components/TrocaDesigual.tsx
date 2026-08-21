/**
 * O aviso de troca desigual, nas duas formas em que ele aparece.
 *
 * A regra que decide *se* há desequilíbrio mora em `lib/types.ts`
 * (`desequilibrio` e `desequilibrioDeValores`, com a tabela de casos). Aqui só
 * mora como ele é dito.
 *
 * **Por que duas formas.** Até 2026-08-21 havia uma cartela parada no meio da
 * página, com três parágrafos. Ela era honesta e era ignorada: chegava junto
 * com a tela, antes de a pessoa ter decidido qualquer coisa, e no momento em
 * que ela decidia — o dedo no "Tenho interesse" — já tinha rolado para fora do
 * campo de visão. Aviso que não está na frente na hora da decisão não é aviso,
 * é rodapé.
 *
 * Agora são duas peças com papéis diferentes:
 *
 * - `ResumoDesigual` — uma linha na página, para quem só está olhando a troca
 *   perceber o sinal. Não argumenta; aponta.
 * - `ModalTrocaDesigual` — a caixa que abre **no lugar** do aceite, com os dois
 *   valores e o argumento inteiro, e exige um segundo clique.
 *
 * **Por que travar.** O aceite é o que libera o contato e marca o encontro; é o
 * último ponto barato de arrependimento. Depois dele, desfazer custa uma
 * conversa com um desconhecido. Um segundo clique aqui é o preço mais baixo que
 * este app cobra por uma decisão que a pessoa pode levar semanas para desfazer.
 *
 * **O que ele não faz.** Não bloqueia, não julga e não acusa ninguém. Troca
 * desigual é legítima — gente dá carta cara para quem está começando, gente
 * fecha coleção pagando a mais de propósito, e preço da TCGplayer é referência
 * de mercado americano, não regra. O botão principal continua sendo o de
 * aceitar; o que muda é que ele passa a ser apertado com os dois números na
 * frente.
 *
 * A caixa fecha no Esc e no clique fora, ao contrário da `ModalIsencao`. Lá as
 * saídas fáceis transformariam "aceito" em "consegui contornar", porque o
 * registro é legal. Aqui a saída fácil **é** a opção conservadora: fechar sem
 * escolher deixa a troca exatamente como estava.
 */

import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

import { Button } from './ui/Button'
import { Cartela } from './brutal/Pecas'
import { cn } from '../lib/cn'
import {
  formatarMoeda,
  formatarRazao,
  type Desequilibrio,
} from '../lib/types'

/** A frase de uma linha, na voz de quem lê. É o mesmo texto nas duas peças. */
function manchete(dados: Desequilibrio): string {
  return dados.euEntregoMais
    ? `Você entrega cerca de ${formatarRazao(dados.razao)} mais valor do que recebe.`
    : `Você recebe cerca de ${formatarRazao(dados.razao)} mais valor do que entrega.`
}

/**
 * O sinal na página: uma linha, sem argumento.
 *
 * `status` e não `alert`: chega junto com a tela e não interrompe nada. Quem usa
 * leitor de tela ouve na vez dela — o que interrompe é a caixa, no aceite.
 */
export function ResumoDesigual({
  dados,
  className,
}: {
  dados: Desequilibrio
  className?: string
}) {
  const alerta = dados.euEntregoMais

  return (
    <Cartela
      role="status"
      className={cn(
        'mt-5 flex items-center gap-3 p-3.5',
        alerta && 'bg-meu',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-tinta font-titulo text-[14px] font-black text-tinta"
      >
        !
      </span>
      <p className="font-corpo text-[14px] leading-snug text-tinta">
        {manchete(dados)}{' '}
        <span className="text-apagado">
          {formatarMoeda(dados.valorDou)} de um lado,{' '}
          {formatarMoeda(dados.valorRecebo)} do outro.
        </span>
      </p>
    </Cartela>
  )
}

/**
 * A caixa que abre no lugar do aceite.
 *
 * `contexto` muda uma frase só, e ela importa: na troca sugerida a saída é pedir
 * compensação antes de fechar; na proposta a saída é contrapropor, que é um
 * botão que existe ali do lado e resolve sem encerrar a conversa.
 */
export function ModalTrocaDesigual({
  aberto,
  dados,
  contexto = 'match',
  salvando = false,
  onAceitar,
  onVoltar,
}: {
  aberto: boolean
  dados: Desequilibrio | null
  contexto?: 'match' | 'proposta'
  salvando?: boolean
  onAceitar: () => void
  onVoltar: () => void
}) {
  // A página não rola atrás da caixa — mesma razão da ModalIsencao: sem isto o
  // corpo continua rolando no celular e a caixa parece um pedaço da tela.
  useEffect(() => {
    if (!aberto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [aberto])

  // Esc fecha, e fechar é voltar. Ver o cabeçalho do arquivo.
  useEffect(() => {
    if (!aberto) return
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape' && !salvando) onVoltar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, salvando, onVoltar])

  const euEntregoMais = dados?.euEntregoMais ?? false

  return (
    <AnimatePresence>
      {aberto && dados && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => !salvando && onVoltar()}
            className="folha-veu fixed inset-0 z-40 bg-ink-deep/75 backdrop-blur-[2px]"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-troca-desigual"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn(
              'folha-inferior',
              'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto',
              'rounded-t-[20px] border-t-2 border-tinta bg-cartela',
              'shadow-[var(--shadow-pop)]',
            )}
          >
            <div className="mx-auto w-full max-w-[560px] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <p
                id="titulo-troca-desigual"
                className="font-titulo text-[19px] leading-tight font-black text-tinta"
              >
                {euEntregoMais
                  ? 'Essa troca está desigual contra você.'
                  : 'Essa troca está desigual a seu favor.'}
              </p>

              {/* Os dois números lado a lado, e não dentro de um parágrafo: é o
                  que a pessoa veio conferir, e ela precisa comparar de relance. */}
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <ValorDoLado
                  rotulo="Você entrega"
                  valor={dados.valorDou}
                  destaque={euEntregoMais}
                />
                {/* Sem `aria-hidden`, e isso não é descuido: a pele brutal
                    pinta de tinta o fundo de qualquer `[aria-hidden]` dentro de
                    uma folha inferior (é a regra do puxador e das divisórias, no
                    index.css), e a razão virava um retângulo preto. Ela também
                    não é decoração — "30x" é o número que resume a caixa. */}
                <span className="font-titulo text-[13px] font-black text-apagado">
                  {formatarRazao(dados.razao)}
                </span>
                <ValorDoLado
                  rotulo="Você recebe"
                  valor={dados.valorRecebo}
                  destaque={!euEntregoMais}
                />
              </div>

              <p className="mt-4 font-corpo text-[14px] leading-relaxed text-apagado">
                {euEntregoMais
                  ? contexto === 'proposta'
                    ? 'Se não for de propósito, contrapropor resolve sem encerrar a conversa — dá para pedir mais uma carta em vez de recusar.'
                    : 'Se não for de propósito, vale combinar uma compensação antes de fechar: mais uma carta do outro lado, por exemplo.'
                  : 'A outra pessoa pode pedir compensação na hora do encontro, e troca muito desigual costuma furar no dia.'}
              </p>

              <p className="mt-2 font-corpo text-[12px] leading-relaxed text-apagado">
                Preço é referência de mercado americano, não regra: condição,
                idioma e vontade de cada um valem mais do que a tabela.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  block
                  loading={salvando}
                  onClick={onAceitar}
                >
                  {contexto === 'proposta'
                    ? 'Aceitar mesmo assim'
                    : 'Tenho interesse mesmo assim'}
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  block
                  disabled={salvando}
                  onClick={onVoltar}
                >
                  Voltar
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function ValorDoLado({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number
  destaque: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-cartela)] border-2 border-tinta p-3 text-center',
        destaque ? 'bg-meu' : 'bg-cartela',
      )}
    >
      <p className="font-corpo text-[11px] tracking-wide text-apagado uppercase">
        {rotulo}
      </p>
      <p className="mt-1 font-titulo text-[17px] font-black text-tinta">
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}
