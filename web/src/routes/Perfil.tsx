import { Link } from 'react-router-dom'

import { IconeEngrenagem } from '@/components/brutal/Pecas'
import { FichaPerfil } from '@/components/perfil/FichaPerfil'
import { MinhasTrocas } from '@/components/perfil/MinhasTrocas'
import { useAnuncios } from '@/hooks/useAnuncios'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePerfil } from '@/hooks/usePerfil'

/**
 * O perfil, no formato do frame `pokeswap-profile`.
 *
 * A tela só mostra: a ficha e a atividade recente. Editar mora em
 * `/perfil/editar` e o resto em `/configuracoes` — quem abre o perfil quase
 * sempre vem conferir a própria reputação ou uma troca antiga, e antes rolava
 * por cima de três caixas de texto que não tinha vindo mexer.
 *
 * A marca do app fica escondida aqui, ao contrário das outras abas: o arquivo dá
 * a esta tela um cabeçalho próprio — o título e a engrenagem —, e empilhar o
 * logo em cima dele seriam duas molduras no topo do celular, que é o espaço mais
 * caro que existe. Decisão do Eduardo.
 */
export default function PerfilTela() {
  useMarcaOculta()

  const { data: perfil, isPending } = usePerfil()
  const { data: anuncios } = useAnuncios()

  return (
    <Moldura>
      <header className="flex items-center justify-between pt-5">
        <h1 className="font-titulo text-[24px] leading-none font-black text-tinta">
          Perfil
        </h1>
        {/* A engrenagem ocupa o lugar do círculo branco do arquivo. Ali ele era
            um espaço reservado; aqui leva às configurações, que é o que sobrou
            de tudo que não é "mostrar quem você é". */}
        <Link
          to="/configuracoes"
          aria-label="Configurações"
          className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          <IconeEngrenagem className="size-5" />
        </Link>
      </header>

      {isPending || !perfil ? (
        <div className="mt-5 h-52 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
      ) : (
        <FichaPerfil
          perfil={perfil}
          cartas={anuncios?.length}
          acao={
            <Link
              to="/perfil/editar"
              className="block rounded-[var(--radius-controle)] border-2 border-tinta bg-azul py-3 text-center font-titulo text-[15px] font-black text-azul-tinta shadow-[var(--shadow-duro-xs)]"
            >
              Editar Perfil
            </Link>
          }
        />
      )}

      {/* Logo depois da ficha: é a lista que dá nome aos números de cima. */}
      <MinhasTrocas />
    </Moldura>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pb-10">
      {children}
    </div>
  )
}
