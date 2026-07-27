# TrocaTCG — Web (PWA)

Frontend PWA em React + TypeScript + Vite. **A ser scaffoldado** (próximo passo da Fase 1 / início da Fase 2).

Stack planejada (ver seção 6 e 14 da doc):

- React 18 + TypeScript (`strict: true`)
- Vite + `vite-plugin-pwa` (service worker, instalável, Web Push)
- TailwindCSS · TanStack Query · React Router · Zustand · Zod
- `@supabase/supabase-js` (auth + realtime)

Setup previsto:

```bash
npm create vite@latest . -- --template react-ts
npm i @tanstack/react-query react-router-dom zustand zod @supabase/supabase-js
npm i -D tailwindcss @tailwindcss/vite vite-plugin-pwa
npm run dev
```

Direção visual: mundo da carta física (sleeve, binder, foil). Gradiente `holo`
aparece **só** no momento do match. Nunca usar a palavra "coleção" na UI.
