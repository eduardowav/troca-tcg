import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * A isenção de responsabilidade — a caixa bloqueante e a linha de rodapé.
 *
 * A seção 4.2 da doc lista quatro momentos em que ela precisa aparecer, e diz
 * qual é o crítico: **antes de revelar o contato**. É o instante exato em que a
 * pessoa sai da plataforma e entra numa negociação pessoal, e onde a fronteira
 * de responsabilidade precisa estar explícita — não no rodapé de uma página de
 * termos que ninguém abre.
 *
 * O texto é o resumo, não a íntegra. A íntegra tem quatro parágrafos e mora em
 * `/termos`; despejá-la num modal garante que ninguém leia, que é o oposto do
 * que ela existe para fazer. O que fica aqui é o que muda o comportamento de
 * quem está prestes a marcar um encontro com um estranho.
 */

/** O resumo que aparece na caixa. Três frases, e nenhuma é decorativa. */
export function TextoIsencao() {
  return (
    <div className="flex flex-col gap-3 font-corpo text-[15px] leading-relaxed text-apagado">
      <p>
        O TrocaTCG <strong className="text-tinta">apenas conecta</strong> vocês
        dois. Ele não participa da negociação, não guarda cartas, não intermedia
        pagamento e não garante que a troca aconteça.
      </p>
      <p>
        Combinar o encontro, conferir a autenticidade e o estado das cartas na
        hora é responsabilidade de vocês.{' '}
        <strong className="text-tinta">
          Marque em lugar público e movimentado
        </strong>{' '}
        — loja especializada ou evento da comunidade.
      </p>
      <p>
        Se algo der errado, use a denúncia dentro da própria troca. É o que
        alimenta a reputação que a comunidade lê.
      </p>
    </div>
  )
}

/**
 * A caixa que precisa ser aceita antes de o contato aparecer.
 *
 * **Ela não cobre um contato que já chegou.** O `GET` do match omite
 * `contato_visivel` enquanto não houver aceite registrado no servidor; quem
 * confirma aqui dispara `POST /me/matches/{id}/contato`, que grava o aceite com
 * versão, IP e o id da troca, e só então devolve o dado. Um modal que escondesse
 * um valor já baixado seria teatro — legível por qualquer um que abrisse as
 * ferramentas do navegador, e o registro provaria apenas que houve um clique.
 *
 * Sem botão de fechar, sem fechar no Esc e sem fechar clicando fora: as três
 * saídas transformariam "aceito" em "consegui contornar". A saída é o botão
 * secundário, que devolve a pessoa para a troca sem o contato — recusar precisa
 * ser possível, só não pode ser acidental.
 */
export function ModalIsencao({
  aberto,
  onAceitar,
  onRecusar,
  salvando = false,
}: {
  aberto: boolean
  onAceitar: () => void
  onRecusar: () => void
  salvando?: boolean
}) {
  // A página não rola atrás da caixa. Sem isto, o corpo continua rolando no
  // celular e a caixa dá a impressão de ser um pedaço da tela, não uma parada.
  useEffect(() => {
    if (!aberto) return
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflowAnterior
    }
  }, [aberto])

  return (
    <AnimatePresence>
      {aberto && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="folha-veu fixed inset-0 z-40 bg-ink-deep/75 backdrop-blur-[2px]"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="titulo-isencao"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn(
              'folha-inferior',
              'fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto',
              'rounded-t-[20px] border-t border-edge bg-surface',
              'shadow-[var(--shadow-pop)]',
            )}
          >
            <div className="mx-auto w-full max-w-xl px-5 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <h2
                id="titulo-isencao"
                className="font-titulo text-[22px] leading-[1.15] font-black text-tinta"
              >
                Antes de ver o contato
              </h2>

              <div className="mt-4">
                <TextoIsencao />
              </div>

              <Link
                to="/termos"
                className="mt-4 inline-block font-corpo text-[14px] text-tinta underline underline-offset-2"
              >
                Ler os termos completos
              </Link>

              <div className="mt-6 flex flex-col gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  block
                  loading={salvando}
                  onClick={onAceitar}
                >
                  Entendi, quero ver o contato
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  block
                  onClick={onRecusar}
                  disabled={salvando}
                >
                  Agora não
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * A não-afiliação, para o rodapé.
 *
 * Exigida pelo Apêndice C e pela seção 4.1, e é o tipo de linha que protege
 * justamente por ser chata e estar sempre visível. Fica separada do resto da
 * isenção porque responde outra pergunta: aquela é sobre o que acontece entre
 * duas pessoas, esta é sobre de quem são as marcas na tela.
 */
export function NaoAfiliacao({ className }: { className?: string }) {
  return (
    <p className={cn('font-corpo text-[11px] leading-relaxed', className)}>
      O TrocaTCG não é afiliado, patrocinado nem endossado por Nintendo,
      Creatures Inc., GAME FREAK inc. ou The Pokémon Company International. Todos
      os nomes, imagens e marcas de cartas pertencem a seus titulares.
    </p>
  )
}
