# Design

<!-- impeccable:design-schema 1 -->

Sistema visual do TrocaTCG, registrado a partir do mundo construído (não da intenção).
Ver contrato de direção no topo de `web/index.html`. Produto em [PRODUCT.md](PRODUCT.md).

## Mundo visual

**Playmat.** A troca acontece sobre uma superfície de jogo em grafite escuro onde as
cartas vivem. A única luz/foil é o momento holográfico do match. Recusa o dashboard
dark-SaaS genérico (near-black + neon + bordas brilhantes) mergulhando no mundo
material de TCG: sleeve, cartela, código de set como vernáculo, foil como recompensa.

Modo (impeccable): **Operate** — o visitante completa uma tarefa; expressão nunca
obscurece a tarefa, o estado ou a afordância. A marca vive nos detalhes precisos.

## Tokens (fonte: `web/src/index.css`)

Superfícies (grafite de playmat, não preto puro):
`ink #0E1116` · `ink-deep #090C10` · `surface #161B22` · `surface-2 #1D232D` ·
`edge #2A313C` · `edge-soft #222834`.

Texto (cardstock levemente quente): `paper #EAEEF4` · `muted #94A0B2` (secundário /
placeholder, ≥4.5:1) · `faint #838DA0` (letra miúda — preço de referência, raridade,
prazo, isenção; ≥4.5:1 até sobre `surface-2`).

Acento e semântica:
- `volt #7C5CFF` / `volt-strong #6B49F0` — ação primária.
- `offer #2DD4BF` (Ofereço, o que eu dou) e `want #F5A524` (Procuro, o que eu quero) —
  as duas listas têm cor própria, usadas como afordância, não como região.
- `alert #F2555A`.
- Holo `#5EE7DF → #B490CA → #FF9DC8` — **exclusivo do momento de match** (`.holo-sweep`,
  `.text-holo`). Nunca decorativo fora dali.

Fundo do body: vinheta radial sutil (feltro de playmat), sem ruído falso.

## Tipografia

- **Display:** Cabinet Grotesk 700/800, tracking -0.03em, headings balanceados.
- **Corpo:** Satoshi 400/500/700.
- **Mono:** JetBrains Mono — código de set (`.set-code`, `SV08.5 059`), tabular. É o
  vernáculo do colecionador, não decoração "técnica".

## Componentes

- **Elevação declarada uma vez** (borda OU sombra, nunca as duas = ghost card).
  Raio: cartela `--radius-card 14px`, controle `--radius-control 10px`.
- **`Button`** (`components/ui/Button.tsx`, cva): variantes `primary` (volt), `offer`,
  `want`, `subtle`, `ghost`; tamanhos sm/md/lg; estados hover/active/disabled/loading.
- **`CartaThumb`** (`components/carta/CartaThumb.tsx`): a carta como objeto físico,
  proporção 2.5×3.5 dentro de um sleeve (moldura + anel interno), `low.webp` lazy,
  skeleton no carregamento, fallback tipográfico (nome + código) quando não há imagem —
  nunca uma caixa quebrada. `foil` aplica a varredura holo para acabamentos especiais.

## Motion

Um único momento autoral: a **varredura holo** (`.holo-sweep`) reservada ao match.
Fora disso, transições curtas e quietas (progresso, entrada de linha, bandeja com
spring). `prefers-reduced-motion` desliga animações e congela o gradiente.

## Piso de qualidade

Contraste AA (≥4.5:1) em texto; foco de teclado visível (anel volt) em tudo que é
interativo; responsivo de 320px; skeleton em toda carga; estados vazio/erro/sem-resultado
escritos na língua do produto. Nunca a palavra "coleção"; acabamento é `finish`.

## Superfícies construídas

- **Onboarding** (`web/src/routes/Onboarding.tsx`): busca real no catálogo (Supabase,
  leitura pública), linhas de resultado com os dois gestos Ofereço/Procuro, progresso
  animado (NumberFlow) rumo a 10 cartas, bandeja fixa com as cartas escolhidas e CTA que
  só libera no limiar. Verificada por screenshot (desktop + mobile) com dados reais.

Próximas superfícies (fases seguintes): Entrar, Minhas cartas, Feed de matches,
Detalhe do match (onde a linha de troca e o holo ganham o palco), Perfil.
