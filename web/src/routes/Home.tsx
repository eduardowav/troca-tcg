import { Link, Navigate } from 'react-router-dom'

import {
  IconeCartasBrutal,
  IconeRaio,
  IconeTrocas,
} from '@/components/brutal/Pecas'
import { useAuth } from '@/stores/auth'

/**
 * Porta de entrada pública.
 *
 * Quem chega aqui não sabe o que é o TrocaTCG, então a página responde três
 * perguntas na ordem em que elas aparecem na cabeça de quem chega: o que é,
 * como funciona e é seguro? Quem já tem sessão nunca vê isto — vai direto para
 * o app.
 *
 * O tom é mais solto que o do resto do app, por decisão do Eduardo. Aqui a
 * pessoa ainda não é usuária: não há tarefa em andamento para atrapalhar, e um
 * texto de folheto institucional é o jeito mais rápido de perder alguém que
 * chegou por curiosidade. Dentro do app o registro volta ao seco, porque lá
 * cada frase acompanha uma decisão.
 *
 * Nada aqui promete o que o produto não faz. Os números são medidos: o catálogo
 * tem 15.997 cartas.
 */
export default function Home() {

  const carregando = useAuth((s) => s.carregando)
  const session = useAuth((s) => s.session)

  if (carregando) {
    return (
      <div className="grid min-h-[100dvh] place-items-center">
        <span
          role="status"
          aria-label="Carregando"
          className="size-6 animate-spin rounded-full border-2 border-tinta border-t-transparent"
        />
      </div>
    )
  }

  // Passa pelo /app em vez de ir direto ao feed: é lá que se decide se a pessoa
  // ainda precisa do onboarding.
  if (session) return <Navigate to="/app" replace />

  return (
    <div className="mx-auto w-full max-w-xl px-6 pb-20">
      <header className="pt-10">
        <span className="inline-flex items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-azul text-azul-tinta">
            <IconeRaio className="size-4" />
          </span>
          <span className="font-titulo text-[24px] leading-none font-black text-tinta">
            TrocaTCG
          </span>
        </span>

        <h1 className="mt-8 font-titulo text-[32px] leading-[1.05] font-black text-balance text-tinta lg:text-[38px]">
          Alguém aí tem a carta que te falta. E quer a que te sobra.
        </h1>
        <p className="mt-4 font-corpo text-[16px] leading-relaxed text-apagado">
          Quadro de trocas de Pokémon TCG, feito em Belém. Você monta duas
          listas — o que tem sobrando e o que está caçando — e o app avisa quando
          a troca fecha dos dois lados.
        </p>

        <div className="mt-8 flex flex-col gap-2">
          <Link
            to="/entrar"
            className="flex h-13 items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta bg-azul font-titulo text-[15px] font-black uppercase text-azul-tinta shadow-[var(--shadow-duro-sm)] transition-shadow hover:shadow-[var(--shadow-duro)]"
          >
            Criar minha conta
          </Link>
          <Link
            to="/entrar"
            className="flex h-13 items-center justify-center rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela font-titulo text-[15px] font-black uppercase text-tinta transition-shadow hover:shadow-[var(--shadow-duro-xs)]"
          >
            Já tenho conta
          </Link>
        </div>
      </header>

      <section className="mt-14">
        <h2 className="font-dado text-[11px] uppercase text-apagado">
          Como funciona
        </h2>
        <ol className="mt-4 flex flex-col gap-3">
          <Passo
            numero={1}
            icone={<IconeCartasBrutal className="size-5" />}
            titulo="Diga o que tem e o que quer"
            texto="Duas listas: Ofereço, para as repetidas que você topa trocar, e Procuro, para as que faltam. São quase 16 mil cartas no catálogo, com imagem."
          />
          <Passo
            numero={2}
            icone={<IconeTrocas className="size-5" />}
            titulo="O app cruza sozinho"
            texto="Quando alguém tem o que você procura e quer o que você oferece, a troca aparece pronta — as duas cartas lado a lado, sem você caçar ninguém."
          />
          <Passo
            numero={3}
            icone={<IconeRaio className="size-5" />}
            titulo="Vocês combinam e trocam"
            texto="Os dois marcam interesse, o contato aparece, e o encontro é de vocês. Presencial, como troca de carta sempre foi."
          />
        </ol>
      </section>

      {/* A seção de confiança fica antes do rodapé e não escondida nos termos:
          quem chega de fora está decidindo se entrega o telefone a um app que
          nunca viu, e essa dúvida vem antes de qualquer funcionalidade. */}
      <section className="mt-14 rounded-[var(--radius-cartela)] border-2 border-tinta bg-cartela p-5 shadow-[var(--shadow-duro)]">
        <h2 className="font-titulo text-[18px] font-black text-tinta">
          O que a gente não faz
        </h2>
        <p className="mt-2 font-corpo text-[15px] leading-relaxed text-apagado">
          Não vende, não compra, não guarda carta e não fica com comissão. Não
          pede seu endereço nem sua localização. Seu telefone só aparece para
          quem fechar troca com você — antes disso, ninguém vê.
        </p>
        <Link
          to="/termos"
          className="mt-4 inline-block font-corpo text-[14px] font-medium text-azul underline underline-offset-2"
        >
          Termos e privacidade
        </Link>
      </section>

      <footer className="mt-14 border-t-2 border-dashed border-tinta/25 pt-6 font-dado text-[11px] uppercase text-apagado">
        <p>Feito em Belém, para quem troca em Belém</p>
      </footer>
    </div>
  )
}

function Passo({
  numero,
  icone,
  titulo,
  texto,
}: {
  numero: number
  icone: React.ReactNode
  titulo: string
  texto: string
}) {
  return (
    <li className="flex gap-3 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-4 shadow-[var(--shadow-duro-xs)]">
      {/* A numeração é a única do app, e ela se justifica: os três passos são
          uma sequência de verdade — sem a primeira lista não existe match, e sem
          match não existe encontro. Em qualquer outra tela seria enfeite. */}
      <span className="relative grid size-10 shrink-0 place-items-center rounded-[var(--radius-etiqueta)] border-2 border-tinta bg-meu text-tinta">
        {icone}
        <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border-2 border-tinta bg-azul font-dado text-[10px] font-bold text-azul-tinta">
          {numero}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block font-titulo text-[16px] font-bold text-tinta">
          {titulo}
        </span>
        <span className="mt-1 block font-corpo text-[14px] leading-relaxed text-apagado">
          {texto}
        </span>
      </span>
    </li>
  )
}
