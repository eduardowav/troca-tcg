import { cn } from '@/lib/cn'
import type { PerfilPublico } from '@/lib/perfil'

/**
 * O painel de reputação, o mesmo nos dois perfis.
 *
 * Recebe `PerfilPublico` e não `Perfil` de propósito: como o perfil do dono
 * estende o público (lib/perfil.ts), o tipo mais estreito serve aos dois e ainda
 * garante que este componente nunca alcance um campo privado. É também o que
 * mantém a promessa da tela de perfil — "é assim que a comunidade te vê" —
 * verdadeira por construção, e não por disciplina: os dois lugares leem os
 * mesmos números, com as mesmas regras de quando mostrar cada um.
 */
export function Reputacao({ perfil }: { perfil: PerfilPublico }) {
  const total = perfil.trocas_concluidas + perfil.trocas_furadas
  // A desistência não entra na razão da reputação, e o placar dela só aparece
  // depois da primeira: um "0" fixo ao lado dos outros números sugeriria que
  // existe algo a vigiar aí, e para quase todo mundo não existe.
  const desistencias = perfil.trocas_desistidas ?? 0

  return (
    <dl
      className={cn(
        'mt-7 grid gap-3',
        desistencias > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3',
      )}
    >
      {/* Nota de 0 a 5, não a porcentagem que o banco devolve.
          A `reputacao()` do Postgres continua sendo a fonte — a nota é a mesma
          razão noutra escala —, mas quem lê num perfil compara com nota de
          marketplace, não com percentual de acerto. A dica embaixo carrega a
          contagem, que é o que impede 5,0 com uma troca de parecer 5,0 com
          duzentas. */}
      <Placar
        rotulo="Nota"
        valor={
          perfil.reputacao != null
            ? `★ ${((perfil.reputacao / 100) * 5).toFixed(1).replace('.', ',')}`
            : '★ —'
        }
        dica={
          total === 0
            ? 'sem trocas ainda'
            : `${total} ${total === 1 ? 'troca' : 'trocas'}`
        }
      />
      <Placar
        rotulo="Concluídas"
        valor={String(perfil.trocas_concluidas)}
        cor="text-offer"
      />
      <Placar
        rotulo="Furadas"
        valor={String(perfil.trocas_furadas)}
        cor="text-alert"
      />
      {desistencias > 0 && (
        <Placar
          rotulo="Desmarcadas"
          valor={String(desistencias)}
          dica="avisadas antes"
        />
      )}
    </dl>
  )
}

function Placar({
  rotulo,
  valor,
  dica,
  cor = 'text-paper',
}: {
  rotulo: string
  valor: string
  dica?: string
  cor?: string
}) {
  return (
    <div className="cartela rounded-card border border-edge bg-surface p-3.5">
      <dt className="text-[12px] text-muted">{rotulo}</dt>
      <dd className={`mt-1 text-[22px] font-bold tabular-nums ${cor}`}>
        {valor}
      </dd>
      {dica && <p className="mt-0.5 text-[11px] text-faint">{dica}</p>}
    </div>
  )
}
