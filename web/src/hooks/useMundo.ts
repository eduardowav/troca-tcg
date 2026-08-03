import { useEffect } from 'react'

/**
 * Liga uma pele visual enquanto a tela estiver montada.
 *
 * O atributo vai no `<html>`, e não numa `div` da rota, por dois motivos: os
 * tokens do tema moram no `:root` e só são sobrescritos ali; e o fundo da
 * página e a barra de navegação ficam fora da árvore da rota — sem isso, a tela
 * nova apareceria recortada dentro do mundo antigo.
 *
 * Contagem em vez de booleano: duas telas do mesmo mundo podem coexistir por um
 * instante durante a transição de rota, e a que desmonta não pode apagar a pele
 * da que acabou de montar.
 */
const montados = new Map<string, number>()

export function useMundo(mundo: string) {
  useEffect(() => {
    const raiz = document.documentElement
    montados.set(mundo, (montados.get(mundo) ?? 0) + 1)
    raiz.dataset.mundo = mundo

    return () => {
      const restantes = (montados.get(mundo) ?? 1) - 1
      montados.set(mundo, restantes)
      if (restantes <= 0 && raiz.dataset.mundo === mundo) {
        delete raiz.dataset.mundo
      }
    }
  }, [mundo])
}
