import { Pokebola, Selo } from '@/components/brutal/Pecas'

/**
 * A tela que ainda não existe.
 *
 * Mensagens e Notificações estão no Figma e não estão no produto: a primeira é
 * chat próprio (tabela, realtime, moderação, mudança na política de
 * privacidade), a segunda é a Fase 6. Os dois botões existem mesmo assim, por
 * decisão do Eduardo — botão presente com destino honesto comunica o roteiro
 * melhor do que ausência, e evita que a pessoa procure a função achando que ela
 * está escondida em algum canto.
 *
 * O que esta tela **não** faz é parar por aí. "Em desenvolvimento" sozinho é
 * humor de porta fechada: diz que não tem e some. Cada uma diz também por onde a
 * coisa acontece hoje — contato por WhatsApp depois do aceite, trocas novas na
 * aba Trocas. É a diferença entre um aviso e uma direção.
 */
function EmBreve({
  titulo,
  descricao,
}: {
  titulo: string
  descricao: string
}) {

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      {/* `role="status"` e não `aria-live`: a região já existe quando a tela
          monta, então não há mudança para anunciar — o leitor de tela lê o
          conteúdo na ordem. A pokébola é `aria-hidden`; quem carrega o recado
          para quem não vê é o texto. */}
      <div role="status" className="flex flex-col items-center">
        <Pokebola className="size-20" />

        <span className="mt-7">
          <Selo>Em desenvolvimento</Selo>
        </span>

        <h1 className="mt-5 font-titulo text-[22px] leading-[1.15] font-black text-tinta">
          {titulo}
        </h1>
        <p className="mt-2.5 max-w-sm font-corpo text-[14px] leading-relaxed text-apagado">
          {descricao}
        </p>
      </div>
    </div>
  )
}

export function Mensagens() {
  return (
    <EmBreve
      titulo="As mensagens ainda não moram aqui."
      descricao="Quando uma troca é combinada pelos dois lados, o contato aparece no detalhe dela e a conversa acontece no WhatsApp. Conversar dentro do app vem depois."
    />
  )
}

export function Notificacoes() {
  return (
    <EmBreve
      titulo="Os avisos ainda não moram aqui."
      descricao="Por enquanto nada some: toda troca possível fica na aba Trocas, e o prazo de cada uma aparece na própria linha. O aviso que chega sozinho vem depois."
    />
  )
}
