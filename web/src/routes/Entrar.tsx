import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import {
  AcaoSecundaria,
  Cartela,
  LinkNoTexto,
  LockupTrocaTCG,
} from '@/components/brutal/Pecas'
import { Campo } from '@/components/ui/Campo'
import { Button } from '@/components/ui/Button'
import { mensagemAuth } from '@/lib/authMensagens'
import { cn } from '@/lib/cn'
import { usernameDisponivel } from '@/lib/perfil'
import { supabase } from '@/lib/supabase'
import { formatarTelefone, telefoneSchema } from '@/lib/telefone'

type Modo = 'entrar' | 'criar'
type Erros = Record<string, string>

const email = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .email('E-mail inválido.')

const esquemaEntrar = z.object({
  email,
  senha: z.string().min(1, 'Informe sua senha.'),
})

const esquemaCriar = z.object({
  nome_exibicao: z
    .string()
    .trim()
    .min(2, 'Como querem te chamar na troca?')
    .max(60, 'No máximo 60 caracteres.'),
  username: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9_]{3,20}$/,
      'De 3 a 20 caracteres: letras minúsculas, números ou _',
    ),
  email,
  telefone: telefoneSchema,
  senha: z.string().min(8, 'Use ao menos 8 caracteres.'),
  aceite: z
    .boolean()
    .refine((v) => v, 'É preciso aceitar os termos para criar a conta.'),
})

export default function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [erros, setErros] = useState<Erros>({})
  const [enviando, setEnviando] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const destino = (location.state as { de?: string } | null)?.de ?? '/'

  function trocarModo(novo: Modo) {
    setModo(novo)
    setErros({})
  }

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const form = new FormData(evento.currentTarget)
    setErros({})

    if (modo === 'entrar') {
      const analise = esquemaEntrar.safeParse({
        email: form.get('email'),
        senha: form.get('senha'),
      })
      if (!analise.success) return setErros(paraErros(analise.error))

      setEnviando(true)
      const { error } = await supabase.auth.signInWithPassword({
        email: analise.data.email,
        password: analise.data.senha,
      })
      setEnviando(false)

      if (error) return setErros({ form: mensagemAuth(error.message) })
      navigate(destino, { replace: true })
      return
    }

    const analise = esquemaCriar.safeParse({
      nome_exibicao: form.get('nome_exibicao'),
      username: String(form.get('username') ?? '')
        .trim()
        .toLowerCase(),
      email: form.get('email'),
      telefone: form.get('telefone'),
      senha: form.get('senha'),
      aceite: form.get('aceite') === 'on',
    })
    if (!analise.success) return setErros(paraErros(analise.error))
    const dados = analise.data

    setEnviando(true)
    if (!(await usernameDisponivel(dados.username))) {
      setEnviando(false)
      return setErros({ username: 'Esse @ já está em uso. Escolha outro.' })
    }

    // username/nome/aceite viajam no user_metadata: o perfil não nasce aqui, e
    // sim no primeiro `garantirPerfil` com um JWT em mãos — que é onde ele
    // nasceria também se a confirmação de e-mail voltasse, possivelmente em
    // outro aparelho. O metadata é o que sobrevive a esse intervalo.
    const { data, error } = await supabase.auth.signUp({
      email: dados.email,
      password: dados.senha,
      options: {
        data: {
          username: dados.username,
          nome_exibicao: dados.nome_exibicao,
          aceite_termos: true,
          contato_visivel: dados.telefone,
        },
      },
    })
    setEnviando(false)

    if (error) return setErros({ form: mensagemAuth(error.message) })

    // Sem confirmação de e-mail (desligada no painel do Supabase em
    // 2026-08-12), o cadastro já volta com sessão e a pessoa entra direto. A
    // guarda existe para o dia em que a confirmação voltar junto com o "esqueci
    // minha senha": ali o `signUp` devolve sessão nula, e sem esta linha a tela
    // ficaria parada sem dizer nada — que é o pior desfecho possível para quem
    // acabou de preencher tudo.
    if (!data.session) {
      return setErros({
        form: 'Conta criada. Confirme seu e-mail e volte para entrar.',
      })
    }
    navigate(destino, { replace: true })
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Lockup />
      <TrocaQueRoda />

      <header>
        <h1 className="text-[30px] leading-[1.05]">
          {modo === 'entrar'
            ? 'Bem-vindo de volta.'
            : 'Sua conta no quadro de trocas.'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-apagado">
          {modo === 'entrar'
            ? 'Entre para ver suas listas e seus matches.'
            : 'Leva um minuto. Depois é só montar Ofereço e Procuro.'}
        </p>
      </header>

      <Alternador modo={modo} onModo={trocarModo} />

      <Cartela className="p-5">
        <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-4">
          {modo === 'criar' && (
            <>
              <Campo
                rotulo="Como querem te chamar"
                name="nome_exibicao"
                autoComplete="name"
                placeholder="Seu Nome"
                erro={erros.nome_exibicao}
              />
              <CampoUsuario erro={erros.username} />
            </>
          )}

          <Campo
            rotulo="E-mail"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="voce@email.com"
            erro={erros.email}
          />

          {modo === 'criar' && <CampoTelefone erro={erros.telefone} />}

          <Campo
            rotulo="Senha"
            name="senha"
            type="password"
            autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            dica={modo === 'criar' ? 'Ao menos 8 caracteres.' : undefined}
            erro={erros.senha}
          />

          {/* Só em "entrar", e alinhado à direita, embaixo do campo de senha:
              é a saída de quem acabou de errar a senha, e ela não pode estar
              competindo com o botão de entrar. Em "criar" não existe senha a
              esquecer ainda. */}
          {modo === 'entrar' && (
            <AcaoSecundaria to="/recuperar" className="-mt-1 self-end">
              Esqueci minha senha
            </AcaoSecundaria>
          )}

          {modo === 'criar' && <AceiteTermos erro={erros.aceite} />}

          {erros.form && (
            <p
              role="alert"
              className="rounded-[var(--radius-controle)] border-2 border-alerta bg-alerta-fraco px-3.5 py-3 text-[14px] font-medium text-alerta"
            >
              {erros.form}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            loading={enviando}
            className="shadow-[var(--shadow-duro-sm)] hover:shadow-[var(--shadow-duro)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
          >
            {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>
      </Cartela>
    </div>
  )
}

/* ---------- A marca ---------- */

/**
 * O mesmo lockup do topo do app — marca à esquerda, palavra à direita.
 *
 * Repetido aqui, e não herdado do `LayoutApp`, porque `/entrar` fica fora dele:
 * quem ainda não entrou não tem barra de navegação nem cabeçalho. É a primeira
 * vez que a pessoa vê a marca, então ela vem maior do que dentro do app.
 */
function Lockup() {
  return (
    <LockupTrocaTCG grande className="justify-center" />
  )
}

/* ---------- A troca rodando ---------- */

/**
 * Duas cartas trocando de lugar, em laço, acima do formulário.
 *
 * Esta é a única tela do app que alguém vê **antes** de ter conta, e até aqui
 * ela pedia dados sem ter mostrado nada. O app inteiro é sobre uma coisa só —
 * a carta que falta para você está na mão de outra pessoa, e vice-versa — e
 * essa frase se explica melhor em dois segundos de movimento que em parágrafo.
 *
 * As cartas são formas, não scans: o catálogo exige sessão, e inventar arte de
 * carta de verdade aqui seria promessa que a tela não pode cumprir. O que
 * importa é a leitura de cor do mundo novo — azul é o seu lado, papel é o do
 * outro —, que é a mesma do `ParDeCartas` no detalhe da troca.
 *
 * O movimento mora no CSS (`entrar-troca`, em index.css) pelo mesmo motivo da
 * animação da troca: percurso com volta e pausa é onde o motion desiste.
 */
function TrocaQueRoda() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-3">
      <div className="entrar-fileira">
        <CartaDaDemo tom="meu" rotulo="VOCÊ" />
        <CartaDaDemo tom="dele" rotulo="ELE" />
      </div>
      <p className="text-center text-[13px] leading-snug text-apagado">
        Você tem a carta que falta para ele.
        <br />
        Ele tem a que falta para você.
      </p>
    </div>
  )
}

function CartaDaDemo({ tom, rotulo }: { tom: 'meu' | 'dele'; rotulo: string }) {
  return (
    <div
      className={cn(
        // A altura é acordo com `--entrar-arco` em index.css: os dois arcos
        // somados precisam passar dela para as cartas se cruzarem sem se cobrir.
        'entrar-troca grid h-[78px] w-[56px] place-items-end rounded-[var(--radius-imagem)]',
        'border-2 border-tinta p-1.5 shadow-[var(--shadow-duro-xs)]',
        tom === 'meu' ? 'bg-azul' : 'entrar-troca-b bg-cartela',
      )}
    >
      <span
        className={cn(
          'font-dado text-[9px] leading-none font-bold',
          tom === 'meu' ? 'text-azul-tinta' : 'text-tinta',
        )}
      >
        {rotulo}
      </span>
    </div>
  )
}

/* ---------- Alternador Entrar / Criar conta ---------- */

/**
 * Segmentado de dois estados, com a pastilha deslizando de um lado ao outro.
 *
 * A pastilha é **um elemento só, sempre montado**, movido por `translateX` numa
 * transição de CSS. A versão anterior usava `layoutId` do motion e uma pastilha
 * que só existia no lado ativo: a cada troca, uma desmontava e outra montava, e
 * o motion tinha de medir as duas para animar entre elas. Ele media no mesmo
 * quadro em que o formulário inteiro mudava de altura — o modo "criar" traz
 * três campos a mais —, então a medida saía de um layout que já não existia. Daí
 * o atraso e a pastilha atravessando a tela para achar o lugar.
 *
 * Sem medição não há o que sair errado: são duas posições, 0 e 100% da largura
 * da própria pastilha, e a largura é calculada pelo CSS. O deslocamento até a
 * segunda aba é exatamente a largura dela — metade da pista menos o respiro —,
 * então `translateX(100%)` assenta no lugar certo em qualquer tela.
 */
function Alternador({
  modo,
  onModo,
}: {
  modo: Modo
  onModo: (m: Modo) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Entrar ou criar conta"
      className="relative grid grid-cols-2 rounded-[var(--radius-controle)] border-2 border-tinta bg-cartela p-1 shadow-[var(--shadow-duro-xs)]"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)]',
          'rounded-[8px] bg-azul transition-transform duration-200 ease-out',
          'motion-reduce:transition-none',
        )}
        style={{
          transform: modo === 'criar' ? 'translateX(100%)' : 'translateX(0)',
        }}
      />

      {(['entrar', 'criar'] as const).map((m) => {
        const ativo = modo === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => onModo(m)}
            className={cn(
              'relative z-10 h-10 rounded-[8px]',
              'font-titulo text-[13px] font-extrabold uppercase',
              'transition-colors duration-200',
              ativo ? 'text-azul-tinta' : 'text-apagado hover:text-tinta',
            )}
          >
            {m === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- O @ da comunidade ---------- */

/**
 * O `@`, com a caixa baixando enquanto se digita.
 *
 * O schema só aceita `^[a-z0-9_]{3,20}$`, e o envio já convertia para
 * minúscula — mas só no envio. Quem digitava "Eduardo" via o campo aceitar e o
 * formulário recusar, por uma regra que a tela não tinha como anunciar. Baixar
 * a caixa aqui é dizer a mesma coisa sem texto de erro: a pessoa vê o `E` virar
 * `e` no momento em que digita e entende a regra sozinha.
 *
 * Mora aqui, exportado, como o `CampoTelefone`: o `CompletarCadastro` pede o
 * mesmo `@` — é a segunda porta para o mesmo cadastro, quando o perfil não
 * nasceu junto com a sessão — e duas cópias sairiam de sintonia na primeira
 * mudança de regra.
 *
 * Reescreve o valor só quando ele muda de verdade, e devolve o cursor onde
 * estava: `value = ...` manda o cursor para o fim, o que só passa despercebido
 * enquanto se digita no fim. Quem volta para corrigir uma letra no meio perderia
 * o lugar a cada tecla. `toLowerCase()` não muda o comprimento das letras que
 * este campo aceita, então o índice de antes continua valendo.
 */
export function CampoUsuario({ erro }: { erro?: string }) {
  return (
    <Campo
      rotulo="Seu @ na comunidade"
      name="username"
      prefixo="@"
      autoComplete="username"
      autoCapitalize="none"
      spellCheck={false}
      // Sem o "@": o campo já desenha um, fixo, à esquerda — repetir aqui
      // mostraria "@ @usuario" na tela.
      placeholder="usuario"
      dica="É assim que os outros vão te achar."
      erro={erro}
      onChange={(e) => {
        const campo = e.currentTarget
        const minusculo = campo.value.toLowerCase()
        if (minusculo === campo.value) return
        const cursor = campo.selectionStart
        campo.value = minusculo
        campo.setSelectionRange(cursor, cursor)
      }}
    />
  )
}

/* ---------- WhatsApp ---------- */

/**
 * Formata enquanto digita. Deixa o campo não-controlado (o form lê por
 * FormData) e só reescreve o valor — assim o cursor não pula, que é o problema
 * clássico de máscara com estado controlado.
 */
export function CampoTelefone({ erro }: { erro?: string }) {
  return (
    <Campo
      rotulo="Seu WhatsApp"
      name="telefone"
      type="tel"
      inputMode="numeric"
      autoComplete="tel"
      placeholder="(91) 98765-4321"
      dica="Só aparece para quem fechar troca com você."
      erro={erro}
      onChange={(e) => {
        e.currentTarget.value = formatarTelefone(e.currentTarget.value)
      }}
    />
  )
}

/* ---------- Aceite dos termos ---------- */

function AceiteTermos({ erro }: { erro?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="aceite"
          className="mt-0.5 size-5 shrink-0 accent-[var(--color-azul)]"
          aria-invalid={erro ? true : undefined}
        />
        <span className="text-[14px] leading-relaxed text-apagado">
          Li e aceito os{' '}
          <LinkNoTexto to="/termos">termos de uso</LinkNoTexto>
          . Entendo que o TrocaTCG apenas conecta pessoas — a troca acontece
          entre vocês, presencialmente, por conta e risco de cada um.
        </span>
      </label>
      {erro && (
        <p role="alert" className="text-[13px] text-alerta">
          {erro}
        </p>
      )}
    </div>
  )
}

/* ---------- Utilitário ---------- */

function paraErros(erro: z.ZodError): Erros {
  const saida: Erros = {}
  for (const problema of erro.errors) {
    const campo = String(problema.path[0] ?? 'form')
    saida[campo] ??= problema.message
  }
  return saida
}
