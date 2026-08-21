# Segurança do TrocaTCG

Auditoria de **2026-08-18**: superfície, modelo de ameaças, achados, correções,
testes e riscos residuais. Substitui a necessidade de seis documentos separados —
o projeto concentra decisão de segurança aqui e na seção 17 da doc técnica, e
seis cópias do mesmo assunto divergem antes de completar um mês.

A varredura anterior, de 2026-08-11, **leu os arquivos**. Esta **exercitou o
sistema**: consulta com JWT de gente de verdade contra o banco de produção,
chamadas fora de ordem, transações concorrentes. Toda a diferença entre as duas
listas de achados vem daí, e essa é a lição de método que vale mais que qualquer
item individual — proteção conferida por leitura é proteção não conferida.

---

## 1. Resumo executivo

Nove achados. Oito corrigidos, um aceito como risco residual explícito.

| ID | Severidade | Achado | Status |
|---|---|---|---|
| F-00a | **HIGH** | Policies do match recursavam infinito desde julho — a rede de segurança do RLS nunca existiu ali | ✅ corrigido |
| F-00b | MEDIUM | Seis tabelas antigas com `grant all` para `anon`/`authenticated`; tabela nova nascia aberta | ✅ corrigido |
| F-01 | **HIGH** | `responder` sem guarda de estado: dava para reviver match expirado e apagar troca concluída | ✅ corrigido |
| F-02 | MEDIUM | Corrida em `confirmar_conclusao`: reputação inflável e baixa de estoque dobrada | ✅ corrigido |
| F-03 | MEDIUM | Enumeração de e-mail no cadastro | ⚠️ mitigado; causa raiz é risco residual |
| F-04 | MEDIUM | Rate limit da API não cobre autenticação | ⚠️ documentado; ações de painel pendentes |
| F-05 | LOW | Webhook do Mercado Pago sem janela de frescor | ✅ corrigido |
| F-06 | LOW | Teto de propostas por dia furável por concorrência | ✅ corrigido |
| F-07 | LOW | CI sem SAST nem varredura de dependência | ✅ corrigido |
| F-08 | LOW | `react-router` com dois CVEs moderados | ⚠️ avaliado como não alcançável |
| F-09 | LOW | `vite` com CVEs de dev server, relevante ao testar no celular pela rede | ⚠️ documentado |

**Nada bloqueia o lançamento hoje.** Os dois HIGH estão fechados e com teste. O
que sobra pendente é ação de painel (F-04) e decisão de produto (F-03).

---

## 2. Superfície de ataque

### Fronteiras de confiança

```
Navegador — PWA React/Vite, sessão do Supabase em localStorage
   │
   ├──► Supabase Auth        login, cadastro, reset  ◄── NÃO passa pela nossa API
   ├──► Supabase PostgREST   só leitura: catálogo + profiles (grant por coluna)
   │       └─ Realtime em `notifications`, filtrado por RLS
   └──► API FastAPI (Render, virginia)
           └──► Postgres (Supabase, sa-east-1)
                 conexão como owner: ignora RLS e grants por desenho

GitHub Actions ──X-Job-Secret──► /v1/internal/jobs/*
Mercado Pago  ──x-signature───► /v1/webhooks/mercadopago
```

**A fronteira que não estava escrita em lugar nenhum: autenticação não é nossa.**
Login, cadastro e recuperação falam direto com `qbdtcpotehvbkozppmyu.supabase.co`.
Nosso rate limit, nossos logs e nossas regras não veem esse tráfego. Toda análise
de força bruta, enumeração e política de senha deste documento parte daí.

### Rotas

| Grupo | Autenticação | Observação |
|---|---|---|
| `/v1/health` | pública | isenta do rate limit — um 429 aqui derruba o deploy |
| `/v1/planos` | pública | tabela de preço; quem não tem conta olha |
| `/v1/webhooks/mercadopago` | HMAC | quem chama é servidor, não tem sessão |
| `/v1/internal/jobs/*` | `X-Job-Secret` | `compare_digest`; sem segredo, 503 |
| `/v1/me/*`, `/v1/matches/*`, `/v1/propostas/*`, `/v1/vitrine/*` | `usuario_atual` | barra conta bloqueada |
| `GET /v1/me` e `DELETE /v1/me` | `usuario_da_sessao` | as duas exceções declaradas |

**Não existe painel administrativo.** A moderação é SQL manual em
`db/queries/moderacao.sql` — não há superfície a endurecer, e isso é uma decisão
de arquitetura, não uma lacuna.

### Dados sensíveis

`contato_visivel` (WhatsApp) é o dado que o produto inteiro protege. Sai por uma
única porta — `POST /v1/matches/{id}/contato` — e só com o match em
`ACEITO`/`CONCLUIDO` **e** o aceite da isenção gravado. Fora do alcance da anon
key por grant de coluna (`11_grants.sql`).

---

## 3. Modelo de ameaças

Por ator, com a pergunta que cada um obriga a responder.

| Ator | O que quer | O que o impede |
|---|---|---|
| Anônimo com a anon key | a base de contatos | grant por coluna tira `contato_visivel`; `/u/{username}` exige login |
| Usuário autenticado | os dados de outro | dono no `where` de toda consulta; RLS como segunda camada |
| Usuário bloqueado | continuar agindo | trava em `usuario_atual`, com duas exceções declaradas |
| Participante de uma troca | reescrever o desfecho | **era o F-01** — hoje, guarda de estado + trava de linha |
| Quem clica duas vezes | inflar a própria reputação | **era o F-02** — hoje, `rowcount` decide quem credita |
| Quem captura um webhook | virar PRO de graça | HMAC + janela de frescor + idempotência |
| Raspador | montar lista de gente | rate limit 300/min por pessoa; sem diretório de usuários |
| Quem tem o repositório | segredo no código | nenhum: cada valor do `.env` testado contra o histórico |

Cinco perguntas que a auditoria fez a cada funcionalidade, e onde elas doeram:

- **"E se o cliente mentir?"** — mass assignment está fechado por allowlist
  (`atualizar_perfil`), e `plano`/`bloqueado`/`trocas_*` não existem em schema de
  entrada nenhum.
- **"E se o atacante trocar este ID?"** — todo serviço filtra por dono.
  `mais_cartas_do_parceiro` deriva o parceiro da própria participação de quem
  pede, e não de um id do corpo.
- **"E se chamarem isto direto, sem passar pela tela?"** — **foi aqui que o F-01
  apareceu.** A tela só mostra os botões de responder em `PENDENTE`; o servidor
  aceitava em qualquer estado.
- **"E se duas requisições correrem juntas?"** — **F-02 e F-06.**
- **"E se o banco vazar?"** — as senhas não são nossas (Supabase Auth). O que
  vaza é contato e acervo. Não há dado financeiro: o checkout inteiro é do
  Mercado Pago e nenhum dado de cartão passa pelo TrocaTCG.

---

## 4. Achados

### F-01 · Máquina de estados do match sem guarda

- **Severidade:** HIGH · **CWE-840**, CWE-372 · OWASP API6:2023
- **Componente:** `api/app/services/matching.py` · `responder`
- **Endpoint:** `POST /v1/matches/{match_id}/responder`
- **Pré-condições:** ser participante do match. Nada além disso.

**Descrição.** A função gravava `update matches set status = :s where id = :m`
sem precondição de status, e o roteador não filtrava nada. O que devia ser
"responder à sugestão do motor" era, na prática, um botão de reescrever o
desfecho de qualquer troca da pessoa.

**Impacto.** `{"aceitou": false}` num match `CONCLUIDO` apagava do histórico uma
troca que aconteceu — deixando de pé os pontos de reputação que ela já tinha
creditado. `{"aceitou": true}` num `EXPIRADO` ressuscitava a troca vencida,
furando o prazo que o `expirar_vencidos` existe para aplicar. `RECUSADO` e
`CANCELADO` voltavam ao jogo do mesmo jeito.

**Causa raiz.** Vibe coding com irmãos corretos: `prorrogar` grava com
`where prorrogacoes < :limite`, `propostas.responder` com `where status =
'ABERTA'`. `responder` nasceu sem a cláusula equivalente e ninguém comparou.

**Validação.** Teste parametrizado nos cinco status × dois sentidos (dez casos).
Contra o código anterior, os dez falham; a asserção que quebra é
`assert not _gravou_status(sessao)`.

**Correção.** Guarda de estado explícita (409 `MATCH_JA_RESPONDIDO`), a
transição só a partir de `PENDENTE`, e `and status = 'PENDENTE'` também na
escrita — a segunda camada, que sobrevive a alguém remover a trava sem perceber
o que ela segurava.

**Status:** ✅ corrigido, com teste de regressão.

---

### F-02 · Corrida em `confirmar_conclusao` infla reputação

- **Severidade:** MEDIUM · **CWE-362**, CWE-367
- **Componente:** `api/app/services/matching.py` · `confirmar_conclusao`
- **Endpoint:** `POST /v1/matches/{match_id}/concluir`

**Descrição.** A sequência era ler (`_exigir_aceito`) → gravar a própria
confirmação → contar quantos faltam → se zero, creditar `trocas_concluidas` dos
dois e baixar o estoque. Duas requisições simultâneas do **mesmo** usuário
passavam as duas pelo `if`.

**Impacto.** +2 de reputação por clique duplo, e baixa de estoque dobrada — uma
carta que a pessoa ainda tem some do acervo dela. Reputação que se infla
apertando o botão duas vezes não é reputação, e é ela que sustenta a decisão de
marcar um encontro presencial com um desconhecido.

**Causa raiz.** O docstring de 2026-08-11 afirmava que a segunda chamada
esbarraria no `_exigir_aceito`. Verdade para chamadas em **sequência**; falso
para duas ao mesmo tempo. O comentário descrevia uma proteção que a concorrência
desfazia.

**Validação.** `test_conclusao_que_perde_a_corrida_nao_credita`. Contra o código
anterior falha com `assert not True` em `_creditou_reputacao` — ou seja, a
transação perdedora **creditava**.

**Correção.** `update matches set status = 'CONCLUIDO' where id = :m and status =
'ACEITO'`, e o `rowcount` decide quem credita. Junto, `_status_do_participante`
passou a ler com `for update of m`, o que serializa os **quatro** desfechos que
entram por ele — concluir, desistir, furar e prorrogar. `registrar_desistencia`
tinha a mesma corrida em `trocas_desistidas` e foi fechada pela mesma trava.

**Status:** ✅ corrigido, com teste de regressão.

---

### F-03 · Enumeração de e-mail no cadastro

- **Severidade:** MEDIUM · **CWE-204** · OWASP ASVS 2.2
- **Componente:** `web/src/lib/authMensagens.ts`

**Descrição.** O cadastro devolvia "Esse e-mail já tem conta. Entre em vez de
criar." — um oráculo: para saber quais e-mails de uma lista estão no app, bastava
tentar criar conta com cada um. Vale mais aqui do que na média, porque o produto
todo é gente combinando encontro presencial: a lista de quem está no app é
informação sobre pessoas, não sobre contas.

**Causa raiz.** A confirmação de e-mail está desligada no Supabase desde
2026-08-12. Com ela ligada, `signUp` devolve usuário ofuscado em vez do erro
`User already registered`.

**Correção aplicada.** Mensagem ambígua entre "já existe" e "não deu para criar",
sem a sugestão "entre em vez de criar" — era a sugestão que confirmava a conta.

**Status:** ✅ **fechado em 2026-08-21**, quando a confirmação de e-mail voltou:
com ela ligada, o `signup` devolve usuário ofuscado para conta confirmada e nem
quem chama a API direto distingue os dois casos. A mensagem ambígua da tela
continua no lugar, porque ela é a única proteção se o interruptor for desligado
de novo. Ver §6, R-1, inclusive para a borda que sobrou.

---

### F-04 · Rate limit da API não cobre autenticação

- **Severidade:** MEDIUM · **CWE-307**
- **Componente:** `api/app/core/limitador.py`, e a fronteira do §2

**Descrição.** O `Limitador` só vê tráfego de `trocatcg-api.onrender.com`. Login,
cadastro e reset vão direto ao Supabase: os 300/min não valem lá, e a única
defesa contra força bruta é a do provedor. Somado, o `MemoryStorage` é por
processo e zera a cada deploy.

**Impacto.** Nossa proteção contra força bruta em credenciais é exatamente a que
o Supabase oferece por padrão — que não é ruim, mas nunca foi conferida, e a doc
do projeto dava a entender que o rate limit cobria o app inteiro.

**Correção.** O achado principal é a fronteira ficar escrita (§2 deste
documento). O que é ajustável está em §5, itens de painel.

**Status:** ⚠️ documentado; três ações de painel pendentes.

---

### F-05 · Webhook do Mercado Pago sem janela de frescor

- **Severidade:** LOW · **CWE-294**
- **Componente:** `api/app/services/mercado_pago.py` · `assinatura_confere`

**Descrição.** O `ts` do `x-signature` sempre entrou no manifesto — ou seja,
sempre esteve **coberto** pelo HMAC — e nunca foi comparado com o relógio. A
diferença importa: assinatura cobrindo o carimbo prova que ninguém o alterou, não
que ele é de agora. Uma notificação capturada continuava válida para sempre.

**Impacto contido, e vale dizer por quê.** Um reenvio esbarrava na idempotência
de `webhook_events` — mesma assinatura, mesmo `notificacao_id`, resposta
"repetida". Era lacuna de camada, não porta aberta. Mas era **uma** camada, e ela
é uma tabela que cresce sem fim.

**Correção.** `_carimbo_fresco`: tolerância de 5 minutos, configurável em
`MERCADO_PAGO_TOLERANCIA_SEGUNDOS`, `abs` nos dois sentidos (relógio adiantado
também é suspeito), carimbo ilegível reprova, e treze dígitos são tratados como
milissegundos — errar a unidade não falharia um caso de borda, recusaria toda
notificação legítima.

**Efeito colateral que confirma a correção:** os testes existentes usavam
`ts=1700000000` fixo e passaram a falhar. O helper agora assina com o relógio, e
carimbo velho é coisa que só os testes da janela pedem.

**Status:** ✅ corrigido, com cinco testes de regressão.

---

### F-06 · Teto de propostas por dia furável por concorrência

- **Severidade:** LOW · **CWE-367**
- **Componente:** `api/app/services/propostas.py` · `_checar_limite_diario`

**Descrição.** Contar-e-depois-gravar: dez requisições simultâneas leem as mesmas
"nove abertas hoje", as dez passam. O limite que existe para impedir disparo em
massa era furado exatamente pelo disparo em massa — o caso que ele foi escrito
para pegar.

**Correção.** `for update` na leitura do plano. A trava é na própria pessoa, que é
a unidade do limite: duas pessoas não esperam uma pela outra; a mesma pessoa
abrindo dez de uma vez, sim.

**Status:** ✅ corrigido, com teste de regressão.

---

### F-07 · CI sem SAST nem varredura de dependência

- **Severidade:** LOW
- **Componente:** `.github/workflows/ci.yml`, `api/pyproject.toml`

**Correção.** Três portões, e a escolha de cada um está comentada no arquivo:

1. **SAST via ruleset `S` do ruff** (flake8-bandit), e não uma ferramenta nova —
   o ruff já roda em todo push, e análise estática que exige lembrar de rodar é
   análise que não roda. Pega o que esta auditoria teve de procurar à mão: hash
   fraco, `subprocess` com shell, `random` onde devia ser `secrets`, segredo em
   default de argumento. **Já achou um ponto real na primeira execução**: exceção
   engolida em silêncio no receptor de webhook (`S110`), hoje logada.
2. **`pip-audit --strict`** nas dependências do backend. O `--strict` faz falhar
   quando o scanner não consegue avaliar um pacote: "não sei" não é "está limpo",
   e tratar os dois igual é como um scanner passa a dar falsa paz.
3. **`npm audit --omit=dev --audit-level=high`** no que vai para o navegador.
   As duas escolhas são deliberadas e estão justificadas em §5.

Duas exclusões declaradas no `pyproject.toml`: `S101` (o `assert` é a linguagem
do pytest) e `S608` (todo SQL é `text()` parametrizado; a regra não distingue
interpolação de constante interna de interpolação de valor de usuário, e marcaria
~20 consultas legítimas — um lint que grita onde não há problema ensina a ignorar
lint).

**Status:** ✅ corrigido.

---

### F-08 · `react-router` com dois CVEs moderados

- **Severidade:** LOW · avaliado como **não alcançável**

`npm audit` acusa open redirect por barra invertida em `<Link>`/`useNavigate` e
injeção de construtor via `deserializeErrors` na hidratação SSR.

**Nenhum dos dois é alcançável neste app.** Não há SSR — é uma SPA construída
pelo Vite. E o único `navigate()` com valor variável é o pós-login, cujo destino
sai de `location.pathname` (`RotaProtegida.tsx:16`), escrito pelo próprio app, e
não de parâmetro de URL.

**Decisão:** não corrigir agora. A correção é `react-router-dom` 6→7, um major
que muda o roteamento de todas as telas, às vésperas do lançamento. O prompt de
auditoria e o bom senso concordam: não atualizar às cegas para o `latest`.

**Status:** ⚠️ aceito com análise de alcançabilidade. Reavaliar depois do
lançamento, ou imediatamente se surgir CVE alcançável.

---

### F-09 · `vite` com CVEs de dev server

- **Severidade:** LOW, condicional ao modo de trabalho
- **Componente:** `web` · `vite@5.4.9` (dependência de desenvolvimento)

Três advisories: path traversal no manejo de `.map` de deps otimizadas, bypass de
`server.fs.deny` em caminhos alternativos no Windows, e disclosure de hash NTLMv2
via caminho UNC no `launch-editor` — este último específico de Windows, que é o
sistema de desenvolvimento aqui.

**Não afeta o app publicado**: o que vai para o Render é HTML e JS já
construídos; o `vite` não é entregue. Afeta a **máquina de quem programa** — e
isso deixa de ser teórico porque `web/.env.local` documenta o teste pelo celular
na rede local. Rodar `vite --host` numa rede que não é sua (o Wi-Fi da loja no
dia do lançamento, por exemplo) põe o dev server ao alcance de quem estiver
junto, e o que há para ler nessa máquina inclui o `api/.env` — com a
`service_role` e a senha do banco.

**Mitigação, em ordem de custo:** não rodar `vite --host` em rede alheia; para
testar no celular fora de casa, usar um túnel HTTPS em vez de expor a porta.
O `npm audit fix` não resolve — a correção é `vite` 5→8, dois majors.

**Status:** ⚠️ documentado com mitigação operacional.

---

## 5. Pendências de painel — não são código

Nenhuma destas se resolve com um commit. Todas são do Eduardo.

1. **Proteção contra senha vazada** (Supabase → Auth). O advisor do próprio
   Supabase acusa; é um interruptor. Compara a senha nova com a base do
   HaveIBeenPwned, que é a defesa que mais vale contra credential stuffing.
2. **Mínimo de senha no servidor.** O `min(8)` de `Entrar.tsx:48` é do cliente, e
   quem chama `supabase.co` direto passa com 6 — o padrão do Supabase. Subir para
   8 no painel alinha os dois lados. **Validação de cliente não é validação.**
3. **Conferir os limites de rate do Auth** (F-04), já que é a única defesa contra
   força bruta em credenciais.
4. **`pg_trgm` no schema `public`** — WARN do linter. Mover custa reconstruir os
   índices da busca por ganho nenhum. Recomendação: deixar.

---

## 6. Riscos residuais

Declarados, e não escondidos.

**R-1 · Enumeração de e-mail — FECHADA em 2026-08-21, com uma borda que fica.**
A correção do F-03 fechava o que a *tela* dizia; a causa raiz era a confirmação
de e-mail estar desligada, e quem chamasse o `supabase.co` direto continuava
distinguindo "já existe" de "criado". **O front nunca é a fronteira.** O
interruptor foi religado em 2026-08-21 (decisão do Eduardo, revendo a de
2026-08-16), e o resultado foi medido contra a API, não lido na documentação:

- **Conta confirmada** — `signup` devolve um usuário **falso**: id novo,
  `role` vazio, `identities: []`, `created_at` de agora e o metadata que o
  chamador mandou. Nenhum e-mail sai. Não há como distinguir de um cadastro
  novo. É o caso do mundo real, e é o que fecha a enumeração.
- **Conta que existe e nunca foi confirmada** — o `signup` devolve o usuário
  **verdadeiro**, com o metadata do primeiro cadastro, e reenvia a confirmação.
  Quem comparar o que mandou com o que voltou sabe que a conta existe. É uma
  janela estreita (só endereços cadastrados e nunca confirmados) e é
  comportamento do GoTrue, não configuração nossa.

**O account squatting muda de forma, e não desaparece.** Ainda dá para criar
conta no e-mail de outra pessoa; o que muda é que a conta nasce inerte e a dona
do endereço **é avisada na hora**, porque o e-mail de confirmação chega a ela.
Medido junto: segundo cadastro no mesmo endereço **não troca a senha nem o
metadata** — o primeiro é que valem. Ou seja, se a dona do e-mail se cadastrar
por cima e clicar no link, ela confirma a conta *de quem chegou antes*, com o
`username` e o `contato_visivel` de quem chegou antes, e não consegue entrar com
a senha que ela escolheu. **A saída existe e é o "esqueci minha senha"**: o
reset devolve o controle e derruba o squatter. Isso precisa estar no suporte, e
é o motivo de a recuperação de senha (item 8) ter vindo antes desta mudança.

O custo aceito é o funil: quem se cadastra deixa de entrar na hora.

**R-2 · A senha não é nossa.** Não há Argon2id neste projeto porque não há
armazenamento de senha: o hash é do Supabase Auth, e o algoritmo dele não é
escolha nossa. Se o banco do Supabase vazar, a resistência das senhas é a que
eles escolheram. Mitigação disponível é o item 1 do §5.

**R-3 · Rate limit em memória.** O `MemoryStorage` zera a cada deploy e é por
processo. No plano free do Render há uma instância, então o efeito prático hoje é
o reinício. Vira problema real no dia de escalar horizontalmente, e a correção é
um storage compartilhado.

**R-4 · Ordem de lock em `trocas_concluidas`.** O `update profiles ... where id in
(select ...)` não tem ordem determinística de aquisição. Duas conclusões
simultâneas de matches **diferentes** que compartilhem uma pessoa podem, em
teoria, se deadlockar. Probabilidade baixíssima na escala atual, efeito é um erro
500 e um retry, e o custo de forçar a ordem não se paga hoje. Anotado para
quando o volume justificar.

**R-5 · `webhook_events` cresce sem limite.** É a tabela de idempotência do
Mercado Pago e nada a poda. Não é falha de segurança; vira uma quando o disco do
free acabar. A janela de frescor do F-05 permite podá-la com segurança — qualquer
linha mais velha que a tolerância já não pode ser reprocessada.

---

## 7. Testes de regressão

`api/tests/test_concorrencia.py` (novo, 20 testes) e `api/tests/test_assinaturas.py`
(5 novos). **Todos foram rodados contra o código anterior num worktree do `HEAD`,
e 20 falharam** — é o que separa um teste que prova de um teste que acompanha.

| Achado | Teste | Contra o código antigo |
|---|---|---|
| F-01 | `test_responder_so_vale_em_pendente` (10 casos) | falha: gravava o status |
| F-01 | `test_a_escrita_do_status_carrega_a_propria_guarda` | falha: sem a cláusula |
| F-01 | `test_responder_em_pendente_continua_funcionando` | garante que a guarda não fecha o caminho legítimo |
| F-02 | `test_conclusao_que_perde_a_corrida_nao_credita` | falha: `assert not True` — creditava |
| F-02 | `test_fechamento_do_match_exige_status_aceito` | falha: sem a condição |
| F-02 | `test_leitura_do_status_trava_a_linha_do_match` | falha: sem `for update` |
| F-05 | `test_carimbo_velho_nao_passa` e `_do_futuro_` | falha: aceitava qualquer idade |
| F-05 | `test_carimbo_em_milissegundos_passa` | protege contra errar a unidade |
| F-06 | `test_teto_de_propostas_trava_a_pessoa_antes_de_contar` | falha: sem `for update` |

**Baseline:** 367 testes passando, `ruff check` limpo com o ruleset de segurança,
81 arquivos formatados, `typecheck`/`build`/`conferir:csp` verdes.

Uma prova que o pytest não dá, e que vale fazer com o app rodando: pedir a
conclusão duas vezes em paralelo e conferir `trocas_concluidas` no Supabase. F-01
e F-02 são estado de banco, e são o tipo de defeito que passa em teste com dublê
e aparece em produção.

---

## 8. Portões de segurança — o estado real

| Área | Antes | Depois | Testado | Status |
|---|---|---|---|---|
| Autenticação | JWT por JWKS, imune a confusão de algoritmo | igual; fronteira documentada | Sim | PASS |
| Autorização | dono no `where` em toda consulta | igual | Sim | PASS |
| IDOR/BOLA | sem achado | sem achado | Sim | PASS |
| Máquina de estados | `responder` sem guarda | guarda + trava de linha | Sim | **PASS** |
| Race conditions | 3 corridas abertas | 3 fechadas | Sim | **PASS** |
| Injeção SQL | parametrizado | igual, + lint | Sim | PASS |
| XSS / CSP | CSP por hash, sem sink perigoso | igual | Sim (CI) | PASS |
| CSRF | n/a — Bearer, sem cookie | n/a | — | N/A |
| SSRF | n/a — nenhuma URL do usuário é buscada | n/a | — | N/A |
| Upload | n/a — não existe | n/a | — | N/A |
| Mass assignment | allowlist explícita | igual | Sim | PASS |
| Rate limiting | 300/min na API | igual; lacuna do Auth documentada | Sim | PARCIAL |
| Força bruta | delegada ao Supabase | igual; 3 ações de painel | Não | PARCIAL |
| Enumeração | oráculo no cadastro | mitigado na tela | Não | PARCIAL |
| Replay/idempotência | só dedupe | dedupe + janela de frescor | Sim | **PASS** |
| Webhooks | HMAC + `compare_digest` | + frescor | Sim | PASS |
| RLS / grants | policies quebradas, grants abertos | corrigido e provado | Sim | **PASS** |
| Segredos | nenhum vazado | igual, verificado por valor | Sim | PASS |
| CI/CD | sem varredura | SAST + SCA nos dois lados | Sim | **PASS** |
| Dependências | 2 CVEs não avaliados | avaliados, não alcançáveis | Sim | PASS |
| Backups | cifrado, restauração nunca exercitada | restaurado e conferido todo dia; `--no-acl` fora do dump | Sim | **PASS** |
| Logs/alertas | sem Sentry | Sentry nos dois lados, sem PII e sem variáveis locais | Sim | **PASS** |
| Admin | não existe | não existe | — | N/A |

Os dois PENDENTE fecharam em 2026-08-20, e nenhum dos dois fechou sozinho — cada
um trouxe um achado que só apareceu porque a coisa foi exercitada em vez de lida:

- **O dump não levava os grants.** `pg_dump --no-acl` não escreve GRANT nenhum:
  o backup trazia dados e esquema, e deixava para trás a revogação de `profiles`
  para `anon`/`authenticated` do `db/schema/11_grants.sql`. Restaurado num
  projeto Supabase novo, o banco nasceria com o default do Supabase — contato
  legível com a chave pública e escrita direta pelo PostgREST. A flag saiu.
- **O Sentry mandaria o `Authorization` inteiro.** Não pelos cabeçalhos, que a
  denylist limpa, mas pelas variáveis locais de cada quadro do stack: o `scope`
  do ASGI carrega os cabeçalhos como lista de pares de bytes, onde nenhuma
  denylist por nome de chave alcança. Corrigido com `include_local_variables=False`.

Detalhe nas seções 15 e 20 da doc técnica.

---

## 9. O que a auditoria confirmou que está de pé

Uma lista só de defeitos não diz onde o sistema aguenta. Tudo abaixo foi
exercitado, não presumido:

- **Injeção SQL** — toda f-string interpola constante interna ou nome de coluna
  vindo de schema pydantic. `_lista_de_ids` gera *nomes* de parâmetro, nunca
  valores. Ids sempre parametrizados, com cast explícito.
- **IDOR** — `obter_match` entra por `match_participants`;
  `mais_cartas_do_parceiro` deriva o parceiro da própria participação;
  `_UMA_PROPOSTA` exige `cast(:eu as uuid) in (autor_id, destinatario_id)`;
  notificações, alertas e push filtram por dono mesmo quando recebem ids.
- **Revelação de contato** — dupla condição no servidor, e o dado fora do alcance
  da anon key por grant de coluna.
- **Timing** — `compare_digest` no `JOB_SECRET`, no HMAC do Mercado Pago e no
  código do WhatsApp. Código de verificação por `secrets`, nunca `random`.
- **Segredos** — cada valor real do `.env` testado contra as 88.536 linhas do
  histórico completo e contra o `HEAD`: todos limpos. Secret scanning do GitHub
  com zero alertas. O `backup.yml` cifra antes de subir e **aborta** se a
  passphrase faltar, porque o repositório é público.
- **Conta bloqueada** — travada em `usuario_atual`, com as exceções declaradas
  (ver o próprio perfil, apagar a conta) para que rota nova nasça fechada.
