import { useSyncExternalStore } from 'react'

import { assinarConvite, temConvite } from '@/lib/instalacao'

/**
 * O convite de instalação do Chrome existe agora?
 *
 * `useSyncExternalStore` e não `useState` + `useEffect`: o convite chega antes
 * de a tela montar (o ouvinte vive no módulo, carregado no `main.tsx`), então
 * ler o valor atual na primeira pintura é o comportamento certo — um efeito
 * pintaria a tela sem botão e o acenderia um quadro depois.
 */
export function useConviteDeInstalacao(): boolean {
  return useSyncExternalStore(assinarConvite, temConvite, () => false)
}
