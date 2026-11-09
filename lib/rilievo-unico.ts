// Rilievo unico: una voce e' da struttura FP PRO (fp) oppure disegnata (grafico).
import type { DisegnoGrafico } from '@/types/rilievo-grafico'
import { formaIniziale, formaInPunti } from '@/lib/rilievo-grafico/forma'
import { radiceIniziale } from '@/lib/rilievo-grafico/modifiche'
import type { AccessorioAggiunto, VoceDisegnata, VoceFp, VoceFpDati, VoceFpVera, VoceGraficoDati } from '@/types/rilievo-fp'

// Generiche: servono anche sulle righe del telefono (VoceLocale), che hanno daInviare in piu'.
export const eVoceDisegnata = <T extends VoceFp>(v: T): v is T & { fp: null; grafico: VoceGraficoDati } => v.fp === null && !!v.grafico
export const eVoceFp = <T extends VoceFp>(v: T): v is T & { fp: VoceFpDati } => v.fp !== null && v.fp !== undefined

/** Disegno completo della voce: quello del cantiere piu' le assegnazioni dell'ufficio */
export function disegnoDellaVoce(v: VoceDisegnata): DisegnoGrafico {
  return { ...v.grafico, profili: v.assegnazioni?.profili ?? {}, riempimenti: v.assegnazioni?.riempimenti ?? {} }
}

/** Riepilogo stampabile: per ora solo le voci FP PRO (le disegnate arrivano con la parte 2) */
export function vociDelRiepilogo(voci: VoceFp[]): { fp: VoceFpVera[]; disegnate: number } {
  return { fp: voci.filter(eVoceFp), disegnate: voci.filter(eVoceDisegnata).length }
}

/** Voce disegnata appena aggiunta: rettangolo 1200 x 1400 a punti, da modificare sul disegno */
export function nuovaVoceDisegnata(rilievoId: string, ordine: number, ora: string): VoceDisegnata {
  return {
    id: crypto.randomUUID(), rilievoId, ordine, posizione: '', quantita: 1, note: '',
    fp: null,
    grafico: { forma: { tipo: 'punti', punti: formaInPunti(formaIniziale()) }, radice: radiceIniziale(), serie: [] },
    assegnazioni: null, assegnazioniAt: null, aggiornatoAt: ora,
  }
}

/** Copia di una voce disegnata, in fondo all'elenco: stesso disegno e stessi profili */
export function copiaVoceDisegnata(v: VoceDisegnata, ordine: number, ora: string, id: string): VoceDisegnata {
  return {
    ...v, id, ordine, aggiornatoAt: ora,
    grafico: structuredClone(v.grafico),
    assegnazioni: v.assegnazioni ? structuredClone(v.assegnazioni) : null,
    assegnazioniAt: v.assegnazioniAt ?? null,
  }
}

/** Accessorio scelto dal catalogo: stesso codice e serie = un pezzo in piu', altrimenti in fondo */
export function aggiungiAccessorio(
  lista: AccessorioAggiunto[], a: { codice: string; descrizione: string | null; serie: string | null },
): AccessorioAggiunto[] {
  const serie = a.serie ?? ''
  const gia = lista.findIndex(x => x.codice === a.codice && x.serie === serie)
  return gia >= 0
    ? lista.map((x, j) => (j === gia ? { ...x, quantita: x.quantita + 1 } : x))
    : [...lista, { codice: a.codice, descrizione: a.descrizione ?? '', serie, quantita: 1 }]
}

type ConAssegnazioni = { assegnazioni?: VoceFp['assegnazioni']; assegnazioniAt?: string | null }
/**
 * Salvando il disegno nel dispositivo, le assegnazioni sono quelle gia' nel dispositivo (le
 * scrive solo l'ufficio, dopo che il server le ha accettate): mai quelle provvisorie
 * dell'editor, che il server potrebbe aver rifiutato. Voce non ancora nel dispositivo: le sue.
 */
export function assegnazioniDaTenere(attuale: ConAssegnazioni | undefined, voce: ConAssegnazioni) {
  const da = attuale ?? voce
  return { assegnazioni: da.assegnazioni ?? null, assegnazioniAt: da.assegnazioniAt ?? null }
}

/**
 * Passo di Annulla/Ripeti del disegno: torna la forma, la struttura e le scritte di allora,
 * ma colori e accessori restano quelli di adesso (si cambiano nella scheda 3, non si annullano
 * dal disegno).
 */
export const conFinituraDi = (passo: VoceGraficoDati, adesso: VoceGraficoDati): VoceGraficoDati => ({
  ...passo,
  coloreInt: adesso.coloreInt, coloreEst: adesso.coloreEst, coloriAcc: adesso.coloriAcc, accessoriAggiunti: adesso.accessoriAggiunti,
})

/**
 * Assegnazioni dell'ufficio arrivate nel dispositivo mentre l'editor e' aperto: da prendere
 * solo se piu' recenti di quelle che l'editor ha gia' (null = niente da fare).
 */
export function assegnazioniArrivate(editor: ConAssegnazioni, arrivate: ConAssegnazioni) {
  if (!arrivate.assegnazioniAt || Number.isNaN(Date.parse(arrivate.assegnazioniAt))) return null
  if (editor.assegnazioniAt === arrivate.assegnazioniAt) return null
  if (editor.assegnazioniAt && Date.parse(editor.assegnazioniAt) >= Date.parse(arrivate.assegnazioniAt)) return null
  return { assegnazioni: arrivate.assegnazioni ?? null, assegnazioniAt: arrivate.assegnazioniAt }
}
