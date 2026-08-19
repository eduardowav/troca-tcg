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

A paleta oficial da marca, fechada em 2026-08-19, tem sete cores: azul `#0067FF`,
bege `#F4EEE4`, escuro `#171717`, branco `#FFFDF5`, cinza `#202020`, vermelho
`#B2292E` e amarelo `#FF9D1B`. Os tokens abaixo são elas — e, onde uma delas não
alcança o contraste de texto, uma derivada dela por conta, nunca um vizinho
escolhido no olho.

Superfícies: `papel #F4EEE4` (fundo da página) · `cartela #FFFDF5` (tudo que se levanta
dela com borda e sombra) · `meu #F9FAFF` (o que é meu numa troca).

Tinta: `tinta #171717` — uma cor só para borda e texto, e é ela que dá a dureza do
mundo · `apagado #555552` (secundário, letra miúda, dado frio).

Cor com significado, e só três:
- `azul #0067FF` — **ação, e nada além dela**. Também na aba ativa, desde que o
  segundo azul (`azul-claro #6082FF`) saiu com a paleta oficial. Por cima dele se
  escreve em `azul-tinta #FFFDF5`, 4,70:1 — o bege reprova ali, com 4,15:1.
- `ambar-marca #FF9D1B` é o amarelo da marca e serve de **área**: a etiqueta de
  raridade de topo é chapada nele, com `ambar-tinta #171717` por cima (8,61:1). Como
  texto ele dá 1,92:1 e não existe: quem escreve é `ambar #8C560F`, a mesma cor
  escurecida a 55% mantendo a proporção entre canais, sobre `ambar-fraco #FFF4E5`
  (5,60:1).
- `alerta #B2292E` sobre `alerta-fraco #FEE2E2` — **o que não tem volta**. Apagar conta
  usa; sair da conta não, porque entrar de novo devolve tudo. É o único dos três
  acentos que entrou puro da paleta: 5,29:1 sobre o próprio fundo.

No tema escuro o papel é o `#171717` e a cartela é o cinza `#202020`. Dois acentos
mudam ali, e os dois por conta e não por gosto:

- O **azul clareia só quando é letra** — `azul-texto #3385FF`, 4,61:1 sobre a
  cartela. O preenchimento continua no azul da marca, porque o botão azul fica na
  mesma tela que o ícone da marca, que é chapado nele e não muda de tema: clarear o
  botão poria dois azuis quase iguais lado a lado.
- O **vermelho clareia 35%** (`#CD7477`): puro ele dá 2,77:1 no papel escuro.

O amarelo entra **puro**, 8,61:1 — no escuro a cor da marca é texto sem ajuste
nenhum.

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

## As duas formas de link

O app tinha uma só — texto azul sublinhado —, e ela reprovava AA no papel escuro:
o azul da marca dá **3,40:1** sobre a cartela escura, contra o piso de
4,5:1 deste documento para texto. Em peça com borda de 2px o mesmo azul funciona, porque
ali quem separa do fundo é a borda; em texto solto não há borda fazendo esse trabalho.
Foi pego na varredura da tela de falha (2026-08-12) e decidido em 2026-08-13, no
`/lab/azul` — bancada que pôs as três versões lado a lado com as amostras reais do app.

A saída não foi clarear o azul. Foi separar dois casos que sempre foram diferentes e
vinham pintados igual:

- **Link solto** — sozinho numa linha, e é ação: "Esqueci minha senha", "Voltar para
  entrar", "Limpar", "Termos e privacidade". Vira `AcaoSecundaria`, a etiqueta de borda
  que a tela de falha estreou. Botão é mais direto que texto azul, e a borda é como esta
  interface diz "isto se toca".
- **Link dentro de uma frase** — "os termos de uso", o `@nome` no título do acervo. Vira
  `LinkNoTexto`, tinta sublinhada. Etiqueta ali abriria a altura da linha em todo
  parágrafo, e um `@nome` em caixa alta com moldura deixa de parecer o nome de alguém.

Nas duas o azul sai e a tinta entra: **14,12:1** no escuro, **17,60:1** no claro. O
`--color-azul` continua inteiro onde sempre funcionou — fundo de peça, tinta branca por
cima. O `--color-azul-claro` que servia à aba ativa **deixou de existir** em 2026-08-19,
com a paleta oficial: a aba passou a usar o `azul-texto`, que no claro é o próprio azul
de ação e no escuro é a versão clareada — sobrescrita dentro de `[data-tema='escuro']`,
que é o que ela sempre teve de ser, porque `#3385FF` sobre a cartela clara dá 3,2:1 e
reprovaria.

## Achado em aberto: azul como texto que não é link

A passada acima cobriu os 19 links. Sobrou o azul usado como **ênfase de texto**, que
tem o mesmo número e não foi tocado: o preço no rodapé do par de cartas
(`Pecas.tsx`), o "· eu procuro" de `MontarProposta`, os valores grandes de `Carta`, o
prazo urgente de `Matches` e o selo "Troca" do histórico (`border-azul bg-meu
text-azul`, que sobre o `bg-meu` escuro cai para **2,42:1**, o pior do app).

Nenhum deles é link, então a regra das duas formas não os alcança — e trocá-los por
tinta apagaria a distinção que eles existem para fazer. É decisão de desenho própria,
não mecânica.

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
