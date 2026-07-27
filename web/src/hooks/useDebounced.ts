import { useEffect, useState } from 'react'

/** Atrasa a propagação de um valor — evita uma busca por tecla digitada. */
export function useDebounced<T>(valor: T, ms = 250): T {
  const [debounced, setDebounced] = useState(valor)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(valor), ms)
    return () => clearTimeout(id)
  }, [valor, ms])
  return debounced
}
