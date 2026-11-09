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
