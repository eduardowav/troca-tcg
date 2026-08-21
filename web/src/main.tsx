import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'

import App from '@/App'
import { LimiteDeErro } from '@/components/Falha'
import { iniciarAtualizacao } from '@/lib/atualizacao'
import { iniciarMonitoramento } from '@/lib/erros'
import { queryClient } from '@/lib/queryClient'
import '@/stores/auth' // assina o estado de sessão do Supabase o quanto antes
// O convite de instalação do Chrome chega logo depois da abertura da página, e
// só uma vez. Quem assina depois — a tela `/instalar`, quando alguém navega até
// ela — não recebe nada: o ouvinte precisa existir desde o começo.
import '@/lib/instalacao'
// Importado aqui, e não só onde é usado: o módulo assina a troca de tema do
// sistema e mantém a `theme-color` em dia. Se só a tela de Configurações o
// carregasse, quem nunca abre Configurações ficaria sem as duas coisas.
import '@/stores/tema'
import './index.css'

// Antes de montar a árvore: erro na primeira renderização é justamente o que
// ninguém vê, porque a pessoa fecha o app e não volta. Sem `VITE_SENTRY_DSN`
// esta chamada não carrega nada — nem o pedaço do bundle.
iniciarMonitoramento()

// Registra o service worker e passa a vigiar versão nova. Fica aqui, e não
// dentro de uma tela, porque quem precisa do aviso é justamente quem deixou o
// app aberto numa tela qualquer — ver `lib/atualizacao.ts`.
iniciarAtualizacao()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* Dentro do BrowserRouter, e não fora: a tela de falha tem um link de
          saída, e link sem roteador estoura outro erro em cima do primeiro. */}
      <BrowserRouter>
        <LimiteDeErro>
          <App />
        </LimiteDeErro>
      </BrowserRouter>
      {/* O aviso segue os tokens do mundo novo, e por isso acompanha o tema
          sozinho. Antes ele era fixo em `dark` com as cores do playmat: uma
          faixa grafite caindo no topo de um app de papel creme — a única peça
          que nunca migrou. Agora é cartela com borda e degrau, como o resto. */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: 'var(--color-cartela)',
            border: '2px solid var(--color-borda)',
            borderRadius: 'var(--radius-controle)',
            boxShadow: 'var(--shadow-duro-sm)',
            color: 'var(--color-tinta)',
            fontFamily: 'var(--font-corpo)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
