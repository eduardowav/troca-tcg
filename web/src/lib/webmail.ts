/**
 * Qual caixa de entrada abrir, a partir do domínio do e-mail.
 *
 * A tela de "confirme seu e-mail" pede uma ação que **acontece fora do app**, e
 * esse é o ponto mais frágil do cadastro: a pessoa precisa sair daqui, lembrar
 * qual é o e-mail dela, achar a mensagem e voltar. Cada um desses passos perde
 * gente. Um botão que abre a caixa certa corta os três primeiros.
 *
 * **Só endereços que o app reconhece ganham botão.** Domínio próprio, de
 * empresa ou de provedor pequeno cai no texto genérico — mandar alguém para o
 * webmail errado é pior que não mandar, porque ela vai achar que o e-mail se
 * perdeu.
 *
 * Os endereços são os de **busca**, e não a raiz do webmail: chegar na caixa e
 * ter que procurar entre promoções é onde o e-mail de confirmação some. No
 * celular, o Gmail e o Outlook abrem o próprio aplicativo a partir destes
 * mesmos endereços — não há link `googlegmail://` aqui de propósito, porque
 * esquema que o sistema não conhece falha em silêncio.
 */

export interface Webmail {
  /** Como a pessoa chama esse serviço. Vai no botão: "Abrir o Gmail". */
  nome: string
  url: string
}

/** Busca por remetente, que é o que separa o nosso e-mail do resto da caixa. */
const REMETENTE = 'trocatcg'

const POR_DOMINIO: Record<string, Webmail> = {
  'gmail.com': {
    nome: 'Gmail',
    url: `https://mail.google.com/mail/u/0/#search/${REMETENTE}`,
  },
  'googlemail.com': {
    nome: 'Gmail',
    url: `https://mail.google.com/mail/u/0/#search/${REMETENTE}`,
  },
  'outlook.com': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'outlook.com.br': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'hotmail.com': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'hotmail.com.br': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'live.com': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'msn.com': { nome: 'Outlook', url: 'https://outlook.live.com/mail/0/' },
  'icloud.com': { nome: 'iCloud Mail', url: 'https://www.icloud.com/mail/' },
  'me.com': { nome: 'iCloud Mail', url: 'https://www.icloud.com/mail/' },
  'mac.com': { nome: 'iCloud Mail', url: 'https://www.icloud.com/mail/' },
  'yahoo.com': { nome: 'Yahoo Mail', url: 'https://mail.yahoo.com/' },
  'yahoo.com.br': { nome: 'Yahoo Mail', url: 'https://mail.yahoo.com/' },
  'proton.me': { nome: 'Proton Mail', url: 'https://mail.proton.me/' },
  'protonmail.com': { nome: 'Proton Mail', url: 'https://mail.proton.me/' },
  // Os brasileiros: aparecem pouco em app de jogo, e custam duas linhas.
  'uol.com.br': { nome: 'UOL Mail', url: 'https://email.uol.com.br/' },
  'bol.com.br': { nome: 'BOL', url: 'https://email.bol.uol.com.br/' },
  'terra.com.br': { nome: 'Terra Mail', url: 'https://mail.terra.com.br/' },
  'ig.com.br': { nome: 'iG Mail', url: 'https://email.ig.com.br/' },
  'globo.com': { nome: 'Globomail', url: 'https://email.globo.com/' },
  'globomail.com': { nome: 'Globomail', url: 'https://email.globo.com/' },
  'zoho.com': { nome: 'Zoho Mail', url: 'https://mail.zoho.com/' },
  'aol.com': { nome: 'AOL Mail', url: 'https://mail.aol.com/' },
}

/** O webmail do endereço, ou `null` quando não dá para saber. */
export function webmailDoEmail(email: string): Webmail | null {
  const dominio = email.trim().toLowerCase().split('@')[1]
  if (!dominio) return null
  return POR_DOMINIO[dominio] ?? null
}
