import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Cartela } from '@/components/brutal/Pecas'
import { Button } from '@/components/ui/Button'
import { Campo } from '@/components/ui/Campo'
import { mensagemAuth } from '@/lib/authMensagens'
import { definirNovaSenha } from '@/lib/recuperacao'
import { Moldura } from '@/routes/Recuperar'
import { useAuth } from '@/stores/auth'

const esquema = z
  .object({
    senha: z.string().min(8, 'Use ao menos 8 caracteres.'),
    repetida: z.string(),
  })
  .refine((d) => d.senha === d.repetida, {
    path: ['repetida'],
    message: 'As duas senhas precisam ser iguais.',
  })

/**
 * A senha nova — o destino do link do e-mail.
 *
 * O link abre o app com uma sessão de recuperação já criada pelo Supabase (é o
 * `detectSessionInUrl`, ligado por padrão, que troca o código do endereço por
 * sessão). Daí duas consequências que decidem esta tela:
 *
 * **A confirmação é pedida.** Um erro de digitação numa senha que a pessoa
 * acabou de inventar a tranca de novo, e desta vez com o link já gasto. É o
 * único lugar do app onde repetir o campo se justifica — no cadastro, o campo
 * repetido é atrito sobre uma senha que a pessoa ainda pode recuperar.
 *
 * **A sessão é conferida antes do formulário.** Link vencido, já usado ou
 * aberto em outro navegador chega aqui sem sessão nenhuma; mostrar os campos e
 * só então dizer "esse link não vale" seria cobrar o trabalho antes de conferir
 * se ele serve.
 *
 * Terminada a troca, a pessoa já está logada — a sessão de recuperação vira
 * sessão comum — e o app manda para `/app`, que decide entre onboarding e
 * trocas. Pedir para entrar de novo com a senha que ela acabou de criar seria
 * pura cerimônia.
 */
export default function NovaSenha() {
  const carregando = useAuth((s) => s.carregando)
  const session = useAuth((s) => s.session)
  const navegar = useNavigate()

  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErros({})

    const form = new FormData(evento.currentTarget)
    const analise = esquema.safeParse({
      senha: form.get('senha'),
      repetida: form.get('repetida'),
    })
    if (!analise.success) {
      const saida: Record<string, string> = {}
      for (const p of analise.error.errors) {
        saida[String(p.path[0] ?? 'form')] ??= p.message
      }
      return setErros(saida)
    }

    setSalvando(true)
    try {
      await definirNovaSenha(analise.data.senha)
      toast.success('Senha trocada. Você já está dentro.')
      navegar('/app', { replace: true })
    } catch (erro) {
      setErros({ form: mensagemAuth(erro instanceof Error ? erro.message : '') })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <Moldura>
        <p className="text-center font-corpo text-[15px] text-apagado">
          Abrindo o link…
        </p>
      </Moldura>
    )
  }

  if (!session) {
    return (
      <Moldura>
        <Cartela className="p-6 text-center">
          <h1 className="font-titulo text-[22px] leading-[1.15] font-black text-tinta">
            Este link não vale mais
          </h1>
          <p className="mt-3 font-corpo text-[15px] leading-relaxed text-apagado">
            Links de senha valem por uma hora e só podem ser usados uma vez.
            Peça outro — leva um minuto.
          </p>
          <Button
            className="mt-5"
            variant="primary"
            size="md"
            block
            onClick={() => navegar('/recuperar', { replace: true })}
          >
            Pedir outro link
          </Button>
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
          Crie uma senha nova
        </h1>
        <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
          Ela substitui a antiga em todos os aparelhos.
        </p>
      </header>

      <Cartela className="p-5">
        <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
          <Campo
            rotulo="Senha nova"
            name="senha"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            dica="Ao menos 8 caracteres."
            erro={erros.senha}
          />
          <Campo
            rotulo="Repita a senha"
            name="repetida"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            erro={erros.repetida}
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
            loading={salvando}
            className="shadow-[var(--shadow-duro-sm)] hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Salvar senha
          </Button>
        </form>
      </Cartela>
    </Moldura>
  )
}
