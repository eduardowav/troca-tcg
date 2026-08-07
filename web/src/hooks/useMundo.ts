import { useEffect } from 'react'

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
