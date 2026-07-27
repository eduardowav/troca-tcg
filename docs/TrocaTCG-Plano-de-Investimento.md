# TrocaTCG — Plano de Investimento em Serviços Pagos

**Documento complementar à Documentação Técnica v2.2**
**Versão:** 1.0 · julho de 2026
**Autor:** Eduardo
**Destinatário:** decisão interna de investimento, patrocinadores e parceiros comerciais

---

## Nota sobre este documento

Este documento avalia quando e por que o TrocaTCG deve deixar de operar exclusivamente em serviços gratuitos. Ele foi escrito no formato usado para decisões de investimento: tese, números, gatilhos e riscos.

Uma ressalva de honestidade que qualquer leitor experiente cobraria: **o TrocaTCG não é um negócio de capital de risco.** É um produto de comunidade local com caminho plausível para autofinanciamento e, no melhor cenário, uma pequena operação lucrativa regional. As projeções aqui são construídas sobre essa premissa. Um documento que prometesse crescimento exponencial seria menos útil e menos crível.

O documento serve a três leitores:

1. **O próprio time** — para decidir quando gastar, com gatilhos objetivos em vez de intuição
2. **Uma loja parceira** — para entender o que patrocina e o que recebe em troca
3. **Um investidor-anjo local** — caso a operação justifique captação

**Premissa cambial:** todos os valores em dólar convertidos a **R$ 5,50/US$**. Câmbio é risco declarado na seção 9.

---

## Sumário

1. [Sumário executivo](#1-sumário-executivo)
2. [Situação atual e o que o custo zero limita](#2-situação-atual)
3. [Tese de investimento](#3-tese-de-investimento)
4. [Panorama de fornecedores](#4-panorama-de-fornecedores)
5. [Os quatro investimentos candidatos](#5-os-quatro-investimentos-candidatos)
6. [Gatilhos de decisão](#6-gatilhos-de-decisão)
7. [Modelo financeiro](#7-modelo-financeiro)
8. [Cenários](#8-cenários)
9. [Riscos](#9-riscos)
10. [Pedido de investimento e uso dos recursos](#10-pedido-de-investimento)
11. [Alternativa preferencial: patrocínio de loja](#11-alternativa-preferencial)

---

## 1. Sumário executivo

**O produto.** TrocaTCG é uma plataforma que resolve um problema específico e mal atendido: colecionadores de Pokémon TCG sabem o que têm e o que querem, mas não conseguem descobrir com quem fechar troca. O sistema calcula automaticamente trocas recíprocas — inclusive triangulares (A→B→C→A), que nenhum concorrente oferece — e mantém reputação para reduzir a taxa de trocas que furam.

**O estágio.** O MVP roda a custo de aproximadamente R$ 3,30/mês, inteiramente sobre camadas gratuitas. Isso não é limitação orçamentária: é decisão de arquitetura. Nenhum gasto é feito antes de existir evidência de uso.

**O pedido.** Este documento não pede capital imediato. Ele estabelece **quatro investimentos escalonados**, cada um destravado por um gatilho de uso mensurável, com investimento total anual entre **R$ 2.112 e R$ 21.732**, dependendo de quantos degraus o produto justificar subir.

**O ponto central.** O primeiro investimento (infraestrutura, R$ 176/mês) tem ponto de equilíbrio em **19 assinantes** ou **um único patrocinador de loja**. Esse número é o que torna a operação plausível — não a projeção de mercado.

**O que muda com investimento.** Três coisas que o produto gratuito não consegue fazer:

| Sem investimento | Com investimento |
|---|---|
| Cadastro manual de cada carta | Scanner por foto: 20 cartas em 2 min |
| Preço de referência impreciso e sem licença comercial | Preço confiável, licenciado, por acabamento |
| Um jogo (Pokémon) | Multi-jogo (Lorcana, Magic, One Piece) |
| Pausas e cold start no free tier | Operação estável 24/7 com backup |

**O risco maior não é técnico nem financeiro.** É o problema de início a frio: um app de matching sem massa crítica de usuários não gera match nenhum. Nenhum investimento em API resolve isso. Por isso a sequência proposta gasta primeiro em estabilidade, depois em aquisição, e só então em capacidade.

---

## 2. Situação atual

### 2.1 Estrutura de custo hoje

| Serviço | Papel | Plano | Custo/mês |
|---|---|---|---|
| Supabase | Banco, auth, realtime | Free | R$ 0 |
| Render | API FastAPI | Free (Hobby) | R$ 0 |
| Cloudflare Pages | PWA, CDN | Free | R$ 0 |
| TCGdex | Catálogo de cartas | Aberta | R$ 0 |
| GitHub Actions | CI, cron, backup | Free | R$ 0 |
| Resend | E-mail transacional | Free | R$ 0 |
| Sentry | Monitoramento | Free | R$ 0 |
| Domínio `.com.br` | — | — | R$ 3,30 |
| **Total** | | | **R$ 3,30** |

### 2.2 O que o custo zero está custando

Cada linha gratuita cobra um preço não financeiro. Esta é a lista honesta:

**Estabilidade.** O Supabase pausa o projeto após 7 dias de inatividade e o Render hiberna após 15 minutos. Ambos são contornados por cron de keep-alive, mas o contorno é frágil: se o workflow falhar silenciosamente num fim de semana, o app sai do ar e ninguém percebe. Além disso, o free tier do Supabase **não tem backup automático** — o backup é um dump diário próprio, que funciona, mas cuja restauração nunca foi testada em situação real.

**Precisão de preço.** O catálogo gratuito fornece preço de referência com precisão reconhecidamente limitada. A própria documentação da TCGdex admite que, em alguns casos, duas impressões diferentes do mesmo Pokémon acabam mapeadas para o mesmo anúncio de marketplace, exibindo preços idênticos. Para o TrocaTCG isso importa diretamente: o preço alimenta a penalidade de desequilíbrio do matching. Preço errado gera sugestão de troca injusta, e sugestão injusta corrói a confiança no feed.

**Licença comercial.** Este é o ponto que mais frequentemente passa despercebido e que um investidor cobraria. Várias APIs de preço restringem uso comercial aos planos superiores. A PokemonPriceTracker, por exemplo, autoriza uso comercial exclusivamente no plano Business. Enquanto o TrocaTCG não cobra nada, opera em zona confortável. **No dia em que ligar a assinatura paga, a licença deixa de ser detalhe e vira requisito.**

**Atrito de cadastro.** Hoje o usuário digita carta por carta. Esse é o maior ponto de abandono previsto do produto, e o único jeito de resolver de verdade é reconhecimento por imagem — que não existe em versão gratuita utilizável.

**Escopo de um jogo.** A decisão de lançar só com Pokémon é correta para densidade de rede, mas fecha a porta para a parcela da comunidade que joga Lorcana e Magic.

### 2.3 O que o custo zero está entregando bem

Vale registrar o outro lado, porque ele sustenta a tese de não gastar cedo demais:

- O catálogo de cartas em português é gratuito e de boa qualidade — a TCGdex cobre PT-BR, o que nenhuma alternativa paga faz melhor para o mercado brasileiro
- O matching, que é o coração do produto, roda em SQL e Python próprios: **nenhum fornecedor pago melhora o algoritmo**
- A taxonomia de acabamentos é dado proprietário, construído por regra e curadoria da comunidade. Nenhuma API gratuita ou paga entrega isso pronto

Em outras palavras: **o diferencial competitivo do produto já está construído e não depende de fornecedor pago.** O investimento compra conveniência, estabilidade e alcance — não a vantagem central.

---

## 3. Tese de investimento

A tese se apoia em três afirmações, em ordem de importância.

**1. O gargalo do produto é aquisição e retenção, não capacidade técnica.**
Um app de matching vale exatamente o tamanho e a densidade da sua rede. Cem usuários com 50 cartas cada geram mais valor que dez usuários com 500. Portanto, o investimento com maior retorno é o que **reduz atrito de entrada** — o scanner de cartas — e não o que aumenta sofisticação de dados.

**2. Estabilidade precede tudo.**
Cobrar assinatura de um serviço que hiberna e pode pausar sozinho é insustentável, e nem é uma questão de imagem: é a base contratual. No momento em que existe um assinante pagante, existe uma expectativa de disponibilidade. Por isso a infraestrutura é o primeiro degrau, não o segundo.

**3. Cada gasto deve ser destravado por evidência, nunca por calendário.**
A arquitetura foi desenhada para que cada fornecedor pago seja trocável — o sync de catálogo é isolado atrás de uma interface, o gate de plano está centralizado numa única camada de limites. Isso significa que **adiar um investimento não gera dívida técnica**, e antecipá-lo não gera vantagem. A decisão pode ser puramente econômica.

### O que não é a tese

Vale ser explícito sobre o que este documento **não** afirma, porque promessas infladas destroem credibilidade:

- Não afirma que o mercado de TCG cresce e que isso beneficia automaticamente o produto. Mercado grande com rede vazia continua valendo zero
- Não afirma que APIs pagas geram receita. Elas geram capacidade; receita vem de usuários dispostos a pagar, e isso ainda não está provado
- Não projeta expansão nacional. A tese é comunidade local de Belém, com replicação para outras cidades apenas se o modelo funcionar em uma

---

## 4. Panorama de fornecedores

Levantamento de julho de 2026. Preços em dólar convertidos a R$ 5,50.

### 4.1 Catálogo de cartas

| Fornecedor | Plano de entrada | Custo/mês | PT-BR | Situação |
|---|---|---|---|---|
| **TCGdex** (atual) | Aberta, sem chave | R$ 0 | ✅ | Open source, comunidade ativa |
| Scrydex | Starter, 5.000 créditos | US$ 29 → R$ 160 | ❌ | Sem free tier |
| Scrydex Growth | 50.000 créditos | US$ 99 → R$ 545 | ❌ | Excedente US$ 0,002/crédito |
| Scrydex Professional | 250.000 créditos | US$ 399 → R$ 2.195 | ❌ | — |
| pokemontcg.io | Chave gratuita | R$ 0 | ❌ | Sucedida pela Scrydex; free tier em risco |

**Leitura:** para catálogo puro em português, **não há motivo para pagar.** A TCGdex entrega o que o produto precisa. A Scrydex só se justifica pelos serviços adjacentes (Vision, preço graduado, multi-jogo), não pelo catálogo em si.

### 4.2 Preço de mercado

| Fornecedor | Plano | Custo/mês | Uso comercial | Observação |
|---|---|---|---|---|
| TCGdex (embutido) | — | R$ 0 | Aberto | Precisão limitada, admitida na documentação |
| PokemonPriceTracker | API | US$ 9,99 → R$ 55 | ❌ **Não autorizado** | 20.000 créditos/dia |
| PokemonPriceTracker | Business | US$ 99 → R$ 545 | ✅ Autorizado | 200.000 créditos/dia, população PSA, export CSV |
| JustTCG | Free / pagos | Escalonado | Verificar em contrato | Preço por condição, mistura listagens e vendas reais em loja |
| TCGplayer | — | — | — | **Inacessível**: aplicação pública fechada a novos desenvolvedores |

**Leitura:** o salto relevante não é de qualidade, é de **licença**. O plano de US$ 9,99 é tentador e tecnicamente suficiente, mas não autoriza uso comercial. No momento em que houver receita, o degrau é o Business a US$ 99/mês — dez vezes mais caro pela mesma função. Esse é o dado mais importante desta seção e precisa ser considerado antes de ligar qualquer cobrança.

Vale registrar também que a TCGplayer, historicamente a fonte de referência do setor, está fora de alcance: o processo público de credenciamento foi fechado e o acesso hoje se restringe a parceiros e grandes vendedores estabelecidos.

### 4.3 Reconhecimento de carta por imagem

| Fornecedor | Modelo | Custo | Observação |
|---|---|---|---|
| Scrydex Vision | Incluído nos planos | A partir de US$ 29 | 5 créditos por chamada de Vision |
| CardGrader.AI | Por uso | Sob consulta | Identificação, grading e valor por foto |
| Solução própria | — | — | Inviável no horizonte deste projeto |

**Leitura:** essa é a única categoria em que pagar destrava uma capacidade **inexistente** na versão gratuita. Todas as outras compram grau; esta compra função.

Atenção ao consumo: no modelo da Scrydex, uma chamada de Vision consome cinco créditos. No plano Starter de 5.000 créditos, isso significa aproximadamente **mil escaneamentos por mês** — o que atende bem uma base pequena, mas se esgota rápido num evento de cadastro presencial com dezenas de pessoas escaneando ao mesmo tempo.

### 4.4 Infraestrutura

| Serviço | Plano atual | Plano pago | Custo/mês | O que resolve |
|---|---|---|---|---|
| Supabase | Free | Pro | US$ 25 → R$ 138 | Fim da pausa por inatividade, backup diário, 8 GB, 250 GB de banda |
| Render | Free | Starter | US$ 7 → R$ 39 | Fim da hibernação e do cold start |
| Sentry | Free | Team | US$ 26 → R$ 143 | Só necessário acima de 5.000 eventos/mês |
| Resend | Free | Pro | US$ 20 → R$ 110 | Só necessário acima de 3.000 e-mails/mês |

**Leitura:** os dois primeiros são os únicos que importam no curto prazo, e somam **R$ 176/mês**. Sentry e Resend continuam gratuitos por bastante tempo.

---

## 5. Os quatro investimentos candidatos

Cada investimento tem ficha própria: o que resolve, quanto custa, o que destrava, como se mede o retorno e qual o risco de fazer cedo demais.

---

### Investimento 1 — Infraestrutura estável

**Custo:** R$ 176/mês · R$ 2.112/ano
**Composição:** Supabase Pro (US$ 25) + Render Starter (US$ 7)
**Gatilho:** primeiro assinante pagante **ou** primeiro contrato de patrocínio

#### O problema que resolve

Três falhas do free tier que só aparecem quando alguém depende do serviço:

1. O projeto Supabase pausa após 7 dias sem atividade e volta apenas com religamento manual
2. A API hiberna após 15 minutos, com cold start de 30 a 60 segundos
3. Não existe backup automático — perda de dados seria permanente

O contorno atual (keep-alive por cron) funciona, mas é uma dependência frágil: um workflow que falha em silêncio derruba o produto sem alarme.

#### O que destrava

Nada de novo em funcionalidade. Destrava **o direito de cobrar**. Não é razoável — nem sustentável contratualmente — vender assinatura de um serviço que pode sair do ar sozinho e cujo dado não tem cópia de segurança gerenciada.

#### Retorno

| Métrica | Valor |
|---|---|
| Ponto de equilíbrio em assinantes (R$ 9,90) | **19 assinantes** |
| Ponto de equilíbrio em patrocínio | **1 loja** (R$ 200/mês) |
| Payback | Imediato ao atingir o gatilho |

#### Risco de antecipar

Baixo em valor absoluto (R$ 176), mas é queima de caixa sem contrapartida enquanto não houver receita. **Não faça antes do gatilho.** O keep-alive cobre bem a fase pré-receita.

---

### Investimento 2 — Scanner de cartas por foto

**Custo:** R$ 160/mês (Scrydex Starter) a R$ 545/mês (Growth) · R$ 1.914 a R$ 6.534/ano
**Gatilho:** taxa de conclusão do onboarding abaixo de 60% **ou** média de cartas por usuário ativo abaixo de 20

#### O problema que resolve

O maior ponto de abandono previsto do produto. Hoje o usuário digita carta por carta, e a meta de onboarding — 10 cartas em menos de 2 minutos — é otimista para quem tem um binder inteiro para cadastrar.

Isso não é questão de conforto. É questão de existência da rede: **abaixo de 20 cartas por usuário, o matching praticamente não encontra reciprocidade.** Um usuário que cadastra 5 cartas e não vê nenhum match não volta, e ainda reduz a densidade da rede para todos os outros.

#### O que destrava

A única capacidade genuinamente nova de toda a lista. Escanear uma pilha de cartas pela câmera transforma o cadastro de tarefa em atividade rápida — e viabiliza o cenário que mais importa: **cadastro assistido presencial no dia do lançamento**, com dezenas de pessoas entrando na plataforma em uma tarde.

#### Retorno

O retorno é indireto e por isso precisa de medição explícita. A hipótese: scanner eleva a média de cartas por usuário de ~15 para ~60, o que multiplica a quantidade de matches possíveis de forma mais que proporcional — em uma rede de trocas, dobrar o número de cartas por participante mais que dobra os pares recíprocos possíveis.

**Como medir:** compare a taxa de conclusão do onboarding e a média de cartas por usuário nos 30 dias antes e depois. Se a média não subir pelo menos 50%, cancele. O plano é mensal e sem fidelidade — essa reversibilidade é parte da tese.

#### Risco de antecipar

**Alto.** É o investimento mais caro por unidade de valor comprovado, e é fácil se apaixonar por ele antes de ter usuários. Com 20 usuários, scanner é brinquedo caro. Com 200, é infraestrutura de crescimento.

Há ainda um risco de consumo: 5 créditos por escaneamento significa ~1.000 escaneamentos no plano Starter. Um evento de lançamento com 40 pessoas cadastrando 50 cartas cada consumiria 2.000 escaneamentos — **quatro vezes o plano**. Se o objetivo for eventos, o plano correto é o Growth, não o Starter.

---

### Investimento 3 — Preço licenciado e confiável

**Custo:** R$ 545/mês (PokemonPriceTracker Business) · R$ 6.534/ano
**Gatilho:** **obrigatório** ao ligar cobrança de assinatura. Antes disso, opcional.

#### O problema que resolve

Dois problemas, sendo um deles não negociável.

**O negociável:** precisão. O preço gratuito alimenta a penalidade de desequilíbrio do matching. Quando duas impressões da mesma carta recebem o mesmo preço, o algoritmo sugere trocas injustas — e com a taxonomia de acabamentos do produto (Master Ball valendo múltiplos do reverse comum), a imprecisão fica visível para o usuário.

**O não negociável:** licença. Vários fornecedores restringem uso comercial ao plano superior. Enquanto o produto for gratuito, a exposição é baixa. **Com receita, isso vira requisito contratual**, e é o tipo de detalhe que só aparece quando alguém decide olhar.

#### O que destrava

- Equilíbrio de troca confiável, por acabamento e condição
- Base legal limpa para operar comercialmente
- Dados de população PSA e exportação em massa, úteis para funcionalidades futuras

#### Retorno

Difícil de atribuir isoladamente, e é honesto dizer isso. O retorno real é **redução da taxa de recusa de match por desequilíbrio** — métrica que o produto já registra em `match_events` e que deve ser acompanhada desde o início para justificar (ou desmentir) esse gasto.

#### Risco de antecipar

Médio. R$ 545/mês é o segundo maior item da lista e não muda nada perceptível para o usuário. Só faz sentido quando existe receita a proteger.

**Alternativa mais barata:** avaliar o JustTCG antes de fechar com o plano Business. Ele oferece preço por condição e mistura listagens on-line com vendas reais em loja física — o que é conceitualmente mais próximo do preço praticado numa troca presencial em Belém do que o preço de marketplace americano. **Recomendação: cotar diretamente e comparar antes de decidir.**

---

### Investimento 4 — Expansão multi-jogo

**Custo:** R$ 545/mês (Scrydex Growth) · R$ 6.534/ano
**Gatilho:** base estável acima de 500 usuários ativos **e** taxa de conclusão de trocas acima de 70% **e** demanda registrada por outro jogo

#### O problema que resolve

Nenhum problema atual. Resolve um limite de mercado: hoje o produto atende apenas jogadores de Pokémon.

#### O que destrava

Catálogo unificado de Pokémon, Lorcana, Magic, One Piece, Gundam e Riftbound em uma única API — o que evita integrar quatro fornecedores diferentes.

#### Retorno

Ampliação do mercado endereçável local. Em Belém, a comunidade de Lorcana é menor que a de Pokémon, mas há sobreposição relevante de pessoas.

#### Risco de antecipar

**O mais alto dos quatro, e por um motivo contraintuitivo:** adicionar um segundo jogo antes da hora **divide a base pela metade** exatamente quando ela é pequena demais para funcionar. Duas redes ralas valem menos que uma rede densa. Este investimento é o último da fila por razão estrutural, não orçamentária.

---

### Quadro-resumo

| # | Investimento | Custo/mês | Custo/ano | Gatilho | Prioridade |
|---|---|---|---|---|---|
| 1 | Infraestrutura | R$ 176 | R$ 2.112 | 1º pagante ou patrocínio | **Alta** |
| 2 | Scanner de cartas | R$ 160–545 | R$ 1.914–6.534 | Onboarding < 60% | **Alta** |
| 3 | Preço licenciado | R$ 545 | R$ 6.534 | Ao ligar cobrança | Média (obrigatório condicional) |
| 4 | Multi-jogo | R$ 545 | R$ 6.534 | 500+ usuários ativos | Baixa |
| | **Total máximo** | **R$ 1.426–1.811** | **R$ 17.112–21.732** | | |

A faixa do total depende de qual plano de scanner for usado (Starter ou Growth).

**Cenário realista de 12 meses:** investimentos 1 e 2 apenas — entre **R$ 4.026 e R$ 8.646/ano**.

---

## 6. Gatilhos de decisão

A regra central deste documento: **nenhum investimento é liberado por data, apenas por métrica.** Isso protege contra o erro mais comum em projeto pequeno, que é gastar por entusiasmo antes da validação.

### 6.1 Painel de decisão

Todas as métricas já são registradas em `match_events` e nas tabelas do produto. Nenhuma exige ferramenta paga.

| Métrica | Onde medir | Libera |
|---|---|---|
| Primeiro assinante pagante | `profiles.plano = 'PRO'` | Investimento 1 |
| Primeiro contrato de patrocínio | Externo | Investimento 1 |
| Taxa de conclusão do onboarding < 60% | `profiles.onboarding_ok` | Investimento 2 |
| Cartas por usuário ativo < 20 | `listings` por `user_id` | Investimento 2 |
| Decisão de ligar cobrança | Interna | Investimento 3 (obrigatório) |
| Recusa por desequilíbrio > 25% | `match_events` motivo | Investimento 3 |
| 500+ usuários ativos por 60 dias | `profiles.ultimo_acesso_em` | Investimento 4 |
| Taxa de conclusão de trocas > 70% | `match_events` | Investimento 4 |

### 6.2 Gatilhos de saída

Tão importantes quanto os de entrada, e frequentemente esquecidos. Todo plano é mensal e sem fidelidade; a reversibilidade é parte da tese de baixo risco.

| Situação | Ação |
|---|---|
| Scanner não elevou cartas/usuário em 50% após 60 dias | Cancelar Investimento 2 |
| Assinantes abaixo do ponto de equilíbrio por 3 meses seguidos | Reavaliar cobrança; considerar voltar ao free tier |
| Segundo jogo abaixo de 15% dos anúncios após 90 dias | Cancelar Investimento 4 |
| Câmbio acima de R$ 7,00/US$ | Recotar tudo; priorizar fornecedor nacional |

### 6.3 A métrica-mãe

Acima de todas: **taxa de conclusão de trocas** = `CONCLUÍDO / (CONCLUÍDO + FURADO + EXPIRADO)`.

Se essa métrica não estiver saudável, **nenhum investimento em API resolve**. Trocas que furam são problema de comunidade e de reputação, não de dados. Gastar com fornecedor enquanto essa taxa está baixa é tratar sintoma errado.

---

## 7. Modelo financeiro

### 7.1 Premissas declaradas

| Premissa | Valor | Base |
|---|---|---|
| Câmbio | R$ 5,50/US$ | Premissa conservadora |
| Preço da assinatura | R$ 9,90/mês | Definido na documentação técnica |
| Taxa de pagamento | ~6% | Mercado Pago, assinatura recorrente e PIX |
| Receita líquida por assinante | R$ 9,31 | R$ 9,90 − 6% |
| Conversão para plano pago | 3% a 8% dos ativos | Faixa típica de freemium; **não validada** |
| Patrocínio de loja | R$ 100 a R$ 200/mês | Estimativa para o mercado de Belém |

A taxa de conversão é a premissa mais frágil de todo o documento e deve ser tratada como hipótese a testar, não como dado.

### 7.2 Pontos de equilíbrio

| Configuração | Custo/mês | Assinantes necessários | Ou lojas patrocinadoras |
|---|---|---|---|
| Investimento 1 | R$ 176 | 19 | 1 |
| Investimentos 1+2 (Starter) | R$ 336 | 36 | 2 |
| Investimentos 1+2 (Growth) | R$ 720 | 77 | 4 |
| Investimentos 1+2+3 | R$ 1.267 | 137 | 7 |
| Todos os quatro (scanner Starter) | R$ 1.426 | 153 | 8 |

### 7.3 Leitura desses números

O primeiro degrau é modesto: **19 assinantes ou uma loja**. Isso é alcançável numa comunidade local ativa e é o número que torna o projeto plausível.

O último degrau é outra coisa: **153 assinantes** exige, a 5% de conversão, uma base de **cerca de 3.000 usuários ativos** — o que ultrapassa com folga a comunidade de Belém e implicaria expansão para outras cidades.

A conclusão prática é direta e vale mais que qualquer projeção: **os investimentos 3 e 4 provavelmente nunca serão justificados por assinatura individual.** Se forem viabilizados, será por receita de patrocínio ou por expansão geográfica — e ambas são decisões de outra natureza, que exigiriam um documento próprio.

### 7.4 Estrutura de custo por usuário

| Base de usuários ativos | Custo mensal | Custo por usuário |
|---|---|---|
| 100 | R$ 176 | R$ 1,76 |
| 500 | R$ 336 | R$ 0,67 |
| 1.000 | R$ 720 | R$ 0,72 |
| 3.000 | R$ 1.426 | R$ 0,48 |

O custo por usuário cai com escala, como esperado, mas nunca chega perto de zero — a estrutura tem piso fixo alto em relação ao ticket. Este é um negócio de margem apertada em escala pequena, e é assim que deve ser apresentado.

---

## 8. Cenários

Horizonte de 12 meses a partir do lançamento.

### Cenário conservador — "comunidade local, sem receita"

| | |
|---|---|
| Usuários ativos ao fim de 12 meses | 80 |
| Assinantes | 0 |
| Patrocínio | 0 |
| Investimento realizado | Nenhum |
| Custo total no ano | **R$ 40** (domínio) |
| Resultado | Produto de portfólio funcional, com usuários reais |

Neste cenário **nada se investe**, e isso não é fracasso. O produto continua no ar, gratuito, servindo como peça de portfólio com uso real comprovado. Para o objetivo declarado de conseguir uma primeira vaga, "20 trocas concluídas por usuários reais" vale mais numa entrevista do que qualquer stack no currículo.

### Cenário base — "uma loja parceira"

| | |
|---|---|
| Usuários ativos | 250 |
| Assinantes | 8 (3,2%) |
| Patrocínio | 1 loja, R$ 150/mês |
| Receita mensal | R$ 224 |
| Investimentos | 1 e 2 (Starter) |
| Custo mensal | R$ 336 |
| Resultado mensal | **−R$ 111** |
| Resultado anual | **−R$ 1.332** |

Operação deficitária, mas em ordem de grandeza tratável — comparável a uma assinatura de curso. O produto se paga parcialmente e o déficit é o custo de aprender. **Este é o cenário mais provável.**

### Cenário otimista — "duas lojas e tração local"

| | |
|---|---|
| Usuários ativos | 600 |
| Assinantes | 35 (5,8%) |
| Patrocínio | 2 lojas, R$ 150/mês cada |
| Receita mensal | R$ 626 |
| Investimentos | 1 e 2 (Growth) |
| Custo mensal | R$ 720 |
| Resultado mensal | **−R$ 94** |
| Resultado anual | **−R$ 1.128** |

Observação relevante e um pouco desconfortável: mesmo no cenário otimista a operação **não fecha no azul**. O motivo é o salto do plano Growth, que dobra o custo do scanner. A leitura correta não é desistir, e sim: **negociar patrocínio acima de R$ 200/mês ou buscar uma terceira loja.** Com três lojas a R$ 200, o cenário otimista fica positivo.

### O que os três cenários dizem juntos

O projeto não se sustenta por assinatura individual numa comunidade do tamanho de Belém. **A receita viável é patrocínio de loja.** Isso não é uma má notícia — é o modelo que já estava indicado na documentação técnica, e agora está confirmado por números.

---

## 9. Riscos

### 9.1 Matriz

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| **Início a frio** — rede sem massa crítica | Crítico | Alta | Nenhum investimento resolve. Lançamento presencial em dia de torneio, com cadastro assistido |
| **Conversão abaixo do previsto** | Alto | Alta | A premissa de 3–8% não está validada. Priorizar patrocínio sobre assinatura |
| **Fornecedor encerra free tier** | Médio | Alta | Já ocorreu duas vezes no levantamento: Fly.io em 2024 e pokemontcg.io em 2026. Camada de abstração no sync; catálogo em cache local |
| **Licença comercial inadequada** | Alto | Média | Verificar termos **antes** de ligar cobrança, não depois. Detalhado na seção 4.2 |
| **Alta do dólar** | Médio | Média | Todos os fornecedores são internacionais. A R$ 7,00/US$ o custo máximo sobe de R$ 1.426 para R$ 1.815/mês |
| **Scanner não entrega o ganho previsto** | Médio | Média | Gatilho de saída em 60 dias com métrica objetiva |
| **Patrocinador desiste** | Alto | Média | Contrato de 6 meses; não depender de uma única loja |
| **Marca (Nintendo / The Pokémon Company)** | Médio | Baixa | Sem logos oficiais, sem "Pokémon" no nome, disclaimer de não-afiliação visível |
| **Tempo do fundador** | Alto | Alta | Projeto conduzido em paralelo a estudos. Escopo enxuto é a mitigação |

### 9.2 O risco que merece destaque

**Concentração em um único fornecedor internacional.**

O levantamento mostrou dois encerramentos de camada gratuita em menos de dois anos, ambos afetando diretamente a arquitetura planejada. O padrão é claro o suficiente para ser tratado como premissa, não como acidente: **camadas gratuitas de infraestrutura tendem a encolher.**

A mitigação já está na arquitetura e é o que torna esse risco administrável:

- O catálogo tem cache local completo — se a fonte cair hoje, o produto continua funcionando e apenas para de receber sets novos
- O sync está isolado atrás de uma interface; trocar de fornecedor é escrever um arquivo, não refatorar
- A API roda em container padrão; migrar de hospedagem custa horas
- O dado proprietário do projeto — a taxonomia de acabamentos — **não depende de fornecedor nenhum**

### 9.3 O risco de não investir

Para equilibrar a análise: manter tudo gratuito também tem custo. O produto opera com contornos frágeis (keep-alive por cron, backup não testado em situação real), cadastro manual que afasta usuários, e sem base contratual para cobrar. Se o gatilho for atingido e o investimento não for feito, **o risco migra de financeiro para reputacional** — um serviço que cai é pior que um serviço que não existe.

---

## 10. Pedido de investimento

### 10.1 O que se pede

**Nada imediatamente.** O produto opera hoje a R$ 3,30/mês e deve permanecer assim até que os gatilhos da seção 6 sejam atingidos.

Para quando forem, o pedido é escalonado:

| Fase | Valor | Quando | Fonte pretendida |
|---|---|---|---|
| Fase A | R$ 2.112/ano | Primeiro pagante ou patrocínio | Receita própria |
| Fase B | R$ 1.914–6.534/ano | Onboarding travando | Patrocínio de loja |
| Fase C | R$ 6.534/ano | Ao ligar cobrança | Receita de assinatura |
| Fase D | R$ 6.534/ano | 500+ ativos | Receita consolidada |

### 10.2 Uso dos recursos

Se houver aporte externo de **R$ 5.000** para os primeiros 12 meses, a alocação seria:

| Item | Valor | % |
|---|---|---|
| Infraestrutura (Investimento 1, 12 meses) | R$ 2.112 | 42% |
| Scanner de cartas (Investimento 2 Starter, 6 meses) | R$ 960 | 19% |
| Evento de lançamento (material, brindes, parceria com loja) | R$ 800 | 16% |
| Domínio, reserva de câmbio e contingência | R$ 628 | 13% |
| Reserva operacional | R$ 500 | 10% |
| **Total** | **R$ 5.000** | **100%** |

Repare que **16% vão para aquisição presencial, não para tecnologia.** Isso é deliberado e é a recomendação central deste documento: com uma rede vazia, o evento de lançamento tem retorno maior que qualquer API.

### 10.3 O que o investidor recebe

Sendo direto sobre a natureza do projeto: **esta não é uma oportunidade de retorno financeiro convencional.** A operação, nos cenários modelados, opera próxima do equilíbrio ou em déficit leve.

O que se oferece a um apoiador:

- **Loja parceira:** presença como ponto de encontro sugerido no app, selo de patrocinadora, e fluxo de colecionadores levados à loja para concretizar trocas — que é a contrapartida concreta e mensurável
- **Investidor local:** participação numa operação de comunidade com custo baixo e risco limitado ao valor aportado
- **Transparência:** todas as métricas do painel da seção 6.1 abertas ao apoiador, com relatório mensal

### 10.4 A pergunta que um investidor faria primeiro

*"Por que isso não foi feito ainda, se o problema é tão claro?"*

Resposta honesta: **foi tentado, de outro jeito.** Existem vários aplicativos de coleção bem construídos, e todos catalogam. Nenhum resolve o encontro entre duas pessoas com interesses recíprocos, porque catalogação é um problema de banco de dados e matching é um problema de rede local — que exige presença física numa comunidade específica para funcionar.

É exatamente aí que um projeto pequeno e local tem vantagem sobre um app internacional bem financiado: **a rede densa de uma cidade vale mais que a rede rala do mundo inteiro.**

---

## 11. Alternativa preferencial

### Patrocínio de loja em vez de assinatura

Os números da seção 7 apontam para uma conclusão que vale declarar sem rodeios: **assinatura individual provavelmente não sustenta este produto em Belém.** Trinta e sete assinantes exigem, a 5% de conversão, 740 usuários ativos — plausível, mas exigente para o primeiro ano.

O patrocínio de loja é superior por quatro motivos:

1. **Ticket maior.** Uma loja a R$ 200/mês equivale a 21 assinantes
2. **Venda mais simples.** Convencer um dono de loja é uma conversa; convencer 21 pessoas é uma campanha
3. **Interesse alinhado.** A loja ganha fluxo de gente que vai até lá concretizar troca. É contrapartida real, não caridade
4. **Não limita a rede.** Manter o app inteiramente gratuito preserva o efeito de rede, que é o ativo do produto

### Proposta comercial sugerida

| Item | Valor |
|---|---|
| Patrocínio mensal | R$ 150 a R$ 250 |
| Contrato mínimo | 6 meses |
| Contrapartidas | Selo de loja parceira; ponto de encontro sugerido no app; destaque em eventos de cadastro; relatório mensal de trocas concretizadas na loja |

**Meta:** três lojas parceiras. Com R$ 600/mês de receita recorrente, os investimentos 1 e 2 ficam cobertos com folga, e o produto permanece gratuito para todos os usuários — que é o desenho ideal.

### Implicação para o roadmap

Se essa via for a principal, a prioridade dos investimentos muda:

- **Sobe:** Investimento 2 (scanner), porque cadastro assistido em evento na loja é a contrapartida mais visível ao patrocinador
- **Cai:** Investimento 3 (preço licenciado), porque a exigência de licença comercial se aplica à cobrança de usuários, não a patrocínio de exibição — mas **confirme os termos de cada fornecedor antes de assumir isso**
- **Some do horizonte:** Investimento 4 (multi-jogo), a menos que uma loja parceira atenda comunidades de outros jogos e peça a expansão

---

## Apêndice — Resumo de uma página

| | |
|---|---|
| **Custo atual** | R$ 3,30/mês |
| **Primeiro investimento** | R$ 176/mês — infraestrutura estável |
| **Ponto de equilíbrio inicial** | 19 assinantes **ou** 1 loja patrocinadora |
| **Investimento máximo** | R$ 1.426/mês (R$ 17.112/ano) |
| **Cenário realista de 12 meses** | R$ 4.026 a R$ 8.646 |
| **Receita mais provável** | Patrocínio de loja, não assinatura |
| **Meta de sustentabilidade** | 3 lojas a R$ 200/mês |
| **Maior risco** | Início a frio — não se resolve com dinheiro |
| **Maior oportunidade** | Scanner de cartas: única capacidade que só o investimento destrava |
| **Regra de ouro** | Nenhum gasto antes do gatilho correspondente |

### As três frases que resumem o documento

1. O produto já tem seu diferencial construído — matching triangular, reputação e taxonomia de acabamentos são código próprio e **não dependem de fornecedor pago**.
2. O investimento compra estabilidade, conveniência e alcance; **não compra vantagem competitiva**.
3. O gargalo real é rede vazia, e a solução para isso é presencial, não contratual — **R$ 800 num evento de lançamento rendem mais que R$ 6.534/ano numa API**.
