import { Link } from 'react-router-dom'

import { useAnuncios } from '@/hooks/useAnuncios'
import { usePerfil } from '@/hooks/usePerfil'

/**
 * Confirmação pós-onboarding.
 *
 * Provisória de propósito: o feed de matches é a fase 3 do roadmap. Aqui a
 * pessoa vê que as listas foram salvas de verdade, no servidor.
 */
export default function Pronto() {
  const { data: perfil } = usePerfil()
  // Mesma query de Minhas cartas: uma chave só, para editar lá refletir aqui.
  const { data: anuncios } = useAnuncios()

  const ofereco = anuncios?.filter((a) => a.tipo === 'OFERTA').length ?? 0
  const procuro = anuncios?.filter((a) => a.tipo === 'PROCURA').length ?? 0

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center px-5 py-12">
      <p className="set-code text-xs tracking-wide text-muted">TROCATCG</p>
      <h1 className="mt-3 text-[28px] leading-[1.1]">
        Suas listas estão no ar
        {perfil ? `, ${perfil.nome_exibicao.split(' ')[0]}` : ''}.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        A partir de agora, quem tiver o que você procura aparece aqui.
      </p>

      <dl className="mt-7 grid grid-cols-2 gap-3">
        <Placar rotulo="Ofereço" valor={ofereco} cor="text-offer" />
        <Placar rotulo="Procuro" valor={procuro} cor="text-want" />
      </dl>

      <Link
        to="/matches"
        className="mt-6 flex h-13 items-center justify-center rounded-[var(--radius-control)] bg-volt text-[15px] font-bold text-[var(--color-volt-ink)] shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_20px_-8px_var(--color-volt)] transition-colors hover:bg-volt-strong"
      >
        Ver trocas possíveis
      </Link>

      <Link
        to="/minhas-cartas"
        className="mt-2 flex h-13 items-center justify-center rounded-[var(--radius-control)] border border-edge bg-surface-2 text-[15px] text-paper transition-colors hover:border-[var(--color-faint)]"
      >
        Ver e editar minhas cartas
      </Link>

      {/* Sair da conta agora mora no perfil, alcançável pela barra de navegação. */}
    </div>
  )
}

function Placar({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string
  valor: number
  cor: string
}) {
  return (
    <div className="rounded-card border border-edge bg-surface p-4">
      <dt className={`text-[13px] font-medium ${cor}`}>{rotulo}</dt>
      <dd className="mt-1 text-[26px] font-bold text-paper tabular-nums">
        {valor}
      </dd>
    </div>
  )
}
