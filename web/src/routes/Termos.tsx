import { Link } from 'react-router-dom'

import {
  ConteudoDosTermos,
  VERSAO,
} from '@/components/termos/ConteudoDosTermos'

/**
 * A página dos Termos, em `/termos`.
 *
 * **É só a casca.** O texto mora em `components/termos/ConteudoDosTermos`,
 * porque a folha que abre no cadastro mostra exatamente o mesmo — ver o
 * cabeçalho de lá para por que ele não pode ser copiado.
 *
 * A página continua existindo, e não virou só folha: é o endereço que se manda
 * por link, que o buscador indexa e que alguém abre para ler com calma fora de
 * um fluxo de cadastro.
 */
export default function Termos() {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12">
      <Link
        to="/entrar"
        className="text-[14px] text-muted underline underline-offset-2 hover:text-paper"
      >
        ← Voltar
      </Link>

      <h1 className="mt-6 text-[26px] leading-[1.15]">
        Termos de uso e privacidade
      </h1>
      <p className="set-code mt-2 text-xs text-muted">VERSÃO {VERSAO}</p>

      <ConteudoDosTermos />
    </div>
  )
}
