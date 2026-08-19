# E-mails transacionais

Os dois e-mails que o Supabase Auth manda em nome do TrocaTCG, escritos na
linguagem do [DESIGN.md](../../DESIGN.md): papel bege, cartela creme com borda
de 2px e sombra dura, azul só na ação.

| Arquivo | Template no painel | Dispara hoje? |
|---|---|---|
| `confirmar-cadastro.html` | **Confirm sign up** | ❌ confirmação desligada em 2026-08-12 |
| `recuperar-senha.html` | **Reset password** | ✅ sim |
| `senha-alterada.html` | **Password changed** | ✅ sim, a cada reset concluído |
| `email-alterado.html` | **Email address changed** | ❌ não há tela de trocar e-mail |
| `telefone-alterado.html` | **Phone number changed** | ❌ **nunca** — ver abaixo |

### Por que três não disparam, e são três motivos diferentes

Confundir os três é o caminho para achar que a conta está avisada quando não está.

**Confirm sign up** — desligado por configuração. Um interruptor no painel liga.

**Email address changed** — falta *funcionalidade*. Nada no app chama
`supabase.auth.updateUser({ email })`; o único `updateUser` do código é o de
senha, em `web/src/lib/recuperacao.ts`. O template fica pronto para o dia em que
existir a tela.

**Phone number changed** — não é interruptor nem tela: é **arquitetura**. Este
template observa `auth.users.phone`, e o TrocaTCG nunca escreve nessa coluna. O
telefone do cadastro vai para o `user_metadata` (`contato_visivel`) e de lá para
`profiles.contato_visivel`, que é tabela nossa, escrita pela nossa API. O
Supabase não fica sabendo. Ligar o template não muda isso.

> **Lacuna de segurança que isso revela** (ver [`../SEGURANCA.md`](../SEGURANCA.md)):
> hoje, trocar `contato_visivel` — o número de WhatsApp que o app entrega a quem
> fecha uma troca — **não gera aviso nenhum**. Nem e-mail, nem notificação
> in-app. Quem tomar uma conta pode redirecionar as trocas da pessoa para o
> próprio número em silêncio. O aviso certo tem de sair da **nossa API**, não do
> Supabase, e o canal certo é e-mail: o app já tem notificação in-app e Web Push,
> mas os dois chegam onde quem tomou a conta também está.
>
> O `telefone-alterado.html` fica versionado como o texto pronto para esse aviso.

Ficam versionados aqui porque a edição acontece **no painel do Supabase**
(Authentication → Emails → Templates), que não tem histórico. O arquivo é a fonte
da verdade; o painel é uma cópia. Mudou aqui, cola lá — e mudou lá, traz de volta
para cá, senão a próxima pessoa edita a versão errada.

## Como aplicar

1. Painel → Authentication → Emails → Templates → o template correspondente.
2. Colar o conteúdo inteiro do arquivo, do `<!doctype html>` ao `</html>`.
3. Salvar e mandar um de teste para si mesmo antes de confiar.

## Decisões que não são óbvias no código

**Sombra dura em `<table>`, não em `box-shadow`.** O Outlook renderiza com o
motor do Word e ignora `box-shadow` — a sombra deslocada de 4px (cartela) e 3px
(botão) é uma barra preta de verdade, empurrada por uma célula vazia. É feio no
fonte e é o único jeito que funciona em todo lugar.

**`color-scheme: light`.** Apple Mail e Outlook invertem cores no modo escuro por
conta própria, e a inversão transforma o papel creme em cinza sujo com a borda
sumindo. O mundo do TrocaTCG é comprometido com a luz; a declaração pede que
respeitem isso.

**Fonte inline, e não só no `<style>`.** O Gmail bloqueia webfont e descarta boa
parte do CSS do `<head>`. Cada elemento carrega a própria pilha —
`Outfit → Trebuchet MS → Segoe UI → Arial` nos títulos,
`Inter → -apple-system → Segoe UI → Roboto → Arial` no corpo. Onde a webfont não
carrega, a hierarquia sobrevive.

**PNG, nunca SVG.** O `marca.svg` não renderiza na maioria dos clientes. O logo é
o `pwa-192.png`, por URL **absoluta** — caminho relativo falha calado em e-mail,
a mesma armadilha da `og:image` de agosto.

**O link cru embaixo do botão.** Alguns clientes descartam o botão; sem o
endereço em texto, a pessoa fica sem saída. Ele vai em `Geist Mono` com
`word-break`, porque URL de recuperação é longa e estoura a caixa.

**A guarda no nome.** `{{ if .Data.nome_exibicao }}` existe porque esse campo vem
do `user_metadata` que o `signUp` grava, e uma conta criada por outro caminho não
o tem. Sem o `if`, o Go template escreve `<no value>` e a pessoa lê
"Oi, `<no value>`." no primeiro e-mail que recebe do app.

**Cor do aviso, e por quê são duas.** No cadastro é âmbar (`#8C560F` sobre
`#FFF4E5`) — aviso. Na senha é vermelho (`#B2292E` sobre `#FEE2E2`), porque no
sistema `alerta` é reservado ao que não tem volta, e alguém trocando a senha de
uma conta que não é dele é dessa categoria.

**Nos avisos, o alerta vem antes do botão.** Nos e-mails de ação (cadastro,
reset) o botão é o assunto. Nos três avisos não: quem reconhece a mudança não
precisa fazer nada, e o e-mail existe inteiro para o outro caso. Pôr o bloco
vermelho depois do botão obrigaria quem precisa agir a ler dois parágrafos antes
de entender que está sendo roubado.

**O aviso de e-mail trocado não manda para "Esqueci minha senha".** Seria mandar
a pessoa para uma porta que não abre mais: o link de recuperação sairia para o
endereço novo, que é o de quem tomou a conta. O único caminho honesto ali é
humano, e o botão abre um `mailto:` para você.

**Endereço e telefone em `Geist Mono`.** No sistema, essa é a fonte do dado — id
de troca, código de set, prazo. Ler endereço em fonte de corpo convida ao erro
entre caracteres parecidos, e nestes e-mails a pessoa está comparando dois
valores para decidir se foi roubada.

## Variáveis usadas

| Variável | Onde |
|---|---|
| `{{ .ConfirmationURL }}` | botão e link cru do cadastro e do reset |
| `{{ .Email }}` | corpo e rodapé — no `email-alterado` é o endereço **novo** |
| `{{ .OldEmail }}` | `email-alterado`: o endereço que a conta usava |
| `{{ .Phone }}` / `{{ .OldPhone }}` | `telefone-alterado` |
| `{{ .Data.nome_exibicao }}` | saudação do cadastro |

Cada template só recebe as suas. O `telefone-alterado` **não** recebe
`{{ .Email }}` — por isso o rodapé dele não diz "enviado para", que imprimiria
`<no value>`.

## Duas coisas para conferir antes de confiar

**O prazo escrito bate com o configurado?** O e-mail de senha diz "vale por uma
hora". Se o *email OTP expiration* do projeto não for 3600s, a frase mente — e
mentir sobre prazo no e-mail mais tenso do app é o pior lugar para errar.
Conferir em Authentication → Emails, e ajustar a frase ou o valor.

**O endereço do logo aponta para produção?** Está fixo em
`https://trocatcg-web.onrender.com/pwa-192.png`. No dia em que houver domínio
próprio, é uma linha em cada arquivo — e é a única coisa que quebra visualmente
se ficar para trás.

## O limite que o HTML não resolve

O corpo tem a cara do app; o **remetente**, não. O `trocatcg.com.br` é de outra
pessoa, então o transacional sai pelo SMTP do Gmail e chega como um endereço
pessoal — e em e-mail transacional o remetente é o que mais decide confiança. Um
e-mail bem-feito vindo de um Gmail pessoal pedindo troca de senha lê como
phishing acima da média.

Vale ter mesmo assim: um e-mail sem marca nenhuma treina as pessoas a clicar em
qualquer coisa parecida, o que é pior. Mas o ganho grande vem com domínio próprio
e SPF/DKIM, e esse é o passo que mais rende quando houver.

## Nota sobre o "Confirm sign up"

A confirmação de e-mail está **desligada** desde 2026-08-12 — o template existe e
não é enviado. Ligá-la fecha o risco residual **R-1** de
[`../SEGURANCA.md`](../SEGURANCA.md): a enumeração de e-mail no cadastro e o
account squatting (hoje dá para criar conta no endereço de outra pessoa). É
também pré-requisito para login por Google, porque o Supabase junta identidades
pelo e-mail e a proteção dele contra pre-account takeover depende de o endereço
estar de fato não-confirmado.

O custo é o funil: quem se cadastra deixa de entrar na hora. Decisão de produto,
não de segurança — e o template já está pronto para o dia em que for tomada.
