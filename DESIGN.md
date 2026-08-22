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

A paleta oficial da marca, fechada em 2026-08-19 e registrada no manual v1.0, tem
sete cores: azul `#0067FF`, bege `#F4EEE4`, escuro `#171717`, branco `#FFFDF5`,
cinza `#202020`, vermelho `#B2292E` e amarelo `#FF9D1B`. Os tokens abaixo são elas —
e, onde uma delas não alcança o contraste de texto, uma derivada dela por conta,
nunca um vizinho escolhido no olho.

**O azul é a exceção, e a regra é do manual:** ele não admite derivada nenhuma.
"Não usar azul claro, variações de azul, degradês ou tons aproximados" — e o
checklist de aplicação pergunta, antes de publicar, se sobrou outro azul na peça.
Onde o azul não alcança o contraste de texto, ele deixa de ser texto.

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

- O **azul não muda, e deixa de ser letra**. Sobre a cartela escura ele dá 3,40:1:
  serve de peça e não de texto. Uma versão clareada (`#3385FF`) chegou a entrar e
  saiu no mesmo dia, porque o manual não admite um segundo azul. No lugar dela vale
  a regra dos links: no escuro `.text-azul` vira tinta, por uma sobrescrita só. O
  preenchimento — botão, aba selecionada, ponto do sino — continua azul nos dois
  temas.
- O **vermelho clareia 35%** (`#CD7477`): puro ele dá 2,77:1 no papel escuro.

O amarelo entra **puro**, 8,61:1 — no escuro a cor da marca é texto sem ajuste
nenhum.

Não existe cor por lista. Ofereço e Procuro se distinguem por aba, rótulo e posição —
nesta grade o azul já é `RARE` e o âmbar já é `ULTRA RARE` dentro da própria célula, e
uma terceira cor de região disputaria a leitura.

## A marca

Duas peças: o **ícone** (`public/marca.svg`) e a **palavra** (`palavra.svg` e
`palavra-escura.svg`). Saem de `idv_troca_tcg/logo_finalizada/SVG` e não se
reconstroem à mão — o manual é explícito nisso.

O ícone é sempre `#0067FF`, nos dois temas. Quem troca é a palavra: escura no claro,
clara no escuro. É a regra central do manual, e a única do sistema de marca que o CSS
precisa saber (`.palavra-svg` no bloco do tema escuro).

**Área de proteção: 25% da altura do ícone**, livre de texto, borda e qualquer outro
elemento. Onde isso pesa é no ícone de app — `scripts/gerar-icones.mjs` deriva a
ocupação dessa regra, e ela derruba o desenho para 2/3 do lado do quadro. O ícone
encolheu em 2026-08-19 por causa dela.

**Mínimos**: 24px para o ícone isolado, 160px para a assinatura horizontal. O lockup
do cabeçalho tem 28px de ícone e ~178px de largura — passa nos dois.

**Composições.** A horizontal é a principal, e é a que o app usa: "na dúvida, use a
assinatura horizontal". A **vertical** existe como arquivo desde 2026-08-19
(`assinatura-vertical.svg` e a irmã escura), para formato estreito — capa, card,
story, totem. Nenhuma tela a usa hoje, e por isso ela fica fora do precache do
service worker. Ela não é arte nova: `scripts/gerar-assinatura.mjs` compõe as duas
peças, com as proporções medidas no pixel da página 09 do manual — palavra a 22,4%
da altura do desenho do ícone, vão de 34,4%, tudo centrado no mesmo eixo. Nunca
comprimir a horizontal para simular a vertical.

**O slogan é `Achou. Combinou. Trocou.`** — decidido pelo Eduardo em 2026-08-21.

Três palavras, três pontos finais, e é o produto inteiro na ordem em que
acontece: o app **achou** quem tem a sua carta, vocês **combinaram** onde e
quando, e a troca **aconteceu**. O ponto depois de cada uma é do slogan, não
enfeite: ele é o que dá o compasso de três batidas e impede que a frase seja lida
como lista.

**Onde ele entra:** como assinatura verbal, perto da marca — kicker da Home,
subtítulo do "Como funciona", rodapé. Sempre com as três palavras juntas e nessa
ordem.

**Onde ele não entra:** onde o texto precisa *explicar* em vez de assinar. A
descrição do manifesto, a `meta description` e o texto do link de convite
continuam dizendo o que o app faz com todas as letras — quem nunca ouviu falar do
TrocaTCG não deduz "quadro de trocas de Pokémon TCG" a partir de três verbos no
passado. Slogan é para quem já chegou; descrição é para quem ainda não.

Raios: `cartela 20px` · `controle 12px` · `imagem 8px` · `etiqueta 6px`.

Sombra dura, deslocada e sem blur — o deslocamento é a hierarquia: `4px` cartela,
`3px` botão, `2px` peça pequena.

## Ilustração

Diretriz oficial da marca, colada aqui na íntegra. A fonte é
`idv_troca_tcg/DIRETRIZ-ILUSTRACAO.md`, e é lá que ela muda — este bloco é cópia, e
cópia que diverge da fonte é pior que cópia nenhuma. Se as duas discordarem, a de lá
ganha.

Os três arquivos que a diretriz manda usar moram no mesmo repositório:
`assets/referencia-estilo-ilustracao-principal.png` (a referência visual obrigatória),
`assets/padrao-verso-carta-trocatcg.svg` e `assets/padrao-frente-carta-trocatcg.svg`.

> Esta é a linguagem visual oficial para todas as ilustrações do aplicativo e da
> comunicação do TrocaTCG.

### Características essenciais

- Ilustração vetorial plana com linguagem neo-brutalista editorial.
- Pessoas diversas representadas por formas grandes, simples e acolhedoras.
- Contornos firmes e grossos em carvão, com espessura visual consistente.
- Anatomia simplificada, sem rostos ou detalhes realistas desnecessários.
- Composições humanas e comunitárias: encontros, trocas, coleção e colaboração.
- Perspectiva simplificada e levemente irregular, com energia de pôster editorial.
- Áreas amplas de cor e forte contraste; poucos elementos pequenos.
- Cartas sempre genéricas, sem personagens, marcas ou artes de franquias.

### Paleta aplicada às ilustrações

- Azul principal da identidade.
- Bege quente como fundo, pele, respiro e áreas negativas.
- Carvão `#171717` para contornos, cabelos, roupas e massas de contraste.
- Branco somente quando necessário para contraste ou acessibilidade.

Usar no máximo três cores principais por ilustração. Evitar adicionar cores secundárias
sem aprovação.

### Acabamento

- Preenchimentos predominantemente chapados.
- Curvas orgânicas combinadas com cortes geométricos.
- Contornos preservados mesmo em áreas de sobreposição.
- Leitura clara tanto em banners quanto em cards pequenos do aplicativo.
- Inclusão e diversidade sem estereótipos ou caricaturas.

### Evitar

- Fotorealismo, 3D, render plástico ou iluminação cinematográfica.
- Sombras realistas, bevel, glassmorphism ou gradientes decorativos.
- Clipart corporativo genérico e personagens com aparência de banco de imagens.
- Anatomia detalhada, dedos excessivamente definidos e expressões faciais complexas.
- Texturas pesadas, ruído, pinceladas ou estética artesanal incompatível com o vetor.
- Referências visuais diretas a Pokémon ou outras propriedades intelectuais.
- Paletas multicoloridas que enfraqueçam azul, bege e carvão.

### Regra de uso

Sempre que uma tela, onboarding, estado vazio, campanha, tutorial ou publicação precisar
de ilustração, esta referência deve ser usada como direção principal. Variações de cena
são permitidas; a linguagem de desenho, a simplificação, os contornos e a paleta devem
permanecer consistentes.

### Verso oficial das cartas ilustradas

- Sempre que o verso de uma carta estiver visível, usar o arquivo
  `assets/padrao-verso-carta-trocatcg.svg`.
- O padrão consiste em uma carta branca de cantos arredondados, com moldura grossa em
  carvão e uma esfera central simples: contorno em carvão, metade superior azul e metade
  inferior branca.
- Este grafismo pertence exclusivamente ao verso da carta. Nunca aplicar a esfera
  azul/branca à frente; quando a frente estiver visível, representar a face própria da
  carta ou mantê-la sem detalhes, conforme a cena.
- A carta deve manter sempre a proporção oficial de `5:7`. Nunca gerar cartas quadradas,
  esticadas, comprimidas ou com proporções diferentes.
- A carta pode ser redimensionada, rotacionada e colocada em perspectiva para acompanhar
  a cena, desde que sua geometria retangular e a proporção `5:7` permaneçam visualmente
  coerentes. A perspectiva pode alterar os ângulos aparentes, mas nunca deformar a carta.
- Cartas parcialmente ocultas devem preservar a mesma largura, altura, espessura e
  perspectiva das demais cartas do mesmo conjunto ou pilha.
- Não redesenhar a esfera, alterar suas proporções ou adicionar ornamentos em cada
  ilustração.
- Não usar o verso oficial de Pokémon, artes de cartas existentes ou elementos
  licenciados.
- Em tamanhos muito pequenos, preservar prioritariamente a esfera central e o contraste
  azul/branco.

### Frente oficial das cartas ilustradas

- Sempre que a frente de uma carta estiver visível, usar como referência o arquivo
  `assets/padrao-frente-carta-trocatcg.svg`.
- A frente deve manter a proporção `5:7`, os cantos arredondados, o fundo branco e a
  moldura grossa em carvão.
- Representar a área da ilustração por um único retângulo azul de contorno carvão, sem
  personagem, cenário, textura ou detalhe interno.
- Representar nomes, atributos, ações e textos somente por linhas geométricas em carvão.
  Não inserir palavras legíveis nas ilustrações.
- Pequenos círculos azuis podem marcar atributos, desde que permaneçam simples e
  consistentes com o modelo oficial.
- Nunca aplicar a esfera azul/branca do verso na frente da carta.
- A frente pode ser redimensionada, rotacionada, parcialmente ocultada e colocada em
  perspectiva, mas nunca quadrada, esticada, comprimida ou deformada.

### Por que a esfera é azul, e não vermelha

Não está na diretriz e fica registrado aqui porque é a linha que mais corre risco de ser
"corrigida" por quem só quiser deixar a associação mais óbvia.

A estrutura — círculo, faixa no equador, botão no centro — é linguagem genérica de bola
de captura, e é ela que produz o reconhecimento imediato que o verso precisa ter. O que
é marca registrada de terceiro é a **combinação** vermelho no topo, branco embaixo,
faixa preta. Trocar a cor pela da marca mantém a leitura e sai da combinação protegida.

E o ganho não é só jurídico: uma bola vermelha e branca faz o produto parecer o produto
do outro; a azul faz parecer este. O disclaimer de não-afiliação (item 4 da seção 17 da
doc técnica) existe para dizer que não somos eles — e perde o sentido se a ilustração
disser o contrário.


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
com a paleta oficial: a aba passou a usar o azul de ação, e no escuro segue a mesma
regra desta seção — vira tinta, com o tracinho azul embaixo fazendo a marcação que a
cor fazia.

## Achado fechado: azul como texto que não é link

A passada acima cobriu os 19 links. Sobrou o azul usado como **ênfase de texto**: o
preço no rodapé do par de cartas (`Pecas.tsx`), o "· eu procuro" de `MontarProposta`,
os valores grandes de `Carta`, o prazo urgente de `Matches`, a estrela de
`FichaPerfil` e o selo "Troca" do histórico. Nenhum é link, então a regra das duas
formas não os alcançava, e por meses eles ficaram como estavam — o selo do histórico
sobre `bg-meu` escuro chegava a **2,42:1**, o pior do app.

Fechou em 2026-08-19, e quem fechou foi o **manual da marca**: com um azul só
permitido no sistema, clarear deixou de ser opção, e sobrou a mesma saída dos links.
No tema escuro `.text-azul` vira `--color-tinta`, numa sobrescrita só, e as doze
chamadas se resolvem sem passada tela a tela.

**O que isso custa, dito na cara:** no escuro a estrela e o prazo urgente perdem cor
própria e viram texto comum. A distinção que a cor fazia ali passa a ser feita por
posição e por peso. É o preço de ter um azul só, e o manual cobra esse preço de
propósito — no claro nada muda, porque lá o azul se lê (4,70:1 sobre a cartela).

A rota `/lab/azul` fica de pé como bancada, agora com a coluna do meio mostrando a
saída proibida: é o jeito de ver quanto a proibição custa, lado a lado com o que
entrou no lugar.

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
