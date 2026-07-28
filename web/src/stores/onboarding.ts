import { create } from 'zustand'

import type { Carta, ListingKind } from '@/lib/types'

export interface Selecao {
  carta: Carta
  tipo: ListingKind
}

interface OnboardingState {
  selecoes: Record<string, Selecao>
  /** Marca a carta como Ofereço/Procuro; tocar de novo no mesmo tipo remove. */
  alternar: (carta: Carta, tipo: ListingKind) => void
  remover: (cardId: string) => void
  tipoDe: (cardId: string) => ListingKind | undefined
  /** Zera após o lote ir para o servidor — a verdade passa a ser a API. */
  limpar: () => void
}

export const useOnboarding = create<OnboardingState>((set, get) => ({
  selecoes: {},
  alternar: (carta, tipo) =>
    set((s) => {
      const atual = s.selecoes[carta.id]
      const selecoes = { ...s.selecoes }
      if (atual?.tipo === tipo) {
        delete selecoes[carta.id]
      } else {
        selecoes[carta.id] = { carta, tipo }
      }
      return { selecoes }
    }),
  remover: (cardId) =>
    set((s) => {
      const selecoes = { ...s.selecoes }
      delete selecoes[cardId]
      return { selecoes }
    }),
  tipoDe: (cardId) => get().selecoes[cardId]?.tipo,
  limpar: () => set({ selecoes: {} }),
}))

/** Deriva as contagens sem recalcular no componente. */
export function contar(selecoes: Record<string, Selecao>) {
  let ofereco = 0
  let procuro = 0
  for (const s of Object.values(selecoes)) {
    if (s.tipo === 'OFERTA') ofereco++
    else procuro++
  }
  return { ofereco, procuro, total: ofereco + procuro }
}
