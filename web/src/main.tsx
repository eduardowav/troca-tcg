import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'

import App from '@/App'
import { queryClient } from '@/lib/queryClient'
import '@/stores/auth' // assina o estado de sessão do Supabase o quanto antes
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster
        position="top-center"
        theme="dark"
        toastOptions={{
          style: {
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-edge)',
            color: 'var(--color-paper)',
          },
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
