import { Selo } from '@/components/brutal/Pecas'

/**
 * O selo de reconhecimento que aparece ao lado do nome de alguém.
 *
 * **Desenha dois selos independentes**, e eles convivem: o de reconhecimento,
 * que vem de `profiles.selo` (hoje só FOUNDER), e o do PRO, que vem derivado de
 * `profiles.plano`. Dá para ter os dois — a coluna `selo` guarda um valor só, e
 * é por isso que o PRO nunca virou um valor dela. Ver `db/schema/37_founder.sql`.
 *
 * **Nenhum dos dois promete recurso.** Quem manda no limite é `profiles.plano`,
 * lido no backend. O FOUNDER é identidade e o PRO é apoio — e a explicação do
 * PRO diz isso com todas as letras, porque o §9 dos Termos promete que ele não
 * dá prioridade sobre ninguém.
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
  pro,
}: {
  /** O valor cru vindo da API. Nulo, vazio ou desconhecido não desenha nada. */
  selo?: string | null
  /**
   * Esta pessoa tem o PRO? Vem derivado da API — não é um valor de `selo`.
   *
   * Separado porque as duas coisas convivem: dá para ser FOUNDER e PRO ao mesmo
   * tempo, e a coluna `selo` guarda um valor só. Um `selo = 'PRO'` também
   * precisaria ser apagado toda vez que um plano vence; derivado, ele some
   * sozinho.
   */
  pro?: boolean
}) {
  // Valor desconhecido não vira caixinha com texto cru. O banco tem `check`, mas
  // um PWA instalado há semanas pode receber um selo que ele ainda não sabe
  // desenhar — e `FOUNDER` em SCREAMING_SNAKE na tela é pior que selo nenhum.
  const definicao = selo ? SELOS[selo] : undefined
  if (!definicao && !pro) return null

  // O `title` no envelope, e não na `Selo`, porque a peça não recebe atributo
  // solto. Sem ele o selo vira enfeite: quem não sabe o que é fica com a
  // pergunta "como eu consigo esse?", que aqui não tem resposta — não se
  // consegue, e é essa a graça.
  // Os dois convivem, e o de reconhecimento vem primeiro: o FOUNDER é sobre
  // quem a pessoa é, o PRO é sobre o que ela paga, e nessa ordem de importância.
  return (
    <>
      {definicao && (
        <span title={definicao.explicacao} className="inline-flex shrink-0">
          <Selo tom="marca">{definicao.rotulo}</Selo>
        </span>
      )}
      {pro && (
        // A explicação diz o que o selo **não** é, e isso não é excesso de
        // zelo: o §9 dos Termos promete que ter o PRO não garante troca e não
        // dá prioridade sobre ninguém. Um selo pago ao lado de um nome, na tela
        // onde se escolhe com quem trocar, é fácil demais de ler como "este
        // passa na frente" — e aí a tela contradiz o contrato.
        <span
          title="Assina o PRO e ajuda a manter o TrocaTCG no ar. Não dá prioridade nas trocas."
          className="inline-flex shrink-0"
        >
          {/* `marca`, o mesmo âmbar do FOUNDER — decisão do Eduardo em
              2026-08-25, olhando rodando na conta que tem os dois. Ele nasceu
              `neutro` como marcador de pendência, não como escolha.

              Os dois ficam da mesma cor de propósito: quem tem os dois carrega
              duas conquistas, e a distinção que importa está no rótulo. `acao`
              foi descartado — é o azul reservado a "aqui se clica", e este não
              clica. */}
          <Selo tom="marca">PRO</Selo>
        </span>
      )}
    </>
  )
}
