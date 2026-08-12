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
      // `injectManifest`, e não o `generateSW` de antes: o service worker
      // precisa tratar o evento `push`, e evento não se declara num arquivo
      // gerado. O worker agora é `src/sw.ts` e o plugin só injeta ali a lista
      // do precache — tudo o que o modo gerado fazia está escrito lá dentro.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // A mesma lista que o modo gerado usava por padrão. Declarada porque no
      // `injectManifest` o padrão é mais curto, e sem ela as artes e o ícone
      // sairiam do precache sem ninguém decidir isso.
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // `iife`, e não o `es` padrão: service worker como módulo ES não é
        // suportado em todo navegador (o Firefox não suporta até hoje), e ali
        // a queda não é degradar — é o app ficar sem worker nenhum, ou seja,
        // sem push e sem offline. O empacotado clássico funciona em todos.
        rollupFormat: 'iife',
      },
      // O worker também roda em `npm run dev`, senão o push só daria para testar
      // depois de publicar. Vale para `localhost`: navegador nenhum registra
      // service worker em origem insegura, então pelo IP da rede local (http)
      // ele continua ausente — para provar no celular, é HTTPS ou produção.
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
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
