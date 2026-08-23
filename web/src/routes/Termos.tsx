import { Link } from 'react-router-dom'

import { NaoAfiliacao } from '@/components/Isencao'

/**
 * Versão registrada em `term_acceptances` a cada aceite.
 *
 * Precisa bater com TERMOS_VERSAO no `api/.env`. Sempre que o texto mudar de
 * conteúdo — não de vírgula — suba a data: quem aceitou a versão anterior não
 * aceitou esta, e o registro de aceite existe justamente para provar o quê.
 *
 * **2026-08-22 subiu sem re-aceite, e isso é exceção declarada.** A mudança é
 * integralmente favorável: conserta o cancelamento (o PRO passa a valer até o fim
 * do ciclo pago, e não 7 dias) e separa os dois prazos de 7 dias que estavam se
 * confundindo no §8. Ninguém perde direito. Alteração que só amplia direito vale
 * contra quem se obriga sem novo aceite — o contrário não seria verdade, e a
 * próxima mudança restritiva é que aciona o fluxo de re-aceite que o §10 promete.
 */
const VERSAO = '2026-08-22'

/**
 * Canal do controlador para pedidos de LGPD. Caixa pessoal por enquanto: o
 * domínio próprio ainda não existe, e um endereço que ninguém lê é pior do que
 * um endereço sem marca. Trocar por `contato@` quando o domínio subir — e aí
 * não precisa mexer na VERSAO, pelo mesmo motivo abaixo.
 *
 * A troca do endereço morto por este não subiu a VERSAO de propósito: quem
 * aceitou não perdeu direito nenhum, ganhou um canal que responde.
 */
const CONTATO = 'eduardowav@icloud.com'

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
          <p>
            Você vai ler isto de novo, e não por engano: antes de o contato da
            outra pessoa aparecer, o app pede que você confirme que leu. É o
            instante em que a conversa sai daqui, e é o único aviso do TrocaTCG
            que interrompe o caminho de propósito.
          </p>
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

        <Secao titulo="8. Assinatura do PRO">
          O PRO é opcional. O TrocaTCG funciona de graça, e o que a assinatura
          compra é limite maior — nunca acesso a quem trocar com você.
          <Lista
            itens={[
              'A cobrança é feita pelo Mercado Pago. Seus dados de pagamento ficam com eles; o TrocaTCG não vê nem guarda número de cartão.',
              'A assinatura se renova sozinha ao fim de cada ciclo, mensal ou anual, até você cancelar.',
              'Você cancela quando quiser, pelo próprio app, sem multa e sem precisar falar com ninguém.',
              'Cancelar interrompe a renovação e não corta o que você já pagou: o PRO continua valendo até o fim do ciclo pago. No plano anual, isso vale até o dia em que ele se renovaria — mesmo que você cancele no primeiro mês. Depois dessa data a conta volta ao FREE.',
              'Como o serviço continua disponível até o fim do ciclo pago, não há devolução proporcional do valor já pago, fora do caso de arrependimento abaixo.',
              'Se o preço mudar, avisamos antes, e o valor novo só vale a partir do ciclo seguinte.',
            ]}
          />
          <strong className="text-paper">Arrependimento.</strong> Nos primeiros
          7 dias contados do pagamento você pode desistir da assinatura e
          receber o valor de volta por inteiro, pelo mesmo meio em que pagou
          (art. 49 do Código de Defesa do Consumidor). Nesse caso o PRO se
          encerra junto com a devolução, e não vale até o fim do ciclo.{' '}
          <strong className="text-paper">Pagamento que falha.</strong> Se uma
          cobrança não for paga — cartão recusado, Pix não pago —, a conta segue
          com os limites do PRO por 7 dias, tempo de resolver. Esse prazo é
          outro, e nada tem a ver com os 7 dias de arrependimento acima. Em
          qualquer um dos casos, quando a conta volta ao plano FREE{' '}
          <strong className="text-paper">nada é apagado</strong>: as ofertas que
          passam do limite saem do ar, continuam no seu acervo e você escolhe
          quais reativar.
        </Secao>

        <Secao titulo="9. A assinatura não tem relação com as trocas">
          O que você paga é o uso da plataforma, e o pagamento é entre você e o
          TrocaTCG. As trocas continuam sendo entre as pessoas, do jeito que a
          seção 3 descreve: assinar não garante troca, não dá prioridade sobre
          ninguém e não nos coloca dentro da negociação.
        </Secao>

        <Secao titulo="10. Mudanças">
          Se estes termos mudarem de forma relevante, a versão sobe e pediremos
          seu aceite de novo antes de continuar usando.
        </Secao>

        <Titulo>Política de privacidade</Titulo>

        <Secao titulo="11. Quem é o responsável">
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

        <Secao titulo="12. Que dados guardamos">
          <Lista
            itens={[
              'E-mail — para você entrar na conta.',
              'Nome de exibição e @ — é como a comunidade te vê.',
              'Telefone de WhatsApp — para combinarem a troca depois do aceite.',
              'Suas listas de Ofereço e Procuro, com condição e acabamento.',
              'Histórico de trocas e o resultado delas, que alimenta a reputação.',
              'Data e IP de cada aceite destes termos, como comprovação legal — o do cadastro e o de antes de ver o contato de alguém, este último junto do identificador da troca.',
              'Se você assinar o PRO: o identificador da assinatura no Mercado Pago, a situação dela e a data da próxima cobrança. Nada de cartão, conta ou CPF.',
            ]}
          />
          Não pedimos CPF, endereço, bairro nem localização, e não usamos
          rastreadores de publicidade.
        </Secao>

        <Secao titulo="13. Por que podemos tratar esses dados">
          Para executar o serviço que você contratou ao criar a conta (art. 7º,
          V da LGPD) e, no caso do registro de aceite, para cumprir obrigação
          legal e exercer direitos (art. 7º, II e VI).
        </Secao>

        <Secao titulo="14. Quem vê o quê">
          Seu nome, @ e reputação são públicos, assim como suas listas — é o que
          torna a troca possível.{' '}
          <strong className="text-paper">Seu telefone não é público</strong> e
          só é mostrado à outra pessoa depois que as duas aceitam a mesma troca.
          Não vendemos nem cedemos seus dados a terceiros.
        </Secao>

        <Secao titulo="15. Onde os dados ficam">
          Em servidores da Supabase, na região de São Paulo (Brasil). Quem
          processa o pagamento da assinatura é o Mercado Pago, sob a política de
          privacidade deles — o que sai daqui para lá é o seu e-mail, e o que
          volta é a situação da assinatura. O envio de e-mails de confirmação
          usa serviço de terceiro apenas para esse fim.
        </Secao>

        <Secao titulo="16. Por quanto tempo">
          Enquanto sua conta existir. Ao apagar a conta, tudo que é seu vai
          junto: perfil, listas, trocas em aberto, inscrições de notificação e o
          registro do seu aceite. Quem já trocou com você mantém a contagem de
          trocas concluídas dele, que não guarda nenhum dado seu.
        </Secao>

        <Secao titulo="17. Seus direitos">
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

        <Secao titulo="18. Como apagar sua conta">
          No próprio app, em Perfil → “Apagar minha conta”. A remoção é imediata
          e não pode ser desfeita — não precisa pedir para ninguém nem esperar.
        </Secao>

        {/* Exigida pela seção 4.1 da doc, e fora da numeração de propósito: não
            é cláusula que rege a relação com quem usa, é declaração sobre marcas
            de terceiros. Numerá-la a colocaria em pé de igualdade com o resto. */}
        <NaoAfiliacao className="mt-2 border-t border-edge pt-6 text-muted" />
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
