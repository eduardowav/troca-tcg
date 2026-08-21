import { create } from 'zustand'

import { supabase } from '@/lib/supabase'

/**
 * Como a pessoa quer ler preço: em que moeda, e por qual base.
 *
 * Mora no `localStorage`, e não no perfil do servidor, pelo mesmo motivo do
 * tema: é preferência de leitura, resolvida antes da primeira pintura, e uma ida
 * ao banco para descobrir em que moeda escrever um número faria a tela piscar
 * dólar antes de virar real. Custo assumido: quem trocar de celular escolhe de
 * novo.
 *
 * ## As duas escolhas
 *
 * **Base** — a TCGplayer publica dois números por carta, e os dois já estão no
 * nosso banco desde a migração 15:
 *
 * - `menor` (`lowPrice`) é o piso dos anúncios: o que custaria comprar a carta
 *   hoje, na oferta mais barata.
 * - `medio` (`marketPrice`) é a média do que foi vendido: a referência que o
 *   jogador está acostumado a ver.
 *
 * O padrão é `menor`, por decisão do Eduardo em 2026-08-21. Medido no catálogo
 * inteiro no mesmo dia: o menor é, em média, **metade** do médio (razão 0,502
 * sobre 24.607 linhas). Isso muda o aviso de troca desigual — a razão entre as
 * duas cartas quase não se mexe, mas a diferença absoluta cai pela metade, e os
 * pisos em dólar da regra filtram mais. É o comportamento certo: um aviso que
 * fala do preço médio enquanto a tela mostra o menor estaria discordando de si
 * mesmo.
 *
 * **Moeda** — dólar é a fonte; real é conversão pela PTAX do dia (tabela
 * `cotacoes`, migração 35). O padrão é real, porque é nele que se julga se uma
 * troca é justa por aqui, e a tela sempre diz que é conversão. Sem cotação
 * carregada, a tela cai para dólar sozinha em vez de esconder o preço: número
 * na moeda da fonte é pior que nenhum número, mas é muito melhor que um traço.
 */
export type BaseDePreco = 'menor' | 'medio'
export type Moeda = 'USD' | 'BRL'

export const CHAVE_BASE = 'troca:preco-base'
export const CHAVE_MOEDA = 'troca:preco-moeda'

export interface Cotacao {
  /** Quantos reais um dólar compra. */
  valor: number
  /** A data da cotação **na fonte** — a PTAX de sábado é a de sexta. */
  referencia: string
}

interface PreferenciasState {
  base: BaseDePreco
  moeda: Moeda
  /** `null` enquanto não carregou, e também quando o banco não tem linha. */
  cotacao: Cotacao | null
}

function baseGuardada(): BaseDePreco {
  return localStorage.getItem(CHAVE_BASE) === 'medio' ? 'medio' : 'menor'
}

function moedaGuardada(): Moeda {
  return localStorage.getItem(CHAVE_MOEDA) === 'USD' ? 'USD' : 'BRL'
}

export const usePreferencias = create<PreferenciasState>(() => ({
  base: baseGuardada(),
  moeda: moedaGuardada(),
  cotacao: null,
}))

export function definirBase(base: BaseDePreco) {
  localStorage.setItem(CHAVE_BASE, base)
  usePreferencias.setState({ base })
}

export function definirMoeda(moeda: Moeda) {
  localStorage.setItem(CHAVE_MOEDA, moeda)
  usePreferencias.setState({ moeda })
}

/**
 * Lê a cotação do banco, uma vez por sessão.
 *
 * Direto no Supabase com a anon key, como o resto do catálogo: `cotacoes` é
 * leitura pública e não tem por que passar pela API. Falha em silêncio — sem
 * cotação a tela mostra dólar, que é a fonte, e não um erro.
 */
export async function carregarCotacao(): Promise<void> {
  const { data, error } = await supabase
    .from('cotacoes')
    .select('valor, referencia')
    .eq('moeda', 'BRL')
    .maybeSingle()

  if (error || !data) return
  usePreferencias.setState({
    cotacao: { valor: Number(data.valor), referencia: data.referencia },
  })
}

/** "Menor preço" ou "Preço médio" — o rótulo que a tela usa para se explicar. */
export function rotuloDaBase(base: BaseDePreco): string {
  return base === 'menor' ? 'Menor preço' : 'Preço médio'
}

/**
 * A nota de honestidade que acompanha o número em real.
 *
 * `null` em dólar, que é a fonte e não precisa de ressalva. Em real, diz que é
 * conversão e de quando: **preço da TCGplayer convertido não é preço
 * brasileiro** — a Liga Pokémon costuma cobrar bem mais que a conversão do
 * dólar, e quem lê "R$ 312" sem essa linha pensa que aquilo é o valor daqui.
 */
export function notaDeConversao(
  moeda: Moeda,
  cotacao: Cotacao | null,
): string | null {
  if (moeda !== 'BRL' || !cotacao) return null
  const [ano, mes, dia] = cotacao.referencia.split('-')
  return `convertido do dólar · câmbio de ${dia}/${mes}/${ano}`
}

/**
 * O estado atual sem passar por hook.
 *
 * Existe porque quem formata preço nem sempre é componente: `lib/vitrine.ts` e
 * `components/proposta/lote.ts` somam lotes fora do React, e obrigá-los a
 * receber moeda por parâmetro espalharia a preferência por meia dúzia de
 * assinaturas. Quem precisa **re-renderizar** quando a escolha muda usa o hook.
 */
export function preferenciasAgora(): PreferenciasState {
  return usePreferencias.getState()
}
