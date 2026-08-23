import { Selo } from '@/components/brutal/Pecas'

/**
 * O selo de reconhecimento que aparece ao lado do nome de alguém.
 *
 * **Não é plano e não promete recurso nenhum.** Quem manda no limite é
 * `profiles.plano`; isto é identidade — ver `db/schema/37_founder.sql` para por
 * que o FOUNDER não virou um terceiro valor de plano.
 *
 * Usa a `Selo` do design system em vez de desenhar a própria pill: o app já
 * tinha uma etiqueta redonda com borda de 2px, e uma segunda quase igual é como
 * nasce a divergência de 1px que ninguém consegue explicar depois. O que faltava
 * lá era o tom `marca`, que entrou junto.
 *
 * O nome é `SeloDaPessoa` e não `Selo` porque `Selo` já existe e é a peça
 * genérica. Este é o uso específico: qual selo esta pessoa tem.
 */
const SELOS: Record<string, { rotulo: string; explicacao: string }> = {
  FOUNDER: {
    rotulo: 'Founder',
    explicacao: 'Ajudou a construir o TrocaTCG antes de ele existir',
  },
}

export function SeloDaPessoa({
  selo,
}: {
  /** O valor cru vindo da API. Nulo, vazio ou desconhecido não desenha nada. */
  selo?: string | null
}) {
  // Valor desconhecido não vira caixinha com texto cru. O banco tem `check`, mas
  // um PWA instalado há semanas pode receber um selo que ele ainda não sabe
  // desenhar — e `FOUNDER` em SCREAMING_SNAKE na tela é pior que selo nenhum.
  const definicao = selo ? SELOS[selo] : undefined
  if (!definicao) return null

  // O `title` no envelope, e não na `Selo`, porque a peça não recebe atributo
  // solto. Sem ele o selo vira enfeite: quem não sabe o que é fica com a
  // pergunta "como eu consigo esse?", que aqui não tem resposta — não se
  // consegue, e é essa a graça.
  return (
    <span title={definicao.explicacao} className="inline-flex shrink-0">
      <Selo tom="marca">{definicao.rotulo}</Selo>
    </span>
  )
}
