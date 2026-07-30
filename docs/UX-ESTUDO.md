# Estudo de UI/UX — TrocaTCG

Levantamento de julho de 2026. Pesquisa na web confrontada com as telas que
existem hoje, não com a intenção do produto. Cada achado aponta arquivo e linha,
e diz o que custa caro e o que é barato.

Direção visual e tokens seguem em [DESIGN.md](../DESIGN.md); produto em
[PRODUCT.md](../PRODUCT.md). Este documento é sobre **comportamento e decisão**,
não sobre paleta.

O critério de corte é a métrica-mãe: taxa de trocas concluídas. Achado que não
move troca concluída ficou de fora, por mais bonito que fosse.

---

## 1. O problema que decide o resto: liquidez

A literatura de marketplace de duas pontas é unânime e desconfortável. A falha
mais comum não é o produto, é o **sequenciamento**: quem chega e não encontra
nada vai embora, não volta e não conta para ninguém. A definição operacional de
liquidez não é número de usuários, é **a probabilidade de quem entra encontrar
uma transação** dentro de um recorte de tempo e lugar. Sem isso o ciclo inverte
e vira espiral: demanda que cai desanima a oferta, que derruba a demanda.

Traduzindo para cá: **nos primeiros meses, a tela `Vazio` de `Matches.tsx:154` é
a experiência principal do TrocaTCG**, não a exceção. Todo mundo que se cadastrar
até a base encorpar vai ver aquilo. Hoje ela é honesta e bem escrita — explica o
que é um match e manda ajustar as cartas — mas é um beco: a pessoa fez tudo
certo, cadastrou as cartas, e a resposta do app é "não tem nada".

**O que a pesquisa recomenda no lugar:** enquanto não há troca fechada, mostrar
o sinal de **uma ponta só**, que já existe no banco. Três coisas que dá para
dizer sem inventar dado:

- *"4 pessoas procuram a sua Charizard PGO 010."* Demanda pela minha oferta.
- *"Ninguém tem a sua Umbreon PRE 059 ainda — você é o único procurando."*
  Escassez, que é informação útil e evita a sensação de app quebrado.
- *"Falta pouco: fulano tem o que você procura, mas você não quer nada do que
  ele oferece (ainda)."* O match que falha **numa perna só** — e que vira troca
  no dia em que a pessoa adicionar mais uma carta.

Esse terceiro é o mais valioso: transforma a tela vazia em motivo concreto para
voltar e mexer nas listas, que é exatamente o comportamento que gera liquidez.
O motor de matching já calcula os dois lados (`services/matching.py`), então o
match de uma perna só é uma consulta a menos, não uma a mais.

**Tensão a vigiar:** a expiração de matches (`5fcdb8c`) é certa num mercado
líquido e perigosa num mercado vazio — expirar o pouco que existe encolhe ainda
mais a liquidez. Enquanto a base for pequena, vale prazo largo ou expiração que
devolve o par ao pool com aviso, não silenciosamente.

**Custo:** média (uma query nova + uma seção na tela). **Impacto:** o maior da
lista. É a diferença entre o app parecer vivo ou morto para os primeiros 50
usuários.

---

## 2. O contato: o degrau mais caro do fluxo é o mais barato de arrumar

`Match.tsx:349` mostra o contato como **texto puro**:

```tsx
<p className="mt-2 text-[17px] break-all text-paper">{outro.contato_visivel}</p>
```

Quem chegou até aqui aceitou uma troca, esperou o outro aceitar, e agora precisa
selecionar um número com o dedo, copiar, sair do app, abrir o WhatsApp, colar,
e **escrever a primeira mensagem para um estranho**. Cada um desses passos é uma
chance de desistir, e o último é o pior: abrir conversa com desconhecido é
constrangedor e a pessoa trava.

No Brasil o padrão consolidado é o *click-to-chat* — `https://wa.me/<numero>?text=<mensagem>`
— e ele existe justamente porque "fale no WhatsApp" converte muito acima de
formulário próprio. O parâmetro `text` resolve o constrangimento: a conversa já
nasce escrita.

Proposta concreta, com o que o app já sabe:

> Oi, Fulano! Vim pelo TrocaTCG. Topei nossa troca: eu te levo a **Charizard
> PGO 010** e você me traz a **Umbreon PRE 059**. Quando e onde fica bom pra
> você?

Isso nomeia as duas cartas, o que também **reduz o mal-entendido de qual carta
era** — a maior fonte de furo em troca combinada por mensagem.

Cuidados: `wa.me` precisa do número em formato internacional só com dígitos
(`5591…`), o campo `contato_visivel` hoje é texto livre, e nem todo contato é
WhatsApp. Então o botão só aparece quando o número casa com o formato; nos
outros casos, mantém o texto atual mais um botão de copiar.

**Custo:** baixo (uma função de normalização e um link). **Impacto:** alto e
direto na métrica-mãe — é o último metro antes da troca acontecer.

---

## 3. Reputação: o problema dos números pequenos

`Matches.tsx:84` e `Match.tsx:118` mostram a reputação assim:

```tsx
{outro?.reputacao != null && ` · ${outro.reputacao}% de trocas ok`}
```

E `api/app/services/profiles.py:27` calcula:

```python
def _reputacao(concluidas: int, furadas: int) -> int | None:
    total = concluidas + furadas
    return round(concluidas / total * 100) if total else None
```

Ou seja: **quem concluiu uma única troca aparece como "100% de trocas ok"** — a
mesma etiqueta de quem concluiu quarenta. E quem levou um furo logo na primeira
aparece como "0%", marcado para sempre por um evento. Porcentagem sem
denominador é o erro clássico de sistema de reputação: ela transmite uma
confiança que o dado não sustenta, nos dois sentidos.

O denominador já existe no banco (`trocas_concluidas`, `trocas_furadas`) — só
não é serializado em `ParticipanteResumo` (`api/app/schemas/match.py:13`).

Recomendação em três partes:

1. **Mostrar o N junto:** "8 de 9 trocas" em vez de "89%". Número absoluto é
   mais honesto e, com números pequenos, mais informativo.
2. **Um estado próprio para quem é novo:** abaixo de ~3 trocas, dizer *"novo por
   aqui"* em vez de uma porcentagem. Isso protege o novato (que hoje pode nascer
   com 0%) e evita crédito falso.
3. **Não deixar o furo ser unilateral e definitivo.** Hoje "A pessoa não
   apareceu" (`Match.tsx:288`) é registrável por um lado só — o que é a decisão
   certa (quem levou o furo não pode depender do outro), mas cria espaço para
   retaliação. A pesquisa da Airbnb sobre revelação simultânea mostra o caminho:
   quando o resultado só aparece depois dos dois reportarem, o índice de resposta
   sobe e a nota infla menos. Aqui, o equivalente barato é uma janela curta antes
   do furo valer, ou simplesmente **contar furo e conclusão separados na tela**,
   sem fundir tudo numa nota.

O acerto que já está de pé e vale preservar: o desfecho é **binário e mútuo**
("aconteceu" / "não apareceu"), não estrelas. Isso escapa por inteiro da inflação
de 5 estrelas que corrói a informação em quase toda plataforma de avaliação.

**Custo:** baixo (serializar dois inteiros e mudar o texto). **Impacto:** alto na
confiança, que é o que faz estranho topar encontrar estranho.

---

## 4. Justiça percebida: o buraco da raridade virou risco de confiança

Nas comunidades de Pokémon TCG, o que mais azeda troca não é condição da carta —
é **valor percebido**. Duas cartas de mesma raridade podem ter demanda muito
diferente, e a pessoa que sente que saiu perdendo não reclama: ela simplesmente
não aparece no encontro. Furo, na métrica.

Hoje a `LinhaDeTroca` coloca as duas cartas frente a frente e diz condição
(`Match.tsx:129`), mas **não dá nenhum sinal de valor ou de escassez**. As duas
cartas parecem equivalentes por estarem no mesmo par. O app está silenciosamente
sugerindo uma equivalência que ele não verificou.

Isso reposiciona um item que estava anotado como enriquecimento opcional:
`cards.raridade` é **100% nulo** hoje. Enquanto for, não há como dar nenhum sinal
de paridade. Não estou propondo preço — preço traz um mundo de problemas e
contraria o espírito de quadro de trocas de comunidade. Mas **raridade lado a
lado** ("Rara Holo" × "Comum") já deixa a assimetria visível antes do encontro, e
deixar visível é o que permite a pessoa negociar em vez de sumir.

**Custo:** alto (o enriquecimento é ~16 mil requests na TCGdex, uma por carta).
**Impacto:** médio-alto, e cresce à medida que a base cresce. Vale como projeto
próprio, rodado uma vez em lote.

### O que foi feito, e a decisão sobre o resto (2026-07-30)

O parágrafo acima envelheceu em um dia, e vale registrar em que direção.

**Preço entrou, não raridade.** O Eduardo optou pelo preço de referência da
TCGplayer (`078e9dc`), e a varredura carta a carta trouxe a raridade junto — o
caro era a requisição, e ela carregava as duas coisas. `cards.raridade` saiu de
0% para 100% do catálogo e está no banco **sem uso na tela**. A ressalva que eu
tinha feito ("preço traz um mundo de problemas") continua de pé e foi endereçada
com o desenho, não ignorada: valor em dólar, fonte declarada, e a frase de que
condição, idioma e vontade valem mais que a tabela.

**O aviso de desequilíbrio** (`eb4ba7f`) veio logo depois, quando o dado real
mostrou uma troca de **104x** entre as contas de demonstração — Dragonite V a
US$ 557 saindo por uma Drakloak a US$ 5. Ele fala dos dois lados e não bloqueia
nada. As duas travas (3x **e** US$ 5) existem porque razão sozinha grita em carta
de centavos e diferença sozinha cala em carta cara.

**A troca múltipla ficou de fora, por decisão do Eduardo.** A alternativa
considerada era deixar a pessoa acrescentar cartas do outro lado até equilibrar o
valor. Ela resolve o problema melhor que um aviso, e é a **Fase 5** do roadmap —
não uma tela, mas o motor mudando de forma: hoje ele resolve "uma carta minha por
uma sua" com um `row_number()` escolhendo o melhor par, e compensar valor vira
seleção de subconjunto (quais cartas dela somam perto de US$ 557?), com escolha
do usuário no meio, proposta e contraproposta, e `match_items` deixando de ter
dois itens fixos. Somando motor, schema, API e uma tela de composição que não
existe, é maior que tudo o que foi feito nesta rodada junto.

**O critério para voltar ao assunto** — e ele é mensurável, não é "quando
parecer": se a taxa de furo continuar alta **nas trocas que dispararam o aviso**,
o aviso não bastou e a compensação precisa ser construída dentro do app. Se cair,
a compensação já está acontecendo por fora, no WhatsApp, que é onde essas duas
pessoas vão conversar de qualquer jeito. O dado para essa conta já existe:
`matches` guarda o desfecho, e o desequilíbrio é recalculável a partir de
`match_items` e `card_prices`.

Nota de vocabulário para quando isso for construído: **"pasta"** cai na mesma
regra de "coleção" e "binder" e não pode aparecer na UI. O termo é "acrescentar à
troca".

---

## 5. Cadastro: o telefone está sendo pedido cedo demais

`CompletarCadastro.tsx` pede nome, @, WhatsApp e aceite — três campos mais
consentimento. A literatura de formulário é consistente: cada campo derruba a
conclusão em alguns pontos percentuais, e a queda de 4 para 3 campos é uma das
mais rentáveis que existem.

O telefone é, dos três, o de maior atrito: é dado pessoal, pedido **antes de a
pessoa ter visto qualquer valor** — antes de existir um match, antes de saber se
o app serve para ela. É exatamente o caso que a técnica de *progressive
profiling* recomenda adiar: pedir identidade barata primeiro, e o dado caro
quando o valor já apareceu.

E o app **já tolera a ausência**: `Match.tsx:353` tem o ramo "ainda não cadastrou
um contato". Ou seja, mover o WhatsApp para o momento do primeiro aceite não
exige inventar nada — o estado já é tratado. Melhor ainda: pedido ali, o dado
faz sentido evidente ("para o fulano falar com você"), em vez de parecer coleta
gratuita.

**Custo:** baixo. **Impacto:** médio no topo do funil, e melhora a percepção de
privacidade — que num app de encontrar estranhos não é detalhe.

---

## 6. Mecânica e acessibilidade

**Alvo de toque abaixo do mínimo.** A WCAG 2.2 (critério 2.5.8, nível AA) exige
24×24 px, e a recomendação de usabilidade é 44×44. O botão de remover carta da
bandeja do onboarding é `size-5` — **20 px** (`Onboarding.tsx`, dentro de
`BandejaSelecao`). É um alvo pequeno, num canto de miniatura, para uma ação
destrutiva. Aumentar a área de toque sem aumentar o desenho (padding invisível)
resolve.

**O que já está certo e não deve ser mexido:** a navegação inferior tem `h-16`
(64 px) e vive na zona do polegar — cerca de 75% da interação em celular é
polegar, e canto superior é a pior região de alcance em tela grande. A busca
sticky no topo é o padrão certo para uma tela que rola muito. Os filtros têm
"Limpar" (`FiltroCatalogo.tsx:105`) e a contagem "Mostrando 24 de 88" segue a
diretriz de busca facetada de mostrar resultado e controle ao mesmo tempo.

**Instalação do PWA.** Hoje o `vite-plugin-pwa` está em `autoUpdate` e não há
convite para instalar. A recomendação corrente é não usar o prompt automático do
navegador, e sim um botão próprio **depois de um momento de valor**. Aqui o
momento é óbvio: a tela de troca combinada, quando o contato acabou de aparecer.
É quando o app provou que serve.

---

## 7. Onboarding: o que a pesquisa diz sobre o que acabamos de mudar

A orientação da NN/g é direta: tutorial interrompe, não melhora desempenho de
tarefa e é esquecido rápido; instrução que precisa ser digerida **antes** de usar
o produto reduz usabilidade e deve ser evitada. Onboarding bom é aquele que quase
não existe.

A remoção da meta de 10 cartas (commit `74ca843`) vai nessa direção, e o modelo
de avaliação certo não é "quantos completaram a tela" — é retenção e uso em D1,
D7 e D30. Vale registrar desde já, porque o dado só existe se for coletado desde
o começo: **quem cadastra 1 carta volta?** Se voltar menos que quem cadastra 5,
a resposta não é reinstalar a meta, é dar motivo melhor para acrescentar a
segunda carta — que é o achado 1.

---

## Prioridade

Estado em 2026-07-30: **1, 2 e 3 implementados** (`7d7a0ff`, `9cafac6`, `1fed13a`).
O 3 nomeia quem procura, por decisão do Eduardo (`0aae1e7`) — contato segue só
depois do aceite mútuo. O **7 foi resolvido por outro caminho**: em vez de
raridade, entrou **preço da TCGplayer** na linha de troca, em Minhas cartas e na
busca, mais o aviso de troca desequilibrada (`eb4ba7f`). A varredura carta a
carta trouxe a raridade de carona — `cards.raridade` saiu de 0% para **100%** do
catálogo — e ela está no banco esperando uso. A troca múltipla, que resolveria o
desequilíbrio de vez, ficou de fora por decisão do Eduardo: é a Fase 5, e o
critério para retomá-la está no fim da seção 4.

| # | Achado | Custo | Impacto | Onde |
|---|---|---|---|---|
| 1 | Link `wa.me` com mensagem pronta | baixo | alto | `Match.tsx:349` |
| 2 | Reputação com denominador + "novo por aqui" | baixo | alto | `profiles.py:27`, `schemas/match.py:13` |
| 3 | Tela vazia vira sinal de uma ponta só | média | o maior | `Matches.tsx:154` |
| 4 | WhatsApp no 1º aceite, não no cadastro | baixo | médio | `CompletarCadastro.tsx` |
| 5 | Alvo de toque de 20 px na bandeja | baixo | médio (a11y) | `Onboarding.tsx` |
| 6 | Convite de instalação do PWA no momento certo | baixo | médio | `Match.tsx` |
| 7 | Raridade lado a lado na linha de troca | alto | médio-alto | catálogo + `LinhaDeTroca.tsx` |

Ordem sugerida: 1 e 2 primeiro (são horas, não dias, e mexem direto na troca
concluída), 3 em seguida como projeto próprio, o resto conforme der.

---

## Fontes

- [Krystal Higgins — Evaluating your new user experience](https://www.kryshiggins.com/evaluating-your-new-user-experience/)
- [NN/g — Onboarding: Skip it When Possible](https://www.nngroup.com/videos/onboarding-skip-it-when-possible/)
- [NN/g — Ecommerce Search UX, including faceted search](https://www.nngroup.com/reports/ecommerce-ux-search-including-faceted-search/)
- [The Marketplace Guide — Cold Start pattern](https://themarketplaceguide.com/patterns/cold-start/)
- [Sharetribe — How to build trust on your marketplace](https://www.sharetribe.com/academy/build-trust-marketplace/)
- [Fradkin, Grewal, Holtz & Pearson — Bias and Reciprocity in Online Reviews (Airbnb)](https://conference.nber.org/confer/2015/SI2015/PRIT/Fradkin_Grewal_Holtz_Pearson.pdf)
- [WCAG 2.2 — SC 2.5.8 Target Size (Minimum)](https://wcag22aa.org/new-criteria/target-size/)
- [Smashing Magazine — Accessible Target Sizes Cheatsheet](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/)
- [web.dev — PWA installation prompt](https://web.dev/learn/pwa/installation-prompt)
- [Elido — WhatsApp Business deep links: click-to-chat](https://elido.app/en/blog/whatsapp-business-deep-links)
- [Venture Harbour — 5 studies on how form length impacts conversion](https://ventureharbour.com/how-form-length-impacts-conversion-rates/)
- [The People's Card Shop — TCG trading etiquette](https://thepeoplescardshop.com/blog/the-ultimate-guide-to-trading-card-game-etiquette/)
