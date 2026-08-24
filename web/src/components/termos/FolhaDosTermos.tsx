import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

import {
  ConteudoDosTermos,
  VERSAO,
} from '@/components/termos/ConteudoDosTermos'
import { cn } from '@/lib/cn'

/**
 * Os Termos por cima do cadastro, sem sair da tela.
 *
 * **Existe por causa de um defeito que o Eduardo achou usando o app em
 * 2026-08-24:** o link do aceite navegava para `/termos`, e quem tinha
 * preenchido nome, e-mail, senha e telefone voltava para um formulário em
 * branco. O React não guarda campo de tela desmontada, e o botão de voltar do
 * navegador remonta a rota do zero. Ou seja: a tela punia exatamente quem fez a
 * coisa certa, que é ler antes de aceitar.
 *
 * **Ler não pode custar o que já foi digitado.** Por isso é folha e não rota: o
 * formulário continua montado atrás, com tudo onde estava.
 *
 * O texto vem de `ConteudoDosTermos`, o mesmo que a página `/termos` mostra —
 * ver o cabeçalho de lá para por que ele não pode ser copiado.
 *
 * A página continua existindo e o link para ela também, em `target="_blank"`:
 * quem quiser ler com calma, guardar ou mandar para alguém precisa de um
 * endereço, e uma folha não tem endereço.
 */
export function FolhaDosTermos({
  aberta,
  aoFechar,
}: {
  aberta: boolean
  aoFechar: () => void
}) {
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    // A página de trás não pode rolar junto: num celular, rolar a folha até o
    // fim e continuar arrastando leva o formulário embora sem a pessoa perceber
    // que saiu de lugar.
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = anterior
    }
  }, [aberta, aoFechar])

  return (
    <AnimatePresence>
      {aberta && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={aoFechar}
            className="fixed inset-0 z-40 bg-ink-deep/75 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Termos de uso e privacidade"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className={cn(
              'fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col',
              'rounded-t-[20px] border-t border-edge bg-surface',
              'shadow-[var(--shadow-pop)]',
            )}
          >
            {/* O cabeçalho fica fora da área que rola. São dezoito seções de
                texto jurídico: com o botão de fechar rolando junto, quem chega
                ao meio e desiste não tem como sair sem rolar de volta ao topo. */}
            <div className="shrink-0 border-b border-edge px-5 pt-3 pb-4">
              <div
                aria-hidden
                className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge"
              />
              <div className="mx-auto flex w-full max-w-xl items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-[18px] leading-tight text-paper">
                    Termos de uso e privacidade
                  </h2>
                  <p className="set-code mt-1 text-xs text-muted">
                    VERSÃO {VERSAO}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={aoFechar}
                  className="shrink-0 rounded-full border border-edge px-3 py-1.5 text-[13px] text-muted hover:text-paper"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <div className="mx-auto w-full max-w-xl">
                <ConteudoDosTermos />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
