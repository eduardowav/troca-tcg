import { Link } from 'react-router-dom'

/** Versão registrada em term_acceptances a cada aceite (API: TERMOS_VERSAO). */
const VERSAO = '2026-07-01'

/**
 * ATENÇÃO: texto provisório. O documento completo (termos + política de
 * privacidade / LGPD) é requisito de lançamento — ver fase 3 do roadmap.
 */
export default function Termos() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12">
      <Link
        to="/entrar"
        className="text-[14px] text-muted underline underline-offset-2 hover:text-paper"
      >
        ← Voltar
      </Link>

      <h1 className="mt-6 text-[26px] leading-[1.15]">Termos de uso</h1>
      <p className="set-code mt-2 text-xs text-muted">VERSÃO {VERSAO}</p>

      <div className="mt-7 flex flex-col gap-4 text-[15px] leading-relaxed text-muted">
        <p className="rounded-card border border-edge bg-surface p-4 text-paper">
          O documento completo está em redação e entra no ar antes da abertura
          para a comunidade. O resumo abaixo já vale como o combinado.
        </p>

        <Secao titulo="O que o TrocaTCG é">
          Um quadro de trocas: você publica o que oferece e o que procura, e o
          app aponta com quem a troca fecha. Nada mais.
        </Secao>

        <Secao titulo="A troca é entre vocês">
          O TrocaTCG não intermedia, não guarda cartas, não processa pagamento e
          não garante a entrega. Combinar local, conferir a carta e concluir é
          responsabilidade das duas pessoas, por conta e risco de cada uma.
        </Secao>

        <Secao titulo="Venda não é troca">
          O espaço é de troca entre colecionadores. Usar o app para vender é
          motivo de denúncia e remoção da conta.
        </Secao>

        <Secao titulo="Seu contato">
          Seu contato só aparece para a outra pessoa depois que as duas aceitam
          a troca e confirmam este aviso. Antes disso, ninguém vê.
        </Secao>

        <Secao titulo="Seus dados">
          Guardamos o mínimo: e-mail (login), nome de exibição, @ e suas listas.
          Você pode pedir a exclusão da conta e de tudo que está ligado a ela.
        </Secao>
      </div>
    </div>
  )
}

function Secao({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="text-[17px] text-paper">{titulo}</h2>
      <p className="mt-1.5">{children}</p>
    </section>
  )
}
