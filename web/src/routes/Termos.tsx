import { useLocation, useNavigate } from 'react-router-dom'

import {
  ConteudoDosTermos,
  VERSAO,
} from '@/components/termos/ConteudoDosTermos'
import { useAuth } from '@/stores/auth'

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
  const navegar = useNavigate()
  const local = useLocation()
  const session = useAuth((s) => s.session)

  // **"Voltar" volta para onde a pessoa estava, e não para um endereço fixo.**
  // Era `<Link to="/entrar">` até 2026-08-25, e quem abria os termos a partir
  // de Configurações — já logado, dentro do app — era cuspido na tela de login.
  // Achado pelo Eduardo usando o app.
  //
  // O `location.key` é o que distingue os dois casos, e é preciso distinguir:
  // o React Router marca a primeira entrada do histórico como `'default'`, e é
  // isso que acontece com quem chegou pelo link compartilhado ou pelo buscador.
  // Para essa pessoa, `navigate(-1)` sairia do site — ou não faria nada, em aba
  // nova. Ela ganha um destino, e o destino depende de haver sessão: mandar
  // quem está logado para `/entrar` é o mesmo defeito com outra roupa.
  const veioDeDentro = local.key !== 'default'

  function voltar() {
    if (veioDeDentro) return navegar(-1)
    navegar(session ? '/app' : '/entrar', { replace: true })
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12">
      <button
        type="button"
        onClick={voltar}
        className="text-[14px] text-muted underline underline-offset-2 hover:text-paper"
      >
        ← Voltar
      </button>

      <h1 className="mt-6 text-[26px] leading-[1.15]">
        Termos de uso e privacidade
      </h1>
      <p className="set-code mt-2 text-xs text-muted">VERSÃO {VERSAO}</p>

      <ConteudoDosTermos />
    </div>
  )
}
