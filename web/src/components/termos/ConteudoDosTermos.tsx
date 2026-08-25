import { NaoAfiliacao } from '@/components/Isencao'

/**
 * O texto dos Termos e da Política de privacidade, sem casca de página.
 *
 * **Mora aqui porque tem dois lugares que o mostram**, e não pode divergir entre
 * eles: a página `/termos` e a folha que abre no cadastro (`FolhaDosTermos`).
 * Duplicar cláusula legal é como as duas versões passam a dizer coisas
 * diferentes, e aí o registro de aceite em `term_acceptances` deixa de provar o
 * quê — que é a única razão de o registro existir.
 *
 * A separação nasceu em 2026-08-24, com a folha. Antes disto o link do cadastro
 * navegava para `/termos` e **apagava o formulário inteiro**: quem tinha
 * preenchido tudo e foi ler os termos voltava para uma tela em branco.
 */

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
 *
 * **2026-08-23 sobe pela mesma exceção, e o teste foi refeito item a item.** O
 * PRO deixou de ser assinatura recorrente e virou tempo comprado por Pix. O que
 * a pessoa ganha: nada mais é debitado dela sem que peça, e não é preciso ter
 * cartão de crédito para comprar. O que ela perde é a renovação automática, que
 * é conveniência e não direito, e a carência de 7 dias por pagamento falho —
 * que só existia para cobrança recorrente e não tem como ser acionada quando o
 * serviço é pré-pago. Direito nenhum encolhe, e o de arrependimento do art. 49
 * continua inteiro. **Nenhum pagante existia nesta data**, o que torna a
 * pergunta teórica: não há quem tenha aceitado a versão anterior tendo pago.
 */
export const VERSAO = '2026-08-23'

/**
 * Canal do controlador para pedidos de LGPD.
 *
 * **Deixou de ser a caixa pessoal do Eduardo em 2026-08-24**, e deixou de ser
 * Gmail em 2026-08-25. Endereço do projeto e não da pessoa: quem escreve para o
 * controlador de dados espera falar com o TrocaTCG, e um endereço pessoal num
 * documento de LGPD mistura as duas identidades justamente onde elas precisam
 * estar separadas. O Gmail era escala: o domínio próprio não existia, porque o
 * `trocatcg.com.br` é de outra pessoa. Com o `trocatcg.com` registrado em 21/08
 * e o recebimento provado em 25/08, o canal passa a ser do mesmo domínio que
 * assina os e-mails do app.
 *
 * **Nenhuma das três trocas de endereço subiu a VERSAO**, e é o mesmo motivo das
 * outras exceções: quem aceitou não perdeu direito nenhum, ganhou um canal que
 * responde.
 *
 * **É uma constante, e é ela que as telas usam.** Configurações e Instalar
 * traziam o endereço escrito à mão até 25/08 — três cópias é como as três passam
 * a dizer endereços diferentes, e num canal de LGPD a que estiver desatualizada
 * é uma promessa quebrada.
 */
export const CONTATO = 'contato@trocatcg.com'

export function ConteudoDosTermos() {
  return (
    <>
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

    <Secao titulo="8. O PRO">
      O PRO é opcional. O TrocaTCG funciona de graça, e o que o PRO compra é
      limite maior — nunca acesso a quem trocar com você.
      <Lista
        itens={[
          'Você compra tempo, não assinatura: um mês ou doze meses, pagos por Pix de uma vez. Não existe cobrança automática, e nada é debitado de você sem que peça.',
          'O pagamento é processado pelo Mercado Pago. O TrocaTCG não vê nem guarda dados bancários, número de cartão ou CPF.',
          'Não há o que cancelar, porque não há renovação. Quando o tempo comprado acaba, a conta volta ao plano FREE sozinha.',
          'Comprar de novo antes de vencer soma ao que ainda falta: você não perde os dias que sobraram por pagar antes.',
          'Avisamos dentro do app quando faltarem poucos dias para o seu PRO vencer.',
          'Se o preço mudar, avisamos antes, e o valor novo só vale para compras feitas depois disso — o que você já pagou não muda.',
        ]}
      />
      <strong className="text-paper">Arrependimento.</strong> Nos primeiros
      7 dias contados do pagamento você pode desistir e receber o valor de
      volta por inteiro, pelo mesmo Pix em que pagou (art. 49 do Código de
      Defesa do Consumidor). Basta pedir pelo e-mail de contato desta
      página. Nesse caso o PRO se encerra junto com a devolução.{' '}
      <strong className="text-paper">
        Quando o PRO acaba, nada é apagado
      </strong>
      : as ofertas que passam do limite do FREE saem do ar, continuam no seu
      acervo e você escolhe quais reativar.
    </Secao>

    <Secao titulo="9. O PRO não tem relação com as trocas">
      O que você paga é o uso da plataforma, e o pagamento é entre você e o
      TrocaTCG. As trocas continuam sendo entre as pessoas, do jeito que a
      seção 3 descreve: ter o PRO não garante troca, não dá prioridade sobre
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
          'Se você comprar o PRO: o identificador do pagamento no Mercado Pago, a situação dele, o valor e até quando o seu PRO vale. Nada de cartão, conta bancária ou CPF.',
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
    </>
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
