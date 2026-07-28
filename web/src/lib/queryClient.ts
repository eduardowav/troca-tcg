import { QueryClient } from '@tanstack/react-query'

/**
 * Cache único da aplicação. Vive fora do main.tsx para que fluxos não-React
 * (sair da conta, por exemplo) possam invalidá-lo.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})
