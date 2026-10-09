import type { FileFornitoreOrdine, StatoConferma } from '@/types/produzione'

/** Formati accettati: gli stessi che il bucket `commesse-docs` lascia passare. */
export const TIPI_FILE_FORNITORE = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const

/** Tetto del bucket `commesse-docs` (20 MB): oltre, Storage rifiuterebbe comunque. */
export const DIMENSIONE_MAX_FILE_FORNITORE = 20 * 1024 * 1024

/**
 * Freno ai caricamenti da un link pubblico: un ordine vero non arriva mai a
 * tanti file, uno script che martella il link si ferma qui.
 */
export const MAX_FILE_PER_ORDINE = 60

/**
 * Pezzi del caricamento di riserva, che passa dal nostro server: il corpo di
 * una richiesta a una function Vercel si ferma a ~4,5 MB, quindi i file piu'
 * grandi viaggiano a pezzi e il server li ricompone.
 */
export const DIMENSIONE_PARTE = 3.5 * 1024 * 1024
export const MAX_PARTI = Math.ceil(DIMENSIONE_MAX_FILE_FORNITORE / DIMENSIONE_PARTE)

const TIPO_DA_ESTENSIONE: Record<string, (typeof TIPI_FILE_FORNITORE)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/**
 * Formato del file scelto dal fornitore. Su Android il browser lascia spesso
 * vuoto `file.type` (o mette application/octet-stream) per i file presi da
 * Drive, Gmail o da alcuni gestori file: in quel caso decide l'estensione.
 */
export function tipoFileFornitore(nome: string, tipoDichiarato: string): string {
  if ((TIPI_FILE_FORNITORE as readonly string[]).includes(tipoDichiarato)) return tipoDichiarato
  const estensione = nome.split('.').pop()?.toLowerCase() ?? ''
  return TIPO_DA_ESTENSIONE[estensione] ?? (tipoDichiarato || 'application/octet-stream')
}

/** Motivo per cui il file non si puo' caricare, oppure null se va bene. */
export function validaFileFornitore(contentType: string, dimensione: number): string | null {
  if (!(TIPI_FILE_FORNITORE as readonly string[]).includes(contentType)) {
    return 'Formato non accettato: caricate un PDF o una foto (JPG, PNG)'
  }
  if (!Number.isFinite(dimensione) || dimensione <= 0) return 'Il file è vuoto'
  if (dimensione > DIMENSIONE_MAX_FILE_FORNITORE) return 'Il file supera i 20 MB'
  return null
}

/**
 * Nome usabile in un path di Storage: niente cartelle, niente caratteri che
 * Storage rifiuta. Il nome originale resta a DB per mostrarlo.
 */
export function nomeFileSicuro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  const pulito = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+/, '')
    .slice(-80)
  return pulito || 'file'
}

/** Cartella temporanea dei pezzi del caricamento di riserva: fuori da quella dei file veri. */
export function cartellaPartiFornitore(orgId: string, ordineId: string, idCaricamento: string): string {
  return `${orgId}/ordini/${ordineId}/fornitore-parti/${idCaricamento}/`
}

/** Cartella dei file del fornitore per un ordine: anche il controllo dei path parte da qui. */
export function cartellaFileFornitore(orgId: string, ordineId: string): string {
  return `${orgId}/ordini/${ordineId}/fornitore/`
}

export type StatoConfermaOrdine =
  | 'non_richiesta'
  | 'in_attesa'
  | 'da_firmare'
  | 'firmata'
  | 'firmata_manuale'

export type RiepilogoConferma = {
  stato: StatoConfermaOrdine
  /** La conferma che decide lo stato: l'ultima non sostituita. */
  conferma: FileFornitoreOrdine | null
}

const PRIORITA: Record<StatoConferma, number> = {
  da_firmare: 3,
  firmata: 2,
  firmata_manuale: 2,
  sostituita: 0,
}

/**
 * Stato della conferma di un ordine a partire dai suoi file.
 *
 * Una conferma da firmare vince sempre: se il fornitore ne manda una nuova
 * dopo che la precedente e' stata firmata, l'ordine torna "da firmare".
 * Una conferma caricata quando l'ordine non la richiedeva conta lo stesso.
 */
export function riepilogaConferma(
  richiesta: boolean,
  file: FileFornitoreOrdine[]
): RiepilogoConferma {
  const conferme = file
    .filter((f) => f.tipo === 'conferma' && f.stato && f.stato !== 'sostituita')
    .sort((a, b) => {
      const p = PRIORITA[b.stato as StatoConferma] - PRIORITA[a.stato as StatoConferma]
      if (p !== 0) return p
      return Date.parse(b.created_at) - Date.parse(a.created_at)
    })
  const conferma = conferme[0] ?? null
  if (!conferma) return { stato: richiesta ? 'in_attesa' : 'non_richiesta', conferma: null }
  return { stato: conferma.stato as StatoConfermaOrdine, conferma }
}

export const ETICHETTE_STATO_CONFERMA: Record<StatoConfermaOrdine, string> = {
  non_richiesta: 'Non richiesta',
  in_attesa: 'In attesa',
  da_firmare: 'Da firmare',
  firmata: 'Firmata',
  firmata_manuale: 'Firmata (caricata a mano)',
}

/** Rettangolo del timbro sulla pagina come la vede l'utente: frazioni 0..1 dall'angolo in alto a sinistra. */
export type PosizioneFirma = { x: number; y: number; larghezza: number; altezza: number }

export type BoxPdf = { x: number; y: number; width: number; height: number }

/** Dove disegnare l'immagine in coordinate PDF, con la rotazione da passare a pdf-lib. */
export type DisegnoFirma = { x: number; y: number; width: number; height: number; rotate: number }

/**
 * Porta il rettangolo scelto a video nelle coordinate della pagina PDF.
 *
 * Il visualizzatore mostra il crop box gia' ruotato di `/Rotate` gradi in
 * senso orario; pdf-lib invece disegna nello spazio non ruotato, con l'origine
 * in basso a sinistra. Perche' timbro e firma restino dritti a video,
 * l'immagine va ancorata all'angolo che a video e' in basso a sinistra e
 * ruotata in senso antiorario della stessa quantita' (rotate di pdf-lib).
 */
export function posizioneSuPdf(pos: PosizioneFirma, box: BoxPdf, rotazione: number): DisegnoFirma {
  const r = (((Math.round(rotazione / 90) * 90) % 360) + 360) % 360
  const { x: cx, y: cy, width: cw, height: ch } = box

  // Punto a video (frazioni u verso destra, v verso il basso) → spazio PDF.
  const mappa = (u: number, v: number): { x: number; y: number } => {
    switch (r) {
      case 90:  return { x: cx + v * cw,      y: cy + u * ch }
      case 180: return { x: cx + cw - u * cw, y: cy + v * ch }
      case 270: return { x: cx + cw - v * cw, y: cy + ch - u * ch }
      default:  return { x: cx + u * cw,      y: cy + ch - v * ch }
    }
  }

  // Larghezza e altezza della pagina come appare a video.
  const larghezzaVista = r === 90 || r === 270 ? ch : cw
  const altezzaVista = r === 90 || r === 270 ? cw : ch

  const ancora = mappa(pos.x, pos.y + pos.altezza)
  return {
    x: ancora.x,
    y: ancora.y,
    width: pos.larghezza * larghezzaVista,
    height: pos.altezza * altezzaVista,
    rotate: r,
  }
}

/** Tiene il rettangolo dentro la pagina mentre lo si trascina. */
export function limitaPosizione(pos: PosizioneFirma): PosizioneFirma {
  const larghezza = Math.min(Math.max(pos.larghezza, 0.05), 1)
  const altezza = Math.min(Math.max(pos.altezza, 0.02), 1)
  return {
    larghezza,
    altezza,
    x: Math.min(Math.max(pos.x, 0), 1 - larghezza),
    y: Math.min(Math.max(pos.y, 0), 1 - altezza),
  }
}

/**
 * Posizione proposta: in basso a destra, dove i moduli d'ordine mettono di
 * solito "timbro e firma per accettazione". `rapporto` = altezza/larghezza del
 * timbro composto, `rapportoPagina` = altezza/larghezza della pagina a video.
 */
export function posizioneProposta(rapporto: number, rapportoPagina: number): PosizioneFirma {
  const larghezza = 0.34
  const altezza = (larghezza * rapporto) / rapportoPagina
  return limitaPosizione({ x: 1 - larghezza - 0.06, y: 1 - altezza - 0.05, larghezza, altezza })
}

/** Testo delle note per l'email: righe preservate, HTML neutralizzato. */
export function noteInHtml(note: string): string {
  return note
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>')
}
