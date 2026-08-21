import type { ReactNode } from 'react'

import { IconeEstrela } from '@/components/brutal/Pecas'
import { cn } from '@/lib/cn'
import { membroDesde, type PerfilPublico } from '@/lib/perfil'

/**
 * A ficha do perfil, copiada do frame `pokeswap-profile`.
 *
 * Avatar grande, @ em Outfit Black, "membro desde" e a nota em estrela; embaixo,
 * três placares lado a lado e a ação primária ocupando a largura toda.
 *
 * Recebe `PerfilPublico` e não `Perfil` de propósito: como o perfil do dono
 * estende o público, o tipo mais estreito serve aos dois e garante que este
 * componente nunca alcance um campo privado. É o que mantém a promessa da tela
 * — "é assim que a comunidade te vê" — verdadeira por construção.
 *
 * Os três placares do arquivo são Trocas, Cartas e Confiança. Os dois primeiros
 * saem direto dos contadores; o terceiro é a `reputacao()` do banco, em
 * porcentagem. A estrela ao lado do nome é a mesma razão noutra escala — o
 * arquivo mostra as duas, e elas não se contradizem: a estrela é o resumo que se
 * lê de relance, a porcentagem é o número que se confere.
 */
export function FichaPerfil({
  perfil,
  cartas,
  acao,
}: {
  perfil: PerfilPublico
  /** Quantas cartas a pessoa tem anunciadas. Só o próprio perfil sabe. */
  cartas?: number
  /** A ação primária do card — "Editar Perfil" no próprio, nada no público. */
  acao?: ReactNode
}) {
  const desfechos = perfil.trocas_concluidas + perfil.trocas_furadas
  const nota =
    perfil.reputacao != null
      ? ((perfil.reputacao / 100) * 5).toFixed(1).replace('.', ',')
      : null
  const desde = membroDesde(perfil.desde)

  return (
    <div className="mt-5 rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela p-5 shadow-[var(--shadow-duro)]">
      <div className="flex items-center gap-4">
        {/* O avatar do arquivo é foto. O produto não tem upload de imagem, então
            o lugar dela fica com a inicial — dado que existe, no mesmo círculo
            de 80px com a mesma borda. */}
        {perfil.avatar_url ? (
          <img
            src={perfil.avatar_url}
            alt=""
            className="size-20 shrink-0 rounded-full border-2 border-tinta object-cover"
          />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-full border-2 border-tinta bg-meu font-titulo text-[30px] font-black text-tinta">
            {(perfil.nome_exibicao || perfil.username).charAt(0).toUpperCase()}
          </span>
        )}

        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-titulo text-[22px] leading-none font-black text-tinta">
            @{perfil.username}
          </p>
          {desde && (
            <p className="truncate font-dado text-[12px] text-apagado">
              Membro desde {desde}
            </p>
          )}
          {/* Sem desfecho não há nota, e "★ —" é mais honesto que um número
              inventado: nota zero e ausência de trocas são coisas opostas. */}
          <span className="flex items-center gap-1">
            <IconeEstrela className="size-3.5 shrink-0 text-azul" />
            <span className="font-dado text-[12px] font-bold text-tinta">
              {nota ?? '—'}
            </span>
          </span>
        </div>
      </div>

      {/* A frase da pessoa, quando existe. Fica **dentro da ficha**, entre o @ e
          os números: ela é identidade, não conteúdo — quem lê está decidindo se
          quer trocar com alguém, e "coleciono Eevees" ajuda nessa decisão tanto
          quanto a nota. Vazia, não deixa buraco nenhum. */}
      {perfil.bio && (
        <p className="mt-4 font-corpo text-[14px] leading-relaxed whitespace-pre-line text-tinta">
          {perfil.bio}
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <Placar valor={String(desfechos)} rotulo="Trocas" />
        {cartas != null && <Placar valor={String(cartas)} rotulo="Cartas" />}
        <Placar
          valor={perfil.reputacao != null ? `${perfil.reputacao}%` : '—'}
          rotulo="Confiança"
        />
      </div>

      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}

function Placar({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div
      className={cn(
        'flex flex-1 flex-col items-center gap-1 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela py-3',
      )}
    >
      <span className="font-titulo text-[20px] leading-none font-black text-tinta">
        {valor}
      </span>
      <span className="font-dado text-[11px] font-medium uppercase text-apagado">
        {rotulo}
      </span>
    </div>
  )
}
