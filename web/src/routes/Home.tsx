import { Link, Navigate } from 'react-router-dom'

import { IconeBusca, IconeCartas, IconeTroca } from '@/components/ui/Icone'
import { useAuth } from '@/stores/auth'

/**
 * Porta de entrada pública.
 *
 * Quem chega aqui não sabe o que é o TrocaTCG, então a página responde três
 * perguntas na ordem em que elas aparecem na cabeça de quem chega: o que é,
 * como funciona e é seguro? Quem já tem sessão nunca vê isto — vai direto para
 * o app.
 */
export default function Home() {
  const carregando = useAuth((s) => s.carregando)
  const session = useAuth((s) => s.session)

  if (carregando) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <span
          role="status"
          aria-label="Carregando"
          className="size-6 animate-spin rounded-full border-2 border-faint border-t-transparent"
        />
      </div>
    )
  }

  // Passa pelo /app em vez de ir direto ao feed: é lá que se decide se a pessoa
  // ainda precisa do onboarding.
  if (session) return <Navigate to="/app" replace />

  return (
    <div className="mx-auto w-full max-w-xl px-5 pb-20">
      <header className="pt-16">
        <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
        <h1 className="mt-4 text-[34px] leading-[1.05] text-balance">
          A carta que falta na sua está sobrando na de alguém.
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Quadro de trocas de Pokémon TCG para a comunidade de Belém. Você diz o
          que tem e o que procura — o app encontra com quem a troca fecha dos
          dois lados.
        </p>

        <div className="mt-8 flex flex-col gap-2">
          <Link
            to="/entrar"
            className="flex h-13 items-center justify-center rounded-[var(--radius-control)] bg-volt text-[15px] font-bold text-[var(--color-volt-ink)] shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_20px_-8px_var(--color-volt)] transition-colors hover:bg-volt-strong"
          >
            Criar minha conta
          </Link>
          <Link
            to="/entrar"
            className="flex h-13 items-center justify-center rounded-[var(--radius-control)] border border-edge bg-surface-2 text-[15px] text-paper transition-colors hover:border-[var(--color-faint)]"
          >
            Já tenho conta
          </Link>
        </div>
      </header>

      <section className="mt-16">
        <h2 className="text-[13px] tracking-wide text-muted uppercase">
          Como funciona
        </h2>
        <ol className="mt-5 flex flex-col gap-5">
          <Passo
            numero={1}
            icone={<IconeCartas className="size-5" />}
            titulo="Monte suas duas listas"
            texto="Ofereço, para as repetidas que você topa trocar. Procuro, para as que faltam. Busca no catálogo real, com imagem."
          />
          <Passo
            numero={2}
            icone={<IconeTroca className="size-5" />}
            titulo="O app acha a troca"
            texto="Quando alguém tem o que você procura e quer o que você oferece, a troca aparece pronta — com as duas cartas lado a lado."
          />
          <Passo
            numero={3}
            icone={<IconeBusca className="size-5" />}
            titulo="Vocês combinam e trocam"
            texto="Os dois aceitam, os contatos aparecem, e o encontro é de vocês. Presencial, como troca de carta sempre foi."
          />
        </ol>
      </section>

      <section className="mt-16 rounded-card border border-edge bg-surface p-5">
        <h2 className="text-[17px] text-paper">O que o TrocaTCG não faz</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Não vende, não compra, não guarda carta e não cobra comissão. Não pede
          seu endereço nem sua localização. Seu telefone só aparece para quem
          fechar uma troca com você — antes disso, ninguém vê.
        </p>
        <Link
          to="/termos"
          className="mt-4 inline-block text-[14px] text-paper underline underline-offset-4"
        >
          Termos e privacidade
        </Link>
      </section>

      <footer className="mt-16 border-t border-edge-soft pt-6 text-[13px] text-faint">
        <p>Feito em Belém, para quem troca em Belém.</p>
      </footer>
    </div>
  )
}

function Passo({
  numero,
  icone,
  titulo,
  texto,
}: {
  numero: number
  icone: React.ReactNode
  titulo: string
  texto: string
}) {
  return (
    <li className="flex gap-4">
      <span className="relative grid size-10 shrink-0 place-items-center rounded-[10px] border border-edge bg-surface text-muted">
        {icone}
        <span className="set-code absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border border-edge bg-surface-2 text-[10px] text-paper">
          {numero}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] text-paper">{titulo}</span>
        <span className="mt-1 block text-[15px] leading-relaxed text-muted">
          {texto}
        </span>
      </span>
    </li>
  )
}
