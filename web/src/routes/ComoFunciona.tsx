import { useNavigate } from 'react-router-dom'

import { Cartela, LockupTrocaTCG } from '@/components/brutal/Pecas'
import { PASSOS } from '@/lib/comoFunciona'
import { marcarTutorialVisto } from '@/lib/tutorial'

/**
 * O passo zero de quem acabou de entrar: como o TrocaTCG funciona, em três
 * blocos.
 *
 * **Por que ela existe.** Até 2026-08-21 a primeira tela de dentro do app era a
 * de escolher cartas, com um parágrafo no alto explicando tudo. Quem entendeu a
 * ideia pelo grupo de WhatsApp seguia bem; quem chegou sem contexto via uma
 * grade de cartas e um campo de busca, e tinha que deduzir o produto inteiro a
 * partir dela. O momento de explicar o que o app faz é antes de pedir trabalho,
 * não durante.
 *
 * **Por que uma tela só, e não um carrossel.** Três telas cheias custam três
 * toques antes de começar, e o onboarding do app já pede um trabalho de verdade
 * logo em seguida (montar duas listas). Numa tela só, quem já sabe rola e
 * ignora; num carrossel, quem já sabe precisa tocar três vezes para chegar onde
 * queria.
 *
 * **Um botão só.** Havia um "já sei como funciona" embaixo do principal, e os
 * dois faziam exatamente a mesma coisa — a saída para quem não quer ler é rolar
 * a tela, que custa menos que ler dois botões e decidir entre eles. Dois
 * caminhos idênticos com nomes diferentes não dão escolha: dão dúvida.
 *
 * Aparece uma vez. O `lib/tutorial.ts` guarda essa decisão, e a tela continua
 * alcançável de propósito para quem quiser reler.
 */
export default function ComoFunciona() {
  const navigate = useNavigate()

  function comecar() {
    marcarTutorialVisto()
    navigate('/onboarding', { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <LockupTrocaTCG grande className="justify-center" />

      <header>
        <h1 className="font-titulo text-[28px] leading-[1.05] font-black text-tinta">
          Como funciona
        </h1>
        {/* O slogan cai bem aqui porque a tela é exatamente ele: as três
            batidas são o que acontece nos passos 2 e 3. O que ele não conta é o
            passo 1, e é por isso que ele fica de subtítulo e não de título. */}
        <p className="mt-2 font-dado text-[12px] font-bold uppercase tracking-wide text-azul">
          Achou. Combinou. Trocou.
        </p>
        <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
          Três passos, e o segundo é o app que faz.
        </p>
      </header>

      <ol className="flex flex-col gap-3">
        {PASSOS.map((passo) => (
          <li key={passo.numero}>
            <Cartela className="flex gap-4 p-4">
              {/* O número é peça, não texto: ele é o que deixa a sequência
                  legível para quem só passa o olho. */}
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-azul font-titulo text-[16px] font-black text-azul-tinta shadow-[var(--shadow-duro-xs)]"
              >
                {passo.numero}
              </span>
              <div>
                <h2 className="font-titulo text-[16px] leading-tight font-extrabold text-tinta">
                  {passo.titulo}
                </h2>
                <p className="mt-1.5 font-corpo text-[14px] leading-relaxed text-apagado">
                  {passo.texto}
                </p>
              </div>
            </Cartela>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={comecar}
        className={[
          'flex w-full items-center justify-center rounded-[var(--radius-controle)]',
          'border-2 border-tinta bg-azul px-5 py-3.5',
          'font-titulo text-[15px] font-extrabold uppercase text-azul-tinta',
          'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
          'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
        ].join(' ')}
      >
        Montar minhas listas
      </button>
    </div>
  )
}
