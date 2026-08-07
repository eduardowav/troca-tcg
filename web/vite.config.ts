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
      // `marca.svg` entra junto: é a marca que o cabeçalho do app exibe, e sem
      // ela em cache o app instalado abriria sem logo quando estivesse offline.
      includeAssets: ['favicon.svg', 'marca.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'TrocaTCG — quadro de trocas de Pokémon TCG',
        short_name: 'TrocaTCG',
        description:
          'Descubra com quem trocar suas cartas de Pokémon TCG. Ofereço e Procuro, matching automático.',
        lang: 'pt-BR',
        // O papel creme, não o preto do playmat: estas duas cores são a barra do
        // sistema e a tela de abertura do app instalado, e com o valor antigo o
        // PWA abria numa tela preta que piscava para creme quando a interface
        // aparecia. Mesmo `#FFFDF5` do `theme-color` do index.html.
        theme_color: '#FFFDF5',
        background_color: '#FFFDF5',
        display: 'standalone',
        orientation: 'portrait',
        // Os três saem de `scripts/gerar-icones.mjs`, a partir da mesma arte do
        // favicon e do componente `MarcaTrocaTCG`. Mudou a marca, rode o script.
        //
        // O maskable é arquivo à parte, não o mesmo `pwa-512.png`: o Android
        // recorta um círculo de 80% do lado, e a carta do desenho passa da zona
        // segura — reaproveitar o ícone comum decepa o leque. O arquivo maskable
        // tem a arte reduzida para caber e o fundo sangrando até a borda, sem
        // canto arredondado, porque quem arredonda é a máscara do sistema.
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
