/**
 * Lettura completa di una tabella, a pagine.
 *
 * PostgREST tronca ogni risposta al valore "Max rows" del progetto (1000 di
 * default su Supabase) e lo fa **in silenzio**: nessun errore, nessun avviso,
 * solo righe che mancano. Una pagina che somma o conta dà quindi numeri sbagliati
 * senza che nulla lo segnali, e se ne accorge solo chi conosce a memoria il
 * totale atteso. Nemmeno `.range(0, 99999)` aiuta: il tetto lo applica il server
 * dopo il range.
 *
 * Da usare per ogni select che deve leggere una tabella intera. Su una tabella
 * che sta sotto il tetto costa esattamente quanto prima — una pagina, una
 * richiesta — quindi conviene applicarlo a tappeto invece di indovinare oggi
 * quali tabelle saranno grandi domani.
 */

/** Forma minima di una risposta PostgREST: evita di dipendere dai tipi del builder. */
type RispostaPagina<T> = {
  data: T[] | null
  error: { message: string } | null
}

/**
 * Dimensione di pagina. Non alzarla sopra il "Max rows" del progetto: una pagina
 * piena tornerebbe troncata (meno righe di quante richieste) e il ciclo la
 * scambierebbe per l'ultima, fermandosi a meta' tabella.
 */
export const PAGINA_DEFAULT = 1000

/** Rete di sicurezza: oltre questo numero di pagine c'e' un ciclo impazzito, non una tabella. */
const MAX_PAGINE = 200

/**
 * Esegue la query a blocchi finche' la tabella non finisce e restituisce tutte le righe.
 *
 * `pagina` riceve gli estremi da passare a `.range()` e deve costruire ogni volta
 * una query nuova. Serve un ordinamento deterministico (di solito `.order('id')`),
 * altrimenti Postgres puo' restituire le righe in un ordine diverso a ogni
 * blocco e la paginazione salta o duplica record.
 *
 * @example
 * const scadenze = await selectAll((da, a) =>
 *   supabase.from('scadenze').select('id, importo').eq('organization_id', orgId).order('id').range(da, a)
 * )
 */
export async function selectAll<T>(
  pagina: (da: number, a: number) => PromiseLike<RispostaPagina<T>>,
  dimensione: number = PAGINA_DEFAULT,
): Promise<T[]> {
  const righe: T[] = []

  for (let i = 0; i < MAX_PAGINE; i++) {
    const da = i * dimensione
    const { data, error } = await pagina(da, da + dimensione - 1)
    if (error) throw new Error(error.message)

    const blocco = data ?? []
    righe.push(...blocco)
    // Pagina non piena = tabella finita. Con l'ultima pagina esattamente piena
    // si paga un giro a vuoto in piu', che e' il prezzo di non perdere righe.
    if (blocco.length < dimensione) return righe
  }

  throw new Error(
    `selectAll: superate ${MAX_PAGINE} pagine da ${dimensione} righe. Query troppo ampia o ciclo non terminato.`
  )
}
