/**
 * Regole del ponte sul PC. Usato sia dall'app sia dal ponte (eseguito con Node
 * senza build): questo file non deve importare nulla.
 */

export type StatoPonte = 'collegato' | 'non_raggiungibile' | 'mai_collegato'

/** Il ponte manda un segnale ogni 30 s: dopo 2 minuti di silenzio e' spento. */
export const SOGLIA_SILENZIO_MS = 2 * 60 * 1000

export function statoPonte(ultimoSegnale: string | null, ora: Date): StatoPonte {
  if (!ultimoSegnale) return 'mai_collegato'
  const silenzio = ora.getTime() - new Date(ultimoSegnale).getTime()
  return silenzio <= SOGLIA_SILENZIO_MS ? 'collegato' : 'non_raggiungibile'
}

/** Giorno di calendario a Roma, 'YYYY-MM-DD' (il formato svedese e' gia' ISO). */
export function giornoRoma(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(d)
}

/**
 * Una sync automatica al giorno. Conta il giorno in cui e' stata ACCODATA, non
 * quello in cui e' riuscita: se fallisce (MySQL spento) non si riprova ogni 30 s.
 */
export function devoAccodareSyncGiornaliera(
  ultimoGiornoAuto: string | null,
  ora: Date,
  richiestaAperta: boolean,
): boolean {
  if (richiestaAperta) return false
  return ultimoGiornoAuto !== giornoRoma(ora)
}
