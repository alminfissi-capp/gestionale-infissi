/**
 * Riprova un'operazione di rete prima di darla per persa.
 *
 * Su rete mobile un singolo pacchetto perso non deve costare all'utente di
 * rifare un caricamento. L'attesa cresce a ogni tentativo (0,4s, 0,8s, …) per
 * non insistere su una rete già in difficoltà.
 *
 * Rilancia l'ultimo errore se anche l'ultimo tentativo fallisce: chi chiama
 * deve poter distinguere "non è riuscito" da "è riuscito al secondo giro".
 */
export async function conRiprova<T>(
  op: () => Promise<T>,
  { tentativi = 3, attesaMs = 400 }: { tentativi?: number; attesaMs?: number } = {},
): Promise<T> {
  let ultimo: unknown
  for (let i = 0; i < tentativi; i++) {
    try {
      return await op()
    } catch (e) {
      ultimo = e
      if (i < tentativi - 1) {
        await new Promise((r) => setTimeout(r, attesaMs * 2 ** i))
      }
    }
  }
  throw ultimo
}
