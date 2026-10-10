/**
 * Tabelle di FP PRO (MySQL fp_pro32_edilsider) copiate nelle tabelle fp_* di Supabase.
 *
 * Lo usa il ponte sul PC (ponte/src/sincronizza.ts), che lo esegue con Node SENZA
 * build: questo file non deve importare nulla (niente alias '@/', niente altri file).
 *
 * I decimali arrivano da mysql2 come stringhe ('374.4250'): passano sempre da numero().
 */

export type Riga = Record<string, unknown>

export interface RigaFp {
  fp_id: number
  dati: Record<string, unknown>
  [colonna: string]: unknown
}

export interface TabellaSync {
  /** Tabella MySQL di cui si controllano le colonne */
  mysql: string
  /** Tabella Supabase di destinazione */
  supabase: string
  sql: string
  /** Colonne MySQL usate da mappa(): se ne manca una, la sync si ferma */
  colonne: string[]
  mappa: (r: Riga) => RigaFp
}

export function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function testo(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

/** In FP PRO "vero" e' 1 oppure -1 */
export function flag(v: unknown): boolean {
  return v !== null && v !== undefined && Number(v) !== 0
}

/** Riga originale senza i campi vuoti: va in `dati` per usi futuri. */
export function compatta(r: Riga): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined || v === '') continue
    if (v instanceof Date) {
      out[k] = v.toISOString()
      continue
    }
    if (typeof v === 'object') continue // blob/binari: non servono
    out[k] = v
  }
  return out
}

function id(v: unknown): number {
  const n = numero(v)
  if (n === null) throw new Error(`id non valido: ${String(v)}`)
  return n
}

export const TABELLE_SYNC: TabellaSync[] = [
  {
    mysql: 'serie_profili',
    supabase: 'fp_serie',
    sql: 'select * from serie_profili order by pkid',
    colonne: ['pkid', 'serie', 'nomeestesoserie', 'visibile'],
    mappa: r => ({
      fp_id: id(r.pkid),
      nome: testo(r.serie) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.nomeestesoserie),
      visibile: r.visibile === null || r.visibile === undefined ? true : flag(r.visibile),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'profili',
    supabase: 'fp_profili',
    sql: 'select * from profili order by pkid',
    colonne: ['pkid', 'serieid', 'codice', 'descr', 'kg_ml', 'larghezza', 'costo_kg', 'costo_ml',
      'varlistino', 'tolleranza_estrusione', 'nome_file_dxf'],
    mappa: r => ({
      fp_id: id(r.pkid),
      serie_fp_id: numero(r.serieid),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      kg_ml: numero(r.kg_ml),
      larghezza: numero(r.larghezza),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      var_listino: numero(r.varlistino),
      tolleranza_estrusione: numero(r.tolleranza_estrusione),
      file_dxf: testo(r.nome_file_dxf),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'costo_profili',
    supabase: 'fp_profili_costi',
    sql: 'select * from costo_profili order by pkid',
    colonne: ['pkid', 'profiloid', 'trattsupid', 'codiceproftrattato', 'costo_kg', 'costo_ml', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      profilo_fp_id: id(r.profiloid),
      colore_fp_id: numero(r.trattsupid),
      codice_trattato: testo(r.codiceproftrattato),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'trattamenti_superficiali',
    supabase: 'fp_colori',
    sql: 'select * from trattamenti_superficiali order by pkid',
    colonne: ['pkid', 'descr', 'tipo', 'costo_kg', 'costo_ml', 'costomq', 'isforprof', 'isforfit',
      'isforglass', 'rgbortexture'],
    mappa: r => ({
      fp_id: id(r.pkid),
      descrizione: testo(r.descr) ?? `#${String(r.pkid)}`,
      tipo: numero(r.tipo),
      costo_kg: numero(r.costo_kg),
      costo_ml: numero(r.costo_ml),
      costo_mq: numero(r.costomq),
      per_profili: flag(r.isforprof),
      per_accessori: flag(r.isforfit),
      per_vetri: flag(r.isforglass),
      rgb: testo(r.rgbortexture),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'accessori',
    supabase: 'fp_accessori',
    sql: 'select a.*, sa.serie as serie_nome from accessori a ' +
      'left join serie_accessori sa on sa.pkid = a.serieid order by a.pkid',
    colonne: ['pkid', 'serieid', 'codice', 'descr', 'costo_grezzo', 'un_vend', 'confezione',
      'min_fatt', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      serie: testo(r.serie_nome),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      prezzo: numero(r.costo_grezzo),
      unita_vendita: numero(r.un_vend),
      confezione: numero(r.confezione),
      min_fatt: numero(r.min_fatt),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'costo_accessori',
    supabase: 'fp_accessori_costi',
    sql: 'select * from costo_accessori order by pkid',
    colonne: ['pkid', 'accessorioid', 'trattsupid', 'codiceacctrattato', 'ppu_vend', 'costounitario',
      'un_vend', 'varlistino'],
    mappa: r => ({
      fp_id: id(r.pkid),
      accessorio_fp_id: id(r.accessorioid),
      colore_fp_id: numero(r.trattsupid),
      codice_trattato: testo(r.codiceacctrattato),
      prezzo: numero(r.ppu_vend),
      costo_unitario: numero(r.costounitario),
      unita_vendita: numero(r.un_vend),
      var_listino: numero(r.varlistino),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'vetri',
    supabase: 'fp_vetri',
    sql: 'select * from vetri order by pkid',
    colonne: ['pkid', 'codice', 'descr', 'costo_grezzo', 'min_fatt', 'spessore', 'kg_mq', 'varlistino',
      'vetroisolante'],
    mappa: r => ({
      fp_id: id(r.pkid),
      codice: testo(r.codice) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      prezzo_mq: numero(r.costo_grezzo),
      min_fatt: numero(r.min_fatt),
      spessore: numero(r.spessore),
      kg_mq: numero(r.kg_mq),
      var_listino: numero(r.varlistino),
      isolante: flag(r.vetroisolante),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'kit',
    supabase: 'fp_kit',
    sql: 'select * from kit order by pkid',
    colonne: ['pkid', 'gruppoid', 'nomekit', 'descr', 'opzionale', 'predefinito', 'numeroante',
      'l_vano_min', 'l_vano_max', 'h_vano_min', 'h_vano_max'],
    mappa: r => ({
      fp_id: id(r.pkid),
      nome: testo(r.nomekit) ?? `#${String(r.pkid)}`,
      descrizione: testo(r.descr),
      gruppo_fp_id: numero(r.gruppoid),
      opzionale: flag(r.opzionale),
      predefinito: flag(r.predefinito),
      numero_ante: numero(r.numeroante),
      l_min: numero(r.l_vano_min),
      l_max: numero(r.l_vano_max),
      h_min: numero(r.h_vano_min),
      h_max: numero(r.h_vano_max),
      dati: compatta(r),
    }),
  },
  {
    mysql: 'dettagliokit',
    supabase: 'fp_kit_righe',
    sql: 'select * from dettagliokit order by iditem',
    colonne: ['iditem', 'kitid', 'tipo', 'codice', 'descr', 'num_base', 'opzionale', 'dim_rif',
      'lim_inf_range', 'lim_sup_range', 'step', 'formulal', 'formulah', 'formular', 'formuladist'],
    mappa: r => ({
      fp_id: id(r.iditem),
      kit_fp_id: id(r.kitid),
      tipo: numero(r.tipo),
      codice: testo(r.codice),
      descrizione: testo(r.descr),
      quantita: numero(r.num_base),
      opzionale: flag(r.opzionale),
      dim_rif: numero(r.dim_rif),
      lim_inf: numero(r.lim_inf_range),
      lim_sup: numero(r.lim_sup_range),
      passo: numero(r.step),
      formula_l: testo(r.formulal),
      formula_h: testo(r.formulah),
      formula_r: testo(r.formular),
      formula_dist: testo(r.formuladist),
      dati: compatta(r),
    }),
  },
]

/**
 * Controlla la sorgente PRIMA di scrivere: se manca una colonna (aggiornamento di
 * FP PRO) o la tabella e' vuota (FP PRO chiuso, archivio sbagliato) restituisce il
 * messaggio d'errore e la sincronizzazione non tocca niente.
 */
export function verificaSorgente(t: TabellaSync, righe: Riga[], colonnePresenti: string[]): string | null {
  const presenti = new Set(colonnePresenti.map(c => c.toLowerCase()))
  const mancanti = t.colonne.filter(c => !presenti.has(c))
  if (mancanti.length > 0) {
    return `FP PRO: nella tabella ${t.mysql} mancano le colonne ${mancanti.join(', ')}. ` +
      'Forse FP PRO e\' stato aggiornato. Sincronizzazione annullata, nessun dato modificato.'
  }
  if (righe.length === 0) {
    return `FP PRO: la tabella ${t.mysql} e' vuota. Sincronizzazione annullata, nessun dato modificato.`
  }
  return null
}

export function aBlocchi<T>(righe: T[], dimensione: number): T[][] {
  const blocchi: T[][] = []
  for (let i = 0; i < righe.length; i += dimensione) blocchi.push(righe.slice(i, i + dimensione))
  return blocchi
}

/** JSON con le chiavi in ordine: stessa riga = stessa stringa. */
function jsonStabile(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonStabile).join(',')}]`
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${jsonStabile(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

/**
 * Impronta di una riga (hash cyrb53 del JSON ordinato). Serve a riscrivere solo le
 * righe cambiate: riscriverle tutte lascerebbe ~100 MB di righe morte a ogni giro.
 * Si confronta solo con la riga dello stesso fp_id, quindi 53 bit bastano.
 */
export function impronta(r: Record<string, unknown>): string {
  const s = jsonStabile(r)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export interface RigaEsistente {
  fp_id: number
  impronta: string | null
  presente: boolean
}

/**
 * Confronta le righe lette da FP PRO con quelle gia' in Supabase:
 * - daScrivere: nuove, cambiate, o ricomparse dopo essere state segnate assenti;
 * - daSegnareAssenti: fp_id presenti in Supabase ma spariti da FP PRO.
 */
export function confrontaRighe(
  nuove: RigaFp[],
  esistenti: RigaEsistente[],
): { daScrivere: RigaFp[]; daSegnareAssenti: number[] } {
  const prima = new Map(esistenti.map(e => [e.fp_id, e]))
  const daScrivere = nuove.filter(r => {
    const e = prima.get(r.fp_id)
    return !e || !e.presente || e.impronta !== impronta(r)
  })
  const ora = new Set(nuove.map(r => r.fp_id))
  const daSegnareAssenti = esistenti.filter(e => e.presente && !ora.has(e.fp_id)).map(e => e.fp_id)
  return { daScrivere, daSegnareAssenti }
}
