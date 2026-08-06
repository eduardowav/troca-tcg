import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'TrocaTCG — quadro de trocas de Pokémon TCG',
        short_name: 'TrocaTCG',
        description:
          'Descubra com quem trocar suas cartas de Pokémon TCG. Ofereço e Procuro, matching automático.',
        lang: 'pt-BR',
        theme_color: '#0E1116',
        background_color: '#0E1116',
        display: 'standalone',
        orientation: 'portrait',
        // O maskable é arquivo à parte, não o mesmo `pwa-512.png`: o Android
        // recorta um círculo de 80% do lado, e a carta do desenho vai de 19% a
        // 81% da altura — reaproveitar o ícone comum decepa o topo e a base
        // dela. O arquivo maskable tem a arte reduzida para caber na zona
        // segura e o fundo sangrando até a borda, sem canto arredondado,
        // porque quem arredonda é a máscara do sistema.
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
