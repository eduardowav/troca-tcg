import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { AcaoSecundaria, Cartela } from '@/components/brutal/Pecas'
import { IconeEnvelope } from '@/components/ui/Icone'
import { mensagemAuth } from '@/lib/authMensagens'
import { reenviarConfirmacao } from '@/lib/confirmacao'
import { webmailDoEmail } from '@/lib/webmail'
import { Moldura } from '@/routes/Recuperar'

/**
 * A tela de quem acabou de criar a conta e precisa abrir o e-mail.
 *
 * **Tela, e não uma frase embaixo do formulário.** Até 2026-08-21 este momento
 * era uma tarja vermelha no rodapé do cadastro — a mesma moldura de "senha
 * incorreta" — dizendo "Conta criada. Confirme seu e-mail e volte para entrar."
 * Duas coisas erradas de uma vez: a cor do erro para a única notícia boa do
 * fluxo, e o formulário inteiro ainda preenchido embaixo, convidando a clicar
 * em "criar conta" de novo.
 *
 * **O que ela resolve é o buraco entre dois aplicativos.** O passo seguinte
 * acontece fora daqui: sair do app, achar o e-mail, achar a mensagem, voltar. É
 * o ponto do cadastro que mais perde gente, e nenhum texto conserta isso — o
 * que conserta é um botão que abre a caixa certa já buscando pelo remetente.
 * Ver `lib/webmail.ts` para quais domínios o app reconhece.
 *
 * Quem chega com um domínio desconhecido (empresa, provedor pequeno) vê a mesma
 * tela sem o botão. Mandar essa pessoa para o webmail errado seria pior que não
 * mandar: ela procuraria numa caixa que não é a dela e concluiria que o e-mail
 * não chegou.
 *
 * O endereço aparece por extenso porque **e-mail digitado errado é o defeito
 * mais comum daqui** — e é o único que a pessoa nota sozinha, antes de esperar
 * por um link que nunca vai chegar.
 */
export default function ConfirmarEmail() {
  const navigate = useNavigate()
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email ?? null

  const [reenviando, setReenviando] = useState(false)
  const [reenviado, setReenviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const webmail = email ? webmailDoEmail(email) : null

  async function reenviar() {
    if (!email || reenviando) return
    setErro(null)
    setReenviando(true)
    try {
      await reenviarConfirmacao(email)
      setReenviado(true)
    } catch (falha) {
      setErro(mensagemAuth(falha instanceof Error ? falha.message : ''))
    } finally {
      setReenviando(false)
    }
  }

  return (
    <Moldura>
      <Cartela className="p-6 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-controle)] border-2 border-tinta bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]">
          <IconeEnvelope className="size-7" />
        </div>

        <h1 className="mt-5 font-titulo text-[24px] leading-[1.15] font-black text-tinta">
          Falta um clique
        </h1>

        <p className="mt-3 font-corpo text-[15px] leading-relaxed text-apagado">
          {email ? (
            <>
              Sua conta está criada. Mandamos um link para{' '}
              <span className="font-medium text-tinta">{email}</span> — abra e
              você entra direto no app.
            </>
          ) : (
            <>
              Sua conta está criada. Mandamos um link de confirmação para o seu
              e-mail — abra e você entra direto no app.
            </>
          )}
        </p>

        {/* O caminho principal desta tela sai do app. O botão é grande porque
            ele *é* o próximo passo — e some quando o app não sabe para onde
            mandar, em vez de virar um chute. */}
        {webmail && (
          <a
            href={webmail.url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'mt-6 flex w-full items-center justify-center gap-2 rounded-[var(--radius-controle)]',
              'border-2 border-tinta bg-azul px-5 py-3.5',
              'font-titulo text-[15px] font-extrabold uppercase text-azul-tinta',
              'shadow-[var(--shadow-duro-sm)] transition-[box-shadow,transform]',
              'hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none',
            ].join(' ')}
          >
            Abrir o {webmail.nome}
          </a>
        )}

        {erro && (
          <p
            role="alert"
            className="mt-5 rounded-[var(--radius-controle)] border-2 border-alerta bg-alerta-fraco px-3.5 py-3 font-corpo text-[14px] font-medium text-alerta"
          >
            {erro}
          </p>
        )}

        {email &&
          (reenviado ? (
            <p className="mt-6 font-corpo text-[14px] leading-relaxed text-tinta">
              Mandamos outro. Se nenhum chegar, confira o spam.
            </p>
          ) : (
            <AcaoSecundaria
              onClick={reenviando ? undefined : reenviar}
              className="mt-6"
            >
              {reenviando ? 'Reenviando…' : 'Não chegou? Reenviar'}
            </AcaoSecundaria>
          ))}

        <p className="mt-6 font-dado text-[11px] uppercase text-apagado">
          Confira o spam antes de pedir de novo
        </p>
      </Cartela>

      <AcaoSecundaria
        onClick={() => navigate('/entrar', { replace: true })}
        className="self-center"
      >
        Voltar para entrar
      </AcaoSecundaria>
    </Moldura>
  )
}
