import { Link } from 'react-router-dom'

import { Pokebola } from '@/components/brutal/Pecas'
import { estiloBotao } from '@/components/ui/Button'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/cn'

/**
 * O endereço que não existe.
 *
 * Até agora, `path="*"` era um `<Navigate to="/" replace />`: quem chegasse por
 * um link quebrado — o `@` que a pessoa trocou, a troca que expirou, o endereço
 * digitado errado no grupo — caía na Home sem uma palavra. Redirecionar calado é
 * a pior resposta possível para "não achei", porque some com a pergunta em vez
 * de respondê-la: a pessoa não descobre que errou o endereço, ela conclui que o
 * app perdeu a coisa.
 *
 * **O destino do botão depende de quem chegou**, e é a única lógica desta tela.
 * Mandar quem já está logado para a Home é oferecer a apresentação do produto a
 * quem já o usa; mandar quem não está para `/matches` é oferecer uma porta que
 * vai pedir login. Cada um volta para onde a próxima ação dele existe.
 */
export default function NaoEncontrada() {
  const sessao = useAuth((s) => s.session)
  const destino = sessao ? '/matches' : '/'

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      {/* Mesmo desenho do `EmBreve`: `role="status"` sem `aria-live`, porque a
          região já existe quando a tela monta e não há mudança para anunciar. A
          pokébola é decorativa; quem carrega o recado é o texto. */}
      <div role="status" className="flex flex-col items-center">
        <Pokebola className="size-20" />

        {/* O número em `font-dado`, que no sistema é a fonte de id, código de
            set e prazo. 404 é dado, não título — e escrevê-lo como dado é o que
            impede a tela de parecer um erro do servidor. */}
        <p className="mt-7 font-dado text-[13px] tracking-[0.12em] text-apagado">
          404
        </p>

        <h1 className="mt-3 font-titulo text-[22px] leading-[1.15] font-black text-tinta">
          Esta página não existe.
        </h1>
        <p className="mt-2.5 max-w-sm font-corpo text-[14px] leading-relaxed text-apagado">
          O endereço pode ter mudado, ou a troca que estava aqui já terminou.
          Nada se perdeu — suas listas e suas trocas continuam no lugar.
        </p>

        <Link
          to={destino}
          replace
          className={cn(estiloBotao({ variant: 'primary', size: 'lg' }), 'mt-7')}
        >
          {sessao ? 'Ir para minhas trocas' : 'Voltar para o início'}
        </Link>
      </div>
    </div>
  )
}
