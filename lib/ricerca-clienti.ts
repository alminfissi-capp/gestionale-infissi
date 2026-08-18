/**
 * Ricerca clienti condivisa fra anagrafica e selettori (preventivi, commesse).
 *
 * Il filtro precedente confrontava la query con ogni singolo campo
 * (`campo.includes(query)`): cercando "marcello zamueli" — cioè il nome così come
 * viene mostrato in elenco — non usciva nulla, perché nessun campo da solo contiene
 * la stringa intera. Qui la query viene spezzata in parole e **ogni parola** deve
 * trovare riscontro in almeno un campo, in qualunque ordine.
 */

export type ClienteRicercabile = {
  tipo?: 'privato' | 'azienda' | null
  ragione_sociale?: string | null
  nome?: string | null
  cognome?: string | null
  telefono?: string | null
  email?: string | null
  cf_piva?: string | null
  cantiere?: string | null
}

/**
 * Minuscolo, accenti rimossi, apostrofi tipografici normalizzati, spazi compattati.
 *
 * Accetta anche null/undefined: è usata dai filtri di ricerca e dal raggruppamento
 * clienti, e un solo chiamante che le passi un campo vuoto farebbe esplodere l'intera
 * pagina invece di non trovare risultati.
 */
export function normalizzaTesto(s: string | null | undefined): string {
  if (typeof s !== 'string') return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // segni diacritici
    .replace(/[‘’ʼ]/g, "'") // ' ' ʼ → '
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Solo le cifre: rende i confronti telefonici indipendenti da prefisso e spaziatura. */
export function soloCifre(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * I numeri di telefono sono salvati in formati diversi ("3477717399",
 * "+39 3487320995", "+39 320 873 2247"): il confronto avviene sulle sole cifre,
 * ignorando anche il prefisso internazionale da entrambe le parti.
 */
function corrispondeNumero(cifreCampo: string, cifreQuery: string): boolean {
  if (!cifreCampo || !cifreQuery) return false
  const senzaPrefisso = (d: string) => (d.length > 10 && d.startsWith('39') ? d.slice(2) : d)
  return (
    cifreCampo.includes(cifreQuery) ||
    senzaPrefisso(cifreCampo).includes(senzaPrefisso(cifreQuery))
  )
}

/** Tutti i campi testuali su cui ha senso cercare, normalizzati e concatenati. */
function testoRicercabile(c: ClienteRicercabile): string {
  return normalizzaTesto(
    [c.ragione_sociale, c.nome, c.cognome, c.email, c.cf_piva, c.cantiere, c.telefono]
      .filter(Boolean)
      .join(' ')
  )
}

/**
 * `true` se il cliente soddisfa la query: ogni parola deve comparire in almeno un
 * campo (AND fra le parole, OR fra i campi). Query vuota → sempre `true`.
 */
export function clienteCorrisponde(cliente: ClienteRicercabile, query: string): boolean {
  const q = normalizzaTesto(query)
  if (!q) return true

  const testo = testoRicercabile(cliente)
  const cifreTelefono = soloCifre(cliente.telefono ?? '')

  // Query composta solo da cifre e separatori ("+39 347 771 7399"): va confrontata
  // intera col telefono, altrimenti "+39" verrebbe cercato come parola a sé
  const cifreQuery = soloCifre(q)
  if (/^[\d\s+().\-/]+$/.test(q) && cifreQuery.length >= 3) {
    return corrispondeNumero(cifreTelefono, cifreQuery)
  }

  return q.split(' ').every((parola) => {
    if (testo.includes(parola)) return true
    // una parola fatta di cifre può essere un pezzo di numero di telefono
    const cifre = soloCifre(parola)
    return cifre.length >= 3 && corrispondeNumero(cifreTelefono, cifre)
  })
}

/** Filtra una lista di clienti con {@link clienteCorrisponde}. */
export function filtraClienti<T extends ClienteRicercabile>(clienti: T[], query: string): T[] {
  const q = normalizzaTesto(query)
  if (!q) return clienti
  return clienti.filter((c) => clienteCorrisponde(c, query))
}
