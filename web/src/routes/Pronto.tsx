import { useQuery } from '@tanstack/react-query'

import { usePerfil } from '@/hooks/usePerfil'
import { listarAnuncios } from '@/lib/anuncios'
import { sair, useUsuarioId } from '@/stores/auth'

/**
 * Confirmação pós-onboarding.
 *
 * Provisória de propósito: o feed de matches é a fase 3 do roadmap. Aqui a
 * pessoa vê que as listas foram salvas de verdade, no servidor.
 */
export default function Pronto() {
  const { data: perfil } = usePerfil()
  const userId = useUsuarioId()

  const { data: anuncios } = useQuery({
    queryKey: ['anuncios', userId],
    enabled: Boolean(userId),
    queryFn: () => listarAnuncios(),
  })

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

      <p className="mt-7 rounded-card border border-edge bg-surface p-4 text-[14px] leading-relaxed text-muted">
        O feed de matches é a próxima etapa em construção. Enquanto isso, suas
        cartas já estão salvas e visíveis para a comunidade.
      </p>

      <button
        onClick={sair}
        className="mx-auto mt-8 text-[13px] text-muted underline underline-offset-2 hover:text-paper"
      >
        Sair da conta
      </button>
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
