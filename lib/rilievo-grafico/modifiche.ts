// Modifiche all'albero delle zone: ogni funzione restituisce un albero nuovo (annulla e
// ripeti tengono le copie). Nessun profilo viene scelto qui: solo la struttura.
import type { Apertura, Contenuto, Materiale, PosizioneTagli, Verso, Zona } from '@/types/rilievo-grafico'

export const nuovoId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 10)

export const zonaVuota = (): Zona => ({ id: nuovoId(), contenuto: { tipo: 'vuoto' } })

/** Contenuto da dare alle zone nuove: lo stesso riempimento della zona di partenza */
const contenutoFoglia = (c: Contenuto): Contenuto =>
  c.tipo === 'riempimento' ? { tipo: 'riempimento', materiale: c.materiale } : { tipo: 'vuoto' }

const nuovaZona = (c: Contenuto): Zona => ({ id: nuovoId(), contenuto: contenutoFoglia(c) })

function figli(c: Contenuto): Zona[] {
  return c.tipo === 'divisione' ? c.parti : c.tipo === 'anta' ? c.ante : []
}

export function trovaZona(z: Zona, id: string): Zona | null {
  if (z.id === id) return z
  for (const f of figli(z.contenuto)) {
    const r = trovaZona(f, id)
    if (r) return r
  }
  return null
}

/** Zona che contiene la divisione o l'anta con questo id */
export function zonaDiElemento(z: Zona, elemento: string): Zona | null {
  const c = z.contenuto
  if ((c.tipo === 'divisione' || c.tipo === 'anta') && c.id === elemento) return z
  for (const f of figli(c)) {
    const r = zonaDiElemento(f, elemento)
    if (r) return r
  }
  return null
}

function sostituisci(z: Zona, id: string, fn: (z: Zona) => Zona): Zona {
  if (z.id === id) return fn(z)
  const c = z.contenuto
  if (c.tipo === 'divisione') return { ...z, contenuto: { ...c, parti: c.parti.map(f => sostituisci(f, id, fn)) } }
  if (c.tipo === 'anta') return { ...z, contenuto: { ...c, ante: c.ante.map(f => sostituisci(f, id, fn)) } }
  return z
}

const foglia = (z: Zona) => z.contenuto.tipo === 'vuoto' || z.contenuto.tipo === 'riempimento'

/** Divide una zona finale con `parti - 1` montanti o traversi */
export function dividi(radice: Zona, zonaId: string, verso: Verso, posizione: PosizioneTagli, parti: number): Zona {
  return sostituisci(radice, zonaId, z => {
    if (!foglia(z) || parti < 2) return z
    return {
      ...z,
      contenuto: {
        tipo: 'divisione', id: nuovoId(), verso, posizione,
        parti: Array.from({ length: parti }, () => nuovaZona(z.contenuto)),
      },
    }
  })
}

/** Griglia: colonne x righe in parti uguali. `passanti` = quale profilo va da parte a parte */
export function griglia(radice: Zona, zonaId: string, colonne: number, righe: number, passanti: Verso): Zona {
  return sostituisci(radice, zonaId, z => {
    if (!foglia(z)) return z
    const [primo, secondo, nPrimo, nSecondo]: [Verso, Verso, number, number] =
      passanti === 'montante' ? ['montante', 'traverso', colonne, righe] : ['traverso', 'montante', righe, colonne]
    const interna = (): Zona => nSecondo < 2
      ? nuovaZona(z.contenuto)
      : {
          id: nuovoId(),
          contenuto: {
            tipo: 'divisione', id: nuovoId(), verso: secondo, posizione: { modo: 'uguali' },
            parti: Array.from({ length: nSecondo }, () => nuovaZona(z.contenuto)),
          },
        }
    if (nPrimo < 2) return nSecondo < 2 ? z : { ...interna(), id: z.id }
    return {
      ...z,
      contenuto: { tipo: 'divisione', id: nuovoId(), verso: primo, posizione: { modo: 'uguali' }, parti: Array.from({ length: nPrimo }, interna) },
    }
  })
}

/** Mette una o piu' ante nella zona; dentro ogni anta resta il riempimento che c'era (vetro se vuota) */
export function mettiAnta(radice: Zona, zonaId: string, apertura: Apertura, numero: number, mano: 'sx' | 'dx' | null): Zona {
  return sostituisci(radice, zonaId, z => {
    if (!foglia(z)) return z
    const dentro: Contenuto = z.contenuto.tipo === 'riempimento' ? z.contenuto : { tipo: 'riempimento', materiale: 'vetro' }
    return {
      ...z,
      contenuto: { tipo: 'anta', id: nuovoId(), apertura, mano, ante: Array.from({ length: Math.max(1, numero) }, () => nuovaZona(dentro)) },
    }
  })
}

export function aggiornaAnta(radice: Zona, antaId: string, p: { apertura?: Apertura; numero?: number; mano?: 'sx' | 'dx' | null }): Zona {
  const z = zonaDiElemento(radice, antaId)
  if (!z || z.contenuto.tipo !== 'anta') return radice
  const c = z.contenuto
  const numero = Math.max(1, Math.min(6, p.numero ?? c.ante.length))
  const ante = c.ante.slice(0, numero)
  while (ante.length < numero) ante.push(nuovaZona(c.ante[c.ante.length - 1]?.contenuto ?? { tipo: 'riempimento', materiale: 'vetro' }))
  return sostituisci(radice, z.id, () => ({
    ...z,
    contenuto: { ...c, apertura: p.apertura ?? c.apertura, mano: p.mano !== undefined ? p.mano : c.mano, ante },
  }))
}

/** Riempie una zona finale (null = la lascia vuota) */
export function riempi(radice: Zona, zonaId: string, materiale: Materiale | null): Zona {
  return sostituisci(radice, zonaId, z => (foglia(z)
    ? { ...z, contenuto: materiale ? { tipo: 'riempimento', materiale } : { tipo: 'vuoto' } }
    : z))
}

/** Primo riempimento che si trova scendendo nell'albero */
function primoRiempimento(z: Zona): Contenuto {
  if (foglia(z)) return contenutoFoglia(z.contenuto)
  for (const f of figli(z.contenuto)) {
    const r = primoRiempimento(f)
    if (r.tipo === 'riempimento') return r
  }
  return { tipo: 'vuoto' }
}

/** Toglie una divisione o un'anta: la zona torna intera, col riempimento che aveva dentro */
export function eliminaElemento(radice: Zona, elemento: string): Zona {
  const z = zonaDiElemento(radice, elemento)
  if (!z) return radice
  return sostituisci(radice, z.id, () => ({ id: z.id, contenuto: primoRiempimento(z) }))
}

/** Cambia la posizione dei tagli di una divisione (stesso numero di parti) */
export function impostaPosizione(radice: Zona, divisione: string, posizione: PosizioneTagli): Zona {
  const z = zonaDiElemento(radice, divisione)
  if (!z || z.contenuto.tipo !== 'divisione') return radice
  const c = z.contenuto
  return sostituisci(radice, z.id, () => ({ ...z, contenuto: { ...c, posizione } }))
}

/** Toglie un solo taglio di una divisione: le due parti accanto diventano una */
export function eliminaTaglio(radice: Zona, divisione: string, indice: number, quoteAttuali: number[]): Zona {
  const z = zonaDiElemento(radice, divisione)
  if (!z || z.contenuto.tipo !== 'divisione') return radice
  const c = z.contenuto
  if (c.parti.length <= 2) return eliminaElemento(radice, divisione)
  const parti = c.parti.filter((_, i) => i !== indice + 1)
  const posizione: PosizioneTagli = c.posizione.modo === 'uguali'
    ? c.posizione
    : { ...c.posizione, quote: quoteAttuali.filter((_, i) => i !== indice) }
  return sostituisci(radice, z.id, () => ({ ...z, contenuto: { ...c, parti, posizione } }))
}

/** Tutti gli id delle zone finali, per togliere le assegnazioni rimaste orfane */
export function zoneFinali(z: Zona): string[] {
  return foglia(z) ? [z.id] : figli(z.contenuto).flatMap(zoneFinali)
}

export const radiceIniziale = (): Zona => ({ id: nuovoId(), contenuto: { tipo: 'riempimento', materiale: 'vetro' } })
