// app/(dashboard)/calendario/page.tsx
import { redirect } from 'next/navigation'
import { requireAccesso } from '@/lib/permessi'

/**
 * Segnaposto della vista Amministrazione (mese/settimana/giorno), prevista
 * dalla Fase 3. Finche' non esiste, la voce "Calendario" della barra laterale
 * porta al calendario di produzione invece di finire su una pagina assente.
 */
export default async function CalendarioPage() {
  await requireAccesso('calendario')
  redirect('/produzione/calendario')
}
