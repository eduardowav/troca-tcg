import { useState } from 'react'
import { toast } from 'sonner'

import {
  Comparacao,
  GanchoDoTopo,
  Oferta,
  Principio,
  Topo,
  useCompra,
} from '@/routes/Planos'
import { cn } from '@/lib/cn'
import type { Limites, Periodo } from '@/lib/planos'

/**
 * Laboratório da tela de planos — rota de desenvolvimento, fora de produção.
 *
 * Existe pelo mesmo motivo do `/lab/troca` e do `/lab/azul`: decidir aparência
 * **vendo rodar**, e não descrita numa mensagem. Só que aqui há um motivo a
 * mais, e ele é prático: a tela de planos tem quatro estados e **nenhum deles é
 * alcançável à vontade numa conta de verdade**. Para ver o estado "você é PRO"
 * seria preciso comprar; para ver "Parceiro", editar o banco; para ver "ainda
 * não estamos cobrando", desligar a cobrança em produção.
 *
 * Aqui os quatro trocam num toque, com dados de mentira.
 *
 * **As peças são as mesmas de `routes/Planos.tsx`**, importadas de lá, não
 * copiadas. Cópia é o que faz o laboratório mentir: mexer aqui e a tela de
 * verdade continuar como estava, ou pior, o contrário — ajustar a tela e o
 * laboratório seguir mostrando a versão velha como se fosse a atual.
 *
 * **O botão não cobra.** `useCompra` recebe `aoComprar`, e aqui ele só mostra um
 * aviso com o período escolhido. Sem isso, cada toque no laboratório criaria uma
 * assinatura pendente de verdade no Mercado Pago.
 *
 * Morre quando a tela estiver decidida, como os outros dois.
 */

/** Os limites de mentira, no formato que a API serve. */
const FREE: Limites = {
  max_ofertas: 20,
  cadastro_em_massa: false,
  matches_visiveis: null,
  triangular: false,
  alerta_carta: false,
  historico_dias: 30,
  propostas_por_dia: 5,
}

const PRO: Limites = {
  max_ofertas: null,
  cadastro_em_massa: true,
  matches_visiveis: null,
  triangular: true,
  alerta_carta: true,
  historico_dias: null,
  propostas_por_dia: null,
}

const PRECOS: Record<Periodo, string> = { mensal: '14.90', anual: '149.90' }

type Estado = 'oferta' | 'pro' | 'fundador' | 'parceiro' | 'desligada'

const ESTADOS: { chave: Estado; rotulo: string; explica: string }[] = [
  {
    chave: 'oferta',
    rotulo: 'Oferta',
    explica: 'Quem é FREE com a cobrança ligada. É o único estado que vende.',
  },
  {
    chave: 'pro',
    rotulo: 'É PRO',
    explica: 'Já assina. Não pode ver oferta nenhuma.',
  },
  {
    chave: 'fundador',
    rotulo: 'Founder',
    explica:
      'PRO que não vence e não é vendido. Nem data, nem renovação, nem preço.',
  },
  {
    chave: 'parceiro',
    rotulo: 'Parceiro',
    explica: 'PRO sem pagar. Não tem o que cobrar nem o que cancelar.',
  },
  {
    chave: 'desligada',
    rotulo: 'Sem cobrança',
    explica: 'Como era até 22/08: todo mundo com tudo, e a tabela é só aviso.',
  },
]

export default function LabPlanos() {
  const [estado, setEstado] = useState<Estado>('oferta')
  // O desvio que impede o laboratório de gerar cobrança de verdade.
  const compra = useCompra((periodo) =>
    toast.success(`Geraria o Pix do ${periodo} — no laboratório não cobra.`),
  )
  // O preço vem da API na tela de verdade. Aqui é editável para experimentar
  // número — é a pergunta que mais volta quando se olha uma tela de preço.
  const [precos, setPrecos] = useState(PRECOS)

  const atual = ESTADOS.find((e) => e.chave === estado)!

  return (
    <div className="mx-auto w-full max-w-xl px-6 pt-5 pb-16">
      <h1 className="font-titulo text-[24px] leading-none font-black text-tinta">
        Laboratório dos planos
      </h1>
      <p className="mt-2 font-corpo text-[13px] leading-relaxed text-apagado">
        As peças são as mesmas de <code>routes/Planos.tsx</code>. O botão de
        pagar não gera Pix nenhum aqui.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ESTADOS.map((e) => (
          <button
            key={e.chave}
            type="button"
            onClick={() => setEstado(e.chave)}
            className={cn(
              'rounded-[var(--radius-controle)] border-2 border-tinta px-3 py-1.5 font-titulo text-[12px] font-extrabold uppercase transition-shadow',
              estado === e.chave
                ? 'bg-azul text-azul-tinta shadow-[var(--shadow-duro-sm)]'
                : 'bg-cartela text-tinta hover:shadow-[var(--shadow-duro-xs)]',
            )}
          >
            {e.rotulo}
          </button>
        ))}
      </div>
      <p className="mt-2 font-corpo text-[12px] leading-relaxed text-apagado">
        {atual.explica}
      </p>

      <div className="mt-4 flex items-end gap-3">
        {(['mensal', 'anual'] as Periodo[]).map((p) => (
          <label key={p} className="flex-1">
            <span className="block font-dado text-[11px] uppercase text-apagado">
              Preço {p}
            </span>
            <input
              value={precos[p]}
              onChange={(ev) =>
                setPrecos((antes) => ({ ...antes, [p]: ev.target.value }))
              }
              inputMode="decimal"
              className="mt-1 w-full rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela px-3 py-2 font-dado text-[14px] text-tinta"
            />
          </label>
        ))}
      </div>

      <hr className="mt-6 border-t-2 border-tinta" />

      {/* Daqui para baixo é a tela de verdade, **na ordem dela**. Isto estava
          errado até 2026-08-22: o laboratório mostrava a oferta antes da tabela
          enquanto a página já tinha invertido, e olhar aqui dava uma impressão
          que o app não produzia. Laboratório que não espelha a ordem mente tanto
          quanto laboratório que copia as peças. */}
      {estado === 'oferta' ? (
        <GanchoDoTopo compra={compra} />
      ) : (
        <Topo
          cobrando={estado !== 'desligada'}
          ePro={estado === 'pro'}
          eFundador={estado === 'fundador'}
          eParceiro={estado === 'parceiro'}
          precos={precos}
          compra={compra}
        />
      )}

      <Comparacao free={FREE} pro={PRO} />

      {estado === 'oferta' && <Oferta precos={precos} compra={compra} />}

      <Principio />
    </div>
  )
}
