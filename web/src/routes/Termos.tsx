import { Link } from 'react-router-dom'

/**
 * Versão registrada em `term_acceptances` a cada aceite.
 *
 * Precisa bater com TERMOS_VERSAO no `api/.env`. Sempre que o texto mudar de
 * conteúdo — não de vírgula — suba a data: quem aceitou a versão anterior não
 * aceitou esta, e o registro de aceite existe justamente para provar o quê.
 */
const VERSAO = '2026-07-28'

/** Canal do controlador para pedidos de LGPD. Trocar antes do lançamento. */
const CONTATO = 'contato@trocatcg.com.br'

export default function Termos() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12">
      <Link
        to="/entrar"
        className="text-[14px] text-muted underline underline-offset-2 hover:text-paper"
      >
        ← Voltar
      </Link>

      <h1 className="mt-6 text-[26px] leading-[1.15]">
        Termos de uso e privacidade
      </h1>
      <p className="set-code mt-2 text-xs text-muted">VERSÃO {VERSAO}</p>

      <p className="mt-5 text-[15px] leading-relaxed text-muted">
        Em resumo: o TrocaTCG aproxima quem quer trocar carta de Pokémon TCG em
        Belém. A troca em si acontece entre vocês, pessoalmente. Guardamos o
        mínimo de dados e seu telefone só aparece depois que os dois aceitam a
        troca.
      </p>

      <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-muted">
        <Titulo>Termos de uso</Titulo>

        <Secao titulo="1. O que o TrocaTCG é">
          Um quadro de trocas. Você publica o que oferece e o que procura, e o
          app aponta as pessoas com quem a troca fecha. Ele não vende, não
          compra, não guarda cartas e não participa da negociação.
        </Secao>

        <Secao titulo="2. Quem pode usar">
          É preciso ter 18 anos ou mais, ou usar com acompanhamento de um
          responsável. Cada pessoa mantém uma conta só, com informações
          verdadeiras.
        </Secao>

        <Secao titulo="3. A troca é entre vocês">
          O TrocaTCG não intermedia, não confere autenticidade nem estado das
          cartas, não processa pagamento e não garante que a troca aconteça.
          Combinar o encontro, conferir a carta na hora e concluir é
          responsabilidade das duas pessoas, por conta e risco de cada uma.
          Recomendamos encontrar em local público e movimentado.
        </Secao>

        <Secao titulo="4. Venda não é troca">
          O espaço é de troca entre colecionadores. Usar o app para vender,
          revender ou anunciar serviços é motivo de remoção da conta.
        </Secao>

        <Secao titulo="5. O que não pode">
          Publicar carta falsificada, roubada ou que você não tem; combinar
          troca e não aparecer de forma reiterada; usar o contato de alguém para
          outro fim que não a troca combinada; assediar, ameaçar ou discriminar.
          Qualquer um desses casos leva à suspensão da conta.
        </Secao>

        <Secao titulo="6. Reputação">
          Sua reputação é calculada a partir das trocas concluídas e das que
          furaram. Ela é pública para que a comunidade decida com quem trocar.
          Não é possível editá-la.
        </Secao>

        <Secao titulo="7. Encerramento">
          Você pode apagar sua conta quando quiser. Podemos suspender contas que
          descumpram estes termos. Se o serviço for descontinuado, avisaremos
          com antecedência para você salvar suas listas.
        </Secao>

        <Secao titulo="8. Mudanças">
          Se estes termos mudarem de forma relevante, a versão sobe e pediremos
          seu aceite de novo antes de continuar usando.
        </Secao>

        <Titulo>Política de privacidade</Titulo>

        <Secao titulo="9. Quem é o responsável">
          O TrocaTCG é o controlador dos seus dados. Para qualquer pedido sobre
          privacidade, fale com{' '}
          <a
            href={`mailto:${CONTATO}`}
            className="text-paper underline underline-offset-2"
          >
            {CONTATO}
          </a>
          .
        </Secao>

        <Secao titulo="10. Que dados guardamos">
          <Lista
            itens={[
              'E-mail — para você entrar na conta.',
              'Nome de exibição e @ — é como a comunidade te vê.',
              'Telefone de WhatsApp — para combinarem a troca depois do aceite.',
              'Suas listas de Ofereço e Procuro, com condição e acabamento.',
              'Histórico de trocas e o resultado delas, que alimenta a reputação.',
              'Data e IP do aceite destes termos, como comprovação legal.',
            ]}
          />
          Não pedimos CPF, endereço, bairro nem localização, e não usamos
          rastreadores de publicidade.
        </Secao>

        <Secao titulo="11. Por que podemos tratar esses dados">
          Para executar o serviço que você contratou ao criar a conta (art. 7º,
          V da LGPD) e, no caso do registro de aceite, para cumprir obrigação
          legal e exercer direitos (art. 7º, II e VI).
        </Secao>

        <Secao titulo="12. Quem vê o quê">
          Seu nome, @ e reputação são públicos, assim como suas listas — é o que
          torna a troca possível. <strong className="text-paper">
            Seu telefone não é público
          </strong>{' '}
          e só é mostrado à outra pessoa depois que as duas aceitam a mesma
          troca. Não vendemos nem cedemos seus dados a terceiros.
        </Secao>

        <Secao titulo="13. Onde os dados ficam">
          Em servidores da Supabase, na região de São Paulo (Brasil). O envio de
          e-mails de confirmação usa serviço de terceiro apenas para esse fim.
        </Secao>

        <Secao titulo="14. Por quanto tempo">
          Enquanto sua conta existir. Ao apagar a conta, tudo que é seu vai
          junto: perfil, listas, trocas em aberto, inscrições de notificação e o
          registro do seu aceite. Quem já trocou com você mantém a contagem de
          trocas concluídas dele, que não guarda nenhum dado seu.
        </Secao>

        <Secao titulo="15. Seus direitos">
          A LGPD te dá direito a confirmar o tratamento, acessar, corrigir,
          anonimizar, portar e apagar seus dados, além de revogar o
          consentimento. Nome, @ e telefone você edita direto no app. Para os
          demais pedidos, escreva para{' '}
          <a
            href={`mailto:${CONTATO}`}
            className="text-paper underline underline-offset-2"
          >
            {CONTATO}
          </a>{' '}
          — respondemos em até 15 dias.
        </Secao>

        <Secao titulo="16. Como apagar sua conta">
          No próprio app, em Perfil → “Apagar minha conta”. A remoção é imediata
          e não pode ser desfeita — não precisa pedir para ninguém nem esperar.
        </Secao>
      </div>
    </div>
  )
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-2 border-b border-edge pb-2 text-[20px] text-paper">
      {children}
    </h2>
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
      <h3 className="text-[17px] text-paper">{titulo}</h3>
      <div className="mt-1.5 flex flex-col gap-2">{children}</div>
    </section>
  )
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5">
      {itens.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
