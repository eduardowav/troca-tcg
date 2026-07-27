# Product

<!-- impeccable:product-schema 1 -->

> Registro derivado com evidência forte da Documentação Técnica v2.2 e do Plano de
> Investimento (em `docs/`). Não houve entrevista separada porque os documentos do
> próprio autor já fixam o produto; pontos herdados deles não estão marcados como
> suposição. Decisões visuais ficam para o DESIGN.md (new-work).

## Platform

web

## Users

Colecionadores e jogadores de Pokémon TCG de uma comunidade local (inicialmente
Belém). Perfil típico: está **dentro da loja ou em evento**, com o celular na mão e
as cartas físicas ao lado, querendo descobrir com quem fechar troca. Acesso
majoritariamente por celular, muitas vezes compartilhado por link de grupo de
WhatsApp. Amplitude de idade e familiaridade técnica variável — a interface precisa
ser óbvia para quem nunca usou um app de TCG.

## Product Purpose

Fazer a **troca acontecer**. O usuário declara o que **Ofereço** e o que **Procuro**,
e o sistema calcula automaticamente trocas recíprocas — diretas, múltiplas e
triangulares (A→B→C→A) — e mantém reputação para reduzir trocas que furam. Sucesso é
medido por uma métrica-mãe: **taxa de trocas concluídas** = concluídas / (concluídas
+ furadas + expiradas). Qualquer coisa que não aumente trocas concluídas fica fora.

## Positioning

**Não é um gerenciador de coleção — é um quadro de trocas.** O mercado de apps de
catalogação é saturado (TCG Collector, Pokely, Dragon Shield) e nenhum resolve o
encontro entre duas pessoas com interesses recíprocos. O diferencial é o **motor de
matching** (incluindo triangular, que nenhum concorrente oferece) somado a uma
**taxonomia própria de acabamentos** (`finishes`: Master Ball, Poké Ball, Quick Ball…)
que nenhuma API gratuita entrega. A vantagem é a densidade de uma rede local, não a
escala global.

## Operating Context

- Uso predominante em pé, dentro da loja/evento, celular na mão, cartas físicas ao lado.
- Fluxo central: cadastrar cartas (Ofereço/Procuro) → ver feed de matches por score →
  aceitar → (disclaimer bloqueante) → revelar contato → combinar encontro presencial →
  confirmar conclusão bilateral.
- A plataforma **apenas conecta**: não custodia cartas, não intermedia dinheiro, não
  tem chat interno (contato revelado após aceite mútuo). Encontros presenciais.
- Momento crítico do onboarding: 10 cartas cadastradas em menos de 2 minutos, senão a
  rede não forma. Abaixo de ~20 cartas por usuário, o matching quase não acha reciprocidade.

## Capabilities and Constraints

- **Só Pokémon TCG na v1.** Um jogo só, por densidade de rede.
- Catálogo em português (TCGdex, cache local) — o jogador busca "Pesquisa do Professor",
  não "Professor's Research".
- Matching casa **carta + acabamento** (um Master Ball não equivale ao reverse comum).
- Reputação por confirmação bilateral; badge só após 5 trocas ("Novo por aqui" antes disso).
- Web Push + notificações in-app (Supabase Realtime). PWA instalável, mobile-first,
  offline para leitura.
- LGPD: contato só compartilhado após aceite mútuo; exclusão de conta funcional.
- **Terminologia proibida:** nunca usar "coleção", "deck", "binder", "pasta". As listas
  são **Ofereço** (OFERTA) e **Procuro** (PROCURA). Acabamento é `finish`, nunca `variant`.
- Custo de operação ~R$ 0/mês (Supabase/Render/Cloudflare free). Monetização futura:
  patrocínio de loja > assinatura individual.

## Brand Commitments

- Nome: **TrocaTCG**. Voz direta, sem juridiquês: botões dizem o que acontece
  ("Aceitar troca", não "Confirmar"); erros explicam e orientam.
- **Isenção de responsabilidade** obrigatória e visível (cadastro, rodapé, e modal
  bloqueante antes de revelar contato).
- **Não afiliado** à Nintendo / Creatures / GAME FREAK / The Pokémon Company. Sem logos
  oficiais, sem "Pokémon" no nome do app. Sem imagens de marca próprias além do catálogo.

## Evidence on Hand

- Documentação Técnica v2.2 e Plano de Investimento em `docs/`.
- Catálogo real já populado no Supabase (Prismatic Evolutions, 180 cartas, PT-BR),
  com imagens servidas pela CDN da TCGdex (`assets.tcgdex.net/.../low.webp`).
- Ainda **não há** usuários reais, trocas concluídas, depoimentos ou métricas de uso —
  não fabricar nada disso na interface.

## Product Principles

1. **A troca é o produto.** Cada tela existe para aproximar duas pessoas de um encontro concluído.
2. **Sem ambiguidade.** Se a carta está cadastrada, está em jogo. Nada de "guardado".
3. **Confiança é o ativo.** Uma sugestão de match absurda (ex.: acabamento trocado)
   destrói a confiança no feed — e o feed é tudo. Reputação e precisão vêm antes de volume.
4. **Mobile-first, dentro da loja.** Rápido, tocável, legível de relance, funciona em 320px.
5. **Honestidade de expectativa.** A plataforma conecta e sai de cena; deixa isso claro.

## Accessibility & Inclusion

Contraste mínimo AA (4.5:1) em texto; foco de teclado visível em todo elemento
interativo; `prefers-reduced-motion` respeitado (sem animação, gradiente estático);
responsivo de 320px para cima; skeleton em toda tela que carrega dados.
