import { api } from '@/lib/api'

/**
 * Os motivos, espelhando o Literal da API e o check do banco
 * (api/app/schemas/report.py, db/schema/22_denuncias.sql).
 */
export type MotivoDenuncia =
  | 'NAO_APARECEU'
  | 'USO_PARA_VENDA'
  | 'CARTA_DIFERENTE'
  | 'CONDUTA'
  | 'OUTRO'

/**
 * Como cada motivo é dito para quem está denunciando.
 *
 * Frases na voz de quem escreve, não rótulos de taxonomia: quem abre esta lista
 * está chateado e quer achar rápido o que aconteceu com ele. "Não apareceu no
 * encontro" se acha; "NAO_APARECEU" se decifra.
 *
 * A ordem é a da frequência esperada, e não é neutra: o furo vem primeiro
 * porque é o que motiva quase toda denúncia de um app de trocas presenciais, e
 * "Outro" fica por último porque lista com escape fácil no topo vira lista de
 * um item só — e denúncia sem categoria não agrega para quem modera.
 */
export const MOTIVOS: { valor: MotivoDenuncia; rotulo: string; dica: string }[] = [
  {
    valor: 'NAO_APARECEU',
    rotulo: 'Não apareceu no encontro',
    dica: 'Combinaram hora e lugar, e a pessoa não foi.',
  },
  {
    valor: 'CARTA_DIFERENTE',
    rotulo: 'A carta não era a anunciada',
    dica: 'Estado, acabamento, idioma ou edição diferentes do anúncio.',
  },
  {
    valor: 'USO_PARA_VENDA',
    rotulo: 'Queria vender, não trocar',
    dica: 'O TrocaTCG é para troca entre colecionadores.',
  },
  {
    valor: 'CONDUTA',
    rotulo: 'Tratamento abusivo',
    dica: 'Ofensa, ameaça ou qualquer coisa que passou do ponto.',
  },
  { valor: 'OUTRO', rotulo: 'Outro motivo', dica: 'Conte com suas palavras.' },
]

/** O limite do campo livre, igual ao `max_length` de DenunciaCriar. */
export const LIMITE_DESCRICAO = 1000

/** O recibo. Não promete desfecho — ver api/app/schemas/report.py. */
export interface Denuncia {
  id: string
  motivo: MotivoDenuncia
  criado_em: string
}

/**
 * Denuncia a outra pessoa desta troca.
 *
 * O denunciado não vai no corpo: a API o lê do match. Aqui isso significa que
 * não há como errar de pessoa — e que denunciar exige ter cruzado com ela.
 */
export const denunciarMatch = (
  id: string,
  motivo: MotivoDenuncia,
  descricao?: string,
) =>
  api.post<Denuncia>(`/me/matches/${id}/denunciar`, {
    motivo,
    descricao: descricao?.trim() || null,
  })
