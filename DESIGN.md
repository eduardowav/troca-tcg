# Design

<!-- impeccable:design-schema 1 -->

Sistema visual do TrocaTCG, registrado a partir do mundo construído (não da intenção).
Ver contrato de direção no topo de `web/index.html`. Produto em [PRODUCT.md](PRODUCT.md).

## Mundo visual

**Papel.** A troca acontece sobre papel creme, com borda preta grossa, sombra dura sem
blur e cor chapada. Neobrutalismo, com a disciplina que o nome não promete: cor é
significado, nunca decoração. Fonte: o arquivo Figma "TrocaTCG — Design", copiado nó a
nó — nenhum valor deste documento foi escolhido de memória.

Modo (impeccable): **Operate** — o visitante completa uma tarefa; expressão nunca
obscurece a tarefa, o estado ou a afordância.

## Tokens (fonte: `web/src/index.css`)

Superfícies: `papel #FFFDF5` (fundo da página) · `cartela #FFFFFF` (tudo que se levanta
dela com borda e sombra) · `meu #F2F4FF` (o que é meu numa troca).

Tinta: `tinta #000000` — uma cor só para borda e texto, e é ela que dá a dureza do
mundo · `apagado #555552` (secundário, letra miúda, dado frio).

Cor com significado, e só três:
- `azul #0038FF` — **ação, e nada além dela**. `azul-claro #6082FF` na aba ativa.
- `ambar #996700` sobre `ambar-fraco #FFF4E5` — raridade de topo e aviso com hora
  marcada. O texto **não** é o `#FFAB00` do arquivo: aquele dá 1,74:1 sobre o próprio
  fundo e reprova no piso AA que este documento fixa. Escurecido 40% mantendo a
  proporção entre canais — mesmo âmbar, 4,52:1.
- `alerta #DC2626` sobre `alerta-fraco #FEE2E2` — **o que não tem volta**. Apagar conta
  usa; sair da conta não, porque entrar de novo devolve tudo.

Não existe cor por lista. Ofereço e Procuro se distinguem por aba, rótulo e posição —
nesta grade o azul já é `RARE` e o âmbar já é `ULTRA RARE` dentro da própria célula, e
uma terceira cor de região disputaria a leitura.

Raios: `cartela 20px` · `controle 12px` · `imagem 8px` · `etiqueta 6px`.

Sombra dura, deslocada e sem blur — o deslocamento é a hierarquia: `4px` cartela,
`3px` botão, `2px` peça pequena.

## Tipografia

- **Título:** Outfit 500–900. A distância entre Medium e Black é o que carrega a
  hierarquia.
- **Corpo:** Inter 400–600.
- **Dado:** Geist Mono — id de troca, código de set, nota, data, prazo, contagem. É o
  vernáculo do colecionador, não decoração "técnica".

## Componentes (`web/src/components/brutal/`)

- **`Cartela`** — borda de 2px, sombra dura de 4px, raio 20. Os três andam juntos:
  sombra sem borda vira mancha, borda sem sombra devolve a peça ao plano do fundo.
- **`ParDeCartas`** — as duas cartas de uma troca, com a seta no vão. Dois tamanhos: no
  feed só arte e nome; no detalhe, raridade, acabamento e preço. `trocado` inverte
  posição **e** posse — depois da troca o azul vai para a carta que ficou com você.
- **`CelulaBrutal` / `GradeBrutal`** — a carta na grade. Moldura 2,5×3,5 em pé, não o
  4:3 do arquivo: o catálogo é scan de carta inteira, e cortá-lo numa faixa apaga nome,
  número e borda.
- **`SeloRaridade`** — três níveis, por padrão no texto e não por tabela: são 35
  rótulos no catálogo e expansão nova traz rótulo novo. O que a regra não reconhece cai
  no neutro.
- **`BotaoBrutal`**, **`Selo`**, **`Pokebola`** — ação primária, estado, e o indicador
  das telas que ainda não existem.
- **`CartaThumb`** — a carta como objeto físico, `low.webp` lazy, esqueleto no
  carregamento e fallback tipográfico quando não há imagem. Nunca uma caixa quebrada.

Ícones: exportados do Figma, paths preservados byte a byte, `stroke` fixo trocado por
`currentColor`. A exceção é o de cartas — no arquivo ele é um `card-sim` (chip de
celular), leitura errada demais para um app de troca de cartas, e foi redesenhado na
mesma língua.

## Motion

Quase ausente, de propósito. Só a sombra que salta no toque e a **pokébola** que gira
nas telas em desenvolvimento — a única animação contínua, e ela se justifica por ser
literalmente um indicador de carregamento. `prefers-reduced-motion` desliga.

A varredura holo do playmat foi removida com ele. O momento autoral do fechamento de
uma troca **ainda não existe** neste mundo, e é a dívida de desenho mais visível que a
migração deixou.

## Piso de qualidade

Contraste AA (≥4.5:1) em **todo** texto — verificado por varredura que compara cor
computada com fundo herdado, não a olho; foi assim que o âmbar do arquivo foi pego.
Foco de teclado visível (anel azul). Responsivo de 320px, sem rolagem horizontal.
Esqueleto em toda carga. Estados vazio/erro/sem-resultado escritos na língua do
produto. Nunca a palavra "coleção"; acabamento é `finish`.

Cada tela mostra o que o produto tem. Onde o arquivo desenha função que não existe —
chat, tema escuro, idioma, cache, notificação — a tela ou diz que não existe ainda
(`EmBreve`) ou omite. Interruptor que não interrompe nada é pior que a ausência dele.

## Superfícies construídas

Todas. Feed, minhas cartas, carta, detalhe da troca, busca, perfil, perfil público,
editar perfil, configurações, onboarding, entrar, completar cadastro, pronto, termos,
home, instalar, recuperar senha, nova senha, falha, e as duas de "em desenvolvimento".

**A falha** (`components/Falha.tsx`) é a superfície que faltava: até 2026-08-12 cada
tela improvisava um `<p>` cinza dizendo "não deu para carregar", e o `RotaProtegida`
ainda usava tokens do playmat. São três motivos com desenho próprio — sem internet,
servidor fora do ar, app quebrado —, porque a diferença entre eles é a única coisa que
a pessoa quer saber: uma ela resolve no wi-fi, outra ela espera, a terceira ela
recarrega. Vermelho só no terceiro: neste mundo o vermelho é o que não tem volta, e
ficar sem sinal tem volta. Duas alturas: a de tela cheia e a `compacta`, que ocupa o vão
de uma lista sem empurrar o cabeçalho para fora da vista.

`/instalar` é a única tela que desenha glifos de outros sistemas — o Compartilhar do
iOS, os três pontos do Chrome. Eles não vêm do Figma e não moram em `Pecas.tsx`: são
redesenhados na língua daqui (traço de 2px, `currentColor`) só para serem reconhecidos
na tela do celular de quem está seguindo o passo a passo.

A moldura do app — logo, sino e barra de baixo — vive no `LayoutApp`. Telas que têm
cabeçalho próprio escondem o logo pelo `useMarcaOculta`: carta, troca, perfil, editar e
configurações.

## Achado em aberto: azul de link no escuro

`text-azul` (`#0038FF`) sobre o papel escuro dá **2,82:1** — reprova o piso AA deste
documento para texto. Em peça com borda de 2px o mesmo azul funciona, porque ali quem
separa do fundo é a borda; em **link solto**, não. Foi pego na varredura da tela de
falha (2026-08-12), onde a saída lateral virou etiqueta com borda em vez de link azul.

Os outros links azuis do app — rodapé da home, "Termos e privacidade", `@nome` na
vitrine — têm o mesmo número no escuro e continuam como estão: a correção é uma passada
própria, e a escolha entre clarear o azul de link (`#6082FF`, que é o da aba ativa) ou
transformar todos em etiqueta é decisão do Eduardo, não mecânica.

## O que ficou para depois

- **O momento da troca fechada.** Ver Motion.
- **Tokens do playmat ainda definidos** em `index.css`. Vários componentes de base
  (`Button`, `Campo`, `CartaThumb`, `ControlesAnuncio`, `BuscaRapida`, `FiltroCatalogo`,
  `Denunciar`) ainda escrevem `bg-surface`, `text-paper` e afins nas suas classes, e o
  mundo novo os repinta por cima via gancho. Apagar os tokens exige reescrever as
  classes desses componentes um a um — trabalho mecânico, mas com risco de regressão
  que merece uma passada própria e verificação tela a tela.
- **`data-mundo="brutal"` no `<html>`.** Ele existe só para manter a especificidade das
  regras de repintura enquanto o item acima não acontece. Quando os componentes
  escreverem os tokens novos direto, o atributo e o seletor somem juntos.
