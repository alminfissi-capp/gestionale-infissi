// Testo libero scritto dall'utente, da riportare nei documenti così com'è.
/** Spazio unificatore: il motore del PDF non lo collassa mai. */
const NBSP = String.fromCharCode(160)

/**
 * Restituisce il testo così come è stato scritto, spazi compresi.
 *
 * Misurato sul PDF renderizzato, non dedotto: il motore rispetta già gli a
 * capo, le righe lasciate vuote e gli spazi ripetuti **in mezzo** al testo.
 * Due cose invece le perde, ed è per quelle che serve questa funzione:
 *
 *   - il rientro a inizio riga, ridotto a un solo spazio
 *   - la tabulazione, schiacciata anch'essa a un solo spazio
 *
 * Chi incolonna a mano si ritrova quindi le righe tutte allineate a sinistra.
 * Gli spazi in eccedenza diventano NBSP, che il motore non tocca mai; il primo
 * di ogni gruppo resta uno spazio normale, così il testo può ancora andare a
 * capo lì se la cella è stretta. Sugli spazi interni la trasformazione è
 * innocua: il risultato impaginato è identico.
 */
export function preservaSpazi(testo: string): string {
  return testo
    .split('\n')
    .map((rigaTesto) =>
      rigaTesto
        .replace(/\t/g, NBSP.repeat(4))
        .replace(/^ +/, (spazi) => NBSP.repeat(spazi.length))
        .replace(/ {2,}/g, (spazi) => ' ' + NBSP.repeat(spazi.length - 1))
    )
    .join('\n')
}
