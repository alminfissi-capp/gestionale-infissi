import { requireAccesso } from '@/lib/permessi'

/**
 * Il modulo commesse era l'unico senza controllo di accesso: chiunque fosse
 * autenticato poteva aprire l'elenco economico scrivendo l'indirizzo, permesso
 * o no. Il controllo sta nel layout e non nelle singole pagine, come per il
 * magazzino, cosi' vale anche per le rotte che verranno aggiunte in futuro.
 *
 * Le rotte di stampa vivono nel gruppo (print) e hanno un layout loro: quelle
 * restano da coprire a parte.
 */
export default async function CommesseLayout({ children }: { children: React.ReactNode }) {
  await requireAccesso('commesse')
  return <>{children}</>
}
