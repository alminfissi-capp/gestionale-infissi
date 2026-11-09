// Dettagli costruttivi: per ogni serramento del rilievo i codici da ricopiare in FP PRO, una
// riga per ogni cosa. Stessa forma per le voci da struttura FP PRO e per quelle disegnate.
import type { NodoStruttura, PezzoStruttura } from '@/lib/fppro/strutture-xml'
import { coloriAccessori, telaiStruttura } from '@/lib/fppro/rilievo-fp'
import { datiRiepilogo } from '@/lib/fppro/riepilogo'
import { calcolaDisegno } from '@/lib/rilievo-grafico/geometria'
import { NOMI_MATERIALE } from '@/lib/rilievo-grafico/ruoli'
import { datiRiepilogoDisegnata } from '@/lib/rilievo-grafico/riepilogo-disegnata'
import { disegnoDellaVoce } from '@/lib/rilievo-unico'
import type { RuoloPezzo } from '@/types/rilievo-grafico'
import type { Lato, RifFp, StrutturaLocale, VoceDisegnata, VoceFpVera } from '@/types/rilievo-fp'

export type EtichettaRiga = 'Telaio' | 'Anta' | 'Riporto' | 'Montanti' | 'Traversi' | 'Fermavetro' | 'Vetri' | 'Accessori' | 'Colori'
export const RIGHE: EtichettaRiga[] = ['Telaio', 'Anta', 'Riporto', 'Montanti', 'Traversi', 'Fermavetro', 'Vetri', 'Accessori', 'Colori']

export interface DettagliVoce {
  titolo: string
  larghezza: number | null
  altezza: number | null
  /** m² di un pezzo (L x H, ingombro per le voci disegnate) */
  mqPezzo: number | null
  righe: Record<EtichettaRiga, string | null>
}

export const DA_ASSEGNARE = 'da assegnare'

const unici = (codici: string[]) => [...new Set(codici.filter(Boolean))]
const elenco = (codici: string[]) => (unici(codici).length ? unici(codici).join(' · ') : null)
/** "UP61840 (2)": per montanti e traversi conta i pezzi di ogni codice */
const conConteggio = (codici: string[]) => {
  if (codici.length === 0) return null
  const n = new Map<string, number>()
  for (const c of codici) n.set(c, (n.get(c) ?? 0) + 1)
  return [...n].map(([c, k]) => (c === DA_ASSEGNARE ? c : `${c} (${k})`)).join(' · ')
}

/** Colore unico, oppure interno ed esterno, piu' i colori degli accessori in ordine */
function testoColori(int: RifFp | null | undefined, est: RifFp | null | undefined, acc: RifFp[]): string | null {
  const parti: string[] = []
  if (int && est && int.fpId === est.fpId) parti.push(int.descrizione)
  else {
    if (int) parti.push(`int. ${int.descrizione}`)
    if (est) parti.push(`est. ${est.descrizione}`)
  }
  if (acc.length) parti.push(`acc. ${acc.map(c => c.descrizione).join(' / ')}`)
  return parti.length ? parti.join(' · ') : null
}

const LATI: { lato: Lato; breve: string }[] = [
  { lato: 'sinistra', breve: 'sx' }, { lato: 'alto', breve: 'alto' }, { lato: 'destra', breve: 'dx' }, { lato: 'basso', breve: 'basso' },
]
const nomeDxf = (dxf: string) => dxf.slice(Math.max(dxf.lastIndexOf('\\'), dxf.lastIndexOf('/')) + 1).replace(/\.dxf$/i, '')
const pezzi = (nodi: NodoStruttura[]): PezzoStruttura[] => nodi.flatMap(n => [...n.pezzi, ...pezzi(n.figli)])

export function dettagliVoceFp(v: VoceFpVera, s: Pick<StrutturaLocale, 'albero' | 'nome' | 'descrizione'> | null): DettagliVoce {
  const fp = v.fp
  const tutti = s ? pezzi(s.albero) : []
  const codici = (tipi: number[]) => tutti.filter(p => tipi.includes(p.tipo)).map(p => nomeDxf(p.dxf))

  const telai = { ...(s ? telaiStruttura(s.albero) : {}), ...fp.telai }
  const perLato = LATI.map(l => telai[l.lato]).filter((x): x is string => !!x)
  const telaio = perLato.length === 0 ? null
    : unici(perLato).length === 1 && perLato.length === 4 ? perLato[0]
      : LATI.filter(l => telai[l.lato]).map(l => `${l.breve} ${telai[l.lato]}`).join(' · ')

  const r = datiRiepilogo(v, s)
  return {
    titolo: [fp.nome, s?.descrizione, fp.serie ? `serie ${fp.serie}` : null].filter(Boolean).join(' · '),
    larghezza: fp.larghezza,
    altezza: fp.altezza,
    mqPezzo: fp.larghezza && fp.altezza ? (fp.larghezza * fp.altezza) / 1e6 : null,
    righe: {
      Telaio: telaio,
      Anta: fp.anta || elenco(codici([8090, 8100])),
      // Riporti verticali/orizzontali e dei bilici (8240 anta, 8250 telaio)
      Riporto: elenco(codici([8150, 8160, 8240, 8250])),
      Montanti: conConteggio(codici([8060])),
      Traversi: conConteggio(codici([8070])),
      // Il fermapannello (8270) e' il fermavetro dei campi a pannello
      Fermavetro: elenco(codici([8180, 8270])),
      Vetri: r.vetri,
      Accessori: r.accessori,
      Colori: testoColori(fp.coloreInt, fp.coloreEst, coloriAccessori(fp)),
    },
  }
}

const RUOLI: Partial<Record<EtichettaRiga, RuoloPezzo[]>> = {
  Telaio: ['telaio'], Anta: ['anta', 'anta_scorrevole'], Riporto: ['riporto'],
  Montanti: ['montante'], Traversi: ['traverso'], Fermavetro: ['fermavetro', 'fermapannello'],
}

export function dettagliVoceDisegnata(v: VoceDisegnata, nomiSerie: Map<number, string>): DettagliVoce {
  const disegno = disegnoDellaVoce(v)
  const calc = calcolaDisegno(disegno)
  const r = datiRiepilogoDisegnata(v, nomiSerie)
  // Solo i pezzi che esistono: assegnazioni di pezzi spariti non compaiono
  const codici = (ruoli: RuoloPezzo[]) => calc.pezzi.filter(p => ruoli.includes(p.ruolo)).map(p => disegno.profili[p.id]?.codice || DA_ASSEGNARE)
  const vetri = calc.zone.filter(z => z.foglia && z.materiale).map(z => {
    const a = disegno.riempimenti[z.id]
    if (!a || (a.materiale && a.materiale !== z.materiale)) return DA_ASSEGNARE
    // Come nelle voci FP PRO: il pannello si legge come tale, il vetro col solo codice
    return z.materiale === 'vetro' ? a.codice : `${NOMI_MATERIALE[z.materiale!]} ${a.codice}`
  })
  const riga = (e: EtichettaRiga) => {
    const c = codici(RUOLI[e] ?? [])
    return e === 'Montanti' || e === 'Traversi' ? conConteggio(c) : elenco(c)
  }
  return {
    titolo: [r.tipo, r.serie ? `serie ${r.serie}` : null].filter(Boolean).join(' · '),
    larghezza: r.larghezza,
    altezza: r.altezza,
    mqPezzo: (r.larghezza * r.altezza) / 1e6,
    righe: {
      Telaio: riga('Telaio'), Anta: riga('Anta'), Riporto: riga('Riporto'), Montanti: riga('Montanti'),
      Traversi: riga('Traversi'), Fermavetro: riga('Fermavetro'),
      Vetri: elenco(vetri),
      Accessori: r.accessori,
      Colori: testoColori(v.grafico.coloreInt, v.grafico.coloreEst, v.grafico.coloriAcc ?? []),
    },
  }
}

/** Nota scritta nella pagina: `base` = la nota della voce che l'utente ha davanti */
export interface StatoNota { testo: string; base: string }

/** Si salva solo se l'utente ha cambiato il testo (toccare e uscire non scrive niente) */
export const notaDaSalvare = (s: StatoNota) => s.testo !== s.base

/**
 * Nota della voce cambiata altrove (sincronizzazione, altra schermata): se il campo non e'
 * stato toccato si prende la nuova; se l'utente sta scrivendo, il suo testo resta.
 */
export function notaAggiornata(s: StatoNota, notaVoce: string): StatoNota {
  if (notaVoce === s.base) return s
  return { testo: s.testo === s.base ? notaVoce : s.testo, base: notaVoce }
}
