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

/**
 * Esconde a marca do topo enquanto a tela estiver montada.
 *
 * Para telas em que se **entra**: página da carta, detalhe da troca. O arquivo
 * do Figma trata as duas famílias de forma diferente — as telas de lista (home,
 * my-cards, messages, profile) trazem o logo e o sino; a `card-detail` traz uma
 * volta e o título da tela, sem marca nenhuma. Faz sentido: quem entrou numa
 * carta quer voltar, não quer a marca de novo, e no celular o topo é o espaço
 * mais caro que existe.
 *
 * Mesma contagem do `useMundo`, e pelo mesmo motivo: duas telas podem coexistir
 * por um instante na transição de rota, e a que desmonta não pode devolver a
 * marca para a que acabou de montar.
 */
const semMarca = { montados: 0 }

export function useMarcaOculta() {
  useEffect(() => {
    const raiz = document.documentElement
    semMarca.montados += 1
    raiz.dataset.marca = 'oculta'

    return () => {
      semMarca.montados -= 1
      if (semMarca.montados <= 0) delete raiz.dataset.marca
    }
  }, [])
}

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
