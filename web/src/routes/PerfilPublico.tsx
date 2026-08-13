import { useParams } from 'react-router-dom'

import { LinkNoTexto } from '@/components/brutal/Pecas'
import { FichaPerfil } from '@/components/perfil/FichaPerfil'
import { useMarcaOculta } from '@/hooks/useMundo'
import { usePerfilPublico } from '@/hooks/usePerfilPublico'
import { ApiError } from '@/lib/api'
import { membroDesde, type PerfilPublico } from '@/lib/perfil'
import { useUsuarioId } from '@/stores/auth'

/**
 * O perfil de outra pessoa.
 *
 * Existe para a pergunta que o app pedia que alguém respondesse no escuro: **com
 * quem eu vou me encontrar?** Até aqui, topar uma troca significava combinar um
 * encontro presencial com um estranho de quem se sabia o nome de exibição e mais
 * nada. A reputação já era calculada e já vinha resumida no match; faltava o
 * lugar onde ela se lê inteira, com o denominador à vista.
 *
 * Não tem botão. Nenhum: nem "trocar com", nem "seguir", nem "mensagem". Trocar
 * não se pede — o matcher sugere quando as listas de vocês se cruzam —, e um
 * botão que insinuasse o contrário prometeria um caminho que não existe. Esta
 * tela informa uma decisão que acontece em outro lugar.
 */
export default function PerfilPublicoTela() {
  useMarcaOculta()

  const { username } = useParams<{ username: string }>()
  const meuId = useUsuarioId()
  const { data: perfil, isPending, error } = usePerfilPublico(username)

  if (isPending) {
    return (
      <Moldura>
        <Voltar />
        <div className="mt-8 h-28 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
        <div className="mt-3 h-24 animate-pulse rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela" />
      </Moldura>
    )
  }

  if (error || !perfil) {
    // A mensagem da API já vem pronta em português para o 404; o genérico cobre
    // rede fora e 500, onde dizer "esse @ não existe" seria mentira.
    const naoExiste = error instanceof ApiError && error.status === 404
    return (
      <Moldura>
        <Voltar />
        <p className="mt-8 text-[15px] leading-relaxed text-paper">
          {naoExiste
            ? `Não encontramos ninguém com o @${username}.`
            : 'Não foi possível carregar esse perfil agora.'}
        </p>
        {naoExiste && (
          <p className="mt-2 text-[14px] leading-relaxed text-muted">
            O @ pode ter mudado — quem troca de @ deixa o antigo livre para outra
            pessoa.
          </p>
        )}
      </Moldura>
    )
  }

  const souEu = perfil.id === meuId

  return (
    <Moldura>
      <Voltar />
      <Identidade perfil={perfil} />
      {perfil.bio && (
        <p className="mt-5 text-[15px] leading-relaxed whitespace-pre-line text-paper">
          {perfil.bio}
        </p>
      )}

      <FichaPerfil perfil={perfil} />
      <ComoLer perfil={perfil} />

      {souEu && (
        <p className="mt-8 border-t-2 border-dashed border-tinta/25 pt-6 font-corpo text-[13px] leading-relaxed text-apagado">
          Este é o seu perfil, como a comunidade o vê.{' '}
          <LinkNoTexto to="/perfil">Editar</LinkNoTexto>
        </p>
      )}
    </Moldura>
  )
}

function Voltar() {
  // -1 e não uma rota fixa: chega-se aqui do detalhe de uma troca, e mandar
  // quem veio de lá para o feed apagaria a troca que a pessoa estava lendo.
  return (
    <button
      onClick={() => window.history.back()}
      className="voltar mt-5 grid size-9 shrink-0 place-items-center self-start rounded-full border-2 border-tinta bg-cartela font-titulo text-[16px] font-black text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
    >
      ← Voltar
    </button>
  )
}

/** Nome, @, e as duas coisas que situam alguém: onde troca e desde quando. */
function Identidade({ perfil }: { perfil: PerfilPublico }) {
  const desde = membroDesde(perfil.desde)
  const lugar = [perfil.bairro, perfil.cidade].filter(Boolean).join(', ')

  return (
    <header className="mt-6 flex items-start gap-4">
      <Avatar perfil={perfil} />
      <div className="min-w-0 flex-1">
        <h1 className="titulo-pagina text-[26px] leading-[1.15] break-words">
          {perfil.nome_exibicao}
        </h1>
        <p className="mt-1 text-[15px] break-all text-muted">
          @{perfil.username}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          {lugar}
          {desde && ` · troca desde ${desde}`}
        </p>
      </div>
    </header>
  )
}

function Avatar({ perfil }: { perfil: PerfilPublico }) {
  if (perfil.avatar_url) {
    return (
      <img
        src={perfil.avatar_url}
        alt=""
        className="size-14 shrink-0 rounded-full border-2 border-tinta object-cover"
      />
    )
  }
  // Sem foto, a inicial. Um ícone genérico de pessoa repetido em toda tela de
  // perfil não distingue ninguém — a letra ao menos é dela.
  return (
    <div
      aria-hidden
      className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-tinta bg-meu font-titulo text-[20px] font-black text-tinta"
    >
      {perfil.nome_exibicao.trim().charAt(0).toUpperCase() || '?'}
    </div>
  )
}

/**
 * A legenda dos números.
 *
 * Sem ela, "67%" ao lado de um nome é um veredito sem régua — e a régua é o
 * denominador, que muda tudo: dois de três é ruído estatístico, quarenta de
 * sessenta é padrão. Quem lê este painel está prestes a decidir se atravessa a
 * cidade para encontrar um estranho, e é o único momento do app em que explicar
 * a conta vale o espaço que ocupa.
 */
function ComoLer({ perfil }: { perfil: PerfilPublico }) {
  const total = perfil.trocas_concluidas + perfil.trocas_furadas
  const desistencias = perfil.trocas_desistidas ?? 0

  return (
    <div className="cartela mt-5 rounded-[var(--radius-card)] border border-edge bg-surface p-4">
      <p className="text-[14px] leading-relaxed text-muted">
        {total === 0
          ? 'Ninguém aqui começou com reputação — esta pessoa ainda não fechou nem furou nenhuma troca. Combinar um lugar público e conferir as cartas na hora vale para qualquer encontro, e mais ainda para o primeiro.'
          : total < 3
            ? `A porcentagem sai de ${total} troca(s), o que é pouco para julgar alguém. Um furo isolado pode ter sido um imprevisto; um acerto isolado ainda não é um padrão.`
            : 'A porcentagem é a fatia de trocas combinadas que foram até o fim. Ela só conta encontros que deveriam ter acontecido.'}
      </p>
      {desistencias > 0 && (
        <p className="mt-2 text-[13px] leading-relaxed text-faint">
          Desmarcadas ficam de fora da conta: a pessoa avisou antes do encontro,
          que é o oposto de furar. Aparecem porque quem vai marcar um horário
          merece saber com que frequência isso acontece.
        </p>
      )}
    </div>
  )
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-5 pb-12">
      {children}
    </div>
  )
}
