import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { LinkNoTexto } from '@/components/brutal/Pecas'
import { MontarProposta } from '@/components/proposta/MontarProposta'
import { useMarcaOculta } from '@/hooks/useMundo'
import { useAbrirProposta } from '@/hooks/usePropostas'
import { ApiError } from '@/lib/api'
import type { ItensDaProposta } from '@/lib/propostas'

/**
 * O acervo de alguém, que é também a mesa onde a proposta é montada.
 *
 * Chega-se aqui a partir de uma carta — nunca de uma busca por gente. Continua
 * não existindo diretório de pessoas: o caminho é vitrine → carta → quem tem →
 * acervo, e cada passo parte de algo concreto que a pessoa estava olhando.
 *
 * A carta que trouxe a pessoa até aqui já vem escolhida (`?quero=`): abrir a
 * tela com a seleção em branco faria a pessoa procurar de novo, dentro da lista
 * inteira, a carta que ela acabou de tocar.
 */
export default function Acervo() {
  useMarcaOculta()

  const { username } = useParams<{ username: string }>()
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const abrir = useAbrirProposta()

  const inicial: ItensDaProposta = {
    quero: params.getAll('quero'),
    ofereco: [],
  }

  function enviar(itens: ItensDaProposta) {
    abrir.mutate(
      { para: username as string, itens },
      {
        onSuccess: (proposta) => {
          toast.success(`Proposta enviada para @${username}.`)
          navegar(`/propostas/${proposta.id}`, { replace: true })
        },
        onError: (erro) => {
          // As mensagens da API já vêm em português e prontas para exibir —
          // inclusive as que explicam uma regra ("já existe uma negociação
          // aberta com essa pessoa"), que é justamente onde uma frase genérica
          // deixaria a pessoa sem saber o que fazer.
          toast.error(
            erro instanceof ApiError
              ? erro.message
              : 'Não foi possível enviar a proposta agora.',
          )
        },
      },
    )
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[100rem] flex-col px-6 py-8 2xl:max-w-[120rem]">
      <div className="flex items-center gap-3">
        <Link
          to="/vitrine"
          aria-label="Voltar para a vitrine"
          className="voltar grid size-9 shrink-0 place-items-center rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
        >
          ←
        </Link>
        <p className="font-titulo text-[18px] leading-none font-black text-tinta">
          Montar proposta
        </p>
      </div>

      <header className="mt-5 w-full max-w-xl">
        <h1 className="titulo-pagina font-titulo text-[24px] leading-[1.15] font-black text-tinta lg:text-[30px]">
          Trocar com{' '}
          {/* Sem `font-medium`: dentro de um `h1` de peso `black`, a classe do
              `LinkNoTexto` seria um passo para trás no peso e o nome sairia
              mais leve que o resto do título. */}
          <LinkNoTexto to={`/u/${username}`} className="font-black">
            @{username}
          </LinkNoTexto>
        </h1>
        <p className="mt-2 font-corpo text-[14px] leading-relaxed text-apagado lg:text-[15px]">
          Escolha o que você quer deste acervo e o que oferece em troca. A outra
          pessoa pode aceitar, recusar ou trocar o que vem — e nada é reservado
          até alguém aceitar.
        </p>
      </header>

      <div className="mt-8">
        <MontarProposta
          outro={username as string}
          inicial={inicial}
          rotulo="Enviar proposta"
          enviando={abrir.isPending}
          onEnviar={enviar}
        />
      </div>
    </div>
  )
}
