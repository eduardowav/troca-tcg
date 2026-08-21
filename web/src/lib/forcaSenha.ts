/**
 * A força da senha, medida no navegador — e o que ela pode barrar.
 *
 * Duas coisas diferentes moram aqui, e vale separá-las antes de ler o código.
 *
 * **A medida** é um palpite honesto sobre quantas tentativas alguém precisaria
 * para adivinhar a senha, traduzido em cinco degraus. Ela é conselho: aparece
 * embaixo do campo enquanto se digita e nunca impede ninguém de enviar o
 * formulário. O papel dela é mostrar, no momento em que a decisão está sendo
 * tomada, que "senha123" e "batata frita azeda" não são a mesma coisa.
 *
 * **A barreira** é o `aceitavel`, e ela é curta de propósito: reprova o que é
 * *adivinhável*, não o que deixa de ter maiúscula. É a orientação do NIST
 * (SP 800-63B) desde 2017 — exigir símbolo e número produz "Senha@123" em toda
 * a base, que é pior do que a frase longa que a regra teria recusado. Então o
 * que barra aqui é: senha da lista das mais usadas, senha que é o nome ou o
 * e-mail da própria pessoa, e senha que sobra em quase nada depois de tirar os
 * pedaços previsíveis.
 *
 * **Isto não é a defesa.** É validação de cliente, e quem chamar o
 * `supabase.co` direto não passa por aqui. A defesa de verdade são dois
 * interruptores do painel do Supabase — mínimo de caracteres e comparação com
 * a base do HaveIBeenPwned —, listados em `docs/SEGURANCA.md` §5. Esta tela
 * existe para quem está de boa-fé escolhendo uma senha, que é a maioria.
 *
 * Sem biblioteca: o `zxcvbn` faz isto melhor e custa ~800 kB com o dicionário,
 * num app que se instala como PWA no celular de quem troca carta na praça.
 */

/** 0 é o que não deveria passar; 4 é o que ninguém adivinha. */
export type NivelSenha = 0 | 1 | 2 | 3 | 4

export interface ForcaSenha {
  pontos: NivelSenha
  rotulo: string
  /** O próximo passo concreto, ou `null` quando não há o que melhorar. */
  dica: string | null
  /** `false` reprova no formulário; sempre acompanhado de `dica`. */
  aceitavel: boolean
  /** `true` só quando há o que medir — o campo vazio não vira aviso. */
  preenchida: boolean
}

/** O mesmo mínimo do schema de cadastro. Um número só, num lugar só. */
export const MINIMO_SENHA = 8

/* ---------- O que é previsível ---------- */

/**
 * As senhas mais usadas do Brasil, e os pedaços de que elas são feitas.
 *
 * Lista curta e escolhida, não um dump de vazamento: cada linha aqui é peso no
 * bundle, e as primeiras dezenas cobrem uma fatia desproporcional da base real.
 * O resto do trabalho é do HaveIBeenPwned, no servidor.
 */
const COMUNS = [
  '123456', '1234567', '12345678', '123456789', '1234567890', '12345',
  'senha', 'senha123', 'senha1234', 'minhasenha', 'senhaforte',
  'password', 'password1', 'passw0rd', 'qwerty', 'qwertyui', 'asdfgh',
  'abc123', 'abcd1234', 'admin', 'administrador', 'root', 'usuario',
  'iloveyou', 'teamo', 'amor', 'amordaminhavida', 'familia', 'jesus',
  'deusefiel', 'deusnocomando', 'brasil', 'brazil', 'saopaulo',
  'flamengo', 'corinthians', 'palmeiras', 'vasco', 'gremio', 'internacional',
  'cruzeiro', 'atletico', 'santos', 'fluminense', 'botafogo', 'bahia',
  'sport', 'remo', 'paysandu', 'futebol', 'gatinha', 'princesa', 'linda',
  'anjinho', 'bebe', 'mamae', 'papai', 'filho', 'filha', 'vida',
  'sucesso', 'dinheiro', 'trabalho', 'liberdade', 'saudade', 'felicidade',
  'monkey', 'dragon', 'master', 'shadow', 'sunshine', 'welcome', 'letmein',
]

/**
 * O que é previsível **neste** app, e não na internet em geral.
 *
 * Um site de troca de carta vê "pikachu2026" com a mesma frequência com que um
 * banco vê "banco2026". Quem escolhe a senha na tela do TrocaTCG está olhando
 * para cartas, e é de lá que a palavra vem.
 */
const CONTEXTO = [
  'trocatcg', 'troca', 'trocar', 'carta', 'cartas', 'cartinha', 'colecao',
  'baralho', 'deck', 'booster', 'pokemon', 'pikachu', 'charizard', 'eevee',
  'magic', 'yugioh', 'yugi', 'digimon', 'onepiece', 'lorcana', 'holo',
  'shiny', 'rara', 'raro', 'ultrarare', 'reverse', 'foil',
]

/**
 * Nomes próprios comuns no Brasil.
 *
 * Entram porque o padrão nacional de senha ruim é `nome` + ano de nascimento, e
 * sem eles "marcelo1994" seria medido como onze caracteres de acaso. Sessenta
 * nomes não cobrem o país; cobrem o suficiente para que a medida deixe de
 * mentir no caso mais frequente.
 */
const NOMES = [
  'maria', 'jose', 'joao', 'antonio', 'francisco', 'carlos', 'paulo',
  'pedro', 'lucas', 'luiz', 'marcos', 'gabriel', 'rafael', 'daniel', 'marcelo',
  'bruno', 'eduardo', 'felipe', 'rodrigo', 'manoel', 'mateus', 'thiago',
  'leandro', 'gustavo', 'vitor', 'victor', 'fernando', 'ricardo', 'sergio',
  'julia', 'juliana', 'fernanda', 'patricia', 'aline', 'camila', 'amanda',
  'bruna', 'jessica', 'leticia', 'larissa', 'beatriz', 'mariana', 'gabriela',
  'rafaela', 'carolina', 'vanessa', 'adriana', 'sandra', 'simone', 'luana',
  'isabela', 'sofia', 'alice', 'helena', 'valentina', 'laura', 'heitor',
  'arthur', 'miguel', 'davi', 'bernardo', 'lorenzo',
]

/**
 * `4` vira `a`, `@` vira `a`, `3` vira `e`.
 *
 * Sem isto, "s3nh@123" passaria por acaso puro. A troca é um-para-um, então o
 * comprimento não muda — o que importa para a conta lá embaixo.
 */
const LEET: Record<string, string> = {
  '4': 'a',
  '@': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  '5': 's',
  $: 's',
  '7': 't',
}

/** Minúscula e sem acento — o mesmo texto, só que comparável. */
function semLeet(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function normalizar(texto: string): string {
  return semLeet(texto).replace(/[4@31!05$7]/g, (c) => LEET[c])
}

/**
 * Os pedaços do que a pessoa já digitou nos outros campos.
 *
 * Nome, `@` e e-mail são público — o `@` aparece para todo mundo, o e-mail
 * chega a quem fecha troca — e senha feita deles é senha que o vizinho de
 * barraca adivinha. Quebra em letras e números, joga fora o que tem menos de
 * quatro caracteres (`ana` casaria dentro de meio dicionário) e devolve o
 * resto.
 */
export function pedacosPessoais(
  valores: Array<string | null | undefined>,
): string[] {
  const saida = new Set<string>()
  for (const bruto of valores) {
    if (!bruto) continue
    // O e-mail entra partido: "joao.silva@gmail.com" dá "joao", "silva" e
    // "gmail" — e "gmail" é tão previsível quanto o nome.
    for (const pedaco of normalizar(bruto).split(/[^a-z0-9]+/)) {
      if (pedaco.length >= 4) saida.add(pedaco)
    }
  }
  return [...saida]
}

/* ---------- A conta ---------- */

/**
 * Quantos caracteres desta senha alguém teria de adivinhar de fato.
 *
 * Cada palavra previsível que aparece dentro dela é trocada por um caractere só
 * — não por zero: escolher *qual* palavra ainda custa alguma coisa, só que
 * pouca. Depois some o que se deduz do vizinho: `aaaa` e `1234` são uma letra e
 * um passo, não quatro decisões.
 */
function comprimentoEfetivo(senha: string, pessoais: string[]): number {
  // Duas passadas, e vale a pior das duas.
  //
  // O `leet` é o que faz "s3nh4" casar com "senha", mas ele custa: trocado por
  // letra, o `123` de "Senha@123" vira "ai2e" e escapa do colapso de escada
  // logo abaixo — a senha mais previsível do país passaria por cinco
  // caracteres de acaso. Medir também o texto cru, sem tradução nenhuma, pega
  // exatamente esse caso, e ficar com o menor dos dois é a leitura honesta:
  // basta uma das duas maneiras de ler a senha ser fácil.
  return Math.min(
    efetivoDe(normalizar(senha), pessoais),
    efetivoDe(semLeet(senha), pessoais),
  )
}

function efetivoDe(entrada: string, pessoais: string[]): number {
  let resto = entrada

  // Do mais longo para o mais curto: com "senha123" na lista, casar "senha"
  // antes deixaria "123" solto valendo como acaso.
  const previsiveis = [...pessoais, ...COMUNS, ...CONTEXTO, ...NOMES].sort(
    (a, b) => b.length - a.length,
  )
  for (const palavra of previsiveis) {
    if (palavra.length < 4) continue
    for (let i = resto.indexOf(palavra); i !== -1; i = resto.indexOf(palavra)) {
      resto = `${resto.slice(0, i)} ${resto.slice(i + palavra.length)}`
    }
  }

  let efetivo = resto.length
  for (let i = 2; i < resto.length; i++) {
    const passo = resto.charCodeAt(i) - resto.charCodeAt(i - 1)
    const anterior = resto.charCodeAt(i - 1) - resto.charCodeAt(i - 2)
    // Repetição (passo 0) ou escada de um em um, mantendo o mesmo passo.
    if (passo === anterior && Math.abs(passo) <= 1) efetivo--
  }
  return Math.max(efetivo, 0)
}

/** O tamanho do alfabeto de onde a senha parece ter saído. */
function alfabeto(senha: string): number {
  let tamanho = 0
  if (/[a-z]/.test(senha)) tamanho += 26
  if (/[A-Z]/.test(senha)) tamanho += 26
  if (/[0-9]/.test(senha)) tamanho += 10
  if (/[^a-zA-Z0-9]/.test(senha)) tamanho += 33
  return Math.max(tamanho, 1)
}

const ROTULOS = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'] as const

/**
 * Os degraus, em bits de entropia.
 *
 * 40 bits é onde uma placa de vídeo doméstica deixa de terminar o trabalho numa
 * tarde, e é por isso que ele fica no meio da escala — abaixo dali a senha não
 * está errada, está ao alcance de quem tentar. 68 bits, no topo, é o que três
 * palavras sorteadas dão sozinhas.
 */
const DEGRAUS = [30, 40, 52, 68]

export function avaliarSenha(
  senha: string,
  pessoais: string[] = [],
): ForcaSenha {
  if (!senha) {
    return {
      pontos: 0,
      rotulo: ROTULOS[0],
      dica: null,
      aceitavel: false,
      preenchida: false,
    }
  }

  const efetivo = comprimentoEfetivo(senha, pessoais)
  const bits = efetivo * Math.log2(alfabeto(senha))
  const pontos = DEGRAUS.filter((degrau) => bits >= degrau).length as NivelSenha

  // Sobrou um caractere de acaso, ou nenhum: a senha *é* uma palavra conhecida,
  // com no máximo um enfeite. Vale dizer isso com todas as letras, em vez de
  // deixar o medidor no vermelho e a pessoa adivinhando o que fazer.
  const previsivel = efetivo <= 2
  const curta = senha.length < MINIMO_SENHA
  const pessoal = contem(senha, pessoais)
  const aceitavel = !curta && !previsivel && pontos >= 1

  return {
    pontos,
    rotulo: ROTULOS[pontos],
    dica: dicaPara({ curta, previsivel, pessoal, pontos }),
    aceitavel,
    preenchida: true,
  }
}

function contem(senha: string, pedacos: string[]): boolean {
  const alvo = normalizar(senha)
  return pedacos.some((pedaco) => pedaco.length >= 4 && alvo.includes(pedaco))
}

/**
 * O que dizer, em ordem de urgência.
 *
 * Um conselho por vez, e sempre o mais próximo da causa: quem escreveu o
 * próprio `@` na senha não precisa ouvir que ela é curta, precisa ouvir que a
 * comunidade inteira conhece esse `@`.
 */
function dicaPara({
  curta,
  previsivel,
  pessoal,
  pontos,
}: {
  curta: boolean
  previsivel: boolean
  pessoal: boolean
  pontos: NivelSenha
}): string | null {
  if (curta) return `Faltam caracteres: são ${MINIMO_SENHA} no mínimo.`
  if (pessoal && pontos <= 2) {
    return 'Seu nome, seu @ e seu e-mail são públicos aqui — quem quiser entrar na sua conta começa por eles.'
  }
  if (previsivel) {
    return 'Essa é das primeiras que alguém tentaria. Troque por algo que só você diria.'
  }
  if (pontos <= 1) {
    return 'Alongue: três palavras sem relação entre si valem mais que um símbolo no fim.'
  }
  if (pontos === 2) return 'Dá para melhorar com mais uma palavra.'
  return null
}
