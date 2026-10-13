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

/** Oltre questo tempo una richiesta "in corso" e' bloccata (la sync dura meno di un minuto). */
export const TEMPO_MASSIMO_RICHIESTA_MS = 90 * 60 * 1000

/**
 * Una richiesta rimasta "in corso" senza che il ponte ci stia lavorando (rete caduta
 * mentre la chiudeva) bloccherebbe ogni sincronizzazione: l'indice univoco ne
 * permette una sola aperta. Dopo 90 minuti si considera bloccata (la prima sync delle strutture e' lunga).
 */
export function richiestaBloccata(iniziataAt: string | null, ora: Date): boolean {
  if (!iniziataAt) return false
  return ora.getTime() - new Date(iniziataAt).getTime() > TEMPO_MASSIMO_RICHIESTA_MS
}

/** Fa fallire una promessa che non risponde entro `ms` (query o rete appese). */
export function conTempoMassimo<T>(p: Promise<T>, ms: number, messaggio: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const scadenza = new Promise<never>((_, rifiuta) => {
    timer = setTimeout(() => rifiuta(new Error(messaggio)), ms)
  })
  return Promise.race([p, scadenza]).finally(() => clearTimeout(timer))
}

/**
 * Il ponte non deve MAI scrivere nel database di FP PRO: passa solo un comando singolo che
 * legge (select / show), senza le forme di select che scrivono file o bloccano righe.
 * Seconda difesa: la connessione e' comunque aperta in sola lettura (mysql-sola-lettura.ts).
 */
export function soloLettura(sql: string): boolean {
  const s = sql.trim().replace(/;\s*$/, '')
  if (s.includes(';')) return false
  if (!/^(select|show)\b/i.test(s)) return false
  return !/\binto\s+(out|dump)file\b|\bfor\s+update\b|\block\s+in\s+share\s+mode\b|\bfor\s+share\b/i.test(s)
}
