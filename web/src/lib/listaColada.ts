import { supabase } from '@/lib/supabase'
import type { Carta } from '@/lib/types'

/**
 * A lista colada virando cartas do catálogo.
 *
 * Quem troca já tem a lista escrita em algum lugar — no bloco de notas, no post
 * do grupo, no exportador de deck. Cadastrar carta por carta é redigitar o que
 * já existe, e é o trabalho que o PRO compra de volta (seção 16).
 *
 * O reconhecimento inteiro mora no banco (`resolver_lista`, migração 28): uma
 * chamada para a lista toda, com a mesma busca da tela de busca — acento, ordem
 * das palavras, erro de digitação — mais o que só a lista colada tem, que é
 * quantidade na frente e código do set no fim. Aqui é só o transporte e o
 * formato que a tela consome.
 */

/** O que a função devolve por linha não vazia. */
interface LinhaCrua {
  posicao: number
  termo: string
  quantidade: number
  candidatos: Carta[]
}

export interface LinhaResolvida {
  /** Chave estável da linha na tela — a posição na lista original. */
  posicao: number
  /** O que a pessoa escreveu, para ela reconhecer a própria linha. */
  termo: string
  quantidade: number
  /** Em ordem: o que veio pelo código do set primeiro, depois por nome. */
  candidatos: Carta[]
  /** Qual candidato está valendo. `null` quando nada casou. */
  escolhida: Carta | null
}

/** Teto da função no banco. Repetido aqui para a tela avisar antes de chamar. */
export const MAX_LINHAS = 200

/**
 * Quebra o texto colado em linhas.
 *
 * Só corta e limpa — quantidade e código de set são desmontados no banco, junto
 * da busca, para qualquer cliente entender a mesma lista do mesmo jeito.
 */
export function emLinhas(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

export async function resolverLista(
  linhas: string[],
): Promise<LinhaResolvida[]> {
  if (linhas.length === 0) return []

  const { data, error } = await supabase.rpc('resolver_lista', {
    termos: linhas.slice(0, MAX_LINHAS),
    por_termo: 3,
  })
  if (error) throw new Error(error.message)

  return ((data ?? []) as LinhaCrua[]).map((linha) => ({
    posicao: linha.posicao,
    termo: linha.termo,
    // O banco já limita, mas quantidade é o número que vai virar estoque: um
    // valor fora da faixa da coluna faria o cadastro inteiro falhar no fim.
    quantidade: Math.min(Math.max(linha.quantidade || 1, 1), 99),
    candidatos: linha.candidatos ?? [],
    // A primeira vem marcada. É o que faz colar cinquenta cartas ser conferir
    // cinquenta linhas em vez de escolher cinquenta vezes — e trocar continua a
    // um toque, para as poucas em que a busca errou.
    escolhida: linha.candidatos?.[0] ?? null,
  }))
}
