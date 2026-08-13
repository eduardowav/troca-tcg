import { useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { Cartela, MarcaTrocaTCG } from '@/components/brutal/Pecas'
import { Button } from '@/components/ui/Button'
import { Campo } from '@/components/ui/Campo'
import { IconeEnvelope } from '@/components/ui/Icone'
import { mensagemAuth } from '@/lib/authMensagens'
import { pedirLinkDeRecuperacao } from '@/lib/recuperacao'

const esquema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Informe seu e-mail.')
    .email('E-mail inválido.'),
})

/**
 * "Esqueci minha senha" — o pedido do link.
 *
 * **A tela de sucesso não confirma que a conta existe.** Ela diz "se houver uma
 * conta com esse e-mail, o link está a caminho", e o app trata e-mail
 * desconhecido como sucesso. Uma mensagem honesta aqui ("não achei esse
 * e-mail") transformaria esta tela num verificador de quem tem conta no
 * TrocaTCG — e o Supabase, por isso mesmo, também não conta a diferença.
 *
 * O passo seguinte é `/nova-senha`, para onde o link do e-mail leva.
 */
export default function Recuperar() {
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErros({})

    const form = new FormData(evento.currentTarget)
    const analise = esquema.safeParse({ email: form.get('email') })
    if (!analise.success) {
      return setErros({ email: analise.error.errors[0]?.message ?? 'E-mail inválido.' })
    }

    setEnviando(true)
    try {
      await pedirLinkDeRecuperacao(analise.data.email)
      setEnviadoPara(analise.data.email)
    } catch (erro) {
      // Só erro de verdade aparece — e o de limite de envio aparece com todas
      // as letras, porque é o único que a pessoa resolve esperando.
      setErros({
        form: mensagemAuth(erro instanceof Error ? erro.message : ''),
      })
    } finally {
      setEnviando(false)
    }
  }

  if (enviadoPara) {
    return (
      <Moldura>
        <Cartela className="p-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-controle)] border-2 border-tinta bg-azul text-azul-tinta shadow-[var(--shadow-duro-xs)]">
            <IconeEnvelope className="size-7" />
          </div>
          <h1 className="mt-5 font-titulo text-[24px] leading-[1.15] font-black text-tinta">
            Confira seu e-mail
          </h1>
          <p className="mt-3 font-corpo text-[15px] leading-relaxed text-apagado">
            Se houver uma conta com{' '}
            <span className="font-medium text-tinta">{enviadoPara}</span>, o link
            para criar uma senha nova está a caminho. Ele vale por uma hora.
          </p>
          <p className="mt-6 font-dado text-[11px] uppercase text-apagado">
            Não chegou? Confira o spam antes de pedir de novo.
          </p>
        </Cartela>

        <Link
          to="/entrar"
          className="text-center font-corpo text-[14px] font-medium text-azul underline underline-offset-2"
        >
          Voltar para entrar
        </Link>
      </Moldura>
    )
  }

  return (
    <Moldura>
      <header>
        <h1 className="font-titulo text-[28px] leading-[1.05] font-black text-tinta">
          Esqueceu a senha?
        </h1>
        <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
          Escreva o e-mail da sua conta. Mandamos um link para você criar uma
          senha nova.
        </p>
      </header>

      <Cartela className="p-5">
        <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
          <Campo
            rotulo="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@email.com"
            erro={erros.email}
          />

          {erros.form && (
            <p
              role="alert"
              className="rounded-[var(--radius-controle)] border-2 border-alerta bg-alerta-fraco px-3.5 py-3 font-corpo text-[14px] font-medium text-alerta"
            >
              {erros.form}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={enviando}
            className="shadow-[var(--shadow-duro-sm)] hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Mandar link
          </Button>
        </form>
      </Cartela>

      <Link
        to="/entrar"
        className="text-center font-corpo text-[14px] font-medium text-azul underline underline-offset-2"
      >
        Lembrei — voltar para entrar
      </Link>
    </Moldura>
  )
}

/** A mesma moldura do `/entrar`: marca no topo, coluna estreita, centralizada. */
export function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Link to="/" className="flex items-center justify-center gap-2.5">
        <MarcaTrocaTCG className="h-9 w-auto shrink-0" />
        <span className="font-titulo text-[30px] leading-none font-black text-tinta">
          TrocaTCG
        </span>
      </Link>
      {children}
    </div>
  )
}
